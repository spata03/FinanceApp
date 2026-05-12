/**
 * report.js – Pagina Report: analisi mensile e grafici a barre per categoria.
 */

import { store } from '../data/store.js';
import { formatCurrency, formatMonthYear } from '../utils/formatters.js';
import { calcBalance, calcMonthlyOverview, groupByCategory, groupByMonth } from '../utils/calculations.js';
import { getCategoryInfo } from '../data/categories.js';
import { escapeHTML } from '../utils/helpers.js';

export function renderReport(container) {
  const now   = new Date();
  let selYear  = now.getFullYear();
  let selMonth = now.getMonth();     // 0-indexed

  function build() {
    const selDate   = new Date(selYear, selMonth, 1);
    store.applyMonthlyEntries(selDate);
    const txMonth   = store.getTransactions({ month: selMonth, year: selYear });
    const { income, expense, balance } = calcBalance(txMonth);
    const overview = calcMonthlyOverview(txMonth);

    const incomeCats  = groupByCategory(txMonth, 'income');
    const expenseCats = groupByCategory(txMonth, 'expense');
    const monthTrend  = groupByMonth(store.getTransactions(), 12);

    const maxBar = Math.max(income, expense, 1);

    container.innerHTML = `
      <div class="page-header">
        <h1>📋 Report</h1>
        <p>Analisi dettagliata delle tue finanze</p>
      </div>

      <!-- Selezione mese -->
      <div class="card" style="margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
        <button class="btn btn--ghost" id="prev-month-btn">‹ Mese prec.</button>
        <span style="font-size:1.1rem;font-weight:600;min-width:180px;text-align:center;">
          ${formatMonthYear(selDate)}
        </span>
        <button class="btn btn--ghost" id="next-month-btn">Mese succ. ›</button>
      </div>

      <!-- KPI mese -->
      <div class="grid-3" style="margin-bottom:1.5rem;">
        <div class="kpi-card kpi-card--income">
          <div class="kpi-card__icon">📈</div>
          <div class="kpi-card__label">Entrate</div>
          <div class="kpi-card__amount">${formatCurrency(income)}</div>
        </div>
        <div class="kpi-card kpi-card--expense">
          <div class="kpi-card__icon">📉</div>
          <div class="kpi-card__label">Spese</div>
          <div class="kpi-card__amount">${formatCurrency(expense)}</div>
        </div>
        <div class="kpi-card kpi-card--${balance >= 0 ? 'savings' : 'expense'}">
          <div class="kpi-card__icon">${balance >= 0 ? '💰' : '⚠️'}</div>
          <div class="kpi-card__label">Saldo netto</div>
          <div class="kpi-card__amount">${formatCurrency(balance)}</div>
        </div>
      </div>

      ${monthlyOverview(overview)}

      <!-- Ripartizione entrate vs spese -->
      <div class="grid-2" style="margin-bottom:1.5rem;">
        ${categoryBreakdown('income', incomeCats, income)}
        ${categoryBreakdown('expense', expenseCats, expense)}
      </div>

      <!-- Trend annuale -->
      <div class="card">
        <div class="card__title">Andamento annuale (12 mesi)</div>
        ${annualTrend(monthTrend)}
      </div>
    `;
  }

  build();

  // ── Event delegation per Nav mese ─────────────────────────────────────────
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

function monthlyOverview(overview) {
  return `
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card__title">Gestione mensile</div>
      <div class="grid-3" style="margin-top:1rem;">
        ${overviewItem('Entrate fisse', overview.fixedIncome, 'income')}
        ${overviewItem('Entrate variabili', overview.variableIncome, 'income')}
        ${overviewItem('Spese fisse', overview.fixedExpenses, 'expense')}
        ${overviewItem('Spese variabili', overview.variableExpenses, 'expense')}
        ${overviewItem('Risparmio', overview.savings, 'savings')}
        ${overviewItem('Liquidita libera', overview.liquidMoney, overview.liquidMoney >= 0 ? 'income' : 'expense')}
      </div>
    </div>`;
}

function overviewItem(label, value, type) {
  const color = type === 'income' ? 'var(--clr-income)' : type === 'expense' ? 'var(--clr-expense)' : 'var(--clr-savings)';
  return `
    <div>
      <div style="font-size:0.75rem;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:0.04em;">${label}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${color};margin-top:0.25rem;">${formatCurrency(value)}</div>
    </div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function categoryBreakdown(type, cats, total) {
  const color  = type === 'income' ? 'var(--clr-income)' : 'var(--clr-expense)';
  const label  = type === 'income' ? 'Entrate per categoria' : 'Spese per categoria';

  if (cats.length === 0) {
    return `
      <div class="card">
        <div class="card__title">${label}</div>
        <div class="empty-state" style="padding:2rem;">
          <div class="empty-state__icon">${type === 'income' ? '📈' : '📉'}</div>
          <div class="empty-state__desc">Nessun dato per questo mese</div>
        </div>
      </div>`;
  }

  return `
    <div class="card">
      <div class="card__title">${label}</div>
      <div style="margin-top:1rem;display:flex;flex-direction:column;gap:0.75rem;">
        ${cats.map(c => {
          const cat = getCategoryInfo(c.category, type);
          const pct = total > 0 ? (c.total / total) * 100 : 0;
          return `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                <span style="font-size:0.85rem;">${escapeHTML(cat.icon)} ${escapeHTML(cat.label)}
                  <span style="color:var(--clr-text-muted);font-size:0.75rem;">(${c.count} op.)</span>
                </span>
                <span style="font-size:0.85rem;font-weight:600;color:${color};">${formatCurrency(c.total)}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-bar__fill" style="width:${pct.toFixed(1)}%;background:${color};"></div>
              </div>
              <div style="text-align:right;font-size:0.65rem;color:var(--clr-text-muted);margin-top:2px;">${pct.toFixed(1)}%</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function annualTrend(months) {
  const maxVal = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1);

  return `
    <div style="overflow-x:auto;margin-top:1rem;">
      <div style="display:flex;align-items:flex-end;gap:0.6rem;min-width:600px;height:160px;padding-bottom:2rem;position:relative;">
        ${months.map(m => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;">
            <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;width:100%;gap:2px;">
              <div title="Entrate: ${formatCurrency(m.income)}"
                style="width:100%;border-radius:4px 4px 0 0;background:var(--clr-income);
                       height:${Math.round((m.income / maxVal) * 120)}px;transition:height 0.5s ease;"></div>
              <div title="Spese: ${formatCurrency(m.expense)}"
                style="width:100%;border-radius:4px 4px 0 0;background:var(--clr-expense);opacity:0.75;
                       height:${Math.round((m.expense / maxVal) * 120)}px;transition:height 0.5s ease;"></div>
            </div>
            <span style="font-size:0.62rem;color:var(--clr-text-muted);margin-top:4px;white-space:nowrap;">${m.label}</span>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:1.5rem;margin-top:0.5rem;">
        <span style="font-size:0.75rem;color:var(--clr-income);">▌ Entrate</span>
        <span style="font-size:0.75rem;color:var(--clr-expense);">▌ Spese</span>
      </div>
    </div>`;
}
