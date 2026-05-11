/**
 * pages/profiles.js - Pagina di selezione/login dei profili di un account
 */

import {
  getActiveAccount,
  listProfilesForAccount,
  loginProfile,
  createProfile,
  setActiveProfileId,
  logoutAccount,
  assertUsername,
  assertPassword,
} from '../data/auth-accounts.js';

export async function renderProfilesPage() {
  const container = document.getElementById('app');
  const account = getActiveAccount();

  if (!account) {
    window.location.hash = '#/accounts';
    return;
  }

  const profiles = listProfilesForAccount(account.id);
  const defaultProfile = account.defaultProfileId
    ? profiles.find(p => p.id === account.defaultProfileId)
    : null;

  const html = `
    <div class="page page-profiles">
      <header class="profiles-header">
        <h1>Profili: ${account.email}</h1>
        <button id="profiles-change-account" class="button button-small button-outline">Cambia Account</button>
      </header>

      <main class="profiles-main">
        ${profiles.length === 0 ? renderNoProfiles() : renderProfilesList(profiles, defaultProfile)}
      </main>

      <footer class="profiles-footer">
        <button id="profiles-new-profile" class="button button-secondary">+ Nuovo Profilo</button>
        <button id="profiles-account-settings" class="button button-outline">Impostazioni Account</button>
      </footer>
    </div>

    <div id="profile-login-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <h2 id="profile-login-title">Login Profilo</h2>
        <div class="form-group">
          <label>Password:</label>
          <input type="password" id="profile-login-password" />
        </div>
        <div class="form-actions">
          <button id="profile-login-submit" class="button">Accedi</button>
          <button id="profile-login-cancel" class="button button-outline">Annulla</button>
        </div>
        <div id="profile-login-error" class="error-message" style="display: none;"></div>
      </div>
    </div>

    <div id="create-profile-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <h2>Nuovo Profilo</h2>
        <div class="form-group">
          <label>Nome Profilo:</label>
          <input type="text" id="create-profile-username" placeholder="es. Marco" />
        </div>
        <div class="form-group">
          <label>Password:</label>
          <input type="password" id="create-profile-password" placeholder="min 8 caratteri" />
        </div>
        <div class="form-group">
          <label>Valuta:</label>
          <select id="create-profile-currency">
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CHF">CHF (₣)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Lingua:</label>
          <select id="create-profile-locale">
            <option value="it-IT">Italiano</option>
            <option value="en-US">English</option>
            <option value="de-DE">Deutsch</option>
            <option value="fr-FR">Français</option>
          </select>
        </div>
        <div class="form-actions">
          <button id="create-profile-submit" class="button">Crea Profilo</button>
          <button id="create-profile-cancel" class="button button-outline">Annulla</button>
        </div>
        <div id="create-profile-error" class="error-message" style="display: none;"></div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  setupProfilesPageEvents(account.id, profiles);
}

function renderNoProfiles() {
  return `
    <div class="empty-state">
      <p>Non hai ancora profili in questo account. Creane uno per iniziare.</p>
    </div>
  `;
}

function renderProfilesList(profiles, defaultProfile) {
  return `
    <div class="profiles-list">
      ${profiles.map(profile => `
        <div class="profile-card" data-profile-id="${profile.id}">
          <div class="profile-info">
            <strong>${profile.username}</strong>
            <small>${profile.currency} • ${profile.locale}</small>
            ${defaultProfile?.id === profile.id ? '<span class="badge">Profilo Default</span>' : ''}
            <small>${profile.syncedAt ? 'Sincronizzato' : 'Locale'}</small>
          </div>
          <div class="profile-actions">
            <button class="profile-select-button button" data-profile-id="${profile.id}">Accedi</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function setupProfilesPageEvents(accountId, profiles) {
  // Select profile
  document.addEventListener('click', (e) => {
    const selectButton = e.target.closest('.profile-select-button');
    if (selectButton) {
      const profileId = selectButton.dataset.profileId;
      const profile = profiles.find(p => p.id === profileId);
      if (profile) {
        showProfileLoginModal(profile);
      }
      return;
    }

    const newProfileButton = e.target.closest('#profiles-new-profile');
    if (newProfileButton) {
      showCreateProfileModal();
      return;
    }

    const changeAccountButton = e.target.closest('#profiles-change-account');
    if (changeAccountButton) {
      logoutAccount();
      window.location.hash = '#/accounts';
      return;
    }

    const accountSettingsButton = e.target.closest('#profiles-account-settings');
    if (accountSettingsButton) {
      // TODO: Implementare pagina di impostazioni account
      alert('Impostazioni account non ancora disponibili.');
      return;
    }
  });

  // Profile login modal
  const profileLoginModal = document.getElementById('profile-login-modal');
  const profileLoginSubmit = document.getElementById('profile-login-submit');
  const profileLoginCancel = document.getElementById('profile-login-cancel');

  if (profileLoginSubmit) {
    profileLoginSubmit.addEventListener('click', () => handleProfileLoginSubmit(accountId));
  }
  if (profileLoginCancel) {
    profileLoginCancel.addEventListener('click', () => {
      profileLoginModal.style.display = 'none';
    });
  }

  // Create profile modal
  const createProfileModal = document.getElementById('create-profile-modal');
  const createProfileSubmit = document.getElementById('create-profile-submit');
  const createProfileCancel = document.getElementById('create-profile-cancel');

  if (createProfileSubmit) {
    createProfileSubmit.addEventListener('click', () => handleCreateProfileSubmit(accountId));
  }
  if (createProfileCancel) {
    createProfileCancel.addEventListener('click', () => {
      createProfileModal.style.display = 'none';
    });
  }
}

function showProfileLoginModal(profile) {
  const modal = document.getElementById('profile-login-modal');
  modal.dataset.profileId = profile.id;
  document.getElementById('profile-login-title').textContent = `Login: ${profile.username}`;
  document.getElementById('profile-login-password').value = '';
  modal.style.display = 'flex';
  document.getElementById('profile-login-password').focus();
}

function showCreateProfileModal() {
  const modal = document.getElementById('create-profile-modal');
  document.getElementById('create-profile-username').value = '';
  document.getElementById('create-profile-password').value = '';
  modal.style.display = 'flex';
  document.getElementById('create-profile-username').focus();
}

async function handleProfileLoginSubmit(accountId) {
  const modal = document.getElementById('profile-login-modal');
  const profileId = modal.dataset.profileId;
  const password = document.getElementById('profile-login-password').value;
  const errorDiv = document.getElementById('profile-login-error');

  const profiles = listProfilesForAccount(accountId);
  const profile = profiles.find(p => p.id === profileId);

  if (!profile) {
    errorDiv.textContent = 'Profilo non trovato.';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    errorDiv.style.display = 'none';
    await loginProfile(accountId, { username: profile.username, password });
    setActiveProfileId(profileId);
    
    // Vai alla dashboard
    window.location.hash = '#/dashboard';
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

async function handleCreateProfileSubmit(accountId) {
  const username = document.getElementById('create-profile-username').value.trim();
  const password = document.getElementById('create-profile-password').value;
  const currency = document.getElementById('create-profile-currency').value;
  const locale = document.getElementById('create-profile-locale').value;
  const errorDiv = document.getElementById('create-profile-error');

  try {
    errorDiv.style.display = 'none';
    
    // Validate
    assertUsername(username);
    assertPassword(password);
    
    await createProfile(accountId, { username, password, currency, locale });
    
    // Ricarica la pagina
    renderProfilesPage();
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}
