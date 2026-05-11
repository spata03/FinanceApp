# 📋 Research Report: CSRF Fix + Account/Profile Architecture

**Date**: 2026-05-11  
**Task**: Fix CSRF token errors + Implement account/profile hierarchy  
**Status**: COMPLETE

---

## 1. CSRF TOKEN PROBLEM ANALYSIS

### Current Implementation (❌ Problematic)
```javascript
function generateCsrfToken(sessionId) {
  return crypto.createHmac('sha256', SESSION_SECRET)
    .update(sessionId)
    .digest('hex');
}
```

**Issues**:
1. **Deterministic**: Token calcolato da `sessionId + SESSION_SECRET`, NON casuale
2. **No Expiration**: Token valido infinitamente finché `sessionId` esiste
3. **Race Condition**: Se la sessione viene invalidata durante un'operazione, il retry usa una nuova sessione ma il backend potrebbe ancora validare con la vecchia
4. **Cache TTL Mismatch**: Client cachizza token per 30s, ma backend non sa dell'intervallo
5. **No Rollover**: Non c'è limite di richieste per token

**Cause dell'errore osservato**:
- Invalidazione sessione tra richiesta di caricamento token e uso
- Token cachizzato scaduto server-side (semantico, non temporale)
- Mismatch tra token atteso e ricevuto su account sincronizzati

### Proposed Solution: Random + Server-Side In-Memory Storage
```javascript
// In-memory token store (resettato a ogni restart)
const tokenStore = new Map(); // sessionId → { token, expiresAt, requestCount }

function generateCsrfToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // 5 minuti
  const requestCount = 0;
  
  tokenStore.set(sessionId, { token, expiresAt, requestCount });
  return token;
}

function validateCsrfToken(sessionId, token) {
  const stored = tokenStore.get(sessionId);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    tokenStore.delete(sessionId);
    return false;
  }
  if (token !== stored.token) return false;
  
  stored.requestCount++;
  return true;
}
```

**Vantaggi**:
- ✅ Token casuale, impossibile da prevedere
- ✅ Expiration time noto e sincronizzato
- ✅ Rollover automatico con nuova sessione (GET `/api/session`)
- ✅ Request counting per security
- ✅ No file I/O, pure in-memory
- ✅ Fallback automatico su server restart (tutti i token invalidi)

---

## 2. ACCOUNT/PROFILE HIERARCHY ARCHITECTURE

### Current State (Flat)
```
User
├─ id, displayName, password
├─ localStorage (client) + backend (synced)
└─ Single profile per user
```

### Proposed Hierarchy (Nested)
```
Device
├─ Account (email + password)
│  ├─ Stored in localStorage:
│  │  └─ { id, email, password_hash, profileIds, defaultProfileId }
│  ├─ Stored in backend DB:
│  │  └─ { id, email, password_hash, createdAt, authToken }
│  └─ Profile (username + password per account)
│     ├─ Stored in account's userData:
│     │  └─ { id, username, password_hash, currency, locale, isDefault }
│     └─ Sync state in backend:
│        └─ /sync-state/{accountId}/{profileId}.json
│           ├─ transactions
│           ├─ recurringEntries
│           └─ settings: { currency, locale, userName }
```

### Data Structure Details

#### **Account** (Client localStorage key: `finanza:accounts`)
```javascript
{
  id: "uuid",
  email: "user@example.com",
  password: { algorithm: "pbkdf2", salt, hash, iterations },
  profileIds: ["profile1", "profile2"],
  defaultProfileId: "profile1" | null,
  createdAt: ISO,
  lastLoginAt: ISO
}
```

#### **Profile** (Nested in Account, stored locally under `finanza:account:{accountId}:profiles`)
```javascript
{
  id: "uuid",
  username: "John",
  password: { algorithm: "pbkdf2", salt, hash, iterations },
  currency: "EUR" | "USD" | "GBP" | "CHF",
  locale: "it-IT" | "en-US" | "de-DE" | "fr-FR",
  isDefault: boolean,
  createdAt: ISO,
  syncedAt: ISO | null
}
```

