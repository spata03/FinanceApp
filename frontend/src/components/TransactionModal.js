/**
 * TransactionModal.js – Modale per aggiungere / modificare una transazione.
 */

import { store } from '../data/store.js';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../data/categories.js';
import { createElement, escapeHTML, showToast, validateAmount, todayISO } from '../utils/helpers.js';

/**
 * @param {'income'|'expense'} defaultType
 * @param {object|null} existingTx – se presente, modalità modifica
 * @param {Function} onSaved – callback dopo salvataggio
 */
export function openTransactionModal(defaultType = 'income', existingTx = null, onSaved = () => {}) {
  const isEdit = !!existingTx;
  const type   = existingTx?.type ?? defaultType;

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const catOptions = categories
    .map(c => `<option value="${c.id}" ${existingTx?.category === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`)
    .join('');

  const overlay = createElement(`
    <div class="modal-overlay" id="tx-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="tx-modal-title">
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title" id="tx-modal-title">${isEdit ? 'Modifica' : 'Nuova'} transazione</h2>
          <button class="modal__close btn--ghost" id="tx-modal-close" aria-label="Chiudi">✕</button>
        </div>

        <form id="tx-form" class="modal__body" novalidate>

          <!-- Tipo -->
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <div style="display:flex;gap:0.5rem;">
              <button type="button" class="btn btn--sm chip ${type === 'income' ? 'active' : ''}" id="type-income-btn" data-type="income">📈 Entrata</button>
              <button type="button" class="btn btn--sm chip ${type === 'expense' ? 'active' : ''}" id="type-expense-btn" data-type="expense">📉 Spesa</button>
            </div>
            <input type="hidden" id="tx-type" name="type" value="${type}" />
          </div>

          <!-- Importo -->
          <div class="form-group">
            <label class="form-label" for="tx-amount">Importo (€)</label>
            <input class="form-input" type="number" id="tx-amount" name="amount"
              min="0.01" step="0.01" placeholder="0,00"
              value="${escapeHTML(existingTx?.amount ?? '')}" required />
          </div>

          <!-- Categoria -->
          <div class="form-group">
            <label class="form-label" for="tx-category">Categoria</label>
            <select class="form-select" id="tx-category" name="category" required>
              <option value="">Seleziona categoria…</option>
              ${catOptions}
            </select>
          </div>

          <!-- Descrizione -->
          <div class="form-group">
            <label class="form-label" for="tx-desc">Descrizione</label>
            <input class="form-input" type="text" id="tx-desc" name="description"
              placeholder="es. Spesa supermercato"
              value="${escapeHTML(existingTx?.description ?? '')}" />
          </div>

          <!-- Data -->
          <div class="form-group">
            <label class="form-label" for="tx-date">Data</label>
            <input class="form-input" type="date" id="tx-date" name="date"
              value="${escapeHTML(existingTx?.date ?? todayISO())}" required />
          </div>

          ${!isEdit ? `
          <div class="form-group" id="monthly-expense-group">
            <label class="chip" style="align-self:flex-start;gap:0.5rem;">
              <input type="checkbox" id="tx-is-monthly" name="isMonthly" value="yes" />
              Voce mensile fissa
            </label>
            <p style="margin:0;font-size:0.78rem;color:var(--clr-text-muted);">
              Verrà registrata automaticamente una volta al mese dal giorno selezionato.
            </p>
          </div>` : ''}

          <div class="modal__actions">
            <button type="button" class="btn btn--outline" id="tx-cancel-btn">Annulla</button>
            <button type="submit" class="btn btn--primary" id="tx-submit-btn">
              ${isEdit ? '💾 Salva modifiche' : '➕ Aggiungi'}
            </button>
          </div>

        </form>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const form       = overlay.querySelector('#tx-form');
  const typeInput  = overlay.querySelector('#tx-type');
  const catSelect  = overlay.querySelector('#tx-category');
  const monthlyGroup = overlay.querySelector('#monthly-expense-group');

  // ── Cambio tipo ──────────────────────────────────────────────────────────
  overlay.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.type;
      typeInput.value = t;
      overlay.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === t));

      // Aggiorna le opzioni della categoria
      const cats = t === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      catSelect.innerHTML = `<option value="">Seleziona categoria…</option>` +
        cats.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('');

      if (monthlyGroup) monthlyGroup.style.display = '';
    });
  });

  // ── Chiusura ─────────────────────────────────────────────────────────────
  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  overlay.querySelector('#tx-modal-close').addEventListener('click', close);
  overlay.querySelector('#tx-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // ── Submit ───────────────────────────────────────────────────────────────
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));

    if (!validateAmount(data.amount)) {
      showToast('Inserisci un importo valido maggiore di zero.', 'error');
      return;
    }
    if (!data.category) {
      showToast('Seleziona una categoria.', 'error');
      return;
    }

    const payload = {
      type:        data.type,
      amount:      parseFloat(data.amount),
      category:    data.category,
      description: data.description,
      date:        data.date,
    };

    const [year, month, day] = String(data.date).split('-').map(Number);
    const isMonthlyEntry = !isEdit && data.isMonthly === 'yes';

    if (isEdit) {
      store.updateTransaction(existingTx.id, payload);
      showToast('Transazione aggiornata.', 'success');
    } else if (isMonthlyEntry) {
      store.addRecurringEntry({
        ...payload,
        startDate: data.date,
        dayOfMonth: day || new Date(year, (month || 1) - 1, 1).getDate(),
      });
      showToast('Voce mensile aggiunta.', 'success');
    } else {
      store.addTransaction(payload);
      showToast('Transazione aggiunta!', 'success');
    }

    close();
    onSaved();
  });

  // Focus sul primo campo
  overlay.querySelector('#tx-amount').focus();
}
