/**
 * helpers.js – Piccole utility generiche.
 */

/** Genera un elemento HTML da una stringa template */
export function html(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}

/** Crea un elemento DOM da una stringa HTML */
export function createElement(htmlString) {
  const template = document.createElement('template');
  template.innerHTML = htmlString.trim();
  return template.content.firstElementChild;
}

/** Escape text before interpolating user data into innerHTML templates */
export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** Mostra un toast di notifica */
export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = createElement(`
    <div class="toast toast--${type}" role="alert">
      <span>${icons[type] ?? 'ℹ️'}</span>
      <span>${message}</span>
    </div>
  `);

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

/** Apre una modale dato il suo elemento */
export function openModal(modalEl) {
  document.body.appendChild(modalEl);
  document.body.style.overflow = 'hidden';
}

/** Chiude una modale */
export function closeModal(modalEl) {
  modalEl.remove();
  document.body.style.overflow = '';
}

/** Valida che un importo sia un numero positivo */
export function validateAmount(value) {
  const n = parseFloat(value);
  return !isNaN(n) && n > 0;
}

/** Restituisce la data di oggi in formato YYYY-MM-DD */
export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Debounce */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
