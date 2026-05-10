# 🌐 Guida al Deployment – Accesso da iPhone ovunque

Questa guida spiega come rendere FinanzaPersonale accessibile da iPhone (o qualsiasi dispositivo) anche quando il PC non è acceso.

---

## Opzione 1: Render.com (Consigliato – Gratuito)

Render offre hosting Node.js gratuito con persistenza dei dati.

### Passaggi

1. **Crea un account** su [render.com](https://render.com)

2. **Prepara il repository Git**:
   ```bash
   cd personal-finance-app
   git init
   git add .
   git commit -m "Deploy FinanzaPersonale"
   ```

3. **Carica su GitHub** (o GitLab):
   ```bash
   # Crea un repository PRIVATO su GitHub, poi:
   git remote add origin https://github.com/TUO-USERNAME/finanza-personale.git
   git push -u origin main
   ```

4. **Configura su Render**:
   - Vai su [dashboard.render.com](https://dashboard.render.com)
   - Clicca "New +" → "Web Service"
   - Connetti il tuo repository GitHub
   - Configurazione:
     - **Name**: `finanza-personale`
     - **Runtime**: `Node`
     - **Build Command**: `exit 0`
     - **Start Command**: `node backend/server.js`
     - **Instance Type**: Free
   - Aggiungi variabile d'ambiente:
     - `SESSION_SECRET` = (genera una stringa sicura, es. `openssl rand -hex 32`)
     - `PORT` = `10000` (Render usa questa porta)

5. **Deploy**: Render avvierà automaticamente il server

6. **Accedi da iPhone**:
   - Apri Safari sul tuo iPhone
   - Vai a `https://finanza-personale.onrender.com`
   - Tocca "Condividi" → "Aggiungi alla schermata Home"
   - L'app funzionerà come un'app nativa!

> ⚠️ **Nota**: Il free tier di Render mette in pausa l'app dopo 15 min di inattività. Il primo accesso dopo la pausa può richiedere 30-60 secondi.

---

## Opzione 2: Railway.app (Più veloce, credito gratuito)

1. **Crea un account** su [railway.app](https://railway.app)

2. **Deploy diretto**:
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

3. **Variabili d'ambiente**:
   - `SESSION_SECRET` = stringa sicura
   - `PORT` = `${{RAILWAY_PORT}}` (viene impostato automaticamente)

4. **Ottieni l'URL**: Railway fornisce un URL HTTPS automatico.

---

## Opzione 3: Cloudflare Tunnel (Il PC deve essere acceso)

Se vuoi mantenere i dati solo sul tuo PC ma accedere da remoto:

1. **Installa cloudflared**:
   ```bash
   # Windows
   winget install Cloudflare.cloudflared
   ```

2. **Crea il tunnel**:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create finanza
   cloudflared tunnel route dns finanza finanza.TUO-DOMINIO.com
   ```

3. **Avvia**:
   ```bash
   # Avvia il server
   node backend/server.js

   # In un altro terminale, avvia il tunnel
   cloudflared tunnel run --url http://localhost:8080 finanza
   ```

> ⚠️ Questa opzione richiede che il PC sia acceso e il tunnel attivo.

---

## Opzione 4: Fly.io (Ottima performance, free tier)

1. **Installa flyctl**:
   ```bash
   # Windows
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **Crea un `fly.toml`** nella root del progetto:
   ```toml
   app = "finanza-personale"
   primary_region = "cdg"

   [http_service]
     internal_port = 8080
     force_https = true

   [build]
     builder = "heroku/builder:22"

   [env]
     PORT = "8080"
   ```

3. **Deploy**:
   ```bash
   fly auth login
   fly launch
   fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
   fly deploy
   ```

---

## Dopo il Deploy: Configurazione iPhone

1. **Apri Safari** sul tuo iPhone
2. **Vai all'URL** del tuo deployment (es. `https://finanza-personale.onrender.com`)
3. **Tocca l'icona di condivisione** (quadrato con freccia verso l'alto)
4. **Scorri e seleziona** "Aggiungi alla schermata Home"
5. **Conferma** il nome e tocca "Aggiungi"

L'app apparirà sulla schermata home come un'app nativa, con:
- ✅ Schermo intero (niente barra di Safari)
- ✅ Icona dedicata
- ✅ Funzionamento offline tramite Service Worker
- ✅ Sincronizzazione dati quando online

---

## Sicurezza

- Usa **SEMPRE** un `SESSION_SECRET` diverso in produzione
- I dati sono salvati nel filesystem del server (directory `backend/data/`)
- Il repository GitHub dovrebbe essere **PRIVATO**
- Aggiungi `backend/data/` al `.gitignore` per non committare dati sensibili
- L'app usa HTTPS automaticamente su tutte le piattaforme cloud
