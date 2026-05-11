/**
 * pages/accounts.js - Pagina di selezione/login degli account
 */

import {
  registerAccount,
  loginAccount,
  listAccountsSummary,
  setActiveAccountId,
  setActiveProfileId,
} from '../data/auth-accounts.js';

export async function renderAccountsPage() {
  const container = document.getElementById('app');
  const accounts = listAccountsSummary();

  const html = `
    <div class="page page-accounts">
      <header class="accounts-header">
        <h1>I Tuoi Account</h1>
      </header>

      <main class="accounts-main">
        ${accounts.length === 0 ? renderNoAccounts() : renderAccountsList(accounts)}
      </main>

      <footer class="accounts-footer">
        ${accounts.length > 0 ? '<button id="accounts-new-account" class="button button-secondary">+ Nuovo Account</button>' : ''}
        <button id="accounts-offline-mode" class="button button-outline">Modalità Offline</button>
      </footer>
    </div>

    <div id="login-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <h2>Login Account</h2>
        <div class="form-group">
          <label>Email:</label>
          <input type="email" id="login-email" placeholder="mail@example.com" />
        </div>
        <div class="form-group">
          <label>Password:</label>
          <input type="password" id="login-password" />
        </div>
        <div class="form-actions">
          <button id="login-submit" class="button">Login</button>
          <button id="login-cancel" class="button button-outline">Annulla</button>
        </div>
        <div id="login-error" class="error-message" style="display: none;"></div>
      </div>
    </div>

    <div id="register-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <h2>Nuovo Account</h2>
        <div class="form-group">
          <label>Email:</label>
          <input type="email" id="register-email" placeholder="mail@example.com" />
        </div>
        <div class="form-group">
          <label>Password Account:</label>
          <input type="password" id="register-password" placeholder="min 8 caratteri" />
        </div>
        <div class="form-group">
          <label>Nome Profilo (primo profilo):</label>
          <input type="text" id="register-username" placeholder="es. Marco" />
        </div>
        <div class="form-group">
          <label>Password Profilo:</label>
          <input type="password" id="register-profile-password" placeholder="min 8 caratteri" />
        </div>
        <div class="form-group">
          <label>Valuta:</label>
          <select id="register-currency">
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CHF">CHF (₣)</option>
          </select>
        </div>
        <div class="form-actions">
          <button id="register-submit" class="button">Crea Account</button>
          <button id="register-cancel" class="button button-outline">Annulla</button>
        </div>
        <div id="register-error" class="error-message" style="display: none;"></div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Attach event listeners
  setupAccountsPageEvents();
}

function renderNoAccounts() {
  return `
    <div class="empty-state">
      <p>Non hai ancora account. Creane uno per iniziare.</p>
    </div>
  `;
}

function renderAccountsList(accounts) {
  return `
    <div class="accounts-list">
      ${accounts.map(account => `
        <div class="account-card" data-account-id="${account.id}">
          <div class="account-info">
            <strong>${account.email}</strong>
            <small>${account.profileCount} profilo${account.profileCount !== 1 ? 'i' : ''}</small>
            <small>${account.lastLoginAt ? new Date(account.lastLoginAt).toLocaleString('it-IT') : 'Mai'}</small>
          </div>
          <div class="account-actions">
            <button class="account-select-button button" data-account-id="${account.id}">Accedi</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function setupAccountsPageEvents() {
  // Select account
  document.addEventListener('click', (e) => {
    const selectButton = e.target.closest('.account-select-button');
    if (selectButton) {
      const accountId = selectButton.dataset.accountId;
      showLoginModal(accountId);
      return;
    }

    const newAccountButton = e.target.closest('#accounts-new-account');
    if (newAccountButton) {
      showRegisterModal();
      return;
    }

    const offlineModeButton = e.target.closest('#accounts-offline-mode');
    if (offlineModeButton) {
      handleOfflineMode();
      return;
    }
  });

  // Login modal
  const loginModal = document.getElementById('login-modal');
  const loginSubmit = document.getElementById('login-submit');
  const loginCancel = document.getElementById('login-cancel');

  if (loginSubmit) {
    loginSubmit.addEventListener('click', handleLoginSubmit);
  }
  if (loginCancel) {
    loginCancel.addEventListener('click', () => {
      loginModal.style.display = 'none';
    });
  }

  // Register modal
  const registerModal = document.getElementById('register-modal');
  const registerSubmit = document.getElementById('register-submit');
  const registerCancel = document.getElementById('register-cancel');

  if (registerSubmit) {
    registerSubmit.addEventListener('click', handleRegisterSubmit);
  }
  if (registerCancel) {
    registerCancel.addEventListener('click', () => {
      registerModal.style.display = 'none';
    });
  }
}

function showLoginModal(accountId) {
  const modal = document.getElementById('login-modal');
  modal.dataset.accountId = accountId;
  modal.style.display = 'flex';
  document.getElementById('login-email').focus();
}

function showRegisterModal() {
  const modal = document.getElementById('register-modal');
  modal.style.display = 'flex';
  document.getElementById('register-email').focus();
}

async function handleLoginSubmit() {
  const modal = document.getElementById('login-modal');
  const accountId = modal.dataset.accountId;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');

  try {
    errorDiv.style.display = 'none';
    const result = await loginAccount({ email, password });
    setActiveAccountId(accountId);
    
    // Vai alla selezione profili
    window.location.hash = '#/profiles';
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

async function handleRegisterSubmit() {
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const profileUsername = document.getElementById('register-username').value.trim();
  const profilePassword = document.getElementById('register-profile-password').value;
  const currency = document.getElementById('register-currency').value;
  const errorDiv = document.getElementById('register-error');

  try {
    errorDiv.style.display = 'none';
    const result = await registerAccount({
      email,
      password,
      profileUsername,
      profilePassword,
      currency,
    });
    
    // Vai alla dashboard del profilo
    window.location.hash = '#/dashboard';
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

function handleOfflineMode() {
  // TODO: Implementare modalità offline
  alert('Modalità offline non ancora disponibile.');
}
