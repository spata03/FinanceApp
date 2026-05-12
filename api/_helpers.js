/**
 * api/_helpers.js — Cross-controller utility functions.
 */

import crypto from 'node:crypto';
import { config } from '../backend/config.js';

const { allowedCurrencies, allowedLocales } = config;

export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

export function normalizeEmail(value = '') {
  return String(value).trim().toLowerCase();
}

export function isoDateOrNull(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function sanitizeProfile(profile = {}) {
  const userName = String(profile.userName || '').trim().slice(0, 80);
  const currency = allowedCurrencies.has(profile.currency) ? profile.currency : 'EUR';
  const locale = allowedLocales.has(profile.locale) ? profile.locale : 'it-IT';
  return { userName, currency, locale };
}

export function sanitizeSyncState(state = {}) {
  const input = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const meta = input.meta && typeof input.meta === 'object' ? input.meta : {};
  return {
    ...input,
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    recurringEntries: Array.isArray(input.recurringEntries) ? input.recurringEntries : [],
    recurringExpenses: Array.isArray(input.recurringExpenses) ? input.recurringExpenses : [],
    savingsGoals: Array.isArray(input.savingsGoals) ? input.savingsGoals : [],
    settings: input.settings && typeof input.settings === 'object' ? input.settings : {},
    meta: {
      ...meta,
      schemaVersion: Number(meta.schemaVersion) || 3,
      storageScope: 'private-backend-sync',
      updatedAt: isoDateOrNull(meta.updatedAt) || new Date().toISOString(),
    },
  };
}
