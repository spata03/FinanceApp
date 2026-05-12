/**
 * transactions.js – Pagina generica per Entrate o Spese.
 * Viene usata da entrambe le rotte con type='income' | 'expense'.
 */

import { store } from '../data/store.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { sumByType, groupByCategory } from '../utils/calculations.js';
import { getCategoryInfo, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../data/categories.js';
import { openTransactionModal } from '../components/TransactionModal.js';
import { openRecurringEntryModal } from '../components/RecurringEntryModal.js';
import { escapeHTML, showToast } from '../utils/helpers.js';

export function renderTransactions(container, type = 'income') {
  const isIncome = type === 'income';
  const label    = isIncome ? 'Entrate' : 'Spese';
  const color    = isIncome ? 'var(--clr-income)' : 'var(--clr-expense)';
  const icon     = isIncome ? '📈' : '📉';
  const cats     = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Stato filtro locale (vive nel closure, sopravvive a buildHTML)
  let filterCategory = '';
  let filterMonth    = '';
  let filterSource   = '';

  function buildHTML() {
    store.applyMonthlyEntries();

    const txs   = store.getTransactions({ type });
    const total = sumByType(txs, type);
    const byCat = groupByCategory(txs, type);
    const recurringEntries = store.getRecurringEntries({ type });
    const monthlyEntries = recurringEntries.filter(entry => (entry.frequency || 'monthly') === 'monthly');
    const yearlyEntries = recurringEntries.filter(entry => entry.frequency === 'yearly');
    const activeRecurringEntries = recurringEntries.filter(entry => entry.active !== false);
    const recurringTotal = activeRecurringEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const monthlyRecurringTotal = activeRecurringEntries
      .filter(entry => (entry.frequency || 'monthly') === 'monthly')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const yearlyRecurringTotal = activeRecurringEntries
      .filter(entry => entry.frequency === 'yearly')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const manualTotal = txs
      .filter(t => t.source !== 'monthly' && t.source !== 'yearly')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    // Applica filtri
    let filtered = txs;
    if (filterCategory) filtered = filtered.filter(t => t.category === filterCategory);
    if (filterSource === 'monthly') filtered = filtered.filter(t => t.source === 'monthly');
    if (filterSource === 'yearly') filtered = filtered.filter(t => t.source === 'yearly');
    if (filterSource === 'manual') filtered = filtered.filter(t => t.source !== 'monthly' && t.source !== 'yearly');
    if (filterMonth) {
      const [fy, fm] = filterMonth.split('-').map(Number);
      filtered = filtered.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === fy && d.getMonth() + 1 === fm;
      });
    }

    container.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <h1>${icon} ${label}</h1>
            <p>Totale registrato: <strong style="color:${color}">${formatCurrency(total)}</strong></p>
          </div>
          <button class="btn btn--primary" id="add-tx-btn">➕ Nuova ${isIncome ? 'entrata' : 'spesa'}</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.5rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
          <div>
            <div class="card__title">${isIncome ? 'Voci fisse' : 'Voci fisse'}</div>
            <p style="margin:0;color:var(--clr-text-muted);font-size:0.85rem;">
              Totale fisso stimato: <strong style="color:${color};">${formatCurrency(recurringTotal)}</strong>
              ${monthlyRecurringTotal > 0 ? `(mensili: ${formatCurrency(monthlyRecurringTotal)})` : ''}
              ${yearlyRecurringTotal > 0 ? `(annuali: ${formatCurrency(yearlyRecurringTotal)})` : ''}
              - Variabili registrate: <strong>${formatCurrency(manualTotal)}</strong>
            </p>
          </div>
          <button class="btn btn--outline btn--sm" id="add-recurring-btn">Nuova voce fissa</button>
        </div>
        ${recurringEntries.length === 0 ? `
          <p style="margin:1rem 0 0;color:var(--clr-text-muted);font-size:0.85rem;">
            Nessuna voce fissa. Usa "Nuova voce fissa" per aggiungere entrate/spese mensili o annuali.
          </p>` : `
          <div class="table-wrapper" style="margin-top:1rem;">
            <table class="table">
              <thead>
                <tr>
                  <th>Giorno</th>
                  <th>Frequenza</th>
                  <th>Categoria</th>
                  <th>Descrizione</th>
                  <th>Stato</th>
                  <th style="text-align:right;">Importo</th>
                  <th style="text-align:center;">Azioni</th>
                </tr>
              </thead>
              <tbody>
                ${recurringEntries.map(entry => {
                  const cat = getCategoryInfo(entry.category, type);
                  const freq = entry.frequency === 'yearly' ? 'Annuale' : 'Mensile';
                  const freqBadge = entry.frequency === 'yearly' ? 'badge--yearly' : 'badge--savings';
                  return `
                    <tr>
                      <td>${escapeHTML(entry.dayOfMonth)}</td>
                      <td><span class="badge ${freqBadge}">${freq === 'Annuale' ? '📆' : '📅'} ${freq}</span></td>
                      <td><span class="badge badge--${type}">${escapeHTML(cat.icon)} ${escapeHTML(cat.label)}</span></td>
                      <td style="color:var(--clr-text-muted);">${escapeHTML(entry.description || (isIncome ? (freq === 'Annuale' ? 'Entrata annuale' : 'Entrata mensile') : (freq === 'Annuale' ? 'Spesa annuale' : 'Spesa mensile')))}</td>
                      <td><span class="badge badge--${entry.active === false ? 'expense' : 'savings'}">${entry.active === false ? 'Pausa' : 'Attiva'}</span></td>
                      <td style="text-align:right;font-weight:600;color:${color};">${formatCurrency(entry.amount)}</td>
                      <td style="text-align:center;">
                        <div style="display:flex;gap:0.25rem;justify-content:center;">
                          <button class="btn btn--ghost btn--sm edit-recurring-btn" data-recurring-id="${escapeHTML(entry.id)}" title="Modifica voce mensile">Modifica</button>
                          <button class="btn btn--danger btn--sm delete-recurring-btn" data-recurring-id="${escapeHTML(entry.id)}" title="Rimuovi voce mensile">Elimina</button>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
      </div>

      <!-- Top categorie -->
      ${byCat.length > 0 ? `
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card__title">Top categorie</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.75rem;">
          ${byCat.slice(0, 5).map(b => {
            const cat = getCategoryInfo(b.category, type);
            const pct = total > 0 ? Math.round((b.total / total) * 100) : 0;
            return `
              <div class="card" style="flex:1;min-width:140px;padding:0.75rem;">
                <div style="font-size:1.5rem;">${escapeHTML(cat.icon)}</div>
                <div style="font-size:0.75rem;color:var(--clr-text-muted);margin-top:0.25rem;">${escapeHTML(cat.label)}</div>
                <div style="font-weight:700;color:${color};margin-top:0.25rem;">${formatCurrency(b.total)}</div>
                <div class="progress-bar" style="margin-top:0.5rem;">
                  <div class="progress-bar__fill" style="width:${pct}%;background:${color};"></div>
                </div>
                <div style="font-size:0.65rem;color:var(--clr-text-muted);margin-top:0.25rem;">${pct}%</div>
              </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Filtri -->
      <div class="card" style="margin-bottom:1.5rem;">
        <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end;">
          <div class="form-group" style="flex:1;min-width:160px;">
            <label class="form-label">Categoria</label>
            <select class="form-select" id="filter-cat">
              <option value="">Tutte</option>
              ${cats.map(c => `<option value="${c.id}" ${filterCategory === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:1;min-width:160px;">
            <label class="form-label">Mese</label>
            <input class="form-input" type="month" id="filter-month" value="${filterMonth}" />
          </div>
          <div class="form-group" style="flex:1;min-width:160px;">
            <label class="form-label">Origine</label>
            <select class="form-select" id="filter-source">
              <option value="" ${filterSource === '' ? 'selected' : ''}>Tutte</option>
              <option value="manual" ${filterSource === 'manual' ? 'selected' : ''}>Variabili</option>
              <option value="monthly" ${filterSource === 'monthly' ? 'selected' : ''}>Fisse mensili</option>
              <option value="yearly" ${filterSource === 'yearly' ? 'selected' : ''}>Fisse annuali</option>
            </select>
          </div>
          <button class="btn btn--ghost" id="reset-filters-btn">✕ Reset filtri</button>
        </div>
      </div>

      <!-- Tabella -->
      <div class="card" style="padding:0;">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state__icon">${icon}</div>
            <div class="empty-state__title">Nessuna transazione trovata</div>
            <div class="empty-state__desc">Prova a modificare i filtri o aggiungi una nuova voce.</div>
          </div>` : `
          <div class="table-wrapper">
            <table class="table" id="tx-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Descrizione</th>
                  <th>Origine</th>
                  <th style="text-align:right;">Importo</th>
                  <th style="text-align:center;">Azioni</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(t => {
                  const cat = getCategoryInfo(t.category, type);
                  return `
                    <tr>
                      <td>${formatDate(t.date)}</td>
                      <td><span class="badge badge--${type}">${escapeHTML(cat.icon)} ${escapeHTML(cat.label)}</span></td>
                      <td style="color:var(--clr-text-muted);">${escapeHTML(t.description || '—')}</td>
                      <td><span class="badge badge--${t.source === 'monthly' ? 'savings' : t.source === 'yearly' ? 'yearly' : type}">${t.source === 'monthly' ? 'Mensile' : t.source === 'yearly' ? 'Annuale' : 'Variabile'}</span></td>
                      <td style="text-align:right;font-weight:600;color:${color};">${formatCurrency(t.amount)}</td>
                      <td style="text-align:center;">
                        <div style="display:flex;gap:0.25rem;justify-content:center;">
                          <button class="btn btn--ghost btn--sm edit-btn" data-id="${escapeHTML(t.id)}" title="Modifica">✏️</button>
                          <button class="btn btn--danger btn--sm delete-btn" data-id="${escapeHTML(t.id)}" title="Elimina">🗑️</button>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}
      </div>
    `;
  }

  // Prima render
  buildHTML();

  // ── Event delegation sul container ────────────────────────────────────────
  // I listener sono attaccati UNA VOLTA sul container (già clonato in app.js).
  // buildHTML() riscrive solo l'innerHTML, i listener sul container rimangono attivi.

  container.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Pulsante "Nuova entrata/spesa"
    if (btn.id === 'add-tx-btn') {
      openTransactionModal(type, null, () => buildHTML());
      return;
    }

    if (btn.id === 'add-recurring-btn') {
      openRecurringEntryModal(type, null, () => buildHTML());
      return;
    }

    // Pulsante "Reset filtri"
    if (btn.id === 'reset-filters-btn') {
      filterCategory = '';
      filterMonth    = '';
      filterSource   = '';
      buildHTML();
      return;
    }

    // Pulsanti Edit / Delete: l'ID è nel data-id del bottone stesso
    const recurringId = btn.dataset.recurringId;
    if (recurringId) {
      if (btn.classList.contains('edit-recurring-btn')) {
        const entry = store.getRecurringEntries({ type }).find(item => String(item.id) === String(recurringId));
        if (entry) openRecurringEntryModal(type, entry, () => buildHTML());
        return;
      }

      if (confirm('Eliminare questa voce mensile fissa? Le transazioni gia generate resteranno nello storico.')) {
        store.deleteRecurringEntry(recurringId);
        showToast('Voce mensile rimossa.', 'success');
        buildHTML();
      }
      return;
    }

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('edit-btn')) {
      const tx = store.getTransactions().find(t => String(t.id) === String(id));
      if (tx) openTransactionModal(type, tx, () => buildHTML());
    }

    if (btn.classList.contains('delete-btn')) {
      if (confirm('Eliminare questa transazione?')) {
        store.deleteTransaction(id);
        showToast('Transazione eliminata.', 'success');
        buildHTML();
      }
    }
  });

  container.addEventListener('change', e => {
    if (e.target.id === 'filter-cat') {
      filterCategory = e.target.value;
      buildHTML();
    } else if (e.target.id === 'filter-month') {
      filterMonth = e.target.value;
      buildHTML();
    } else if (e.target.id === 'filter-source') {
      filterSource = e.target.value;
      buildHTML();
    }
  });
}
