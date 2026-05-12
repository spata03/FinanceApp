/**
 * formatters.js – Funzioni di formattazione per valuta, date e percentuali.
 */

import { store } from '../data/store.js';

/** Formatta un importo nella valuta e locale delle impostazioni */
export function formatCurrency(amount, overrideSettings = {}) {
  const { currency, locale } = { ...store.getSettings(), ...overrideSettings };
  return new Intl.NumberFormat(locale, {
    style:    'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Formatta una data in formato leggibile */
export function formatDate(dateStr, options = {}) {
  const { locale } = store.getSettings();
  const defaults = { day: '2-digit', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, { ...defaults, ...options })
    .format(new Date(dateStr));
}

/** Formatta una data come "mese anno" (es. Maggio 2026) */
export function formatMonthYear(date = new Date()) {
  const { locale } = store.getSettings();
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    .format(date);
}

/** Formatta una percentuale */
export function formatPercent(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** Formatta un numero compatto (es. 12500 → 12,5K) */
export function formatCompact(amount) {
  const { locale } = store.getSettings();
  return new Intl.NumberFormat(locale, { notation: 'compact' }).format(amount);
}

/** Restituisce "+€ X" o "−€ X" con segno */
export function formatSignedCurrency(amount) {
  const sign = amount >= 0 ? '+' : '';
  return sign + formatCurrency(amount);
}
