/**
 * assistant.js - Chat locale per suggerimenti economici basati sui dati inseriti.
 */

import { store } from '../data/store.js';
import { buildAssistantReply, suggestedAssistantPrompts } from '../utils/assistant.js';
import { analyzeWithBackend } from '../utils/backendClient.js';
import { escapeHTML } from '../utils/helpers.js';

export function renderAssistant(container) {
  const messages = [
    {
      role: 'assistant',
      text: 'Ciao, sono il tuo assistente locale. Posso leggere entrate, spese, obiettivi e salvadanaio salvati su questo browser per darti suggerimenti pratici.',
    },
  ];

  function renderMessage(message) {
    const text = escapeHTML(message.text).replaceAll('\n', '<br>');
    const label = message.role === 'user' ? 'Tu' : 'Assistente';
    return `
      <div class="assistant-message assistant-message--${message.role}">
        <div class="assistant-message__label">${label}</div>
        <div class="assistant-message__bubble">${text}</div>
      </div>
    `;
  }

  function buildHTML() {
    container.innerHTML = `
      <div class="page-header">
        <h1>💬 Assistente AI</h1>
        <p>Suggerimenti locali basati sui tuoi dati, senza inviare informazioni fuori dal browser.</p>
      </div>

      <div class="assistant-shell">
        <div class="card assistant-panel">
          <div class="assistant-messages" id="assistant-messages" aria-live="polite">
            ${messages.map(renderMessage).join('')}
          </div>

          <div class="assistant-prompts" aria-label="Domande rapide">
            ${suggestedAssistantPrompts().map(prompt => `
              <button class="chip assistant-prompt" type="button" data-prompt="${escapeHTML(prompt)}">${escapeHTML(prompt)}</button>
            `).join('')}
          </div>

          <form class="assistant-form" id="assistant-form">
            <label class="sr-only" for="assistant-input">Messaggio per l'assistente</label>
            <textarea class="form-textarea" id="assistant-input" name="message" rows="2"
              placeholder="Chiedi un consiglio su budget, spese, risparmi o dati salvati..."></textarea>
            <button class="btn btn--primary" type="submit">Invia</button>
          </form>
        </div>

        <div class="card card--glass assistant-note">
          <div class="card__title">Come funziona</div>
          <p>
            Se avvii il backend dedicato, l'analisi passa da un endpoint server con sessione protetta.
            In modalita statica resta attiva la valutazione locale basata sui dati gia presenti nell'app.
          </p>
        </div>
      </div>
    `;

    const messageBox = container.querySelector('#assistant-messages');
    messageBox.scrollTop = messageBox.scrollHeight;
  }

  async function submitQuestion(question) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;

    messages.push({ role: 'user', text: cleanQuestion });
    const reply = { role: 'assistant', text: 'Analizzo entrate, spese fisse, spese manuali e trend...' };
    messages.push(reply);
    buildHTML();

    const backendResult = await analyzeWithBackend(cleanQuestion, store.getState());
    reply.text = backendResult.available && backendResult.reply
      ? backendResult.reply
      : buildAssistantReply(cleanQuestion);
    buildHTML();
    container.querySelector('#assistant-input')?.focus();
  }

  buildHTML();

  container.addEventListener('submit', event => {
    if (event.target.id !== 'assistant-form') return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    submitQuestion(data.message || '');
  });

  container.addEventListener('click', event => {
    const prompt = event.target.closest('.assistant-prompt');
    if (!prompt) return;
    submitQuestion(prompt.dataset.prompt || '');
  });
}
