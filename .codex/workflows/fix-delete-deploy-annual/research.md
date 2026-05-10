# Research Report – Fix Delete, Deploy, Annual Entries

## Task Summary

Three requirements:
1. **Fix account deletion error** + improve profile management
2. **Make app accessible from iPhone when PC is off** (deploy)
3. **Add annual recurring entries** (yearly expenses/income alongside monthly)

---

## Issue 1: Account Delete Failure

### Root Cause Analysis

The `deleteAccount()` function in `auth.js:485-505` calls `deleteSyncedAccount(accountId)` which sends a `DELETE` to `/api/sync/account?id=...`.

**Bug**: In `auth.js:495`, `getActiveAccount()` is called **after** the account list has already been filtered and saved (line 491-492). At this point, `getActiveAccount()` reads from the localStorage which now has the account removed. So `getActiveAccount()?.id === accountId` may fail to match because the account is no longer in the list, meaning `logoutAccount()` is never called.

**But the actual error** is a **403 Forbidden** from the backend. Looking at `server.js:632-648`, the DELETE endpoint requires CSRF validation. The `deleteSyncedAccount` function in `backendClient.js:97-112` does send the CSRF token correctly. 

**The real issue**: The `ensureBackendSession()` caches the session promise. If the session cookie has expired or the server restarted (new SESSION_SECRET), the cached session has a stale CSRF token. The DELETE request fails with 403 because the CSRF token is stale.

**Fix approach**:
1. In `backendClient.js`: add session retry logic – if a request gets 403 for CSRF, invalidate the cached session and retry once.
2. In `auth.js:deleteAccount`: Fix the order of operations – check/logout active account BEFORE removing from the account list.
3. Add error handling/user feedback when deletion fails on the backend.

### Profile Management Improvements
- Add ability to rename account from the profile management screen
- Show last login date on profile cards
- Better visual feedback during profile operations

---

## Issue 2: Accessibility from iPhone (Deployment)

The app currently runs on a local Node.js server. For iPhone access when the PC is off, we need a **cloud deployment**.

**Best approach**: Deploy to a free cloud platform. The app is a Node.js server that serves static files and has a JSON-file-based backend.

**Recommended: Render.com free tier** or **Railway.app**:
- Supports Node.js natively
- Free tier available
- Persistent file storage (for the JSON data files)

**However**, the simplest approach that keeps the user's data private is to provide **deployment instructions** and improve the PWA for offline usage.

**Alternative: Use Cloudflare Tunnel** (free) to expose the local backend to the internet with a permanent URL, accessible from anywhere.

Since the user wants to access the app when the PC is off, a true cloud deployment is needed. I'll provide a comprehensive guide with multiple options.

---

## Issue 3: Annual Recurring Entries

Currently the system has:
- **Monthly fixed** (source: `'monthly'`): auto-generated each month from `recurringEntries`
- **Variable/Manual**: manually added transactions

**Needed**: Annual entries that generate once per year.

### Implementation plan:
1. Add `frequency` field to recurring entries: `'monthly'` | `'yearly'`
2. Update `RecurringEntryModal.js` to allow choosing frequency
3. Update `materializeMonthlyEntries` in `store.js` to handle yearly entries
4. Update `normalizeRecurringEntries` to include frequency field
5. Update transaction `source` to distinguish: `'monthly'` vs `'yearly'`
6. Update calculations, monthly page, transactions page filters to handle yearly
7. Update backend `server.js` sanitization to accept the new frequency/source values

---

## Acceptance Criteria

- **AC-001**: Account deletion completes without errors (both locally and on the backend)
- **AC-002**: Profile management shows last login, allows rename from profile screen
- **AC-003**: Deployment guide is provided for cloud hosting (Render/Railway/Cloudflare)
- **AC-004**: Annual recurring entries can be created and edited via modal
- **AC-005**: Annual entries auto-generate transactions once per year in the correct month
- **AC-006**: Filters and reports correctly distinguish monthly, yearly, and variable entries
- **AC-007**: Existing monthly entries continue to work unchanged (backward compatibility)
