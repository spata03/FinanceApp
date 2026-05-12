# 💰 FinanzaPersonale

Un'applicazione web **semplice e moderna** per gestire entrate, spese e obiettivi di risparmio personali. Funziona direttamente nel browser senza bisogno di backend o dipendenze esterne — tutti i dati sono salvati in `localStorage`.

---

## 🗂️ Struttura del progetto

Dalla v2 il progetto è suddiviso in tre layer netti: **frontend** (SPA),
**backend** (HTTP server + middleware), **api** (controller per endpoint).
Lo storage persistente è su **Neon Postgres** (vedi DEPLOY.md).

```
personal-finance-app/
├── frontend/                # SPA statica servita dal backend
│   ├── index.html
│   ├── sw.js
│   ├── manifest.webmanifest
│   ├── assets/
│   └── src/
│       ├── app.js           # Router SPA + bootstrap
│       ├── data/            # store, auth, categorie, seed
│       ├── utils/           # formatters, calculations, helpers, backendClient
│       ├── components/      # TransactionModal, RecurringEntryModal, UserMenu
│       ├── pages/           # dashboard, entrate/spese, mensile, risparmi, ecc.
│       └── styles/          # variables, reset, main, components
│
├── backend/                 # HTTP bootstrap + middleware (no business logic)
│   ├── server.js            # Dispatcher /api/* → controller; serve frontend/
│   ├── config.js            # Variabili d'ambiente, validate-on-boot
│   └── middleware/
│       ├── session.js       # Cookie firmato HttpOnly+Secure+SameSite=None
│       ├── csrf.js          # Validazione X-CSRF-Token
│       ├── body.js          # JSON body reader con limite size
│       └── errors.js        # Header sicurezza, sendJson()
│
├── api/                     # Controller HTTP (uno per area funzionale)
│   ├── auth.controller.js   # register, login, profile/select/create/delete, me, logout
│   ├── session.controller.js# GET /api/session — emette CSRF token
│   ├── profile.controller.js# legacy GET/PUT /api/profile
│   ├── sync.controller.js   # GET/PUT /api/sync/state per profilo
│   ├── assistant.controller.js # POST /api/assistant/analyze (regole pure)
│   ├── health.controller.js # GET /api/health
│   └── _helpers.js          # sanitize, generateId, normalizeEmail
│
└── db/                      # Persistenza (Neon Postgres via @neondatabase/serverless)
    ├── client.js            # neon(DATABASE_URL) → sql tagged-template
    ├── migrate.js           # Runner idempotente, splitter SQL
    ├── migrations/
    │   └── 001-initial.sql
    └── repositories/
        ├── accounts.repo.js
        ├── profiles.repo.js
        ├── sessions.repo.js
        └── syncState.repo.js
```

Tutti i file JS sono **ES modules** (Node ≥18). Il backend e l'api **non**
hanno più dipendenze native: solo `@neondatabase/serverless` (HTTPS, no
socket open).

---

## 🚀 Come avviare

Non ci sono dipendenze da installare. Basta aprire `index.html` con un **server HTTP locale** (i moduli ES6 richiedono HTTP, non `file://`).

### Opzione 1 — VS Code Live Server
1. Installa l'estensione **Live Server** in VS Code
2. Tasto destro su `index.html` → **Open with Live Server**

### Opzione 2 — Python (già installato su macOS/Linux)
```bash
cd personal-finance-app
python -m http.server 8080
# poi apri http://localhost:8080
```

### Opzione 3 — Node.js `serve`
```bash
npx serve .
```

### Opzione backend locale dedicato
```bash
cd personal-finance-app
node backend/server.js
# poi apri http://127.0.0.1:8080
```

Il backend serve l'app statica e abilita `/api/session`, `/api/profile`, `/api/sync/*` e `/api/assistant/analyze`.
Account e dati finanziari vengono salvati privatamente in `backend/data/` e restano anche in `localStorage` come cache/offline del dispositivo. Le scritture backend usano cookie HttpOnly e protezione CSRF.

Per renderla raggiungibile solo nella tua rete privata:

```bash
cd personal-finance-app
$env:HOST="0.0.0.0"; $env:PORT="8080"; node backend/server.js
```

Poi apri da un altro dispositivo `http://IP-DEL-PC:8080`. Usa questa modalita solo su Wi-Fi fidato o, meglio, dietro VPN privata tipo Tailscale/WireGuard. Non serve pubblicare l'app su Internet.