#### **Backend Account** (`backend/data/sync-accounts.json`)
```javascript
{
  id: "uuid",
  email: "user@example.com",
  password: { algorithm, salt, hash, iterations },
  authToken: "hex32" | null,
  createdAt: ISO,
  lastLoginAt: ISO
}
```

#### **Backend Sync State** (`backend/data/sync-state/{accountId}/{profileId}.json`)
```javascript
{
  transactions: [],
  recurringEntries: [],
  recurringExpenses: [],
  savingsGoals: [],
  settings: { userName, currency, locale },
  meta: { schemaVersion, storageScope, updatedAt }
}
```

### Authentication Flow

#### **Initial Setup**
1. **Create Account**: Email + password → Account creato (no profile yet)
2. **Create First Profile**: Username + password → Profile creato, marcato come default
3. **Store device**: Account salvato in localStorage, session creata

#### **Next Access (Same Device)**
1. **Load accounts list**: Leggi localStorage (no backend call needed)
2. **Select account**: Account selezionato → mostra profili associati
3. **Profile selection**:
   - Se esiste `defaultProfileId` → bypass e vai a dashboard
   - Altrimenti → mostra list di profili
4. **Profile login**:
   - Se profile password ricordata (salvata in account) → auto-login
   - Altrimenti → chiedi password
5. **Backend sync**: Dopo profilo selezionato, sincronizza con backend

#### **Account Change**
- Pulsante "Cambia Account" → back a selection screen
- Logout del profilo attuale
- Mostra list di accounts

### UI Flow

```
┌─────────────────────────────────────────┐
│ 1. SELECT ACCOUNT SCREEN                │
│ ┌──────────────────────────────────────┐│
│ │ Account: user1@example.com          ││
│ │ [Last used: 3 hours ago]            ││
│ ├──────────────────────────────────────┤│
│ │ Account: user2@example.com          ││
│ │ [Last used: yesterday]              ││
│ └──────────────────────────────────────┘│
│ [+ New Account] [Offline Mode]          │
└─────────────────────────────────────────┘
         ↓ (click account)
┌─────────────────────────────────────────┐
│ 2. PROFILE SELECTION SCREEN             │
│ Account: user1@example.com              │
│ ┌──────────────────────────────────────┐│
│ │ Profile: John              [Default] ││
│ │ ├─ EUR • it-IT                      ││
│ │ └─ Auto-login: Yes                  ││
│ ├──────────────────────────────────────┤│
│ │ Profile: Maria              [Choose]││
│ │ ├─ USD • en-US                      ││
│ │ └─ Requires password                ││
│ └──────────────────────────────────────┘│
│ [+ New Profile]  [← Back] [Acc. Settings]
└─────────────────────────────────────────┘
         ↓ (click profile)
┌─────────────────────────────────────────┐
│ 3. PROFILE LOGIN SCREEN (if needed)     │
│ Account: user1@example.com              │
│ Profile: Maria                          │
│                                         │
│ Password: [___________]                 │
│ ☐ Remember password on this device      │
│ [Login]  [← Back]                       │
└─────────────────────────────────────────┘
         ↓ (success or auto-login)
┌─────────────────────────────────────────┐
│ 4. DASHBOARD (existing)                 │
│ User: Maria (EUR, it-IT)                │
│ [...existing dashboard...]              │
│ [Cambia Account ↧]  [Menu]              │
└─────────────────────────────────────────┘
```

---

## 3. FILES AFFECTED

| File | Current Role | Changes Needed |
|------|--------------|-----------------|
| `backend/server.js` | Session + CSRF mgmt | ✅ Random CSRF token generator; profile sync endpoints |
| `src/data/auth.js` | Account auth | ✅ Account/profile separation; device account loading |
| `src/data/store.js` | State sync | ✅ Profile-aware state management |
| `src/utils/backendClient.js` | HTTP + CSRF | ✅ Updated CSRF retry logic (no TTL) |
| `src/pages/dashboard.js` | Main page | ✅ Add "Cambia Account" button |
| **NEW**: `src/pages/accounts.js` | Account selection | ✅ New page for account/profile selection |
| **NEW**: `src/pages/profiles.js` | Profile selection | ✅ New page for profile selection |
| **NEW**: `src/components/ProfileLoginModal.js` | Profile password | ✅ New modal for profile auth |
| `index.html` | App entry | ✅ Route to account selection on first load |
| `src/app.js` | App router | ✅ New routes for accounts/profiles |

