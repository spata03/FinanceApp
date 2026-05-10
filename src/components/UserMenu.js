/**
 * UserMenu.js - Sezione utente e gate di accesso.
 */

import {
  getActiveAccount,
  listAccounts,
  loginAccount,
  logoutAccount,
  registerAccount,
  deleteAccount,
  quickSwitchAccount,
} from '../data/auth.js';
import { createElement, escapeHTML, showToast } from '../utils/helpers.js';

const ACCOUNT_ROOT_ID = 'account-widget-root';
const AUTH_OVERLAY_ID = 'auth-overlay';

function accountInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || 'U';
}

function formatLastLogin(dateStr) {
  if (!dateStr) return 'Mai effettuato';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Mai effettuato';
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Mai effettuato';
  }
}

function accountOptions(accounts, activeId = '') {
  return accounts.map(account => `
    <option value="${escapeHTML(account.id)}" ${account.id === activeId ? 'selected' : ''}>
      ${escapeHTML(account.displayName)}
    </option>
  `).join('');
}

function renderWidget(root) {
  const active = getActiveAccount();
  if (!active) {
    root.innerHTML = `
      <button class="account-button" id="account-signin-btn" type="button">
        <span class="account-avatar" aria-hidden="true">U</span>
        <span>Accedi</span>
      </button>
    `;
    root.querySelector('#account-signin-btn').addEventListener('click', () => showAuthGate());
    return;
  }

  root.innerHTML = `
    <div class="account-widget">
      <button class="account-button" id="account-menu-btn" type="button" aria-haspopup="menu" aria-expanded="false">
        <span class="account-avatar" aria-hidden="true">${escapeHTML(accountInitials(active.displayName))}</span>
        <span class="account-button__name">${escapeHTML(active.displayName)}</span>
      </button>
      <div class="account-menu" id="account-menu" role="menu" hidden>
        <div class="account-menu__header">
          <span class="account-avatar account-avatar--lg" aria-hidden="true">${escapeHTML(accountInitials(active.displayName))}</span>
          <div>
            <strong>${escapeHTML(active.displayName)}</strong>
            <span>Dati locali con sync privato</span>
          </div>
        </div>
        <button type="button" role="menuitem" data-account-action="settings">Impostazioni utente</button>
        <button type="button" role="menuitem" data-account-action="switch">Cambia utente</button>
        <button type="button" role="menuitem" data-account-action="lock">Blocca app</button>
        <hr class="divider" style="margin: var(--sp-2) 0;" />
        <button type="button" role="menuitem" data-account-action="delete" style="color: var(--clr-expense);">Elimina account</button>
      </div>
    </div>
  `;

  const button = root.querySelector('#account-menu-btn');
  const menu = root.querySelector('#account-menu');
  const setOpen = open => {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const closeOnOutside = event => {
    if (!root.contains(event.target)) {
      setOpen(false);
      document.removeEventListener('click', closeOnOutside);
    }
  };

  button.addEventListener('click', event => {
    event.stopPropagation();
    const shouldOpen = menu.hidden;
    setOpen(shouldOpen);
    if (shouldOpen) {
      setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    } else {
      document.removeEventListener('click', closeOnOutside);
    }
  });

  root.querySelectorAll('[data-account-action]').forEach(action => {
    action.addEventListener('click', async () => {
      setOpen(false);
      document.removeEventListener('click', closeOnOutside);
      const type = action.dataset.accountAction;
      if (type === 'settings') {
        window.location.hash = 'impostazioni';
        return;
      }
      if (type === 'delete') {
        if (confirm('Sei sicuro di voler eliminare definitivamente questo account e tutti i suoi dati dal server e dal dispositivo? Questa operazione non è reversibile.')) {
          await deleteAccount(active.id);
          window.location.reload();
        }
        return;
      }
      logoutAccount();
      window.location.reload();
    });
  });

}
function authPanel(mode) {
  const accounts = listAccounts();
  const active = getActiveAccount();
  const hasAccounts = accounts.length > 0;
  const safeMode = mode === 'register' || !hasAccounts ? 'register' : (mode || 'profiles');
  const secureNote = window.isSecureContext
    ? ''
    : '<p class="auth-warning"><strong>Nota:</strong> Connessione locale non HTTPS. Puoi procedere regolarmente per creare l\'account: l\'app usa una modalità sicura compatibile.</p>';

  if (safeMode === 'profiles') {
    return `
      <div class="auth-card auth-card--profiles" id="auth-form" data-auth-form="profiles">
        <h1 style="text-align:center; margin-bottom: 0;">Chi sta usando l'app?</h1>
        <div class="profiles-grid">
          ${accounts.map(account => `
            <div class="profile-card">
              <button class="profile-btn" type="button" data-quick-login="${escapeHTML(account.id)}">
                <span class="account-avatar account-avatar--xl" aria-hidden="true">${escapeHTML(accountInitials(account.displayName))}</span>
                <span class="profile-name">${escapeHTML(account.displayName)}</span>
                <span style="font-size:0.7rem;color:var(--clr-text-subtle);margin-top:2px;">${formatLastLogin(account.lastLoginAt)}</span>
              </button>
              <button class="profile-delete-btn" type="button" data-delete-account="${escapeHTML(account.id)}" title="Elimina account" aria-label="Elimina account">✕</button>
            </div>
          `).join('')}
          <div class="profile-card">
            <button class="profile-btn profile-btn--new" type="button" data-auth-mode="register">
              <span class="account-avatar account-avatar--xl" aria-hidden="true">+</span>
              <span class="profile-name">Nuovo utente</span>
            </button>
          </div>
        </div>
        <p class="auth-error" id="auth-error" role="alert" style="text-align:center;"></p>
        <div style="display:flex; flex-direction:column; gap: var(--sp-2); align-items:center;">
          <button class="btn btn--outline" id="manage-profiles-btn" type="button">Gestisci profili</button>
          <button class="btn btn--ghost" type="button" data-auth-mode="login">Accedi con password (altro utente)</button>
        </div>
      </div>
    `;
  }

  if (safeMode === 'register') {
    return `
      <form class="auth-card" id="auth-form" data-auth-form="register">
        <div class="auth-card__icon" aria-hidden="true">👤</div>
        <h1>Crea utente</h1>
        <p>Ogni utente ha password e dati locali separati.</p>
        <div class="form-group">
          <label class="form-label" for="auth-name">Nome utente</label>
          <input class="form-input" id="auth-name" name="displayName" type="text" autocomplete="username" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-password">Password</label>
          <input class="form-input" id="auth-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="auth-confirm">Conferma password</label>
          <input class="form-input" id="auth-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required />
        </div>
        ${secureNote}
        <p class="auth-error" id="auth-error" role="alert"></p>
        <button class="btn btn--primary" type="submit">Crea e accedi</button>
        ${hasAccounts ? '<button class="btn btn--ghost" type="button" data-auth-mode="profiles">Annulla</button>' : ''}
      </form>
    `;
  }

  return `
    <form class="auth-card" id="auth-form" data-auth-form="login">
      <div class="auth-card__icon" aria-hidden="true">👤</div>
      <h1>Accedi</h1>
      <p>Scegli l'utente e inserisci la password.</p>
      <div class="form-group">
        <label class="form-label" for="auth-account">Utente</label>
        <select class="form-select" id="auth-account" name="accountId" autocomplete="username">
          ${accountOptions(accounts, getActiveAccount()?.id || '')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="auth-password">Password</label>
        <input class="form-input" id="auth-password" name="password" type="password" autocomplete="current-password" minlength="8" required />
      </div>
      ${secureNote}
      <p class="auth-error" id="auth-error" role="alert"></p>
      <button class="btn btn--primary" type="submit">Entra</button>
      <button class="btn btn--ghost" type="button" data-auth-mode="profiles">Annulla</button>
    </form>
  `;
}

function setAuthError(overlay, message) {
  const error = overlay.querySelector('#auth-error');
  if (error) error.textContent = message || '';
}

function bindAuthOverlay(overlay, mode) {
  overlay.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => {
      overlay.querySelector('.auth-dialog').innerHTML = authPanel(button.dataset.authMode);
      bindAuthOverlay(overlay, button.dataset.authMode);
    });
  });

  overlay.querySelectorAll('[data-quick-login]').forEach(button => {
    button.addEventListener('click', async () => {
      setAuthError(overlay, '');
      try {
        await quickSwitchAccount(button.dataset.quickLogin);
        window.location.reload();
      } catch (error) {
        setAuthError(overlay, error.message);
      }
    });
  });

  overlay.querySelectorAll('[data-delete-account]').forEach(button => {
    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('Sei sicuro di voler eliminare questo account dal dispositivo e dal server?')) {
        setAuthError(overlay, '');
        try {
          await deleteAccount(button.dataset.deleteAccount);
          const accounts = listAccounts();
          if (accounts.length === 0) {
            overlay.querySelector('.auth-dialog').innerHTML = authPanel('register');
            bindAuthOverlay(overlay, 'register');
          } else {
            overlay.querySelector('.auth-dialog').innerHTML = authPanel('profiles');
            bindAuthOverlay(overlay, 'profiles');
          }
        } catch (error) {
          setAuthError(overlay, 'Errore eliminazione: ' + error.message);
        }
      }
    });
  });

  const manageBtn = overlay.querySelector('#manage-profiles-btn');
  if (manageBtn) {
    manageBtn.addEventListener('click', () => {
      const grid = overlay.querySelector('.profiles-grid');
      const isEditing = grid.classList.toggle('is-editing');
      manageBtn.textContent = isEditing ? 'Fatto' : 'Gestisci profili';
      manageBtn.classList.toggle('btn--primary', isEditing);
      manageBtn.classList.toggle('btn--outline', !isEditing);
    });
  }

  const form = overlay.querySelector('#auth-form');
  if (!form || form.dataset.authForm === 'profiles') return;

  requestAnimationFrame(() => {
    const firstInput = form.querySelector('input, select');
    firstInput?.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setAuthError(overlay, '');
    const submit = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    submit.disabled = true;

    try {
      if (form.dataset.authForm === 'register') {
        if (data.password !== data.confirmPassword) {
          throw new Error('Le password non coincidono.');
        }
        await registerAccount({
          displayName: data.displayName,
          password: data.password,
        });
        showToast('Utente creato. Accesso eseguito.', 'success');
      } else {
        await loginAccount(data.accountId, data.password);
        showToast('Accesso eseguito.', 'success');
      }
      window.location.reload();
    } catch (error) {
      setAuthError(overlay, error.message);
      submit.disabled = false;
    }
  });

  if (mode === 'register' && !listAccounts().length) {
    const nameInput = form.querySelector('#auth-name');
    if (nameInput) nameInput.placeholder = 'es. Andrea';
  }
}

export function showAuthGate(mode) {
  document.getElementById(AUTH_OVERLAY_ID)?.remove();
  const initialMode = mode || (listAccounts().length ? 'profiles' : 'register');
  const overlay = createElement(`
    <div class="auth-overlay" id="${AUTH_OVERLAY_ID}">
      <div class="auth-dialog" role="dialog" aria-modal="true" aria-label="Accesso utente">
        ${authPanel(initialMode)}
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  document.body.classList.add('is-auth-locked');
  bindAuthOverlay(overlay, initialMode);
}

export function setupUserMenu() {
  let root = document.getElementById(ACCOUNT_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ACCOUNT_ROOT_ID;
    document.body.appendChild(root);
  }
  renderWidget(root);
}

export function ensureAuthenticated() {
  const active = getActiveAccount();
  if (!active) {
    showAuthGate();
    return false;
  }
  document.body.classList.remove('is-auth-locked');
  return true;
}
