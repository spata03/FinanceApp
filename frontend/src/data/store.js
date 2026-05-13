/**
 * store.js – Gestione centralizzata dei dati con persistenza su localStorage.
 *
 * Schema dati:
 *   transactions[]  – array di transazioni (entrate/spese)
 *   savingsGoals[]  – obiettivi di risparmio
 *   settings{}      – preferenze utente
 */

import { getActiveAccount, getActiveProfile } from './auth-accounts.js';
import { getSyncedState, saveSyncedState } from '../utils/backendClient.js';
import { showToast } from '../utils/helpers.js';

// Legacy fallback storage key (used when no profile is active)
const LEGACY_STORAGE_KEY = 'finanza_personale_v1';

// Ritorna la chiave di storage per il profilo attivo
// Usa il storageKey del profilo v3, oppure il legacy fallback
function getStorageKey() {
  const profile = getActiveProfile();
  if (profile && profile.storageKey) return profile.storageKey;
  return LEGACY_STORAGE_KEY;
}

// Ritorna l'ID del profilo attivo (se esiste)
// Usato per il sync con profileId
function getActiveProfileId() {
  return getActiveProfile()?.id || null;
}

// Helper ID univoco
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const clone = value => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function monthKeyFromDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return monthKeyFromDate(new Date());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyFromISO(value) {
  const parsed = parseISODate(value);
  if (parsed) return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
  return monthKeyFromDate(value);
}

function occurrenceDateForMonth(monthKey, preferredDay) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = clamp(Number(preferredDay) || 1, 1, lastDay);
  return localDateISO(new Date(year, month - 1, day));
}

// ── Struttura dati di default ──────────────────────────────────────────────
const DEFAULT_STATE = {
  transactions: [],   // { id, type, amount, category, description, date, tags[], source?, recurringId?, monthKey? }
  recurringEntries: [],  // { id, type, amount, category, description, dayOfMonth, startDate, active, frequency, generatedMonthKeys[] }
  recurringExpenses: [], // mirror legacy: expense recurringEntries for backward compatibility
  savingsGoals: [],   // { id, name, targetAmount, savedAmount, deadline, icon }
  settings: {
    currency: 'EUR',
    locale:   'it-IT',
    userName: '',
  },
  meta: {
    schemaVersion: 3,
    storageScope: 'browser-profile',
    updatedAt: null,
  },
};

const VALID_FREQUENCIES = new Set(['monthly', 'yearly']);

function normalizeRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter(record => record && typeof record === 'object')
    .map(record => ({ ...record, id: record.id || generateId() }));
}

function normalizeRecurringEntries(records, fallbackType = 'expense') {
  if (!Array.isArray(records)) return [];
  return records
    .filter(record => record && typeof record === 'object')
    .map(record => {
      const amount = Number(record.amount);
      const parsedDate = parseISODate(record.startDate || record.date);
      const dayOfMonth = Number(record.dayOfMonth) || parsedDate?.day || 1;
      const generatedMonthKeys = Array.isArray(record.generatedMonthKeys)
        ? [...new Set(record.generatedMonthKeys.map(String).filter(Boolean))]
        : [];
      const type = record.type === 'income' || record.type === 'expense'
        ? record.type
        : fallbackType;
      const frequency = VALID_FREQUENCIES.has(record.frequency)
        ? record.frequency
        : 'monthly';

      return {
        id: record.id || generateId(),
        type,
        frequency,
        amount: Number.isFinite(amount) ? amount : 0,
        category: record.category || '',
        description: record.description || '',
        dayOfMonth: clamp(dayOfMonth, 1, 31),
        startDate: record.startDate || record.date || localDateISO(),
        active: record.active !== false,
        generatedMonthKeys,
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || null,
      };
    });
}

function mergeRecurringEntries(...groups) {
  const map = new Map();
  groups.flat().forEach(entry => {
    if (!entry) return;
    const id = String(entry.id);
    map.set(id, { ...(map.get(id) || {}), ...entry });
  });
  return [...map.values()];
}