---

## 4. ACCEPTANCE CRITERIA

### CSRF Token Fix
- **AC-001**: CSRF token è casuale, non deterministico
- **AC-002**: Token ha expiration time di 5 minuti
- **AC-003**: Token viene rigenerato automaticamente al restart del server
- **AC-004**: Sync operations non falliscono con "Token CSRF non valido" dopo invalidazione sessione
- **AC-005**: Request count è tracciato e loggato per token

### Account/Profile Architecture
- **AC-006**: Device può memorizzare più account (email + password)
- **AC-007**: Ogni account può avere 1+ profili (username + password per account)
- **AC-008**: Primo accesso richiede creazione di account + primo profilo
- **AC-009**: Accessi successivi mostrano selezione account → selezione profilo
- **AC-010**: Se profilo default esiste, accesso diretto a dashboard
- **AC-011**: Password profilo può essere ricordata su dispositivo (dopo permesso esplicito)
- **AC-012**: "Cambia Account" button torna a selezione account
- **AC-013**: Backend sincronizza stato separatamente per account/profilo
- **AC-014**: Logout pulisce sessione ma non account dal device

### Data Persistence
- **AC-015**: Account list persistita in localStorage
- **AC-016**: Profilo default salvato per account
- **AC-017**: Password profilo non salvata unless esplicitamente richiesto
- **AC-018**: Backend mantiene auth token per account

---

## 5. IMPLEMENTATION STRATEGY

### Phase 1: CSRF Token Fix (Low-risk, high-impact)
1. Modifica `backend/server.js`:
   - Aggiungi in-memory token store
   - Sostituisci `generateCsrfToken()` con versione casuale
   - Aggiorna `assertCsrf()` con expiration check
2. Update `backendClient.js`:
   - Aggiungi logica di fallback su expired token (non solo TTL)
3. Test: Sync operations in loop, check no CSRF errors

### Phase 2: Account/Profile Data Layer
1. Modifica `src/data/auth.js`:
   - Aggiungi account management (CRUD)
   - Aggiungi profile management dentro account
   - Nuovo sistema di password hashing per profili
2. Update localStorage keys structure

### Phase 3: UI Layers
1. Nuove pagine: `accounts.js`, `profiles.js`
2. Nuovo modal: `ProfileLoginModal.js`
3. Update `dashboard.js`: Aggiungi "Cambia Account" button
4. Update `app.js`: Nuovi routes e router logic

### Phase 4: Backend Sync Updates
1. Modifica `/api/sync/*` endpoints per account/profile
2. Aggiorna `sync-state/` structure a `sync-state/{accountId}/{profileId}/`
3. Migrazione dati per account esistenti (backwards compatibility)

### Phase 5: Integration & Testing
1. Test accesso device nuovo (create account)
2. Test accesso device esistente (load account)
3. Test profile selection + default
4. Test password recovery / profile addition
5. Test backend sync per profile

---

## 6. RISKS & MITIGATION

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Breaking change** per account synced | High | Versione di schema nuovo in metadata; load account storage key migration |
| **CSRF token loss on restart** | Low | Accettabile; cliente farà GET `/api/session` automaticamente |
| **Profile password forgotten** | Med | UI deve offrire "Create New Profile" come fallback |
| **Multiple profiles race** | Low | Lock su account ID durante profile operations |
| **Data loss su migration** | High | Test migration script prima di deploy; rollback plan |

---

## 7. RECOMMENDED SEQUENCE

1. ✅ Phase 1 (CSRF Fix) - Day 1, minimal risk
2. ✅ Phase 2 (Auth layer) - Day 1-2, mostly local
3. ✅ Phase 3 (UI) - Day 2-3, can be incremental
4. ✅ Phase 4 (Backend) - Day 3, merge with phase 3
5. ✅ Phase 5 (Testing) - Day 4, validation

---

## DECISION REQUIRED

**Should we support migration of existing accounts to new account/profile system?**

- **Option A** (Recommended): Auto-wrap existing account as "Account 1" with single profile containing existing data
- **Option B**: Manual migration guide in settings
- **Recommendation**: Option A for seamless UX
