/**
 * app.js – Entry point dell'applicazione FinanzaPersonale.
 *
 * Responsabilità:
 *   • Inizializzazione dell'app
 *   • Router SPA (hash-based)
 *   • Binding della sidebar
 *   • Aggiornamento mese corrente nell'header
 */

import { renderDashboard }    from './pages/dashboard.js';
import { renderTransactions } from './pages/transactions.js';
import { renderSavings }      from './pages/savings.js';
import { renderSalvadanaio }  from './pages/salvadanaio.js';
import { renderMonthly }      from './pages/monthly.js';
import { renderReport }       from './pages/report.js';
import { renderSettings }     from './pages/settings.js';
import { renderAssistant }    from './pages/assistant.js';
import { renderAccountsPage } from './pages/accounts.js';
import { renderProfilesPage } from './pages/profiles.js';
import { formatMonthYear }    from './utils/formatters.js';
import { store }              from './data/store.js';
import { getActiveAccount, getActiveProfile, checkAndRestoreSession } from './data/auth-accounts.js';
import { ensureAuthenticated, setupUserMenu, refreshUserMenu } from './components/UserMenu.js';

// ── Mappa rotte ───────────────────────────────────────────────────────────────
const ROUTES = {
  accounts:     renderAccountsPage,
  profiles:     renderProfilesPage,
  dashboard:    renderDashboard,
  entrate:      container => renderTransactions(container, 'income'),
  spese:        container => renderTransactions(container, 'expense'),
  mensile:      renderMonthly,
  risparmi:     renderSavings,
  salvadanaio:  renderSalvadanaio,
  report:       renderReport,
  assistente:   renderAssistant,
  impostazioni: renderSettings,
};

// ── Shell restore ─────────────────────────────────────────────────────────────
function ensureAppShell() {
  // When accounts/profiles pages render, they write into #app directly,
  // destroying the sidebar and main-content. Before rendering a regular page,
  // we must ensure the shell is intact.
  if (!document.getElementById('sidebar') || !document.getElementById('main-content')) {
    const app = document.getElementById('app');
    if (!app) return;

    // Remove any old mobile hamburger/overlay to avoid duplicates after restore
    const oldHamburger = document.querySelector('#hamburger-btn');
    const oldOverlay = document.querySelector('#mobile-overlay');
    if (oldHamburger) oldHamburger.remove();
    if (oldOverlay) oldOverlay.remove();

    // Restore the static shell (matches index.html exactly)
    app.innerHTML = `
      <nav id="sidebar" class="sidebar" role="navigation" aria-label="Menu principale">
        <div class="sidebar__logo">
          <span class="logo-icon">💰</span>
          <span class="logo-text">FinanzaPersonale</span>
        </div>

        <ul class="sidebar__nav" role="menubar">
          <li role="none">
            <button id="nav-dashboard" class="nav-btn" role="menuitem" data-page="dashboard" aria-current="false">
              <span class="nav-icon">📊</span>
              <span class="nav-label">Dashboard</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-entrate" class="nav-btn" role="menuitem" data-page="entrate" aria-current="false">
              <span class="nav-icon">📈</span>
              <span class="nav-label">Entrate</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-spese" class="nav-btn" role="menuitem" data-page="spese" aria-current="false">
              <span class="nav-icon">📉</span>
              <span class="nav-label">Spese</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-mensile" class="nav-btn" role="menuitem" data-page="mensile" aria-current="false">
              <span class="nav-icon">📅</span>
              <span class="nav-label">Mensile</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-risparmi" class="nav-btn" role="menuitem" data-page="risparmi" aria-current="false">
              <span class="nav-icon">🏦</span>
              <span class="nav-label">Risparmi</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-salvadanaio" class="nav-btn" role="menuitem" data-page="salvadanaio" aria-current="false">
              <span class="nav-icon">🐷</span>
              <span class="nav-label">Salvadanaio</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-report" class="nav-btn" role="menuitem" data-page="report" aria-current="false">
              <span class="nav-icon">📋</span>
              <span class="nav-label">Report</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-assistente" class="nav-btn" role="menuitem" data-page="assistente" aria-current="false">
              <span class="nav-icon">💬</span>
              <span class="nav-label">Assistente</span>
            </button>
          </li>
          <li role="none">
            <button id="nav-impostazioni" class="nav-btn" role="menuitem" data-page="impostazioni" aria-current="false">
              <span class="nav-icon">⚙️</span>
              <span class="nav-label">Impostazioni</span>
            </button>
          </li>
        </ul>

        <div id="sync-status-sidebar" style="margin-top:auto; padding: 0.5rem 1rem; font-size: 0.75rem; color: var(--clr-text-subtle); display:flex; flex-direction:column; gap:0.25rem; cursor:pointer;" title="Clicca per sincronizzare ora">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span id="sync-icon">🔄</span>
            <span id="sync-text">Sincronizzato</span>
          </div>
          <div id="sync-time" style="font-size:0.65rem; padding-left:1.5rem; opacity:0.8;">Mai sincronizzato</div>
        </div>
        <div class="sidebar__footer">
          <span id="current-month" class="sidebar-month"></span>
        </div>
      </nav>

      <main id="main-content" class="main-content" role="main">
        <div id="page-container"></div>
      </main>
    `;

    // Re-bind events on the restored shell
    bindSidebar();
    setupMobileSidebar();
    updateCurrentMonth();
  }
}

