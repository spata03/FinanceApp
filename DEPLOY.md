# Guida al Deployment – FinanzaPersonale

Questa guida spiega come deployare FinanzaPersonale su Render con Neon
(Postgres) come database esterno gratuito. Non serve il disco a pagamento
di Render: i dati persistono nel database cloud.

---

## 1. Crea il database Neon (Postgres free tier)

1. Vai su [neon.tech](https://neon.tech) e registrati gratis (login con
   GitHub/Google o email).
2. Crea un nuovo progetto: `New Project`
   - **Name**: `finanza-personale`
   - **Postgres version**: 16 (default va bene)
   - **Region**: scegli la stessa regione del servizio Render (es. `Frankfurt (eu-central-1)` per `Frankfurt`).
3. Dopo la creazione, copia la **Connection String** mostrata (formato:
   `postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`).
   - Usa la versione **pooled** se disponibile (URL contiene `-pooler`).

> Free tier Neon: 0.5 GB storage, scaling-to-zero. Per un'app di finanza
> personale è ampiamente sufficiente.

---

## 2. Deploy su Render

1. Crea un account su [render.com](https://render.com) e collega il tuo
   repository GitHub/GitLab.
2. **New +** → **Web Service** → seleziona il repo `personal-finance-app`.
3. Render rileverà automaticamente `render.yaml` e proporrà la
   configurazione corretta (runtime Docker, plan free, env vars).
4. **Configura le variabili d'ambiente** (Render → Environment):
   - `DATABASE_URL` = (la connection string Neon copiata sopra)
   - `SESSION_SECRET` = (Render la genera automaticamente — lasciala così)
   - `NODE_ENV` = `production` (impostata da render.yaml)
   - `PORT` = `10000` (impostata da render.yaml)
5. Clicca **Create Web Service**. Render builda il container Docker e
   avvia il servizio.
6. Al primo boot, lo script `db/migrate.js` esegue le migrazioni
   (idempotenti) e crea le tabelle su Neon.

> **Importante**: NON serve il blocco `disk:` in `render.yaml`. È già stato
> rimosso. Non attivare il disco a pagamento.

---

## 3. Sviluppo in locale

In locale puoi usare la stessa istanza Neon (è gratis e l'auto-suspend non
costa niente), oppure un Postgres locale.

1. Crea un file `.env` nella root del progetto:
   ```
   DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   SESSION_SECRET=una-stringa-casuale-lunga-min-32-caratteri
   PORT=8080
   ```
2. Carica le variabili (PowerShell):
   ```powershell
   $env:DATABASE_URL = "postgresql://..."
   $env:SESSION_SECRET = "una-stringa-casuale"
   ```
   oppure con `cross-env` o `dotenv-cli`.
3. Installa le dipendenze e avvia:
   ```bash
   npm install
   node db/migrate.js   # facoltativo: il server le esegue al boot
   npm run dev
   ```
4. Apri `http://localhost:8080`.

> Nota: il driver `@neondatabase/serverless` parla con Neon via HTTPS, non
> aprendo socket TCP. Funziona quindi anche da reti restrittive e da
> ambienti serverless.

---

## 4. Verifica post-deploy

1. Apri l'URL Render (es. `https://finanza-personale.onrender.com`).
2. Crea un account.
3. Apri la stessa URL da un altro dispositivo (telefono), accedi con le
   stesse credenziali → vedi i dati sincronizzati.
4. Se vuoi forzare un restart del server (Render → Manual Deploy →
   Clear build cache & deploy): i dati DEVONO rimanere — questo è il
   test principale dell'utilizzo del DB esterno.

---

## Sicurezza

- `SESSION_SECRET` è **obbligatorio in produzione**. Render lo genera
  automaticamente; non rivelarlo.
- `DATABASE_URL` contiene la password Postgres: tienila riservata, mai
  committarla.
- Cookie di sessione: `HttpOnly`, `Secure`, `SameSite=None` su HTTPS,
  Max-Age 30 giorni.
- Password account/profilo: hash pbkdf2-sha256 ≥120000 iterazioni con salt
  per record.
- CSRF token ruotato su ogni operazione sensibile.

---

## Aggiornare l'app

`git push origin main` → Render rebuilda e ridistribuisce automaticamente.
Le migrazioni sono idempotenti, quindi è sicuro fare deploy ripetuti.
