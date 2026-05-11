/**
 * UserMenu.js - User widget displayed in the sidebar / topbar.
 *
 * Shows: email account + active profile name.
 * Actions: "Cambia Profilo" → #/profiles, "Logout" → #/accounts.
 */

import {
  getActiveAccount,
  getActiveProfile,
  logoutAccount,
} from '../data/auth-accounts.js';
import { showToast } from '../utils/helpers.js';

const ACCOUNT_ROOT_ID = 'account-widget-root';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function profileInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || 'U';
}

function renderWidget(root) {
  const account = getActiveAccount();
  const profile = getActiveProfile();

  if (!account || !profile) {
    root.innerHTML = `
      <button class="account-button" id="account-signin-btn" type="button" aria-label="Accedi">
        <span class="account-avatar" aria-hidden="true">U</span>
        <span>Accedi</span>
      </button>
    `;
    root.querySelector('#account-signin-btn').addEventListener('click', () => {
      window.location.hash = '#/accounts';
    });
    return;
  }

  root.innerHTML = `
    <div class="account-widget">
      <button class="account-button" id="account-menu-btn" type="button" aria-haspopup="menu" aria-expanded="false">
        <span class="account-avatar" aria-hidden="true">${escapeHtml(profileInitials(profile.username))}</span>
        <span class="account-button__name">${escapeHtml(profile.username)}</span>
      </button>
      <div class="account-menu" id="account-menu" role="menu" hidden>
        <div class="account-menu__header">
          <span class="account-avatar account-avatar--lg" aria-hidden="true">${escapeHtml(profileInitials(profile.username))}</span>
          <div>
            <strong>${escapeHtml(profile.username)}</strong>
            <span style="font-size:0.75rem;color:var(--clr-text-subtle);">${escapeHtml(account.email)}</span>
          </div>
        </div>
        <button type="button" role="menuitem" data-account-action="change-profile">Cambia Profilo</button>
        <hr class="divider" style="margin: var(--sp-2) 0;" />
        <button type="button" role="menuitem" data-account-action="logout" style="color: var(--clr-expense);">Logout</button>
      </div>
    </div>
  `;

  const button = root.querySelector('#account-menu-btn');
  const menu = root.querySelector('#account-menu');

  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  const closeOnOutside = (event) => {
    if (!root.contains(event.target)) {
      setOpen(false);
      document.removeEventListener('click', closeOnOutside);
    }
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = menu.hidden;
    setOpen(shouldOpen);
    if (shouldOpen) {
      setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    } else {
      document.removeEventListener('click', closeOnOutside);
    }
  });

  root.querySelectorAll('[data-account-action]').forEach(actionBtn => {
    actionBtn.addEventListener('click', async () => {
      setOpen(false);
      document.removeEventListener('click', closeOnOutside);

      const type = actionBtn.dataset.accountAction;

      if (type === 'change-profile') {
        window.location.hash = '#/profiles';
        return;
      }

      if (type === 'logout') {
        try {
          await logoutAccount();
          showToast('Logout effettuato.', 'success');
        } catch (e) {
          console.warn('[UserMenu] Logout error:', e.message);
        }
        window.location.hash = '#/accounts';
      }
    });
  });
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

/**
 * Check if the user has an authenticated account + profile.
 * Returns true if authenticated, false if the user was redirected.
 */
export function ensureAuthenticated() {
  const account = getActiveAccount();
  const profile = getActiveProfile();

  if (!account) {
    window.location.hash = '#/accounts';
    return false;
  }

  if (!profile) {
    window.location.hash = '#/profiles';
    return false;
  }

  document.body.classList.remove('is-auth-locked');
  return true;
}

/**
 * @deprecated No longer used — kept so existing imports don't break.
 */
export function showAuthGate(mode) {
  console.warn('[UserMenu] showAuthGate is deprecated. Use #/accounts navigation.');
  window.location.hash = '#/accounts';
}
