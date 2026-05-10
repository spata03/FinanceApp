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
import { formatMonthYear }    from './utils/formatters.js';
import { store }              from './data/store.js';
import { getActiveAccount, syncAccountsWithBackend } from './data/auth.js';
import { ensureAuthenticated, setupUserMenu } from './components/UserMenu.js';
import { authorizeSyncedAccount } from './utils/backendClient.js';

// ── Mappa rotte ───────────────────────────────────────────────────────────────
const ROUTES = {
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

// ── Navigazione ───────────────────────────────────────────────────────────────
function navigateTo(page) {
  if (!ROUTES[page]) page = 'dashboard';

  // Aggiorna stato attivo nella sidebar
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.page === page;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Aggiorna hash URL senza innescare hashchange
  const newHash = `#${page}`;
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }

  // Ottieni il container e sostituiscilo con un clone pulito
  // (rimuove tutti i vecchi event listener senza doverli tracciare)
  const old = document.getElementById('page-container');
  const container = document.createElement('div');
  container.id = 'page-container';
  old.parentNode.replaceChild(container, old);

  // Animazione entrata
  container.style.opacity = '0';
  container.style.transform = 'translateY(10px)';

  requestAnimationFrame(() => {
    ROUTES[page](container);
    container.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
  });
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
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);
}

// ── Topbar mese corrente ──────────────────────────────────────────────────────
function updateCurrentMonth() {
  const el = document.getElementById('current-month');
  if (el) el.textContent = formatMonthYear(new Date());
}

function syncActiveAccountName() {
  const account = getActiveAccount();
  if (!account) return;
  const settings = store.getSettings();
  if (!settings.userName) {
    store.updateSettings({ userName: account.displayName });
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

  const hamburger = document.createElement('button');
  hamburger.id        = 'hamburger-btn';
  hamburger.className = 'btn btn--ghost';
  hamburger.setAttribute('aria-label', 'Apri menu');
  hamburger.style.cssText = `
    position:fixed; top:1rem; left:1rem; z-index:150;
    display:none; font-size:1.25rem; background:var(--clr-surface);
    border:1px solid var(--clr-border); border-radius:var(--radius-md);
    padding:0.5rem 0.75rem;
  `;
  hamburger.textContent = '☰';
  document.body.appendChild(hamburger);

  const overlay = document.createElement('div');
  overlay.id    = 'mobile-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.6);
    z-index:99; display:none; backdrop-filter:blur(2px);
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
  await syncAccountsWithBackend().catch(error => {
    console.warn('[Auth] Sincronizzazione iniziale account non riuscita:', error);
  });
  setupUserMenu();
  if (!ensureAuthenticated()) return;
  
  const active = getActiveAccount();
  if (active?.authToken) {
    await authorizeSyncedAccount(active.id, active.authToken).catch(() => null);
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
  const AUTO_SYNC_INTERVAL = 60000; // 60 secondi (ridotto per evitare conflitti CSRF)

  async function autoSync() {
    if (autoSyncInProgress || !getActiveAccount()?.authToken) return;
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
      // Se è un errore CSRF, invalida la sessione per il prossimo tentativo
      if (error.message?.includes('Token CSRF') || error.status === 403) {
        console.debug('[AutoSync] Invalidating session due to CSRF error');
        // Importa e chiama invalidateSession
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
      if (Date.now() - lastAutoSync > 5000 && getActiveAccount()?.authToken) {
        autoSync();
      }
    }, 2000); // Attendi 2 secondi dopo l'ultima modifica prima di sincronizzare
  });

  syncActiveAccountName();
  updateCurrentMonth();
  bindSidebar();
  setupMobileSidebar();
  registerServiceWorker();
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