function recurringExpensesMirror(entries) {
  return entries
    .filter(entry => entry.type === 'expense')
    .map(entry => ({ ...entry }));
}

function normalizeState(value = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const recurringEntries = Array.isArray(input.recurringEntries)
    ? normalizeRecurringEntries(input.recurringEntries, 'expense')
    : mergeRecurringEntries(
      normalizeRecurringEntries(input.recurringExpenses, 'expense'),
      normalizeRecurringEntries(input.recurringEntries, 'expense')
    );

  return {
    ...clone(DEFAULT_STATE),
    ...input,
    transactions: normalizeRecords(input.transactions),
    recurringEntries,
    recurringExpenses: recurringExpensesMirror(recurringEntries),
    savingsGoals: normalizeRecords(input.savingsGoals),
    settings: {
      ...DEFAULT_STATE.settings,
      ...(input.settings && typeof input.settings === 'object' ? input.settings : {}),
    },
    meta: {
      ...DEFAULT_STATE.meta,
      ...(input.meta && typeof input.meta === 'object' ? input.meta : {}),
    },
  };
}

function stateUpdatedTime(state) {
  if (!state || !state.meta || !state.meta.updatedAt) return 0;
  const value = Date.parse(state.meta.updatedAt);
  return Number.isFinite(value) ? value : 0;
}

function hasUserData(state = {}) {
  const settings = state.settings || {};
  return Boolean(
    (Array.isArray(state.transactions) && state.transactions.length > 0) ||
    (Array.isArray(state.recurringEntries) && state.recurringEntries.length > 0) ||
    (Array.isArray(state.savingsGoals) && state.savingsGoals.length > 0) ||
    settings.userName ||
    settings.currency !== DEFAULT_STATE.settings.currency ||
    settings.locale !== DEFAULT_STATE.settings.locale ||
    stateUpdatedTime(state) > 0
  );
}

// ── Caricamento / salvataggio ──────────────────────────────────────────────
function shouldGenerateForMonth(entry, monthKey) {
  const frequency = entry.frequency || 'monthly';
  const startMonthKey = monthKeyFromISO(entry.startDate);

  // Non generare se il monthKey è prima della data inizio
  if (startMonthKey > monthKey) return false;

  if (frequency === 'yearly') {
    // Le voci annuali si generano solo nel mese corrispondente alla startDate
    const startParsed = parseISODate(entry.startDate);
    if (!startParsed) return false;
    const [, refMonth] = monthKey.split('-').map(Number);
    return refMonth === startParsed.month;
  }

  // monthly: genera sempre
  return true;
}

function sourceForEntry(entry) {
  return (entry.frequency || 'monthly') === 'yearly' ? 'yearly' : 'monthly';
}

function defaultDescription(entry) {
  const freq = entry.frequency || 'monthly';
  if (freq === 'yearly') {
    return entry.type === 'income' ? 'Entrata annuale' : 'Spesa annuale';
  }
  return entry.type === 'income' ? 'Entrata mensile' : 'Spesa mensile';
}