// ── Navigazione ───────────────────────────────────────────────────────────────
function navigateTo(page) {
  if (!ROUTES[page]) page = 'dashboard';

  // Pagine che non hanno sidebar
  const noSidebarPages = ['accounts', 'profiles'];
  const hasNoSidebar = noSidebarPages.includes(page);

  // Per le pagine regolari: garantiamo che la shell (sidebar + main-content)
  // sia intatta — potrebbe essere stata distrutta da una pagina full-screen
  if (!hasNoSidebar) {
    ensureAppShell();
  }

  // Toggle fullscreen-route class on <html> so that the #app grid
  // (sidebar | content) does not affect the full-screen layout used by
  // accounts/profiles. CSS rule: html.fullscreen-route #app { display: block; }
  if (document && document.documentElement) {
    document.documentElement.classList.toggle('fullscreen-route', hasNoSidebar);
  }

  // Mostra/nascondi sidebar e main-content
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('main-content');
  const topbar = document.getElementById('topbar');
  if (sidebar) sidebar.style.display = hasNoSidebar ? 'none' : '';
  if (mainContent) mainContent.style.display = hasNoSidebar ? 'none' : '';
  if (topbar) topbar.style.display = hasNoSidebar ? 'none' : '';

  // Aggiorna stato attivo nella sidebar (solo se visibile)
  if (!hasNoSidebar) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const isActive = btn.dataset.page === page;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  // Aggiorna hash URL senza innescare hashchange
  const newHash = `#/${page}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }

  let container;

  if (hasNoSidebar) {
    // Pagine full-screen (accounts, profiles): renderizza dentro #app direttamente
    container = document.getElementById('app');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app';
      document.body.appendChild(container);
    }
    container.style.opacity = '0';
    container.style.transform = 'translateY(10px)';
    requestAnimationFrame(() => {
      ROUTES[page](container);
      container.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    });
  } else {
    // Pagine regolari: renderizza dentro un nuovo #page-container dentro #main-content
    // (sostituisce il vecchio nodo per rimuovere tutti i vecchi event listener)
    const old = document.getElementById('page-container');
    if (old) {
      container = document.createElement('div');
      container.id = 'page-container';
      old.parentNode.replaceChild(container, old);
    } else {
      const mainEl = document.getElementById('main-content');
      container = document.createElement('div');
      container.id = 'page-container';
      if (mainEl) {
        mainEl.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }
    container.style.opacity = '0';
    container.style.transform = 'translateY(10px)';
    requestAnimationFrame(() => {
      ROUTES[page](container);
      container.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    });
  }
}

// ── Sidebar binding ───────────────────────────────────────────────────────────
function bindSidebar() {
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  const syncBar = document.getElementById('sync-status-sidebar');
  if (syncBar) {
    syncBar.addEventListener('click', async () => {
      const icon = syncBar.querySelector('#sync-icon');
      const text = syncBar.querySelector('#sync-text');
      const time = syncBar.querySelector('#sync-time');
      if (icon.style.animation) return; // Già in corso

      icon.style.animation = 'pulse 1s infinite';
      text.textContent = 'Sincronizzazione...';
      
      try {
        const res = await store.syncWithBackend();
        if (res.available) {
          text.textContent = res.direction === 'none' ? 'Già aggiornato' : 'Sincronizzato!';
          time.textContent = 'Ultimo: ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          setTimeout(() => { text.textContent = 'Sincronizzato'; }, 3000);
        } else {
          text.textContent = 'Sync fallito';
          console.warn('[Sync] Fallito:', res.error);
        }
      } catch (e) {
        text.textContent = 'Errore sync';
        console.error('[Sync] Errore:', e);
      } finally {
        icon.style.animation = '';
      }
    });
  }
}

// ── Hash router ───────────────────────────────────────────────────────────────
function handleHashChange() {
  let hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  
  // Check autenticazione profilo
  const profile = getActiveProfile();
  const account = getActiveAccount();
  
  // Pagine pubbliche (non richiedono profilo)
  const publicPages = ['accounts', 'profiles'];
  
  if (!publicPages.includes(hash)) {
    // Pagine private: richiedono profilo attivo
    if (!profile) {
      if (!account) {
        // Nessun account: vai a selezione account
        hash = 'accounts';
      } else {
        // Account attivo ma nessun profilo: vai a selezione profilo
        hash = 'profiles';
      }
    }
  }

  navigateTo(hash);

  // Keep the account widget in sync with the current account / profile after
  // every navigation (it caches the email + profile name from localStorage).
  try {
    refreshUserMenu();
  } catch (e) {
    console.warn('[UserMenu] refresh failed:', e?.message || e);
  }
}

// ── Topbar mese corrente ──────────────────────────────────────────────────────
function updateCurrentMonth() {
  const el = document.getElementById('current-month');
  if (el) el.textContent = formatMonthYear(new Date());
}

function syncActiveAccountName() {
  const profile = getActiveProfile();
  if (!profile) return;
  const settings = store.getSettings();
  if (!settings.userName) {
    store.updateSettings({ userName: profile.username });
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js').catch(error => {
    console.warn('[PWA] Service worker non registrato:', error);
  });
}

// ── Responsive: sidebar su mobile ────────────────────────────────────────────
function setupMobileSidebar() {
  const sidebar = document.getElementById('sidebar');

  // Remove stale elements if present (e.g. after shell restore from ensureAppShell)
  const existingHamburger = document.querySelector('#hamburger-btn');
  if (existingHamburger) existingHamburger.remove();
  const existingOverlay = document.querySelector('#mobile-overlay');
  if (existingOverlay) existingOverlay.remove();

  const hamburger = document.createElement('button');
  hamburger.id        = 'hamburger-btn';
  hamburger.className = 'btn btn--ghost';
  hamburger.setAttribute('aria-label', 'Apri menu');
  hamburger.style.cssText = `
    position:fixed; top:1rem; left:1rem; z-index:210;
    display:none; font-size:1.25rem; background:var(--clr-surface);
    border:1px solid var(--clr-border); border-radius:var(--radius-md);
    padding:0.5rem 0.75rem;
  `;
  hamburger.textContent = '☰';
  document.body.appendChild(hamburger);

  const overlay = document.createElement('div');
  overlay.id    = 'mobile-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.5);
    z-index:149; display:none;
  `;
  document.body.appendChild(overlay);

  const openSidebar  = () => { sidebar.classList.add('open');    overlay.style.display = 'block'; };
  const closeSidebar = () => { sidebar.classList.remove('open'); overlay.style.display = 'none'; };

  hamburger.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', closeSidebar);
  });

  const mq = window.matchMedia('(max-width: 900px)');
  const toggleHamburger = e => {
    hamburger.style.display = e.matches ? 'block' : 'none';
    if (!e.matches) closeSidebar();
  };
  mq.addEventListener('change', toggleHamburger);
  toggleHamburger(mq);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  // Try to restore session from persistent cookie (handles cold start)
  await checkAndRestoreSession().catch(error => {
    console.warn('[Auth] Ripristino sessione non riuscito:', error);
  });

  // Registra router INCONDIZIONATAMENTE prima di qualsiasi guard
  window.addEventListener('hashchange', handleHashChange);

  setupUserMenu();
  if (!ensureAuthenticated()) {
    handleHashChange(); // renderizza #/accounts o #/profiles per utente non autenticato
    return;
  }

  await store.syncWithBackend().catch(error => {
    console.warn('[Store] Sincronizzazione iniziale dati non riuscita:', error);
  });

  const syncTimeEl = document.getElementById('sync-time');
  if (syncTimeEl) {
    syncTimeEl.textContent = 'Ultimo: ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Sincronizzazione automatica periodica ──
  let lastAutoSync = Date.now();
  let autoSyncInProgress = false;
  const AUTO_SYNC_INTERVAL = 60000; // 60 secondi

  async function autoSync() {
    if (autoSyncInProgress || !getActiveProfile()) return;
    autoSyncInProgress = true;
    try {
      const result = await store.syncWithBackend();
      if (result.available) {
        lastAutoSync = Date.now();
        if (syncTimeEl) {
          syncTimeEl.textContent = 'Ultimo: ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }
        console.debug('[AutoSync] Success:', result.direction);
      } else {
        console.debug('[AutoSync] Failed:', result.error);
      }
    } catch (error) {
      console.debug('[AutoSync] Error:', error.message);
      if (error.message?.includes('Token CSRF') || error.status === 403) {
        import('./utils/backendClient.js').then(({ invalidateSession }) => invalidateSession());
      }
    } finally {
      autoSyncInProgress = false;
    }
  }

  setInterval(autoSync, AUTO_SYNC_INTERVAL);

  // Sincronizza anche dopo ogni cambio significativo (con debounce)
  let syncDebounceTimer = null;
  store.subscribe(async () => {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      if (Date.now() - lastAutoSync > 5000 && getActiveProfile()) {
        autoSync();
      }
    }, 2000);
  });

  syncActiveAccountName();
  updateCurrentMonth();
  bindSidebar();
  setupMobileSidebar();
  registerServiceWorker();
  handleHashChange();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
