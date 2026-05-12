/**
 * api/assistant.controller.js — Backend-side rule-based assistant.
 *
 * Pure synchronous logic. Exported so unit tests can call buildAssistantReply()
 * directly without making HTTP requests.
 */

import { sendJson } from '../backend/middleware/errors.js';
import { getOrCreateSession } from '../backend/middleware/session.js';
import { assertCsrf } from '../backend/middleware/csrf.js';
import { readBody } from '../backend/middleware/body.js';
import { sanitizeProfile } from './_helpers.js';

function currentMonthTransactions(transactions) {
  const now = new Date();
  return transactions.filter(tx => {
    const date = new Date(tx.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function sumByType(transactions, type) {
  return transactions
    .filter(tx => tx.type === type)
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
}

function topExpenseCategory(transactions) {
  const totals = new Map();
  transactions
    .filter(tx => tx.type === 'expense')
    .forEach(tx => totals.set(tx.category, (totals.get(tx.category) || 0) + Number(tx.amount || 0)));
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)[0] || null;
}

function formatCurrency(value, settings) {
  return new Intl.NumberFormat(settings.locale || 'it-IT', {
    style: 'currency',
    currency: settings.currency || 'EUR',
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function normalizeRecurringEntries(state = {}) {
  const map = new Map();
  const legacyExpenses = Array.isArray(state.recurringExpenses)
    ? state.recurringExpenses.map(item => ({ ...item, type: 'expense' }))
    : [];
  const entries = Array.isArray(state.recurringEntries) ? state.recurringEntries : [];
  [...legacyExpenses, ...entries].forEach(item => {
    if (!item || typeof item !== 'object') return;
    const id = String(item.id || `${item.type}-${item.category}-${item.amount}-${item.startDate}`);
    map.set(id, { ...item, type: item.type === 'income' ? 'income' : 'expense', frequency: item.frequency === 'yearly' ? 'yearly' : 'monthly' });
  });
  return [...map.values()];
}

function isFixedSource(source) {
  return source === 'monthly' || source === 'yearly';
}

function monthlyOverview(transactions) {
  const fixedIncome = transactions.filter(tx => tx.type === 'income' && isFixedSource(tx.source)).reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const variableIncome = transactions.filter(tx => tx.type === 'income' && !isFixedSource(tx.source)).reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const savings = transactions.filter(tx => tx.type === 'expense' && tx.category === 'salvadanaio').reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const fixedExpenses = transactions.filter(tx => tx.type === 'expense' && isFixedSource(tx.source) && tx.category !== 'salvadanaio').reduce((s, tx) => s + Number(tx.amount || 0), 0);
  const variableExpenses = transactions.filter(tx => tx.type === 'expense' && !isFixedSource(tx.source) && tx.category !== 'salvadanaio').reduce((s, tx) => s + Number(tx.amount || 0), 0);
  return { fixedIncome, variableIncome, fixedExpenses, variableExpenses, savings, liquidMoney: fixedIncome + variableIncome - fixedExpenses - variableExpenses - savings };
}

export function buildAssistantReply(question = '', state = {}) {
  const settings = sanitizeProfile(state.settings || {});
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  const recurringEntries = normalizeRecurringEntries(state);
  const monthTxs = currentMonthTransactions(transactions);
  const income = sumByType(monthTxs, 'income');
  const expense = sumByType(monthTxs, 'expense');
  const balance = income - expense;
  const overview = monthlyOverview(monthTxs);
  const fixedIncomePlanned = recurringEntries.filter(i => i.active !== false && i.type === 'income').reduce((s, i) => s + Number(i.amount || 0), 0);
  const fixedPlanned = recurringEntries.filter(i => i.active !== false && i.type === 'expense' && i.category !== 'salvadanaio').reduce((s, i) => s + Number(i.amount || 0), 0);
  const fixedPaid = overview.fixedExpenses;
  const manualExpense = overview.variableExpenses;
  const topCategory = topExpenseCategory(monthTxs);
  const expenseRate = income > 0 ? expense / income : 0;
  const fixedRate = income > 0 ? fixedPlanned / income : 0;

  let score = 78;
  const reasoning = [];
  const actions = [];

  if (transactions.length === 0) {
    score = 35;
    reasoning.push('Non ci sono ancora movimenti sufficienti: la valutazione e poco affidabile.');
    actions.push('Registra almeno entrate, spese fisse e 5-10 spese variabili del mese.');
  } else {
    reasoning.push(`Entrate ${formatCurrency(income, settings)}, spese ${formatCurrency(expense, settings)}, saldo ${formatCurrency(balance, settings)}.`);
  }
  if (income <= 0 && expense > 0) { score -= 25; reasoning.push('Ci sono spese senza entrate nel mese: il saldo non rappresenta ancora un budget completo.'); actions.push('Aggiungi le entrate ricorrenti prima di prendere decisioni sui tagli.'); }
  else if (expenseRate >= 0.9) { score -= 24; reasoning.push(`Le spese assorbono ${formatPercent(expenseRate)} delle entrate: margine di sicurezza molto basso.`); actions.push('Imposta un tetto settimanale sulle spese manuali fino a riportare il rapporto sotto il 75%.'); }
  else if (expenseRate >= 0.75) { score -= 10; reasoning.push(`Le spese assorbono ${formatPercent(expenseRate)} delle entrate: gestione sostenibile ma fragile.`); actions.push('Riduci prima le categorie variabili, non le spese essenziali.'); }
  else if (income > 0) { score += 6; reasoning.push(`Il rapporto spese/entrate e ${formatPercent(expenseRate)}: resta spazio per risparmio o fondo emergenza.`); }
  if (balance < 0) { score -= 18; reasoning.push('Il saldo mensile e negativo: le uscite superano le entrate registrate.'); actions.push('Blocca nuove spese non essenziali finche il saldo mensile torna positivo.'); }
  if (fixedRate > 0.5) { score -= 12; reasoning.push(`Le spese fisse pianificate pesano ${formatPercent(fixedRate)} delle entrate: il budget e poco flessibile.`); actions.push('Rinegozia o sostituisci almeno una spesa fissa ad alto importo.'); }
  else if (fixedPlanned > 0 && income > 0) { reasoning.push(`Spese fisse pianificate: ${formatCurrency(fixedPlanned, settings)} (${formatPercent(fixedRate)} delle entrate).`); }
  if (fixedIncomePlanned > 0) { reasoning.push(`Entrate fisse pianificate: ${formatCurrency(fixedIncomePlanned, settings)}. Liquidita libera stimata nel mese: ${formatCurrency(overview.liquidMoney, settings)}.`); }
  if (topCategory && expense > 0 && topCategory.total / expense > 0.35) { reasoning.push(`La categoria piu pesante e ${topCategory.category}: ${formatCurrency(topCategory.total, settings)}.`); actions.push(`Controlla le ultime voci in "${topCategory.category}" e cerca una riduzione mirata del 5-10%.`); }
  if (manualExpense > fixedPaid && manualExpense > 0) { reasoning.push(`Spese manuali del mese: ${formatCurrency(manualExpense, settings)} contro ${formatCurrency(fixedPaid, settings)} gia generate da spese mensili.`); }
  if (String(question).toLowerCase().includes('dati')) { actions.push('Per dati sensibili usa il backend locale e non inserire credenziali bancarie nell app.'); }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level = boundedScore >= 75 ? 'buona' : boundedScore >= 55 ? 'da monitorare' : 'critica';
  if (actions.length === 0) actions.push('Mantieni la separazione tra spese fisse e manuali e controlla il saldo una volta a settimana.');

  return [
    `Analisi AI backend: gestione ${level}, score ${boundedScore}/100.`,
    'Ragionamento:',
    ...reasoning.slice(0, 5).map(item => `- ${item}`),
    'Azioni consigliate:',
    ...actions.slice(0, 4).map(item => `- ${item}`),
    'Nota: analisi automatica dei dati inseriti, non consulenza finanziaria certificata.',
  ].join('\n');
}

export async function analyze(req, res) {
  const session = await getOrCreateSession(req, res);
  if (!(await assertCsrf(req, session))) {
    sendJson(res, 403, { error: 'Token CSRF non valido' });
    return;
  }
  const body = await readBody(req);
  sendJson(res, 200, { reply: buildAssistantReply(body.question, body.state) });
}
