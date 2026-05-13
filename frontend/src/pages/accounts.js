/**
 * pages/accounts.js - Account registration / login page
 *
 * Flow:
 *   1. No account in localStorage → show registration form
 *   2. Account in localStorage but no active session → show login form
 *   3. After register: navigate to #/profiles (profile selection)
 *   4. After login:   navigate to #/profiles (profile selection)
 */

import {
  registerAccount,
  loginAccount,
  getActiveAccount,
  checkAndRestoreSession,
} from '../data/auth-accounts.js';

export async function renderAccountsPage(container) {
  const el = container || document.getElementById('app');

  // Try to restore session first (cookie-based)
  const restored = await checkAndRestoreSession().catch(() => ({ restored: false }));
  if (restored.restored && restored.profile) {
    window.location.hash = '#/dashboard';
    return;
  }
  if (restored.restored && restored.account) {
    window.location.hash = '#/profiles';
    return;
  }

  const cachedAccount = getActiveAccount();
  const showLogin = Boolean(cachedAccount);

  el.innerHTML = showLogin ? renderLoginForm(cachedAccount) : renderRegisterForm();
  setupAccountsPageEvents(el, showLogin);
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRegisterForm() {
  return `
    <div class="page page-accounts">
      <div class="page-accounts__inner">
      <div class="auth-card" id="account-form-card">
        <div class="auth-card__icon" aria-hidden="true">👤</div>
        <h1>Crea il tuo account</h1>
        <p>Registrazione gratuita. I tuoi dati restano privati.</p>

        <form id="account-register-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="reg-email">Email</label>
            <input class="form-input" id="reg-email" name="email" type="email" autocomplete="email" required placeholder="mail@esempio.it" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-password">Password account</label>
            <input class="form-input" id="reg-password" name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="min 8 caratteri" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-username">Nome primo profilo</label>
            <input class="form-input" id="reg-username" name="profileUsername" type="text" autocomplete="username" required placeholder="es. Marco" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-profile-password">Password profilo</label>
            <input class="form-input" id="reg-profile-password" name="profilePassword" type="password" autocomplete="new-password" minlength="8" required placeholder="min 8 caratteri" />
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-currency">Valuta</label>
            <select class="form-select" id="reg-currency" name="currency">
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CHF">CHF (₣)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-locale">Lingua</label>
            <select class="form-select" id="reg-locale" name="locale">
              <option value="it-IT">Italiano</option>
              <option value="en-US">English</option>
              <option value="de-DE">Deutsch</option>
              <option value="fr-FR">Français</option>
            </select>
          </div>

          <p class="auth-error" id="account-error" role="alert" style="display:none;"></p>
          <button class="btn btn--primary" type="submit" id="account-submit-btn">Crea account</button>
        </form>

        <p style="margin-top: var(--sp-3); text-align: center; font-size: 0.875rem;">
          Hai già un account? <button class="btn btn--ghost btn--inline" id="switch-to-login-btn" type="button">Accedi</button>
        </p>
      </div>
      </div>
    </div>
  `;
}

function renderLoginForm(cachedAccount) {
  return `
    <div class="page page-accounts">
      <div class="page-accounts__inner">
      <div class="auth-card" id="account-form-card">
        <div class="auth-card__icon" aria-hidden="true">👤</div>
        <h1>Bentornato</h1>
        ${cachedAccount ? `<p>Account: <strong>${escapeHtml(cachedAccount.email)}</strong></p>` : ''}

        <form id="account-login-form" novalidate>
          <div class="form-group">
            <label class="form-label" for="login-email">Email</label>
            <input class="form-input" id="login-email" name="email" type="email" autocomplete="email" required
              value="${escapeHtml(cachedAccount ? cachedAccount.email : '')}" placeholder="mail@esempio.it" />
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input class="form-input" id="login-password" name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="password account" />
          </div>
          <div class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
            <input type="checkbox" id="login-trust-device" name="trustDevice" checked />
            <label for="login-trust-device" style="font-size:0.85rem; color:var(--clr-text-subtle); cursor:pointer;">
              Ricorda questo dispositivo
            </label>
          </div>

          <p class="auth-error" id="account-error" role="alert" style="display:none;"></p>
          <button class="btn btn--primary" type="submit" id="account-submit-btn">Accedi</button>
        </form>

        <p style="margin-top: var(--sp-3); text-align: center; font-size: 0.875rem;">
          Nuovo utente? <button class="btn btn--ghost btn--inline" id="switch-to-register-btn" type="button">Crea account</button>
        </p>
      </div>
      </div>
    </div>
  `;
}

// ── Event setup ────────────────────────────────────────────────────────────────

function showError(el, message) {
  const errorEl = el.querySelector('#account-error');
  if (!errorEl) return;
  errorEl.textContent = message || '';
  errorEl.style.display = message ? 'block' : 'none';
}

function setLoading(el, loading) {
  const btn = el.querySelector('#account-submit-btn');
  if (btn) btn.disabled = loading;
}

function setupAccountsPageEvents(el, isLoginMode) {
  // Switch between register and login forms
  const switchToLogin = el.querySelector('#switch-to-login-btn');
  if (switchToLogin) {
    switchToLogin.addEventListener('click', () => {
      el.innerHTML = renderLoginForm(getActiveAccount());
      setupAccountsPageEvents(el, true);
    });
  }
  const switchToRegister = el.querySelector('#switch-to-register-btn');
  if (switchToRegister) {
    switchToRegister.addEventListener('click', () => {
      el.innerHTML = renderRegisterForm();
      setupAccountsPageEvents(el, false);
    });
  }

  if (isLoginMode) {
    const form = el.querySelector('#account-login-form');
    if (form) {
      requestAnimationFrame(() => {
        const pwdInput = form.querySelector('#login-password');
        if (pwdInput) pwdInput.focus();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        showError(el, '');
        setLoading(el, true);
        const data = Object.fromEntries(new FormData(form));
        // `FormData` returns "on" for checked checkboxes, undefined otherwise.
        const trustDevice = data.trustDevice === 'on' || data.trustDevice === true;
        try {
          await loginAccount({ email: data.email, password: data.password, trustDevice });
          window.location.hash = '#/profiles';
        } catch (err) {
          showError(el, err.message);
          setLoading(el, false);
        }
      });
    }
  } else {
    const form = el.querySelector('#account-register-form');
    if (form) {
      requestAnimationFrame(() => {
        const emailInput = form.querySelector('#reg-email');
        if (emailInput) emailInput.focus();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        showError(el, '');
        setLoading(el, true);
        const data = Object.fromEntries(new FormData(form));
        try {
          await registerAccount({
            email: data.email,
            password: data.password,
            profileUsername: data.profileUsername,
            profilePassword: data.profilePassword,
            currency: data.currency,
            locale: data.locale,
          });
          window.location.hash = '#/profiles';
        } catch (err) {
          showError(el, err.message);
          setLoading(el, false);
        }
      });
    }
  }
}
