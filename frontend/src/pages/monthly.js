/**
 * monthly.js - Vista dedicata alla gestione mensile.
 */

import { store } from '../data/store.js';
import { getCategoryInfo } from '../data/categories.js';
import { calcMonthlyOverview } from '../utils/calculations.js';
import { formatCurrency, formatMonthYear } from '../utils/formatters.js';
import { escapeHTML } from '../utils/helpers.js';

export function renderMonthly(container) {
  const now = new Date();
  let selYear = now.getFullYear();
  let selMonth = now.getMonth();

  function build() {
    const selDate = new Date(selYear, selMonth, 1);
    store.applyMonthlyEntries(selDate);
    const txMonth = store.getTransactions({ month: selMonth, year: selYear });
    const overview = calcMonthlyOverview(txMonth);
    const allIncomeEntries = store.getRecurringEntries({ type: 'income', active: true });
    const allExpenseEntries = store.getRecurringEntries({ type: 'expense', active: true });
    const monthlyIncomeEntries = allIncomeEntries.filter(e => (e.frequency || 'monthly') === 'monthly');
    const yearlyIncomeEntries = allIncomeEntries.filter(e => e.frequency === 'yearly');
    const monthlyExpenseEntries = allExpenseEntries.filter(e => (e.frequency || 'monthly') === 'monthly');
    const yearlyExpenseEntries = allExpenseEntries.filter(e => e.frequency === 'yearly');

    container.innerHTML = `
      <div class="page-header">
        <h1>Gestione mensile</h1>
        <p>${formatMonthYear(selDate)} - fisse, variabili, risparmio e liquidita</p>
      </div>

      <div class="card" style="margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="prev-month-btn">‹ Mese prec.</button>
        <span style="font-size:1.1rem;font-weight:600;min-width:180px;text-align:center;">
          ${formatMonthYear(selDate)}
        </span>
        <button class="btn btn--ghost" id="next-month-btn">Mese succ. ›</button>
      </div>

      <div class="grid-3" style="margin-bottom:1.5rem;">
        ${overviewCard('income', 'Entrate fisse', overview.fixedIncome, `${overview.counts.fixedIncome} movimenti fissi`)}
        ${overviewCard('income', 'Entrate variabili', overview.variableIncome, `${overview.counts.variableIncome} movimenti manuali`)}
        ${overviewCard('expense', 'Spese fisse', overview.fixedExpenses, `${overview.counts.fixedExpenses} movimenti fissi`)}
        ${overviewCard('expense', 'Spese variabili', overview.variableExpenses, `${overview.counts.variableExpenses} movimenti manuali`)}
        ${overviewCard('savings', 'Risparmio', overview.savings, 'Categoria salvadanaio')}
        ${overviewCard(overview.liquidMoney >= 0 ? 'balance' : 'expense', 'Liquidita libera', overview.liquidMoney, 'Dopo spese e risparmio')}
      </div>

      <div class="grid-2" style="margin-bottom:1.5rem;">
        ${fixedList('📅 Entrate mensili attive', monthlyIncomeEntries, 'income')}
        ${fixedList('📅 Spese mensili attive', monthlyExpenseEntries, 'expense')}
      </div>

      ${(yearlyIncomeEntries.length > 0 || yearlyExpenseEntries.length > 0) ? `
      <div class="grid-2" style="margin-bottom:1.5rem;">
        ${fixedList('📆 Entrate annuali attive', yearlyIncomeEntries, 'income')}
        ${fixedList('📆 Spese annuali attive', yearlyExpenseEntries, 'expense')}
      </div>` : ''}

      <div class="card">
        <div class="card__title">Movimenti del mese</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-top:1rem;">
          ${metric('Entrate totali', overview.totalIncome, 'income')}
          ${metric('Uscite operative', overview.operatingExpenses, 'expense')}
          ${metric('Risparmio', overview.savings, 'savings')}
          ${metric('Saldo mese', overview.balance, overview.balance >= 0 ? 'income' : 'expense')}
        </div>
      </div>
    `;
  }

  build();

  container.addEventListener('click', e => {
    if (e.target.closest('#prev-month-btn')) {
      selMonth--;
      if (selMonth < 0) { selMonth = 11; selYear--; }
      build();
    } else if (e.target.closest('#next-month-btn')) {
      selMonth++;
      if (selMonth > 11) { selMonth = 0; selYear++; }
      build();
    }
  });
}

function overviewCard(type, label, value, sub) {
  return `
    <div class="kpi-card kpi-card--${type}">
      <div class="kpi-card__label">${label}</div>
      <div class="kpi-card__amount">${formatCurrency(value)}</div>
      <div class="kpi-card__trend">${sub}</div>
    </div>`;
}

function fixedList(title, entries, type) {
  const color = type === 'income' ? 'var(--clr-income)' : 'var(--clr-expense)';
  return `
    <div class="card">
      <div class="card__title">${title}</div>
      ${entries.length === 0 ? `
        <div class="empty-state" style="padding:2rem;">
          <div class="empty-state__desc">Nessuna voce fissa attiva.</div>
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:0.75rem;margin-top:1rem;">
          ${entries.map(entry => {
            const cat = getCategoryInfo(entry.category, type);
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--clr-border);padding-bottom:0.75rem;">
                <div style="min-width:0;">
                  <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escapeHTML(entry.description || cat.label)}
                  </div>
                  <div style="font-size:0.75rem;color:var(--clr-text-muted);">
                    Giorno ${escapeHTML(entry.dayOfMonth)} · ${escapeHTML(cat.icon)} ${escapeHTML(cat.label)}
                  </div>
                </div>
                <div style="font-weight:700;color:${color};white-space:nowrap;">${formatCurrency(entry.amount)}</div>
              </div>`;
          }).join('')}
        </div>`}
    </div>`;
}

function metric(label, value, type) {
  const color = type === 'income' ? 'var(--clr-income)' : type === 'expense' ? 'var(--clr-expense)' : 'var(--clr-savings)';
  return `
    <div style="min-width:0;">
      <div style="font-size:0.75rem;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:0.04em;">${label}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${color};margin-top:0.25rem;">${formatCurrency(value)}</div>
    </div>`;
}
