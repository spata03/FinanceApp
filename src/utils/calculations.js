/**
 * calculations.js – Funzioni di calcolo su transazioni e risparmi.
 */

/**
 * Somma le transazioni per tipo ('income' | 'expense').
 * @param {Array} transactions
 * @param {'income'|'expense'} type
 * @returns {number}
 */
export function sumByType(transactions, type) {
  return transactions
    .filter(t => t.type === type)
    .reduce((acc, t) => acc + Number(t.amount), 0);
}

/**
 * Calcola il saldo netto: entrate − spese.
 */
export function calcBalance(transactions) {
  const income  = sumByType(transactions, 'income');
  const expense = sumByType(transactions, 'expense');
  return { income, expense, balance: income - expense };
}

function sumTransactions(transactions) {
  return transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);
}

/**
 * Separa il mese in entrate/spese fisse, variabili, risparmio e liquidita.
 * Il risparmio mensile usa i movimenti di spesa nella categoria "salvadanaio".
 * Le voci fisse includono sia source 'monthly' che 'yearly'.
 */
export function calcMonthlyOverview(transactions) {
  const isFixed = t => t.source === 'monthly' || t.source === 'yearly';
  const fixedIncomeTxs = transactions.filter(t => t.type === 'income' && isFixed(t));
  const variableIncomeTxs = transactions.filter(t => t.type === 'income' && !isFixed(t));
  const savingsTxs = transactions.filter(t => t.type === 'expense' && t.category === 'salvadanaio');
  const fixedExpenseTxs = transactions.filter(t =>
    t.type === 'expense' &&
    isFixed(t) &&
    t.category !== 'salvadanaio'
  );
  const variableExpenseTxs = transactions.filter(t =>
    t.type === 'expense' &&
    !isFixed(t) &&
    t.category !== 'salvadanaio'
  );

  const fixedIncome = sumTransactions(fixedIncomeTxs);
  const variableIncome = sumTransactions(variableIncomeTxs);
  const fixedExpenses = sumTransactions(fixedExpenseTxs);
  const variableExpenses = sumTransactions(variableExpenseTxs);
  const savings = sumTransactions(savingsTxs);
  const totalIncome = fixedIncome + variableIncome;
  const operatingExpenses = fixedExpenses + variableExpenses;
  const totalExpenses = operatingExpenses + savings;
  const liquidMoney = totalIncome - totalExpenses;

  return {
    fixedIncome,
    variableIncome,
    fixedExpenses,
    variableExpenses,
    savings,
    liquidMoney,
    totalIncome,
    operatingExpenses,
    totalExpenses,
    balance: liquidMoney,
    counts: {
      fixedIncome: fixedIncomeTxs.length,
      variableIncome: variableIncomeTxs.length,
      fixedExpenses: fixedExpenseTxs.length,
      variableExpenses: variableExpenseTxs.length,
      savings: savingsTxs.length,
    },
  };
}

/**
 * Raggruppa le transazioni per categoria e restituisce totali.
 * @returns {Array<{category, total, count}>}
 */
export function groupByCategory(transactions, type) {
  const map = {};
  transactions
    .filter(t => t.type === type)
    .forEach(t => {
      if (!map[t.category]) map[t.category] = { category: t.category, total: 0, count: 0 };
      map[t.category].total += Number(t.amount);
      map[t.category].count += 1;
    });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

/**
 * Raggruppa le transazioni per mese (ultimi N mesi).
 * @param {Array} transactions
 * @param {number} months – quanti mesi indietro
 * @returns {Array<{label, income, expense, balance}>}
 */
export function groupByMonth(transactions, months = 6) {
  const result = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const slice = transactions.filter(t => {
      const td = new Date(t.date);
      return td.getMonth() === m && td.getFullYear() === y;
    });
    const { income, expense, balance } = calcBalance(slice);
    result.push({
      label: d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
      month: m, year: y,
      income, expense, balance,
    });
  }
  return result;
}

/**
 * Calcola la percentuale di completamento di un obiettivo di risparmio.
 */
export function goalProgress(goal) {
  if (!goal.targetAmount || goal.targetAmount === 0) return 0;
  return Math.min(goal.savedAmount / goal.targetAmount, 1);
}

/**
 * Restituisce i giorni rimanenti alla scadenza di un obiettivo.
 */
export function daysRemaining(deadline) {
  if (!deadline) return null;
  const diff = new Date(deadline) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Calcola la variazione percentuale rispetto al periodo precedente.
 * @returns {number} (es. 0.12 = +12%)
 */
export function percentChange(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 1 : 0;
  return (current - previous) / Math.abs(previous);
}
