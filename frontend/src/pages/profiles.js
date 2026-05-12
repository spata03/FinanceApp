/**
 * pages/profiles.js - Profile selection / creation page
 *
 * Flow:
 *   1. Show list of profiles for the active account
 *   2. Click a profile → enter password → selectProfile → navigate to #/dashboard
 *   3. "Nuovo Profilo" → create form → createProfile → reload profiles page
 *   4. No account → redirect to #/accounts
 */

import {
  getActiveAccount,
  listProfilesForAccount,
  selectProfile,
  createProfile,
  deleteProfile,
  logoutAccount,
  assertUsername,
  assertPassword,
} from '../data/auth-accounts.js';
import { ensureBackendSession } from '../utils/backendClient.js';

export async function renderProfilesPage(container) {
  const el = container || document.getElementById('app');
  const account = getActiveAccount();

  if (!account) {
    window.location.hash = '#/accounts';
    return;
  }

  const profiles = listProfilesForAccount(account.id);

  el.innerHTML = buildProfilesHtml(account, profiles);
  setupProfilesPageEvents(el, account.id, profiles);
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildProfilesHtml(account, profiles) {
  return `
    <div class="page page-profiles">
      <header class="profiles-header">
        <h1>Chi sta usando l'app?</h1>
        <span style="font-size:0.85rem;color:var(--clr-text-subtle);">${escapeHtml(account.email)}</span>
      </header>

      <main class="profiles-main">
        ${profiles.length === 0 ? renderNoProfiles() : renderProfilesList(profiles)}
      </main>

      <footer class="profiles-footer">
        <button id="profiles-new-profile" class="btn btn--secondary" type="button">+ Nuovo Profilo</button>
        <button id="profiles-change-account" class="btn btn--outline" type="button">Cambia Account</button>
      </footer>
    </div>

    <!-- Profile login modal -->
    <div id="profile-login-modal" class="modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="profile-login-title">
      <div class="modal-content">
        <h2 id="profile-login-title">Accedi al profilo</h2>
        <p id="profile-login-subtitle" style="color:var(--clr-text-subtle);"></p>
        <div class="form-group">
          <label class="form-label" for="profile-login-password">Password profilo</label>
          <input class="form-input" type="password" id="profile-login-password" autocomplete="current-password" />
        </div>
        <p class="auth-error" id="profile-login-error" role="alert" style="display:none;"></p>
        <div class="form-actions">
          <button id="profile-login-submit" class="btn btn--primary" type="button">Accedi</button>
          <button id="profile-login-cancel" class="btn btn--outline" type="button">Annulla</button>
        </div>
      </div>
    </div>

    <!-- Create profile modal -->
    <div id="create-profile-modal" class="modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="create-profile-title">
      <div class="modal-content">
        <h2 id="create-profile-title">Nuovo Profilo</h2>
        <div class="form-group">
          <label class="form-label" for="create-profile-username">Nome profilo</label>
          <input class="form-input" type="text" id="create-profile-username" autocomplete="username" placeholder="es. Marco" />
        </div>
        <div class="form-group">
          <label class="form-label" for="create-profile-password">Password</label>
          <input class="form-input" type="password" id="create-profile-password" autocomplete="new-password" placeholder="min 8 caratteri" />
        </div>
        <div class="form-group">
          <label class="form-label" for="create-profile-currency">Valuta</label>
          <select class="form-select" id="create-profile-currency">
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CHF">CHF (₣)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="create-profile-locale">Lingua</label>
          <select class="form-select" id="create-profile-locale">
            <option value="it-IT">Italiano</option>
            <option value="en-US">English</option>
            <option value="de-DE">Deutsch</option>
            <option value="fr-FR">Français</option>
          </select>
        </div>
        <p class="auth-error" id="create-profile-error" role="alert" style="display:none;"></p>
        <div class="form-actions">
          <button id="create-profile-submit" class="btn btn--primary" type="button">Crea Profilo</button>
          <button id="create-profile-cancel" class="btn btn--outline" type="button">Annulla</button>
        </div>
      </div>
    </div>
  `;
}

function renderNoProfiles() {
  return `
    <div class="empty-state">
      <p>Non hai ancora profili in questo account. Creane uno per iniziare.</p>
    </div>
  `;
}

function renderProfilesList(profiles) {
  return `
    <div class="profiles-grid">
      ${profiles.map(p => `
        <div class="profile-card">
          <button class="profile-btn" type="button" data-select-profile="${escapeHtml(p.id)}">
            <span class="account-avatar account-avatar--xl" aria-hidden="true">${escapeHtml(initials(p.username))}</span>
            <span class="profile-name">${escapeHtml(p.username)}</span>
            <span style="font-size:0.7rem;color:var(--clr-text-subtle);">${escapeHtml(p.currency)} • ${escapeHtml(p.locale)}</span>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || 'P';
}

// ── Event setup ────────────────────────────────────────────────────────────────

function showError(el, id, message) {
  const errEl = el.querySelector(`#${id}`);
  if (!errEl) return;
  errEl.textContent = message || '';
  errEl.style.display = message ? 'block' : 'none';
}

function setupProfilesPageEvents(el, accountId, profiles) {
  // Profile select buttons
  el.querySelectorAll('[data-select-profile]').forEach(btn => {
    btn.addEventListener('click', () => {
      const profileId = btn.dataset.selectProfile;
      const profile = profiles.find(p => p.id === profileId);
      if (profile) openLoginModal(el, profile);
    });
  });

  // New profile button
  const newProfileBtn = el.querySelector('#profiles-new-profile');
  if (newProfileBtn) {
    newProfileBtn.addEventListener('click', () => openCreateModal(el));
  }

  // Change account button
  const changeAccountBtn = el.querySelector('#profiles-change-account');
  if (changeAccountBtn) {
    changeAccountBtn.addEventListener('click', async () => {
      await logoutAccount().catch(() => null);
      window.location.hash = '#/accounts';
    });
  }

  // Login modal
  const loginModal = el.querySelector('#profile-login-modal');
  const loginSubmit = el.querySelector('#profile-login-submit');
  const loginCancel = el.querySelector('#profile-login-cancel');

  if (loginCancel) {
    loginCancel.addEventListener('click', () => { loginModal.style.display = 'none'; });
  }
  if (loginSubmit) {
    loginSubmit.addEventListener('click', () => handleProfileLoginSubmit(el, loginModal, accountId));
  }
  if (loginModal) {
    // Allow submit on Enter
    const pwdInput = el.querySelector('#profile-login-password');
    if (pwdInput) {
      pwdInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleProfileLoginSubmit(el, loginModal, accountId);
      });
    }
  }

  // Create profile modal
  const createModal = el.querySelector('#create-profile-modal');
  const createSubmit = el.querySelector('#create-profile-submit');
  const createCancel = el.querySelector('#create-profile-cancel');

  if (createCancel) {
    createCancel.addEventListener('click', () => { createModal.style.display = 'none'; });
  }
  if (createSubmit) {
    createSubmit.addEventListener('click', () => handleCreateProfileSubmit(el, createModal, accountId));
  }
}

