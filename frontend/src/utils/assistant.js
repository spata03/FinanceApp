import { store } from '../data/store.js';
import { getCategoryInfo } from '../data/categories.js';
import { calcBalance, calcMonthlyOverview, daysRemaining, goalProgress, groupByCategory, groupByMonth } from './calculations.js';
import { formatCurrency, formatMonthYear, formatPercent } from './formatters.js';

function currentMonthTransactions(transactions) {
  const now = new Date();
  return transactions.filter(tx => {
    const date = new Date(tx.date);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
}

function topExpenseCategory(transactions) {
  const [top] = groupByCategory(transactions, 'expense');
  if (!top) return null;
  const info = getCategoryInfo(top.category, 'expense');
  return { ...top, label: info.label, icon: info.icon };
}

function activeGoalSummary(goals) {
  const active = goals
    .filter(goal => goalProgress(goal) < 1)
    .sort((a, b) => {
      const aDays = daysRemaining(a.deadline) ?? Number.POSITIVE_INFINITY;
      const bDays = daysRemaining(b.deadline) ?? Number.POSITIVE_INFINITY;
      return aDays - bDays;
    })[0];

  if (!active) return null;
  return {
    ...active,
    progress: goalProgress(active),
    remaining: Math.max(0, Number(active.targetAmount) - Number(active.savedAmount || 0)),
    days: daysRemaining(active.deadline),
  };
}

function trendObservation(transactions) {
  const months = groupByMonth(transactions, 3);
  if (months.length < 2) return null;

  const current = months[months.length - 1];
  const previous = months.slice(0, -1);
  const avgExpense = previous.reduce((sum, month) => sum + month.expense, 0) / previous.length;

  if (!avgExpense && !current.expense) return null;

  const delta = avgExpense ? (current.expense - avgExpense) / avgExpense : 1;
  return { current, avgExpense, delta };
}

function monthlyOverviewBreakdown(monthTxs, recurringEntries) {
  const overview = calcMonthlyOverview(monthTxs);
  const activeEntries = recurringEntries.filter(entry => entry.active !== false);
  const fixedIncomePlanned = activeEntries
    .filter(entry => entry.type === 'income')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const fixedPlanned = activeEntries
    .filter(entry => entry.type === 'expense' && entry.category !== 'salvadanaio')
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return {
    ...overview,
    fixedIncomePlanned,
    fixedPlanned,
    fixedPaid: overview.fixedExpenses,
    manualExpense: overview.variableExpenses,
  };
}

function buildFinancialAssessment({ balance, income, expense }, topCategory, trend, recurringInfo, dataCount) {
  let score = 78;
  const reasons = [];

  if (dataCount < 3) {
    score -= 18;
    reasons.push('pochi dati registrati, quindi la valutazione e ancora fragile');
  }

  if (income <= 0 && expense > 0) {
    score -= 25;
    reasons.push('vedo spese nel mese ma nessuna entrata registrata');
  } else if (income > 0) {
    const expenseRate = expense / income;
    if (expenseRate >= 0.9) {
      score -= 24;
      reasons.push(`le spese assorbono ${formatPercent(expenseRate)} delle entrate`);
    } else if (expenseRate >= 0.75) {
      score -= 10;
      reasons.push(`le spese assorbono ${formatPercent(expenseRate)} delle entrate`);
    } else {
      score += 6;
      reasons.push(`il rapporto spese/entrate e ${formatPercent(expenseRate)}`);
    }

    const fixedRate = recurringInfo.fixedPlanned / income;
    if (recurringInfo.fixedPlanned > 0 && fixedRate > 0.5) {
      score -= 12;
      reasons.push(`le spese fisse pianificate pesano ${formatPercent(fixedRate)} delle entrate`);
    }
  }

  if (balance < 0) {
    score -= 18;
    reasons.push('il saldo mensile e negativo');
  }

  if (topCategory && expense > 0 && topCategory.total / expense > 0.35) {
    score -= 6;
    reasons.push(`la categoria ${topCategory.label} concentra una quota alta delle uscite`);
  }

  if (trend && trend.delta > 0.15) {
    score -= 7;
    reasons.push('le spese correnti superano la media recente');
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level = boundedScore >= 75 ? 'buona' : boundedScore >= 55 ? 'da monitorare' : 'critica';
  return { score: boundedScore, level, reasons };
}

function buildGeneralAdvice({ balance, income, expense }, topCategory, trend, goal, recurringInfo) {
  const advice = [];

  if (income <= 0 && expense > 0) {
    advice.push('Questo mese vedo spese ma nessuna entrata registrata: aggiungi le entrate ricorrenti per avere un saldo realistico.');
  } else if (income > 0) {
    const expenseRate = expense / income;
    if (expenseRate >= 0.9) {
      advice.push(`Le spese stanno usando circa ${formatPercent(expenseRate)} delle entrate: prova a fissare un tetto settimanale sulle categorie non essenziali.`);
    } else if (expenseRate <= 0.6) {
      advice.push(`Il rapporto spese/entrate e' circa ${formatPercent(expenseRate)}: hai margine per aumentare risparmio o salvadanaio.`);
    } else {
      advice.push(`Il rapporto spese/entrate e' circa ${formatPercent(expenseRate)}: situazione equilibrata, da monitorare sulle categorie piu' variabili.`);
    }
  }

  if (balance < 0) {
    advice.push(`Il saldo mensile e' negativo (${formatCurrency(balance)}): rimanda acquisti non urgenti finche' non torni sopra zero.`);
  }

  if (topCategory) {
    advice.push(`La categoria piu' pesante e' ${topCategory.icon} ${topCategory.label} con ${formatCurrency(topCategory.total)}: controlla le ultime voci e cerca una riduzione del 5-10%.`);
  }

  if (recurringInfo.fixedPlanned > 0 && income > 0) {
    const fixedRate = recurringInfo.fixedPlanned / income;
    if (fixedRate > 0.5) {
      advice.push(`Le spese fisse pianificate sono ${formatCurrency(recurringInfo.fixedPlanned)} (${formatPercent(fixedRate)} delle entrate): valuta una rinegoziazione o un taglio ricorrente.`);
    } else {
      advice.push(`Spese fisse sotto controllo: ${formatCurrency(recurringInfo.fixedPlanned)} pianificate, con ${formatCurrency(recurringInfo.manualExpense)} di spese manuali nel mese.`);
    }
  }

  if (trend && trend.delta > 0.15) {
    advice.push(`Le spese di ${trend.current.label} sono sopra la media degli ultimi mesi: ${formatCurrency(trend.current.expense)} contro ${formatCurrency(trend.avgExpense)}.`);
  }

  if (goal) {
    const timing = goal.days !== null ? ` entro ${goal.days} giorni` : '';
    advice.push(`Obiettivo "${goal.name}": manca ${formatCurrency(goal.remaining)}${timing}. Avanzamento attuale: ${formatPercent(goal.progress, 0)}.`);
  }

  return advice;
}

export function buildAssistantReply(question = '') {
  const transactions = store.getTransactions();
  const goals = store.getSavingsGoals();
  const recurringEntries = typeof store.getRecurringEntries === 'function'
    ? store.getRecurringEntries({ active: true })
    : typeof store.getRecurringExpenses === 'function'
      ? store.getRecurringExpenses({ active: true }).map(entry => ({ ...entry, type: 'expense' }))
    : [];
  const settings = store.getSettings();
  const storageInfo = store.getStorageInfo();
  const monthTxs = currentMonthTransactions(transactions);
  const balance = calcBalance(monthTxs);
  const topCategory = topExpenseCategory(monthTxs);
  const goal = activeGoalSummary(goals);
  const trend = trendObservation(transactions);
  const recurringInfo = monthlyOverviewBreakdown(monthTxs, recurringEntries);
  const assessment = buildFinancialAssessment(balance, topCategory, trend, recurringInfo, transactions.length);
  const normalizedQuestion = String(question).toLowerCase();

  if (transactions.length === 0 && goals.length === 0) {
    return [
      `Ciao${settings.userName ? ` ${settings.userName}` : ''}, non ho ancora dati sufficienti per fare un'analisi utile.`,
      'Aggiungi almeno qualche entrata e spesa: poi posso stimare saldo mensile, categorie critiche e priorita di risparmio.',
    ].join('\n');
  }

  const lines = [];
  lines.push(`Analisi per ${formatMonthYear(new Date())}: entrate ${formatCurrency(balance.income)}, spese ${formatCurrency(balance.expense)}, saldo ${formatCurrency(balance.balance)}.`);
  lines.push(`Valutazione AI locale: gestione ${assessment.level}, score ${assessment.score}/100.`);

  if (assessment.reasons.length > 0) {
    lines.push('Ragionamento sintetico:');
    assessment.reasons.slice(0, 4).forEach(reason => lines.push(`- ${reason}.`));
  }

  if (recurringInfo.fixedIncomePlanned > 0 || recurringInfo.fixedPlanned > 0 || recurringInfo.manualExpense > 0) {
    lines.push(`Entrate fisse pianificate: ${formatCurrency(recurringInfo.fixedIncomePlanned)}. Spese fisse pianificate: ${formatCurrency(recurringInfo.fixedPlanned)}. Spese variabili del mese: ${formatCurrency(recurringInfo.manualExpense)}.`);
  }

  if (normalizedQuestion.includes('dati') || normalizedQuestion.includes('utente') || normalizedQuestion.includes('salva')) {
    lines.push(`I dati finanziari restano nello store del browser, chiave ${storageInfo.key}. Con il backend locale attivo il profilo utente puo essere salvato su sessione server senza esporre chiavi nel client.`);
  }

  if (normalizedQuestion.includes('obiett') || normalizedQuestion.includes('risparm')) {
    if (goal) {
      lines.push(`Priorita risparmio: "${goal.name}", mancano ${formatCurrency(goal.remaining)} e l'avanzamento e' ${formatPercent(goal.progress, 0)}.`);
    } else {
      lines.push('Non ci sono obiettivi di risparmio attivi: puoi crearne uno con importo e scadenza per rendere il piano piu concreto.');
    }
  }

  const advice = buildGeneralAdvice(balance, topCategory, trend, goal, recurringInfo);
  if (advice.length > 0) {
    lines.push('Suggerimenti pratici:');
    advice.slice(0, 4).forEach(item => lines.push(`- ${item}`));
  }

  lines.push('Nota: sono indicazioni operative basate sui dati inseriti, non consulenza finanziaria certificata.');
  return lines.join('\n');
}

export function suggestedAssistantPrompts() {
  return [
    'Come sto andando questo mese?',
    'Dove posso tagliare le spese?',
    'Come sono salvati i miei dati?',
  ];
}
