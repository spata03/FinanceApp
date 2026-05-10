# 💰 FinanzaPersonale

Un'applicazione web **semplice e moderna** per gestire entrate, spese e obiettivi di risparmio personali. Funziona direttamente nel browser senza bisogno di backend o dipendenze esterne — tutti i dati sono salvati in `localStorage`.

---

## 🗂️ Struttura del progetto

```
personal-finance-app/
├── index.html                  # Entry point HTML
├── README.md
│
├── assets/
│   ├── icons/                  # Icone SVG custom (future)
│   └── fonts/                  # Font locali (opzionale)
│
└── src/
    ├── app.js                  # Router SPA + bootstrap
    │
    ├── data/
    │   ├── store.js            # Store centralizzato (localStorage)
    │   ├── categories.js       # Categorie predefinite entrate/spese
    │   └── seed.js             # Dati demo per test
    │
    ├── utils/
    │   ├── formatters.js       # Formattazione valuta, date, numeri
    │   ├── calculations.js     # Calcoli finanziari (saldo, trend, %)
    │   └── helpers.js          # Utility DOM (toast, modal, createElement…)
    │
    ├── components/
    │   └── TransactionModal.js # Modale aggiunta/modifica transazione
    │
    ├── pages/
    │   ├── dashboard.js        # Dashboard con KPI e ultime transazioni
    │   ├── transactions.js     # Pagina Entrate / Spese (riusabile)
    │   ├── savings.js          # Obiettivi di risparmio
    │   ├── report.js           # Report mensile e annuale
    │   └── settings.js        # Impostazioni (valuta, profilo, export)
    │
    └── styles/
        ├── reset.css           # CSS reset
        ├── variables.css       # Design tokens (colori, spazi, font…)
        ├── main.css            # Layout principale (sidebar + main)
        └── components.css      # Stili componenti riusabili
```

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