function openLoginModal(el, profile) {
  const modal = el.querySelector('#profile-login-modal');
  modal.dataset.profileId = profile.id;
  const subtitle = el.querySelector('#profile-login-subtitle');
  if (subtitle) subtitle.textContent = profile.username;
  const pwdInput = el.querySelector('#profile-login-password');
  if (pwdInput) pwdInput.value = '';
  showError(el, 'profile-login-error', '');
  modal.style.display = 'flex';
  requestAnimationFrame(() => pwdInput && pwdInput.focus());
}

function openCreateModal(el) {
  const modal = el.querySelector('#create-profile-modal');
  const usernameInput = el.querySelector('#create-profile-username');
  const pwdInput = el.querySelector('#create-profile-password');
  if (usernameInput) usernameInput.value = '';
  if (pwdInput) pwdInput.value = '';
  showError(el, 'create-profile-error', '');
  modal.style.display = 'flex';
  requestAnimationFrame(() => usernameInput && usernameInput.focus());
}

async function handleProfileLoginSubmit(el, modal, accountId) {
  const profileId = modal.dataset.profileId;
  const password = el.querySelector('#profile-login-password')?.value || '';
  showError(el, 'profile-login-error', '');

  const submitBtn = el.querySelector('#profile-login-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await ensureBackendSession().catch(() => null);
    await selectProfile(profileId, password);
    modal.style.display = 'none';
    window.location.hash = '#/dashboard';
  } catch (err) {
    showError(el, 'profile-login-error', err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleCreateProfileSubmit(el, modal, accountId) {
  const username = el.querySelector('#create-profile-username')?.value?.trim() || '';
  const password = el.querySelector('#create-profile-password')?.value || '';
  const currency = el.querySelector('#create-profile-currency')?.value || 'EUR';
  const locale = el.querySelector('#create-profile-locale')?.value || 'it-IT';
  showError(el, 'create-profile-error', '');

  const submitBtn = el.querySelector('#create-profile-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await ensureBackendSession().catch(() => null);
    assertUsername(username);
    assertPassword(password);
    await createProfile(accountId, { username, password, currency, locale });
    modal.style.display = 'none';
    // Re-render the profiles page to show the new profile
    await renderProfilesPage(el.closest('#app') || el);
  } catch (err) {
    showError(el, 'create-profile-error', err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
