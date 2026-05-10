/**
 * dashboard.js – Pagina Dashboard: riepilogo KPI + ultime transazioni.
 */

import { store } from '../data/store.js';
import { formatCurrency, formatDate, formatMonthYear, formatSignedCurrency } from '../utils/formatters.js';
import { calcBalance, groupByMonth, percentChange } from '../utils/calculations.js';
import { getCategoryInfo } from '../data/categories.js';
import { openTransactionModal } from '../components/TransactionModal.js';
import { escapeHTML } from '../utils/helpers.js';

export function renderDashboard(container) {
  if (!container) return;
  
  try {
    store.applyMonthlyEntries();
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();

    // Dati mese corrente
    const txAll     = store.getTransactions() || [];
    const settings  = store.getSettings() || {};
    const txMonth   = store.getTransactions({ month, year }) || [];
    const { income, expense, balance } = calcBalance(txMonth);

    // Dati mese precedente (per delta %)
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear  = month === 0 ? year - 1 : year;
    const txPrev    = store.getTransactions({ month: prevMonth, year: prevYear }) || [];
    const prev      = calcBalance(txPrev);

    // Risparmio totale accumulato (tutti i periodi)
    const totalBalance = calcBalance(txAll);

    // Ultime 5 transazioni
    const recent = txAll.slice(0, 5);

    // Trend 6 mesi per mini-bar
    const trend = groupByMonth(txAll, 6);

    container.innerHTML = `
      <div class="page-header">
        <h1>${settings.userName ? `Ciao, ${escapeHTML(settings.userName)}! 👋` : 'Buongiorno! 👋'}</h1>
        <p>${formatMonthYear(now)} — riepilogo finanziario</p>
      </div>

      <!-- KPI cards -->
      <div class="grid-4" style="margin-bottom:2rem;">
        ${kpiCard('income',  '📈', 'Entrate mese',  income,  prev.income,  formatCurrency(income))}
        ${kpiCard('expense', '📉', 'Spese mese',    expense, prev.expense, formatCurrency(expense))}
        ${kpiCard('savings', '💰', 'Saldo mese',    balance, prev.balance, formatSignedCurrency(balance))}
        ${kpiCard('balance', '🏦', 'Patrimonio tot.',totalBalance.balance, null, formatCurrency(totalBalance.balance))}
      </div>

      <!-- Trend + Recent -->
      <div class="grid-2" style="margin-bottom:2rem;">

        <!-- Trend 6 mesi -->
        <div class="card">
          <div class="card__title">Andamento 6 mesi</div>
          <div id="trend-chart" style="margin-top:1rem;">
            ${renderTrendBars(trend)}
          </div>
        </div>

        <!-- Ultime transazioni -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
            <div class="card__title" style="margin:0;">Ultime transazioni</div>
            <button class="btn btn--sm btn--primary" id="dash-add-tx-btn">➕ Aggiungi</button>
          </div>
          ${recent.length === 0 ? emptyState() : recentList(recent)}
        </div>

      </div>

      <!-- Quick actions -->
      <div class="card card--glass">
        <div class="card__title">Azioni rapide</div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:1rem;">
          <button class="btn btn--outline" id="quick-income-btn">📈 Nuova entrata</button>
          <button class="btn btn--outline" id="quick-expense-btn">📉 Nuova spesa</button>
          <button class="btn btn--outline" id="quick-monthly-btn" data-page="mensile">Gestione mensile</button>
          <button class="btn btn--outline" id="quick-savings-btn" data-page="risparmi">🏦 Gestisci risparmi</button>
          <button class="btn btn--outline" id="quick-report-btn" data-page="report">📋 Vedi report</button>
        </div>
      </div>
    `;

    // ── Event listeners ───────────────────────────────────────────────────────
    const refresh = () => renderDashboard(container);

    const addBtn = container.querySelector('#dash-add-tx-btn');
    if (addBtn) addBtn.addEventListener('click', () => openTransactionModal('expense', null, refresh));

    const incBtn = container.querySelector('#quick-income-btn');
    if (incBtn) incBtn.addEventListener('click', () => openTransactionModal('income', null, refresh));

    const expBtn = container.querySelector('#quick-expense-btn');
    if (expBtn) expBtn.addEventListener('click', () => openTransactionModal('expense', null, refresh));

    // I pulsanti con data-page delegano al router globale
    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.hash = btn.dataset.page;
      });
    });
  } catch (error) {
    console.error('[Dashboard] Errore di rendering:', error);
    container.innerHTML = `
      <div class="empty-state" style="padding:4rem;">
        <div class="empty-state__icon">⚠️</div>
        <div class="empty-state__title">Errore nel caricamento</div>
        <div class="empty-state__desc">Si è verificato un problema tecnico caricando la dashboard. Prova a ricaricare la pagina o cambiare utente.</div>
        <button class="btn btn--primary" onclick="window.location.reload()" style="margin-top:1rem;">Ricarica Pagina</button>
      </div>
    `;
  }
}

