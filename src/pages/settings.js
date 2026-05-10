/**
 * settings.js – Pagina Impostazioni.
 */

import { store } from '../data/store.js';
import { getBackendProfile, saveBackendProfile } from '../utils/backendClient.js';
import { escapeHTML, showToast } from '../utils/helpers.js';

export function renderSettings(container) {
  const settings = store.getSettings();
  const storageInfo = store.getStorageInfo();
  const lastUpdate = storageInfo.updatedAt
    ? new Date(storageInfo.updatedAt).toLocaleString(settings.locale)
    : 'Non ancora salvato';

  container.innerHTML = `
    <div class="page-header">
      <h1>⚙️ Impostazioni</h1>
      <p>Personalizza la tua esperienza</p>
    </div>

    <div style="display:flex;flex-direction:column;gap:1.5rem;max-width:580px;">

      <!-- Profilo -->
      <div class="card">
        <div class="card__title">Profilo</div>
        <form id="profile-form" style="display:flex;flex-direction:column;gap:1rem;margin-top:1rem;">
          <div class="form-group">
            <label class="form-label" for="s-username">Il tuo nome</label>
            <input class="form-input" type="text" id="s-username" name="userName"
              placeholder="es. Mario Rossi" value="${escapeHTML(settings.userName ?? '')}" />
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="submit" class="btn btn--primary">💾 Salva profilo</button>
          </div>
        </form>
        <p id="backend-profile-status" style="font-size:0.78rem;color:var(--clr-text-subtle);margin:0.75rem 0 0;">
          Backend privato: verifica in corso...
        </p>
      </div>

      <!-- Valuta e lingua -->
      <div class="card">
        <div class="card__title">Valuta & Locale</div>
        <form id="currency-form" style="display:flex;flex-direction:column;gap:1rem;margin-top:1rem;">
          <div class="form-group">
            <label class="form-label" for="s-currency">Valuta</label>
            <select class="form-select" id="s-currency" name="currency">
              <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>€ Euro (EUR)</option>
              <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>$ Dollaro (USD)</option>
              <option value="GBP" ${settings.currency === 'GBP' ? 'selected' : ''}>£ Sterlina (GBP)</option>
              <option value="CHF" ${settings.currency === 'CHF' ? 'selected' : ''}>Fr. Franco Svizzero (CHF)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="s-locale">Formato numeri</label>
            <select class="form-select" id="s-locale" name="locale">
              <option value="it-IT" ${settings.locale === 'it-IT' ? 'selected' : ''}>Italiano (it-IT)</option>
              <option value="en-US" ${settings.locale === 'en-US' ? 'selected' : ''}>English (en-US)</option>
              <option value="de-DE" ${settings.locale === 'de-DE' ? 'selected' : ''}>Deutsch (de-DE)</option>
              <option value="fr-FR" ${settings.locale === 'fr-FR' ? 'selected' : ''}>Français (fr-FR)</option>
            </select>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button type="submit" class="btn btn--primary">💾 Salva valuta</button>
          </div>
        </form>
      </div>

      <!-- Dati -->
      <div class="card">
        <div class="card__title">Gestione dati</div>
        <p style="font-size:0.85rem;color:var(--clr-text-muted);margin:0.75rem 0 1rem;">
          I dati sono salvati in locale su questo browser, nella chiave <strong>${escapeHTML(storageInfo.key)}</strong>.
          Quando il backend privato e raggiungibile, account e operazioni vengono sincronizzati anche in <strong>backend/data</strong>.
        </p>
        <p style="font-size:0.78rem;color:var(--clr-text-subtle);margin:0 0 1rem;">
          LocalStorage resta la cache offline del dispositivo; la sincronizzazione riprende quando riapri la stessa app dal backend privato.
        </p>
        <p style="font-size:0.78rem;color:var(--clr-text-subtle);margin:0 0 1rem;">
          Ambito: ${escapeHTML(storageInfo.scope)} · Schema v${escapeHTML(storageInfo.schemaVersion)} · Ultimo salvataggio: ${escapeHTML(lastUpdate)}
        </p>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <button class="btn btn--outline" id="export-btn">📤 Esporta JSON</button>
          <button class="btn btn--danger" id="reset-btn">🗑️ Cancella tutti i dati</button>
        </div>
      </div>

      <!-- Info app -->
      <div class="card card--glass" style="text-align:center;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">💰</div>
        <div style="font-weight:700;font-size:1.1rem;">FinanzaPersonale</div>
        <div style="font-size:0.75rem;color:var(--clr-text-muted);margin-top:0.25rem;">
          v1.0.0 · Gestione economica personale
        </div>
      </div>

    </div>
  `;

  // ── Profile form ─────────────────────────────────────────────────────────
  const updateBackendStatus = (message, tone = 'muted') => {
    const status = container.querySelector('#backend-profile-status');
    if (!status) return;
    status.textContent = message;
    status.style.color = tone === 'ok' ? 'var(--clr-income)' : 'var(--clr-text-subtle)';
  };

  getBackendProfile().then(result => {
    if (!result.available) {
      updateBackendStatus('Backend privato non attivo: uso salvataggio locale su questo browser.');
      return;
    }

    updateBackendStatus('Backend privato attivo: account e dati possono sincronizzarsi tra dispositivi.', 'ok');
    const input = container.querySelector('#s-username');
    if (input && result.profile?.userName && !input.value) {
      input.value = result.profile.userName;
    }
  });

  container.querySelector('#profile-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const nextSettings = { ...store.getSettings(), userName: data.userName.trim() };
    const backendResult = await saveBackendProfile(nextSettings);

    store.updateSettings({ userName: nextSettings.userName });
    showToast(
      backendResult.available ? 'Profilo salvato sul backend.' : 'Profilo salvato localmente.',
      backendResult.available ? 'success' : 'info'
    );

    renderSettings(container);
  });

  // ── Currency form ─────────────────────────────────────────────────────────
  container.querySelector('#currency-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const nextSettings = { ...store.getSettings(), currency: data.currency, locale: data.locale };
    store.updateSettings({ currency: data.currency, locale: data.locale });
    const backendResult = await saveBackendProfile(nextSettings);
    showToast(
      backendResult.available ? 'Impostazioni valuta salvate sul backend!' : 'Impostazioni valuta salvate localmente!',
      backendResult.available ? 'success' : 'info'
    );
  });

  // ── Export ────────────────────────────────────────────────────────────────
  container.querySelector('#export-btn').addEventListener('click', () => {
    const state = store.getState();
    const blob  = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement('a');
    a.href      = url;
    a.download  = `finanza-personale-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Esportazione completata!', 'success');
  });

  // ── Reset ─────────────────────────────────────────────────────────────────
  container.querySelector('#reset-btn').addEventListener('click', () => {
    if (confirm('⚠️ Sei sicuro? Tutti i dati verranno eliminati definitivamente!')) {
      store.reset();
      showToast('Tutti i dati sono stati eliminati.', 'info');
      renderSettings(container);
    }
  });
}
