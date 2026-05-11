# 📝 Implementation Report: Iteration 1

**Date**: 2026-05-11  
**Task**: Fix CSRF Token + Implement Account/Profile Hierarchy  
**Status**: IN PROGRESS  

---

## ✅ Completed

### Phase 1: CSRF Token Fix
- **CSRF Token Storage**: Implementato in-memory token store in `backend/server.js`
- **Random Token Generation**: Sostituito sistema deterministico con token casuale
- **Expiration Time**: Token scadono dopo 5 minuti (configurable)
- **Request Counting**: Aggiunto conteggio richieste per token
- **Changes in backend/server.js**:
  - Aggiunto `csrfTokenStore` Map in-memory (riga 17)
  - Sostituiti `generateCsrfToken()` con `generateAndStoreCsrfToken()` (randomico)
  - Aggiunto `validateCsrfToken()` per validazione dal store (riga 126)
  - Aggiornato `assertCsrf()` per usare la validazione dal store (riga 154)
  - Modificato `createSession()` per generare token all'init (riga 104)
  - Modificato `getSession()` per rigenerare token se scaduto (riga 117)

### Phase 2: Account/Profile Data Layer
- **New Module**: Creato `src/data/auth-accounts.js` (513 lines)
- **Account Structure**: Email + password-based super admin account
- **Profile Structure**: Username + password per account, con currency e locale
- **Password Hashing**: Supporta PBKDF2 + fallback hash (compatibile con backend)
- **Public API**:
  - `registerAccount()`: Crea account + primo profilo
  - `loginAccount()`: Login account, ritorna profili
  - `loginProfile()`: Login profilo dentro account
  - `createProfile()`: Aggiungi profilo a account
  - `setDefaultProfile()`: Imposta profilo default
  - `deleteAccount()` / `deleteProfile()`: Rimozione
  - `listAccountsSummary()` / `listProfilesForAccount()`: Listing
  - `getActiveAccount()` / `getActiveProfile()`: Stato attuale
  - `logoutProfile()` / `logoutAccount()`: Logout

### Phase 3: UI Layers
- **New File**: `src/pages/accounts.js` - Selezione/login account
  - Mostra lista account precedenti
  - Pulsante per nuovo account
  - Modale di login account (email + password)
  - Modale per registrazione (email, password, profilo default)
  
- **New File**: `src/pages/profiles.js` - Selezione/login profilo
  - Mostra profili di account selezionato
  - Evidenzia profilo default
  - Pulsante "Cambia Account"
  - Modale per login profilo (password)
  - Modale per creazione profilo

- **Updated**: `src/app.js`
  - Aggiunto import per `auth-accounts.js`
  - Aggiunte rotte: `/accounts`, `/profiles`
  - Modificato `navigateTo()` per nascondere sidebar su pagine auth
  - Aggiornato `handleHashChange()` per verificare profilo attivo all'avvio
  - Se profilo non attivo: reindirizza a `#/profiles` o `#/accounts`

---

## 📋 Acceptance Criteria Status

| Criteria | Status | Notes |
|----------|--------|-------|
| AC-001: CSRF token casuale | ✅ | Implementato `generateAndStoreCsrfToken()` |
| AC-002: Token expiration 5m | ✅ | Costante `CSRF_TOKEN_EXPIRATION_MS` = 5 min |
| AC-003: Token reset on restart | ✅ | In-memory store resettato a startup |
| AC-004: No CSRF errors on sync | ⏳ | Testare dopo verifica backend |
| AC-005: Request count logged | ✅ | Implementato in `validateCsrfToken()` |
| AC-006: Multiple accounts | ✅ | Supportato in `auth-accounts.js` |
| AC-007: Profiles per account | ✅ | Implementato sistema annidato |
| AC-008: Create account + profile | ✅ | `registerAccount()` crea entrambi |
| AC-009: Account → Profile selection | ✅ | Flow: accounts → profiles → dashboard |
| AC-010: Auto-login default profile | ⏳ | Necessario verificare in router |
| AC-011: Remember profile password | ⏳ | TODO: Implementare checkbox in login |
| AC-012: "Cambia Account" button | ✅ | Pulsante in `profiles.js` |
| AC-013: Per-profile sync state | ⏳ | Backend endpoint TODO |
| AC-014: Logout preserves account | ✅ | `logoutProfile()` non rimuove account |

---

## 🚀 Files Created

1. **Backend CSRF Fix**:
   - `backend/server.js` (modified)

2. **New Auth Module**:
   - `src/data/auth-accounts.js` (513 lines)

3. **New UI Pages**:
   - `src/pages/accounts.js` (300+ lines)
   - `src/pages/profiles.js` (300+ lines)

4. **Updated Router**:
   - `src/app.js` (modified)

---

## 🔄 Remaining Work

### Phase 4: Backend Sync Updates (TODO)
1. Update `/api/sync/accounts` to handle email-based accounts
2. Add `/api/sync/profiles/{accountId}` endpoint
3. Update `/api/sync/state` to per-profile paths
4. Add profile settings persistence

### Phase 5: Testing & Verification (TODO)
1. Manual test: create account → create profile → login → sync
2. Manual test: default profile auto-login
3. Manual test: CSRF token doesn't error after 5 minutes
4. Verify localStorage structure
5. Test "Cambia Account" flow

### Known Limitations
- [ ] Auto-login default profile not yet implemented in router
- [ ] Password remember feature not yet implemented
- [ ] Backend sync endpoints need update
- [ ] Profile settings (currency/locale) not persisted to backend yet

---

## 🐛 Issues Found

- **None critical yet** - System ready for Phase 4 integration

---

## 📊 Next Steps

1. **Phase 4**: Implement backend endpoints for profile sync
2. **Phase 5**: Full integration test
3. **Review**: Verify all AC met before final OK
