/**
 * categories.js – Categorie predefinite per entrate e spese.
 */

export const INCOME_CATEGORIES = [
  { id: 'stipendio',    label: 'Stipendio',         icon: '💼' },
  { id: 'freelance',   label: 'Freelance',          icon: '💻' },
  { id: 'investimenti',label: 'Investimenti',        icon: '📈' },
  { id: 'affitto',     label: 'Affitti attivi',     icon: '🏠' },
  { id: 'regalo',      label: 'Regali ricevuti',    icon: '🎁' },
  { id: 'rimborso',    label: 'Rimborsi',           icon: '↩️' },
  { id: 'altro_e',     label: 'Altro (entrata)',    icon: '➕' },
];

export const EXPENSE_CATEGORIES = [
  { id: 'alimentari',  label: 'Alimentari',         icon: '🛒' },
  { id: 'casa',        label: 'Casa & Utenze',      icon: '🏡' },
  { id: 'trasporti',   label: 'Trasporti',          icon: '🚗' },
  { id: 'salute',      label: 'Salute & Farmacia',  icon: '🏥' },
  { id: 'svago',       label: 'Svago & Ristoranti', icon: '🎉' },
  { id: 'abbigliamento',label: 'Abbigliamento',     icon: '👗' },
  { id: 'tecnologia',  label: 'Tecnologia',         icon: '📱' },
  { id: 'istruzione',  label: 'Istruzione',         icon: '📚' },
  { id: 'abbonamenti', label: 'Abbonamenti',        icon: '📺' },
  { id: 'sport',       label: 'Sport & Fitness',    icon: '🏋️' },
  { id: 'viaggi',      label: 'Viaggi & Vacanze',   icon: '✈️' },
  { id: 'salvadanaio', label: 'Salvadanaio',        icon: '🐷' },
  { id: 'altro_s',     label: 'Altro (spesa)',      icon: '➖' },
];

/** Restituisce icona + label data la categoria e il tipo */
export function getCategoryInfo(categoryId, type = 'expense') {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find(c => c.id === categoryId) ?? { id: categoryId, label: categoryId, icon: '📌' };
}

/** Tutte le categorie in un unico array (con il tipo incluso) */
export const ALL_CATEGORIES = [
  ...INCOME_CATEGORIES.map(c => ({ ...c, type: 'income' })),
  ...EXPENSE_CATEGORIES.map(c => ({ ...c, type: 'expense' })),
];
