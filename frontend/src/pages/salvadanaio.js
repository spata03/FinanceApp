/**
 * salvadanaio.js – Pagina Salvadanaio.
 * Gestisce i fondi accantonati senza uno scopo preciso, registrati come spese.
 */

import { store } from '../data/store.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { createElement, escapeHTML, showToast, todayISO, validateAmount } from '../utils/helpers.js';

export function renderSalvadanaio(container) {

  function buildHTML() {
    // Il salvadanaio è calcolato sommando le transazioni "expense" con categoria "salvadanaio"
    // e sottraendo eventuali transazioni "income" con categoria "salvadanaio" (se l'utente preleva)
    const txs = store.getTransactions({ category: 'salvadanaio' });
    
    // Separiamo per mostrare la lista
    const sortedTxs = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calcolo saldo totale salvadanaio
    const totalBalance = txs.reduce((acc, t) => {
      return t.type === 'expense' ? acc + t.amount : acc - t.amount;
    }, 0);

    container.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <h1>🐷 Salvadanaio</h1>
            <p>Fondi messi da parte (contati come spese nel bilancio)</p>
          </div>
          <button class="btn btn--primary" id="add-funds-btn">💸 Versa nel salvadanaio</button>
        </div>
      </div>

      <!-- KPI Totale Salvadanaio -->
      <div class="card kpi-card kpi-card--savings" style="margin-bottom: 2rem;">
        <div class="kpi-card__icon">🐷</div>
        <div class="kpi-card__label">Totale accantonato</div>
        <div class="kpi-card__amount" style="font-size: 2.5rem;">${formatCurrency(totalBalance)}</div>
      </div>

      <!-- Storico Versamenti -->
      <div class="card">
        <div class="card__title">Storico movimenti salvadanaio</div>
        
        ${sortedTxs.length === 0 ? `
          <div class="empty-state" style="padding:2rem;">
            <div class="empty-state__icon">🐷</div>
            <div class="empty-state__title">Nessun movimento</div>
            <div class="empty-state__desc">Inizia a mettere da parte dei fondi.</div>
          </div>
        ` : `
          <div class="table-wrapper">
            <table class="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrizione</th>
                  <th style="text-align:right;">Importo</th>
                  <th style="text-align:center;">Azioni</th>
                </tr>
              </thead>
              <tbody>
                ${sortedTxs.map(t => {
                  // Se è una spesa, per il salvadanaio è un "+". Se è un'entrata (prelievo), è un "-".
                  const isDeposit = t.type === 'expense';
                  const sign = isDeposit ? '+' : '-';
                  const color = isDeposit ? 'var(--clr-savings)' : 'var(--clr-expense)';
                  
                  return `
                    <tr>
                      <td>${formatDate(t.date)}</td>
                      <td style="color:var(--clr-text-muted);">${escapeHTML(t.description || (isDeposit ? 'Versamento' : 'Prelievo'))}</td>
                      <td style="text-align:right;font-weight:600;color:${color};">
                        ${sign}${formatCurrency(t.amount)}
                      </td>
                      <td style="text-align:center;">
                        <button class="btn btn--danger btn--sm delete-btn" data-id="${escapeHTML(t.id)}" title="Elimina movimento">🗑️</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  }

  buildHTML();

  // ── Event delegation ──────────────────────────────────────────────────────
  container.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'add-funds-btn') {
      openDepositModal(() => buildHTML());
      return;
    }

    if (btn.classList.contains('delete-btn')) {
      const id = btn.dataset.id;
      if (!id) return;
      
      if (confirm('Eliminare questo movimento dal salvadanaio?')) {
        store.deleteTransaction(id);
        showToast('Movimento eliminato.', 'success');
        buildHTML();
      }
    }
  });
}

// ── Modale Versamento ───────────────────────────────────────────────────────
function openDepositModal(onSaved) {
  const overlay = createElement(`
    <div class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title">🐷 Versa nel salvadanaio</h2>
          <button class="modal__close" id="dep-close">✕</button>
        </div>
        <form id="dep-form" class="modal__body" novalidate>
          
          <div class="form-group">
            <label class="form-label" for="dep-amount">Importo da mettere da parte (€)</label>
            <input class="form-input" type="number" id="dep-amount" name="amount"
              min="0.01" step="0.01" placeholder="0,00" required />
            <span style="font-size:0.75rem;color:var(--clr-text-muted); margin-top:0.25rem; display:block;">
              Questo importo verrà registrato come spesa nel tuo bilancio generale.
            </span>
          </div>

          <div class="form-group">
            <label class="form-label" for="dep-desc">Note (opzionale)</label>
            <input class="form-input" type="text" id="dep-desc" name="description" placeholder="es. Risparmio extra mese" />
          </div>

          <div class="form-group">
            <label class="form-label" for="dep-date">Data</label>
            <input class="form-input" type="date" id="dep-date" name="date" required />
          </div>

          <div class="modal__actions">
            <button type="button" class="btn btn--outline" id="dep-cancel">Annulla</button>
            <button type="submit" class="btn btn--primary">💸 Versa</button>
          </div>
        </form>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Imposta data odierna come default
  const today = todayISO();
  overlay.querySelector('#dep-date').value = today;

  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.querySelector('#dep-close').addEventListener('click', close);
  overlay.querySelector('#dep-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#dep-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const amount = parseFloat(data.amount);
    
    if (!validateAmount(amount)) { 
      showToast('Importo non valido.', 'error'); 
      return; 
    }

    // Registriamo come spesa (expense) con categoria 'salvadanaio'
    store.addTransaction({
      type: 'expense',
      category: 'salvadanaio',
      amount: amount,
      description: data.description.trim() || 'Versamento salvadanaio',
      date: data.date || today,
      tags: []
    });

    showToast(`${formatCurrency(amount)} aggiunti al salvadanaio!`, 'success');
    close();
    onSaved();
  });
}
