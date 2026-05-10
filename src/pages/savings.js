/**
 * savings.js – Pagina obiettivi di risparmio.
 */

import { store } from '../data/store.js';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { goalProgress, daysRemaining } from '../utils/calculations.js';
import { createElement, escapeHTML, showToast, validateAmount } from '../utils/helpers.js';

export function renderSavings(container) {

  function buildHTML() {
    const goals = store.getSavingsGoals();

    container.innerHTML = `
      <div class="page-header">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <h1>🏦 Risparmi</h1>
            <p>Tieni traccia dei tuoi obiettivi di risparmio</p>
          </div>
          <button class="btn btn--primary" id="add-goal-btn">➕ Nuovo obiettivo</button>
        </div>
      </div>

      ${goals.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            <div class="empty-state__icon">🏦</div>
            <div class="empty-state__title">Nessun obiettivo ancora</div>
            <div class="empty-state__desc">Crea il tuo primo obiettivo di risparmio per iniziare.</div>
          </div>
        </div>` : `
        <div class="grid-2">
          ${goals.map(goal => renderGoalCard(goal)).join('')}
        </div>`}
    `;
  }

  buildHTML();

  // ── Event delegation – attaccata UNA VOLTA sul container ─────────────────
  container.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'add-goal-btn') {
      openGoalModal(null, () => buildHTML());
      return;
    }

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains('goal-edit-btn')) {
      const goal = store.getSavingsGoals().find(g => String(g.id) === String(id));
      if (goal) openGoalModal(goal, () => buildHTML());
    }

    if (btn.classList.contains('goal-delete-btn')) {
      if (confirm('Eliminare questo obiettivo?')) {
        store.deleteSavingsGoal(id);
        showToast('Obiettivo eliminato.', 'success');
        buildHTML();
      }
    }

    if (btn.classList.contains('goal-deposit-btn')) {
      const goal = store.getSavingsGoals().find(g => String(g.id) === String(id));
      if (goal) openDepositModal(goal, () => buildHTML());
    }
  });
}

// ── Goal card ────────────────────────────────────────────────────────────────

function renderGoalCard(goal) {
  const pct    = goalProgress(goal);
  const pctPct = Math.round(pct * 100);
  const days   = daysRemaining(goal.deadline);
  const done   = pct >= 1;

  return `
    <div class="card kpi-card" style="position:relative;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">
        <div>
          <span style="font-size:2rem;">${escapeHTML(goal.icon || '🎯')}</span>
          <div style="font-size:1rem;font-weight:600;margin-top:0.25rem;">${escapeHTML(goal.name)}</div>
        </div>
        <div style="display:flex;gap:0.25rem;">
          <button class="btn btn--ghost btn--sm goal-edit-btn" data-id="${escapeHTML(goal.id)}" title="Modifica">✏️</button>
          <button class="btn btn--danger btn--sm goal-delete-btn" data-id="${escapeHTML(goal.id)}" title="Elimina">🗑️</button>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem;">
        <span style="font-size:0.8rem;color:var(--clr-text-muted);">Salvato</span>
        <span style="font-size:0.8rem;color:var(--clr-text-muted);">Obiettivo</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:0.75rem;">
        <span style="font-weight:700;color:var(--clr-savings);">${formatCurrency(goal.savedAmount)}</span>
        <span style="font-weight:600;">${formatCurrency(goal.targetAmount)}</span>
      </div>

      <div class="progress-bar" style="margin-bottom:0.5rem;">
        <div class="progress-bar__fill" style="width:${pctPct}%;${done ? 'background:var(--clr-income);' : ''}"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--clr-text-muted);">
        <span>${pctPct}% completato${done ? ' ✅' : ''}</span>
        ${goal.deadline ? `<span>${days !== null ? `${days} giorni rimasti · ` : ''}Scadenza ${formatDate(goal.deadline)}</span>` : ''}
      </div>

      ${!done ? `
      <div style="margin-top:1rem;">
        <button class="btn btn--outline goal-deposit-btn" style="width:100%;" data-id="${escapeHTML(goal.id)}">
          💸 Aggiungi versamento
        </button>
      </div>` : `
      <div style="margin-top:1rem;text-align:center;color:var(--clr-income);font-weight:600;">🎉 Obiettivo raggiunto!</div>`}
    </div>`;
}

// ── Modals ───────────────────────────────────────────────────────────────────

function openGoalModal(existingGoal, onSaved) {
  const isEdit = !!existingGoal;
  const ICONS  = ['🎯','🏠','🚗','✈️','💻','📱','🎓','💍','🏖️','📦','💰','🏋️'];

  const overlay = createElement(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="goal-modal-title">
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title" id="goal-modal-title">${isEdit ? 'Modifica' : 'Nuovo'} obiettivo</h2>
          <button class="modal__close" id="goal-modal-close" aria-label="Chiudi">✕</button>
        </div>
        <form id="goal-form" class="modal__body" novalidate>
          <div class="form-group">
            <label class="form-label">Icona</label>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
              ${ICONS.map(ic => `
                <button type="button" class="chip icon-chip ${(existingGoal?.icon ?? '🎯') === ic ? 'active' : ''}"
                  data-icon="${escapeHTML(ic)}" style="font-size:1.25rem;padding:0.4rem 0.6rem;">${escapeHTML(ic)}</button>
              `).join('')}
            </div>
            <input type="hidden" id="goal-icon" name="icon" value="${escapeHTML(existingGoal?.icon ?? '🎯')}" />
          </div>

          <div class="form-group">
            <label class="form-label" for="goal-name">Nome obiettivo</label>
            <input class="form-input" type="text" id="goal-name" name="name"
              placeholder="es. Vacanza estiva" value="${escapeHTML(existingGoal?.name ?? '')}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="goal-target">Importo obiettivo (€)</label>
            <input class="form-input" type="number" id="goal-target" name="targetAmount"
              min="1" step="0.01" placeholder="0,00" value="${escapeHTML(existingGoal?.targetAmount ?? '')}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="goal-saved">Già salvato (€)</label>
            <input class="form-input" type="number" id="goal-saved" name="savedAmount"
              min="0" step="0.01" placeholder="0,00" value="${escapeHTML(existingGoal?.savedAmount ?? 0)}" />
          </div>

          <div class="form-group">
            <label class="form-label" for="goal-deadline">Scadenza (opzionale)</label>
            <input class="form-input" type="date" id="goal-deadline" name="deadline"
              value="${escapeHTML(existingGoal?.deadline ?? '')}" />
          </div>

          <div class="modal__actions">
            <button type="button" class="btn btn--outline" id="goal-cancel-btn">Annulla</button>
            <button type="submit" class="btn btn--primary">${isEdit ? '💾 Salva' : '➕ Crea'}</button>
          </div>
        </form>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => { overlay.remove(); document.body.style.overflow = ''; };

  overlay.querySelector('#goal-modal-close').addEventListener('click', close);
  overlay.querySelector('#goal-cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Icon picker
  const iconInput = overlay.querySelector('#goal-icon');
  overlay.querySelectorAll('.icon-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      overlay.querySelectorAll('.icon-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      iconInput.value = chip.dataset.icon;
    });
  });

  overlay.querySelector('#goal-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(overlay.querySelector('#goal-form')));
    if (!data.name.trim())          { showToast("Inserisci un nome per l'obiettivo.", 'error'); return; }
    if (!validateAmount(data.targetAmount)) { showToast('Inserisci un importo valido.', 'error'); return; }

    const payload = {
      name:         data.name.trim(),
      icon:         data.icon,
      targetAmount: parseFloat(data.targetAmount),
      savedAmount:  parseFloat(data.savedAmount) || 0,
      deadline:     data.deadline || null,
    };

    if (isEdit) {
      store.updateSavingsGoal(existingGoal.id, payload);
      showToast('Obiettivo aggiornato.', 'success');
    } else {
      store.addSavingsGoal(payload);
      showToast('Obiettivo creato!', 'success');
    }
    close();
    onSaved();
  });
}

function openDepositModal(goal, onSaved) {
  const remaining = goal.targetAmount - goal.savedAmount;

  const overlay = createElement(`
    <div class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title">${escapeHTML(goal.icon)} Versamento per "${escapeHTML(goal.name)}"</h2>
          <button class="modal__close" id="dep-close">✕</button>
        </div>
        <form id="dep-form" class="modal__body" novalidate>
          <div class="form-group">
            <label class="form-label" for="dep-amount">Importo da aggiungere (€)</label>
            <input class="form-input" type="number" id="dep-amount" name="amount"
              min="0.01" step="0.01" max="${remaining}"
              placeholder="0,00" required />
            <span style="font-size:0.75rem;color:var(--clr-text-muted);">
              Mancano ancora ${formatCurrency(remaining)}
            </span>
          </div>
          <div class="modal__actions">
            <button type="button" class="btn btn--outline" id="dep-cancel">Annulla</button>
            <button type="submit" class="btn btn--primary">💸 Aggiungi</button>
          </div>
        </form>
      </div>
    </div>
  `);

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.querySelector('#dep-close').addEventListener('click', close);
  overlay.querySelector('#dep-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#dep-form').addEventListener('submit', e => {
    e.preventDefault();
    const amount = parseFloat(overlay.querySelector('#dep-amount').value);
    if (!validateAmount(amount)) { showToast('Importo non valido.', 'error'); return; }
    const newSaved = Math.min(goal.savedAmount + amount, goal.targetAmount);
    const addedAmount = newSaved - goal.savedAmount;
    store.updateSavingsGoal(goal.id, { savedAmount: newSaved });
    showToast(`${formatCurrency(addedAmount)} aggiunti all'obiettivo!`, 'success');
    close();
    onSaved();
  });
}
