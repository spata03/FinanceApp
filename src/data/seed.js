/**
 * seed.js – Dati demo per testare l'applicazione.
 *
 * Per usarlo: apri la console del browser e digita:
 *   import('./src/data/seed.js').then(m => m.seedDemoData())
 *
 * Oppure aggiungi temporaneamente a app.js:
 *   import { seedDemoData } from './data/seed.js';
 *   seedDemoData();
 */

import { store } from './store.js';

export function seedDemoData() {
  // Evita di duplicare se già presenti
  if (store.getTransactions().length > 0) {
    console.warn('[Seed] Dati già presenti. Esegui store.reset() prima di fare il seed.');
    return;
  }

  const now   = new Date();
  const y     = now.getFullYear();
  const m     = now.getMonth(); // 0-indexed

  // Helper: data in formato YYYY-MM-DD
  const d = (month, day) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  };

  // ── Entrate (3 mesi) ──────────────────────────────────────────────────────
  const entrate = [
    // Mese corrente
    { type:'income', amount:2200, category:'stipendio',    description:'Stipendio maggio',         date: d(m, 1) },
    { type:'income', amount:350,  category:'freelance',    description:'Consulenza web',            date: d(m, 8) },
    { type:'income', amount:120,  category:'investimenti', description:'Dividendi ETF',             date: d(m,15) },
    // Mese precedente
    { type:'income', amount:2200, category:'stipendio',    description:'Stipendio aprile',          date: d(m-1, 1) },
    { type:'income', amount:500,  category:'freelance',    description:'Progetto logo',             date: d(m-1,12) },
    // 2 mesi fa
    { type:'income', amount:2200, category:'stipendio',    description:'Stipendio marzo',           date: d(m-2, 1) },
    { type:'income', amount:80,   category:'regalo',       description:'Regalo compleanno',         date: d(m-2,20) },
    { type:'income', amount:200,  category:'rimborso',     description:'Rimborso spese lavoro',     date: d(m-2,25) },
  ];

  // ── Spese (3 mesi) ────────────────────────────────────────────────────────
  const spese = [
    // Mese corrente
    { type:'expense', amount:650,  category:'casa',          description:'Affitto',                  date: d(m, 2) },
    { type:'expense', amount:95,   category:'casa',          description:'Bolletta luce + gas',      date: d(m, 5) },
    { type:'expense', amount:180,  category:'alimentari',    description:'Spesa settimanale',        date: d(m, 6) },
    { type:'expense', amount:55,   category:'trasporti',     description:'Abbonamento mensile ATM',  date: d(m, 3) },
    { type:'expense', amount:45,   category:'svago',         description:'Cinema + cena',            date: d(m,10) },
    { type:'expense', amount:29,   category:'abbonamenti',   description:'Netflix + Spotify',        date: d(m, 4) },
    { type:'expense', amount:120,  category:'alimentari',    description:'Spesa fine mese',          date: d(m,18) },
    { type:'expense', amount:80,   category:'salute',        description:'Farmacia + visita',        date: d(m,12) },
    // Mese precedente
    { type:'expense', amount:650,  category:'casa',          description:'Affitto aprile',           date: d(m-1, 2) },
    { type:'expense', amount:88,   category:'casa',          description:'Bollette',                 date: d(m-1, 6) },
    { type:'expense', amount:310,  category:'alimentari',    description:'Spesa mensile',            date: d(m-1,10) },
    { type:'expense', amount:55,   category:'trasporti',     description:'Abbonamento ATM',          date: d(m-1, 3) },
    { type:'expense', amount:199,  category:'tecnologia',    description:'Cuffie wireless',          date: d(m-1,15) },
    { type:'expense', amount:75,   category:'svago',         description:'Ristorante con amici',     date: d(m-1,22) },
    { type:'expense', amount:29,   category:'abbonamenti',   description:'Netflix + Spotify',        date: d(m-1, 4) },
    // 2 mesi fa
    { type:'expense', amount:650,  category:'casa',          description:'Affitto marzo',            date: d(m-2, 2) },
    { type:'expense', amount:92,   category:'casa',          description:'Bollette',                 date: d(m-2, 6) },
    { type:'expense', amount:275,  category:'alimentari',    description:'Spesa mensile',            date: d(m-2, 8) },
    { type:'expense', amount:55,   category:'trasporti',     description:'Abbonamento ATM',          date: d(m-2, 3) },
    { type:'expense', amount:120,  category:'istruzione',    description:'Corso online',             date: d(m-2,14) },
    { type:'expense', amount:29,   category:'abbonamenti',   description:'Netflix + Spotify',        date: d(m-2, 4) },
    { type:'expense', amount:60,   category:'sport',         description:'Palestra mensile',         date: d(m-2, 1) },
  ];

  [...entrate, ...spese].forEach(tx => store.addTransaction(tx));

  // ── Obiettivi di risparmio ────────────────────────────────────────────────
  store.addSavingsGoal({
    name:         'Fondo emergenza',
    icon:         '🏦',
    targetAmount: 5000,
    savedAmount:  2100,
    deadline:     `${y}-12-31`,
  });

  store.addSavingsGoal({
    name:         'Vacanza estate',
    icon:         '✈️',
    targetAmount: 1500,
    savedAmount:  850,
    deadline:     `${y}-07-01`,
  });

  store.addSavingsGoal({
    name:         'Nuovo laptop',
    icon:         '💻',
    targetAmount: 1200,
    savedAmount:  300,
    deadline:     null,
  });

  store.addSavingsGoal({
    name:         'Corso di formazione',
    icon:         '🎓',
    targetAmount: 500,
    savedAmount:  500,
    deadline:     `${y}-06-01`,
  });

  console.log('[Seed] ✅ Dati demo inseriti con successo!');
  console.log(`  → ${entrate.length + spese.length} transazioni`);
  console.log('  → 4 obiettivi di risparmio');
}