function materializeMonthlyEntries(state, referenceDate = new Date()) {
  const monthKey = monthKeyFromDate(referenceDate);
  const now = new Date().toISOString();
  let changed = false;
  const generated = [];
  const transactions = [...state.transactions];
  const recurringEntries = state.recurringEntries.map(entry => ({
    ...entry,
    generatedMonthKeys: [...entry.generatedMonthKeys],
  }));

  recurringEntries.forEach(entry => {
    if (!entry.active || entry.amount <= 0 || !entry.category) return;
    if (!shouldGenerateForMonth(entry, monthKey)) return;

    const entrySource = sourceForEntry(entry);
    const alreadyMarked = entry.generatedMonthKeys.includes(monthKey);
    const alreadyExists = transactions.some(tx =>
      (tx.source === 'monthly' || tx.source === 'yearly') &&
      String(tx.recurringId) === String(entry.id) &&
      tx.monthKey === monthKey
    );

    if (alreadyMarked || alreadyExists) {
      if (!alreadyMarked && alreadyExists) {
        entry.generatedMonthKeys.push(monthKey);
        entry.updatedAt = now;
        changed = true;
      }
      return;
    }

    const transaction = {
      id: generateId(),
      type: entry.type,
      amount: entry.amount,
      category: entry.category,
      description: entry.description || defaultDescription(entry),
      date: occurrenceDateForMonth(monthKey, entry.dayOfMonth),
      source: entrySource,
      recurringId: entry.id,
      monthKey,
      createdAt: now,
    };

    transactions.unshift(transaction);
    generated.push(transaction);
    entry.generatedMonthKeys.push(monthKey);
    entry.updatedAt = now;
    changed = true;
  });

  return {
    changed,
    generated,
    state: changed ? { ...state, transactions, recurringEntries } : state,
  };
}

function syncMonthlyTransactionForEntry(state, entry, referenceDate = new Date()) {
  const monthKey = monthKeyFromDate(referenceDate);
  const now = new Date().toISOString();
  const entrySource = sourceForEntry(entry);
  let changed = false;
  const transactions = state.transactions.map(tx => {
    if (
      (tx.source !== 'monthly' && tx.source !== 'yearly') ||
      String(tx.recurringId) !== String(entry.id) ||
      tx.monthKey !== monthKey
    ) {
      return tx;
    }

    changed = true;
    return {
      ...tx,
      type: entry.type,
      amount: entry.amount,
      category: entry.category,
      description: entry.description || defaultDescription(entry),
      date: occurrenceDateForMonth(monthKey, entry.dayOfMonth),
      source: entrySource,
      updatedAt: now,
    };
  });

  return changed ? { ...state, transactions } : state;
}

function loadState() {
  try {
    const key = getStorageKey();
    const raw = localStorage.getItem(key);
    if (!raw) return clone(DEFAULT_STATE);

    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (e) {
    console.error('[Store] Errore lettura localStorage:', e);
    return clone(DEFAULT_STATE);
  }
}

function saveState(state) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
  } catch (e) {
    console.error('[Store] Errore scrittura localStorage:', e);
  }
}

function currentStorageScope() {
  const account = getActiveAccount();
  return account ? `account-local:${account.email || account.id}` : DEFAULT_STATE.meta.storageScope;
}

// ── Store singleton ────────────────────────────────────────────────────────
let _state = loadState();
const initialMonthlyEntries = materializeMonthlyEntries(_state);
if (initialMonthlyEntries.changed) {
  _state = normalizeState({
    ...initialMonthlyEntries.state,
    meta: {
      ...initialMonthlyEntries.state.meta,
      updatedAt: new Date().toISOString(),
    },
  });
  saveState(_state);
}
const _listeners = new Set();
let backendSaveTimer = null;

function notifyListeners() {
  _listeners.forEach(fn => fn(clone(_state)));
}

function queueBackendSave(state, accountId, profileId = null) {
  if (!accountId) return;

  const snapshot = clone(state);
  clearTimeout(backendSaveTimer);
  backendSaveTimer = setTimeout(() => {
    saveSyncedState(accountId, snapshot, profileId)
      .then(res => {
        if (!res.available) console.warn('[Store] Sync fallito:', res.error);
        else console.log('[Store] Sync completato con successo.');
      })
      .catch(error => {
        console.error('[Store] Errore critico salvataggio backend:', error);
      });
  }, 1000); // Ridotto a 1 secondo
}