### Opzione programma locale Windows

Nella cartella del progetto e disponibile `FinanzaPersonale.exe`.
Puoi metterlo sul desktop: avvia un server locale sulla porta `8080` e apre l'app in una finestra standalone Edge/Chrome quando disponibile.
Il launcher prova prima `node backend/server.js`; se Node non e disponibile usa `python -m http.server`.

## Account, password e iPhone

- Al primo avvio l'app chiede di creare un utente con password.
- Il menu utente in alto a destra permette di aprire impostazioni, cambiare utente e bloccare l'app.
- Il primo utente conserva i dati gia presenti in `finanza_personale_v1`; gli utenti successivi hanno una chiave localStorage separata.
- Su `http://IP-DEL-PC:8080` la creazione account funziona anche se il browser non espone Web Crypto: l'app usa una modalita password compatibile. Per la verifica piu robusta e per installare la PWA usa `localhost` o HTTPS, anche su VPN privata.
- Se apri PC e telefono dallo stesso backend privato, gli account e le modifiche dell'account attivo si sincronizzano in `backend/data/`.
- La password protegge l'accesso nell'app, ma non cifra tutto il disco o il file backend: per dati sensibili usa anche la protezione del dispositivo e tieni il backend su rete/VPN privata.
- Su iPhone puoi aprire l'indirizzo privato in Safari e usare **Condividi -> Aggiungi alla schermata Home**. L'uso offline con PC spento richiede che la PWA sia gia installata da un'origine sicura; in quel caso lavori sulla cache locale e la sincronizzazione riprende quando il backend torna raggiungibile.
- Per vedere sul telefono le modifiche fatte su PC mentre il PC e spento serve un backend privato sempre acceso, ad esempio NAS/Raspberry Pi/VPS dietro Tailscale/WireGuard. Un'app web non puo sincronizzare dati da un PC spento senza un host acceso.

---

## 🧪 Caricare dati demo

Per popolare l'app con dati di esempio, apri la **console del browser** e digita:

```js
import('./src/data/seed.js').then(m => m.seedDemoData())
```

Oppure, per resettare e ricaricare da zero:

```js
// 1. Reset
const { store } = await import('./src/data/store.js')
store.reset()

// 2. Seed
const { seedDemoData } = await import('./src/data/seed.js')
seedDemoData()

// 3. Ricarica la pagina
location.reload()
```

---

## ✨ Funzionalità

| Sezione | Funzionalità |
|---|---|
| **Dashboard** | KPI mensili, variazione vs mese precedente, trend 6 mesi, ultime 5 transazioni |
| **Entrate** | Lista, filtro per categoria/mese, top categorie con barre, aggiunta/modifica/eliminazione |
| **Spese** | Identico alle entrate, con palette e logica dedicata |
| **Mensile** | Vista dedicata con entrate fisse/variabili, spese fisse/variabili, risparmio e liquidita libera |
| **Risparmi** | Obiettivi con barre di avanzamento, versamenti, scadenze |
| **Report** | Analisi mensile navigabile, ripartizione categorie, trend 12 mesi |
| **Impostazioni** | Nome utente, valuta, locale, esportazione JSON, reset dati |

---

## 🎨 Design system

- **Tema**: Dark mode con palette HSL curata
- **Font**: Inter (Google Fonts)
- **Colori semantici**: verde (entrate) · rosso (spese) · ambra (risparmi) · viola (brand)
- **Componenti**: card, KPI card, tabelle, modali, toast, progress bar, badge, chip
- **Responsive**: sidebar mobile con hamburger, griglie adattive

---

## 📦 Tecnologie

- **HTML5** + **ES Modules** (vanilla JS, no framework)
- **CSS3** (custom properties, grid, flexbox, animazioni)
- **localStorage** per la persistenza dei dati
- **Intl API** per formattazione internazionale di valute e date

---

## 🗺️ Roadmap futura

- [ ] Grafico a ciambella (donut) per categorie
- [ ] Importazione CSV/JSON
- [ ] Budget mensile per categoria con alert di sforamento
- [ ] Ricorrenze automatiche (stipendio, abbonamenti)
- [ ] PWA / installabile su mobile
- [ ] Sincronizzazione cloud (Supabase / Firebase)
- [ ] Tema chiaro / scuro toggle
