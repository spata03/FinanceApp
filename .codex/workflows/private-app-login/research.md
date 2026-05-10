# Research Report

## Task
Rendere FinanzaPersonale piu simile a una app privata: launcher Windows senza finestra browser tradizionale, account utente con password e cambio utente, base PWA per iPhone e istruzioni per uso privato in rete locale/VPN.

## Repository Findings
- Package manager: none
- Framework/runtime: vanilla HTML/CSS/ES modules, Node.js backend opzionale, Windows Forms launcher C#
- Relevant scripts: none; test HTML in `tests/` da eseguire via server HTTP locale
- Relevant conventions: store singleton in `src/data/store.js`, rendering con template string, UI copy in italiano, design tokens CSS scuri, persistenza localStorage

## Reuse Map
- `src/data/store.js`: va riusato per separare la chiave localStorage in base all'utente attivo.
- `src/utils/helpers.js`: `escapeHTML` e `showToast` per UI account.
- `src/styles/main.css` e `src/styles/components.css`: pattern esistenti per shell, button, form, modal e responsive.
- `backend/server.js`: serve gia app statica e API; va esteso solo per host privato configurabile.
- `tools/FinanzaPersonaleLauncher.cs`: launcher esistente da migliorare con app mode Edge/Chrome.
- `tests/*.test.html`: pattern esistenti per test browser senza package manager.

## Likely Files To Edit
- `src/data/auth.js`: nuovo modulo account locali, password hash, utente attivo e storage key.
- `src/data/store.js`: usare storage key attiva e metadata account.
- `src/components/UserMenu.js`: nuova UI top-right per login, registrazione, cambio utente e blocco.
- `src/app.js`: inizializzare auth gate, menu utente e PWA service worker.
- `src/styles/main.css`, `src/styles/components.css`: layout top-right e overlay account.
- `index.html`: manifest, theme color e icona app.
- `manifest.webmanifest`, `sw.js`, `assets/icons/app-icon.svg`: asset PWA minimi.
- `tools/FinanzaPersonaleLauncher.cs`: aprire Edge/Chrome in `--app=` quando disponibile.
- `backend/server.js`: `HOST` configurabile per rete privata.
- `README.md`: chiarire app Windows, iPhone, rete privata e limiti di sincronizzazione.
- `tests/auth-store.test.html`, `tests/page-imports.test.html`, `tests/store-assistant.test.html`: copertura account/import e isolamento test.

## Files To Avoid
- `FinanzaPersonale.exe`: binario generato; non modificarlo manualmente senza toolchain di compilazione.
- `src/pages/*` non legati a impostazioni/account: evitare refactor non richiesti.

## Risks And Edge Cases
- Una password client-side protegge l'accesso nell'app, ma non equivale a cifratura completa dei dati su disco.
- Se si espone il server su LAN senza HTTPS/VPN, iOS puo aprire la pagina ma non e una pubblicazione sicura su Internet.
- Account locali separano i dati per browser/dispositivo; la sincronizzazione vera PC-iPhone richiede backend dati o VPN con uno storage condiviso.
- `crypto.subtle` puo non essere disponibile su contesti non sicuri; serve fallback e messaggio prudente.
- Il launcher in app mode dipende dalla presenza di Edge/Chrome; deve mantenere fallback al browser predefinito.

## Acceptance Criteria
- AC-001: Il launcher Windows prova ad aprire l'app in finestra standalone Edge/Chrome `--app=` e mantiene fallback funzionante al browser predefinito.
- AC-002: L'app mostra una sezione utente in alto a destra con utente attivo, accesso/registrazione con password, cambio utente e blocco/logout.
- AC-003: Ogni utente locale usa una chiave dati separata, il primo account preserva i dati legacy `finanza_personale_v1`, e i test esistenti restano isolati.
- AC-004: L'app include metadata PWA minimi e README spiega i passaggi realistici per iPhone e uso privato su LAN/VPN senza pubblicazione Internet.

## Implementation Plan
1. Aggiungere modulo auth locale con hash password e storage key per account.
2. Collegare `store.js` alla storage key dell'account attivo mantenendo compatibilita legacy.
3. Aggiungere componente menu utente/auth gate e integrarlo in `app.js`.
4. Aggiungere CSS account/PWA metadata/service worker.
5. Aggiornare launcher, backend host configurabile, README e test HTML.

## Verification Plan
1. Avviare un server HTTP locale e aprire i test HTML headless gia usati nel repo.
2. Eseguire un controllo sintattico Node del backend se Node e disponibile.
3. Verificare import moduli e test account/store in browser.

## Open Questions
- None.