// ── Helpers di rendering ───────────────────────────────────────────────────

function kpiCard(type, icon, label, current, previous, formatted) {
  const delta = previous !== null ? percentChange(current, previous) : null;
  const deltaHtml = delta !== null
    ? `<div class="kpi-card__trend">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(1)}% vs mese prec.</div>`
    : '';
  return `
    <div class="kpi-card kpi-card--${type}">
      <div class="kpi-card__icon">${icon}</div>
      <div class="kpi-card__label">${label}</div>
      <div class="kpi-card__amount">${formatted}</div>
      ${deltaHtml}
    </div>`;
}

function renderTrendBars(trend) {
  const maxVal = Math.max(...trend.map(t => Math.max(t.income, t.expense)), 1);
  return `
    <div style="display:flex;align-items:flex-end;gap:0.5rem;height:120px;padding-bottom:1.5rem;position:relative;">
      ${trend.map(t => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;height:100%;">
          <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;width:100%;gap:2px;">
            <div title="Entrate: ${formatCurrency(t.income)}"
              style="width:100%;border-radius:4px 4px 0 0;background:var(--clr-income);
                     height:${Math.round((t.income / maxVal) * 80)}px;transition:height 0.4s ease;"></div>
            <div title="Spese: ${formatCurrency(t.expense)}"
              style="width:100%;border-radius:4px 4px 0 0;background:var(--clr-expense);opacity:0.7;
                     height:${Math.round((t.expense / maxVal) * 80)}px;transition:height 0.4s ease;"></div>
          </div>
          <span style="font-size:0.65rem;color:var(--clr-text-muted);margin-top:4px;">${t.label}</span>
        </div>
      `).join('')}
    </div>
    <div style="display:flex;gap:1rem;margin-top:0.5rem;">
      <span style="font-size:0.7rem;color:var(--clr-income);">▌ Entrate</span>
      <span style="font-size:0.7rem;color:var(--clr-expense);">▌ Spese</span>
    </div>`;
}

function recentList(txs) {
  return txs.map(t => {
    const cat = getCategoryInfo(t.category, t.type);
    const sign = t.type === 'income' ? '+' : '-';
    const color = t.type === 'income' ? 'var(--clr-income)' : 'var(--clr-expense)';
    return `
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid var(--clr-border);">
        <span style="font-size:1.25rem;">${escapeHTML(cat.icon)}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.875rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHTML(t.description || cat.label)}
          </div>
          <div style="font-size:0.7rem;color:var(--clr-text-muted);">${formatDate(t.date)} · ${escapeHTML(cat.label)}</div>
        </div>
        <span style="font-size:0.9rem;font-weight:600;color:${color};white-space:nowrap;">
          ${sign}${formatCurrency(t.amount)}
        </span>
      </div>`;
  }).join('');
}

function emptyState() {
  return `
    <div class="empty-state" style="padding:2rem;">
      <div class="empty-state__icon">📭</div>
      <div class="empty-state__title">Nessuna transazione</div>
      <div class="empty-state__desc">Inizia aggiungendo la tua prima entrata o spesa.</div>
    </div>`;
}