export const store = {
  /** Restituisce una copia dell'intero stato */
  getState() {
    return clone(_state);
  },

  /** Aggiorna lo stato e notifica i listener */
  setState(updater) {
    const patch = updater(clone(_state));
    _state = normalizeState({
      ..._state,
      ...patch,
      meta: {
        ..._state.meta,
        updatedAt: new Date().toISOString(),
      },
    });
    saveState(_state);

    const account = getActiveAccount();
    const profileId = getActiveProfileId();
    if (account && profileId) {
      queueBackendSave(_state, account.id, profileId);
    }

    notifyListeners();
  },

  /** Registra un callback chiamato ad ogni cambio di stato */
  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  // ── Transazioni ──────────────────────────────────────────────────────────

  addTransaction(tx) {
    const newTx = { ...tx, id: generateId(), createdAt: new Date().toISOString() };
    this.setState(s => ({ transactions: [newTx, ...s.transactions] }));
    return newTx;
  },

  updateTransaction(id, updates) {
    const tid = String(id);
    this.setState(s => ({
      transactions: s.transactions.map(t => String(t.id) === tid ? { ...t, ...updates } : t),
    }));
  },

  deleteTransaction(id) {
    const tid = String(id);
    this.setState(s => ({
      transactions: s.transactions.filter(t => String(t.id) !== tid),
    }));
  },

  getTransactions({ type, month, year, category } = {}) {
    let txs = _state.transactions;
    if (type)     txs = txs.filter(t => t.type === type);
    if (category) txs = txs.filter(t => t.category === category);
    if (month !== undefined && year !== undefined) {
      txs = txs.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === month && d.getFullYear() === year;
      });
    }
    return clone(txs);
  },

  // ── Voci mensili fisse ───────────────────────────────────────────────────

  addRecurringEntry(entry) {
    const [normalized] = normalizeRecurringEntries([{
      ...entry,
      id: generateId(),
      active: entry.active !== false,
      createdAt: new Date().toISOString(),
      generatedMonthKeys: [],
    }], entry.type === 'income' ? 'income' : 'expense');
    this.setState(s => ({ recurringEntries: [normalized, ...s.recurringEntries] }));
    this.applyMonthlyEntries();
    return clone(normalized);
  },

  updateRecurringEntry(id, updates) {
    const tid = String(id);
    this.setState(s => {
      let updatedEntry = null;
      const recurringEntries = s.recurringEntries.map(entry => {
        if (String(entry.id) !== tid) return entry;
        updatedEntry = normalizeRecurringEntries([{
          ...entry,
          ...updates,
          updatedAt: new Date().toISOString(),
        }], entry.type)[0];
        return updatedEntry;
      });

      const nextState = { recurringEntries };
      return updatedEntry
        ? syncMonthlyTransactionForEntry({ ...s, ...nextState }, updatedEntry)
        : nextState;
    });
  },

  deleteRecurringEntry(id) {
    const tid = String(id);
    this.setState(s => ({
      recurringEntries: s.recurringEntries.filter(entry => String(entry.id) !== tid),
    }));
  },

  getRecurringEntries({ type, active } = {}) {
    let entries = _state.recurringEntries;
    if (type) entries = entries.filter(entry => entry.type === type);
    if (active !== undefined) entries = entries.filter(entry => entry.active === active);
    return clone(entries);
  },

  addRecurringExpense(expense) {
    return this.addRecurringEntry({ ...expense, type: 'expense' });
  },

  updateRecurringExpense(id, updates) {
    this.updateRecurringEntry(id, { ...updates, type: 'expense' });
  },

  deleteRecurringExpense(id) {
    this.deleteRecurringEntry(id);
  },

  getRecurringExpenses({ active } = {}) {
    return this.getRecurringEntries({ type: 'expense', active });
  },

  applyMonthlyEntries(referenceDate = new Date()) {
    const result = materializeMonthlyEntries(_state, referenceDate);
    if (!result.changed) return [];

    _state = normalizeState({
      ...result.state,
      meta: {
        ...result.state.meta,
        updatedAt: new Date().toISOString(),
      },
    });
    saveState(_state);
    notifyListeners();
    const _acc = getActiveAccount();
    const _prof = getActiveProfile();
    if (_acc && _prof) queueBackendSave(_state, _acc.id, _prof.id);
    return clone(result.generated);
  },

  applyMonthlyExpenses(referenceDate = new Date()) {
    return this.applyMonthlyEntries(referenceDate);
  },

  addSavingsGoal(goal) {
    const newGoal = { ...goal, id: generateId(), savedAmount: goal.savedAmount ?? 0 };
    this.setState(s => ({ savingsGoals: [newGoal, ...s.savingsGoals] }));
    return newGoal;
  },

  updateSavingsGoal(id, updates) {
    const tid = String(id);
    this.setState(s => ({
      savingsGoals: s.savingsGoals.map(g => String(g.id) === tid ? { ...g, ...updates } : g),
    }));
  },

  deleteSavingsGoal(id) {
    const tid = String(id);
    this.setState(s => ({
      savingsGoals: s.savingsGoals.filter(g => String(g.id) !== tid),
    }));
  },

  getSavingsGoals() {
    return clone(_state.savingsGoals);
  },

  // ── Impostazioni ─────────────────────────────────────────────────────────

  updateSettings(updates) {
    this.setState(s => ({ settings: { ...s.settings, ...updates } }));
  },

  getSettings() {
    return clone(_state.settings);
  },

  getStorageInfo() {
    return {
      key: getStorageKey(),
      scope: currentStorageScope(),
      schemaVersion: _state.meta.schemaVersion,
      updatedAt: _state.meta.updatedAt,
    };
  },

  async syncWithBackend() {
    const account = getActiveAccount();
    if (!account) {
      return { available: false, error: 'Nessun account attivo.' };
    }

    const profileId = getActiveProfileId();

    const result = await getSyncedState(account.id, profileId).catch(err => {
      if (err.message.includes('403') || err.message.includes('Accedi')) {
        showToast('Sync disattivato: effettua il login con password una volta su questo dispositivo.', 'info', 6000);
      }
      return { available: false, error: err.message };
    });
    if (!result.available) return result;

    const remoteState = result.state ? normalizeState(result.state) : null;
    const remoteTime = stateUpdatedTime(remoteState);
    const localTime = stateUpdatedTime(_state);

    console.log(`[Store] Sync check: Local=${localTime}, Remote=${remoteTime}, Account=${account.id}, Profile=${profileId || 'none'}`);

    // Se il remoto è più nuovo, facciamo PULL
    if (remoteState && remoteTime > localTime) {
      console.log('[Store] Sincronizzazione: PULL dei dati dal server.');
      _state = remoteState;
      saveState(_state);
      notifyListeners();
      return { available: true, direction: 'pull', state: clone(_state) };
    }

    // Se il locale è più nuovo, facciamo PUSH
    if (localTime > remoteTime || !result.exists) {
      console.log('[Store] Sincronizzazione: PUSH dei dati al server.');
      const saved = await saveSyncedState(account.id, _state, profileId);
      return {
        available: saved.available,
        direction: saved.available ? 'push' : 'none',
        error: saved.error,
        state: clone(_state),
      };
    }

    console.log('[Store] Sincronizzazione: i dati sono già aggiornati.');
    return { available: true, direction: 'none', state: clone(_state) };
  },

  // ── Reset ────────────────────────────────────────────────────────────────
  reset() {
    _state = normalizeState({
      ...clone(DEFAULT_STATE),
      meta: {
        ...DEFAULT_STATE.meta,
        updatedAt: new Date().toISOString(),
      },
    });
    saveState(_state);
    notifyListeners();
    const _acc = getActiveAccount();
    const _prof = getActiveProfile();
    if (_acc && _prof) queueBackendSave(_state, _acc.id, _prof.id);
  },

  // ── Reload from storage (called after profile switch) ────────────────────
  reloadFromStorage() {
    _state = loadState(); // loadState() uses getStorageKey() which now points to the correct profile
    const result = materializeMonthlyEntries(_state);
    if (result.changed) {
      _state = normalizeState({
        ...result.state,
        meta: { ...result.state.meta, updatedAt: new Date().toISOString() },
      });
      saveState(_state);
    }
    notifyListeners();
  },
};
