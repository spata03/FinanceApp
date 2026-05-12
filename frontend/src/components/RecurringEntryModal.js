/**
 * RecurringEntryModal.js - Modale per aggiungere/modificare voci fisse (mensili o annuali).
 */

import { store } from '../data/store.js';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../data/categories.js';
import { createElement, escapeHTML, showToast, validateAmount, todayISO } from '../utils/helpers.js';

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function categoryOptions(type, selectedCategory = '') {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return categories
    .map(c => `<option value="${c.id}" ${selectedCategory === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`)
    .join('');
}

function monthOptions(selectedMonth = 1) {
  return MONTH_NAMES
    .map((name, i) => `<option value="${i + 1}" ${selectedMonth === i + 1 ? 'selected' : ''}>${name}</option>`)
    .join('');
}

function frequencyLabel(frequency) {
  return frequency === 'yearly' ? 'annuale' : 'mensile';
}

/**
 * @param {'income'|'expense'} defaultType
 * @param {object|null} existingEntry
 * @param {Function} onSaved
 */
export function openRecurringEntryModal(defaultType = 'expense', existingEntry = null, onSaved = () => {}) {
  const isEdit = !!existingEntry;
  const type = existingEntry?.type ?? defaultType;
  const frequency = existingEntry?.frequency ?? 'monthly';
  const startDate = existingEntry?.startDate ?? todayISO();
  const fallbackDay = Number(String(startDate).split('-')[2]) || 1;
  const fallbackMonth = Number(String(startDate).split('-')[1]) || (new Date().getMonth() + 1);
  const active = existingEntry?.active !== false;

  const titleText = isEdit ? 'Modifica voce fissa' : 'Nuova voce fissa';

  const overlay = createElement(`
    <div class="modal-overlay" id="recurring-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recurring-modal-title">
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title" id="recurring-modal-title">${titleText}</h2>
          <button class="modal__close btn--ghost" id="recurring-modal-close" aria-label="Chiudi">x</button>
        </div>

        <form id="recurring-form" class="modal__body" novalidate>
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <button type="button" class="btn btn--sm chip ${type === 'income' ? 'active' : ''}" data-recurring-type="income">Entrata fissa</button>
              <button type="button" class="btn btn--sm chip ${type === 'expense' ? 'active' : ''}" data-recurring-type="expense">Spesa fissa</button>
            </div>
            <input type="hidden" id="recurring-type" name="type" value="${escapeHTML(type)}" />
          </div>

          <div class="form-group">
            <label class="form-label">Frequenza</label>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <button type="button" class="btn btn--sm chip ${frequency === 'monthly' ? 'active' : ''}" data-recurring-freq="monthly">📅 Mensile</button>
              <button type="button" class="btn btn--sm chip ${frequency === 'yearly' ? 'active' : ''}" data-recurring-freq="yearly">📆 Annuale</button>
            </div>
            <input type="hidden" id="recurring-frequency" name="frequency" value="${escapeHTML(frequency)}" />
          </div>

          <div class="form-group">
            <label class="form-label" for="recurring-amount">Importo</label>
            <input class="form-input" type="number" id="recurring-amount" name="amount"
              min="0.01" step="0.01" placeholder="0,00"
              value="${escapeHTML(existingEntry?.amount ?? '')}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="recurring-category">Categoria</label>
            <select class="form-select" id="recurring-category" name="category" required>
              <option value="">Seleziona categoria...</option>
              ${categoryOptions(type, existingEntry?.category)}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="recurring-desc">Descrizione</label>
            <input class="form-input" type="text" id="recurring-desc" name="description"
              placeholder="es. Stipendio, affitto, abbonamento, assicurazione"
              value="${escapeHTML(existingEntry?.description ?? '')}" />
          </div>

          <div style="display:grid;grid-template-columns:1fr 120px;gap:1rem;">
            <div class="form-group">
              <label class="form-label" for="recurring-start">Data inizio</label>
              <input class="form-input" type="date" id="recurring-start" name="startDate"
                value="${escapeHTML(startDate)}" required />
            </div>
            <div class="form-group" id="day-group" ${frequency === 'yearly' ? 'style="display:none;"' : ''}>
              <label class="form-label" for="recurring-day">Giorno</label>
              <input class="form-input" type="number" id="recurring-day" name="dayOfMonth"
                min="1" max="31" step="1" value="${escapeHTML(existingEntry?.dayOfMonth ?? fallbackDay)}" required />
            </div>
            <div class="form-group" id="month-group" ${frequency !== 'yearly' ? 'style="display:none;"' : ''}>
              <label class="form-label" for="recurring-month-sel">Mese</label>
              <select class="form-select" id="recurring-month-sel" name="yearlyMonth">
                ${monthOptions(fallbackMonth)}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="chip" style="align-self:flex-start;gap:0.5rem;">
              <input type="checkbox" id="recurring-active" name="active" value="yes" ${active ? 'checked' : ''} />
              <span id="active-label">Attiva ogni ${frequency === 'yearly' ? 'anno' : 'mese'}</span>
            </label>
          </div>

          <div class="modal__actions">
            <button type="button" class="btn btn--outline" id="recurring-cancel-btn">Annulla</button>
            <button type="submit" class="btn btn--primary" id="recurring-submit-btn">
              ${isEdit ? 'Salva modifiche' : 'Aggiungi voce fissa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const form = overlay.querySelector('#recurring-form');
  const typeInput = overlay.querySelector('#recurring-type');
  const frequencyInput = overlay.querySelector('#recurring-frequency');
  const categorySelect = overlay.querySelector('#recurring-category');
  const startInput = overlay.querySelector('#recurring-start');
  const dayInput = overlay.querySelector('#recurring-day');
  const dayGroup = overlay.querySelector('#day-group');
  const monthGroup = overlay.querySelector('#month-group');
  const monthSel = overlay.querySelector('#recurring-month-sel');
  const activeLabel = overlay.querySelector('#active-label');

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  overlay.querySelector('#recurring-modal-close').addEventListener('click', close);
  overlay.querySelector('#recurring-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Type toggle
  overlay.querySelectorAll('[data-recurring-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextType = btn.dataset.recurringType;
      typeInput.value = nextType;
      overlay.querySelectorAll('[data-recurring-type]')
        .forEach(item => item.classList.toggle('active', item.dataset.recurringType === nextType));
      categorySelect.innerHTML = `<option value="">Seleziona categoria...</option>${categoryOptions(nextType)}`;
    });
  });

  // Frequency toggle
  overlay.querySelectorAll('[data-recurring-freq]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextFreq = btn.dataset.recurringFreq;
      frequencyInput.value = nextFreq;
      overlay.querySelectorAll('[data-recurring-freq]')
        .forEach(item => item.classList.toggle('active', item.dataset.recurringFreq === nextFreq));

      const isYearly = nextFreq === 'yearly';
      dayGroup.style.display = isYearly ? 'none' : '';
      monthGroup.style.display = isYearly ? '' : 'none';
      activeLabel.textContent = `Attiva ogni ${isYearly ? 'anno' : 'mese'}`;
    });
  });

  startInput.addEventListener('change', () => {
    const parts = String(startInput.value).split('-');
    const day = Number(parts[2]);
    const month = Number(parts[1]);
    if (day && !existingEntry) dayInput.value = String(day);
    if (month) monthSel.value = String(month);
  });

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

    const freq = data.frequency === 'yearly' ? 'yearly' : 'monthly';
    let finalStartDate = data.startDate;
    let finalDayOfMonth = Number(data.dayOfMonth) || Number(String(data.startDate).split('-')[2]) || 1;

    // Per le voci annuali, adegua la startDate al mese selezionato
    if (freq === 'yearly') {
      const yearlyMonth = Number(data.yearlyMonth) || 1;
      const parts = String(data.startDate).split('-');
      const year = parts[0] || new Date().getFullYear();
      finalStartDate = `${year}-${String(yearlyMonth).padStart(2, '0')}-${String(finalDayOfMonth).padStart(2, '0')}`;
    }

    const payload = {
      type: data.type === 'income' ? 'income' : 'expense',
      frequency: freq,
      amount: parseFloat(data.amount),
      category: data.category,
      description: data.description,
      startDate: finalStartDate,
      dayOfMonth: finalDayOfMonth,
      active: data.active === 'yes',
    };

    if (isEdit) {
      store.updateRecurringEntry(existingEntry.id, payload);
      showToast(`Voce ${frequencyLabel(freq)} aggiornata.`, 'success');
    } else {
      store.addRecurringEntry(payload);
      showToast(`Voce ${frequencyLabel(freq)} aggiunta.`, 'success');
    }

    close();
    onSaved();
  });

  overlay.querySelector('#recurring-amount').focus();
}
