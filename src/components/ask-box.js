/**
 * The question input plus suggested-question chips.
 *
 * v0 is text-only. The mic is v1 (PRD §5) — deferred deliberately, because speech is one
 * of the three components with no prior experience behind it and v0 must ship.
 *
 * Everything here is keyboard-reachable. Enter submits.
 */

class AskBox extends HTMLElement {
  connectedCallback() {
    this.className = 'block space-y-3';
    this.innerHTML = `
      <div data-chips class="flex flex-wrap gap-2"></div>
      <form class="flex gap-2" novalidate>
        <label class="sr-only" for="ask-input">Ask a question about Kshitij's work</label>
        <input id="ask-input" name="q" type="text" autocomplete="off"
               placeholder="Ask about his work…"
               maxlength="600"
               class="min-w-0 flex-1 rounded-lg border border-paper/15 bg-panel px-3 py-2.5 text-[15px] placeholder:text-muted focus:border-accent" />
        <button type="submit"
                class="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-ink hover:brightness-110 disabled:opacity-40">
          Ask
        </button>
      </form>
      <p data-note class="text-xs text-muted" hidden></p>`;

    this.form = this.querySelector('form');
    this.input = this.querySelector('input');
    this.chips = this.querySelector('[data-chips]');
    this.note = this.querySelector('[data-note]');

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = '';
      this.dispatchEvent(new CustomEvent('ask', { detail: { text }, bubbles: true }));
    });
  }

  setSuggestions(questions) {
    this.chips.replaceChildren();
    for (const q of questions ?? []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'rounded-full border border-paper/15 px-3 py-1.5 text-xs text-paper/80 hover:border-accent hover:text-accent';
      b.textContent = q;
      b.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('ask', { detail: { text: q }, bubbles: true }));
      });
      this.chips.appendChild(b);
    }
  }

  setBusy(busy) {
    this.querySelector('button[type=submit]').disabled = busy;
    this.input.disabled = busy;
    if (!busy) this.input.focus();
  }

  /**
   * Free-form asking is disabled when quota is exhausted — but the suggested questions
   * still work, because those resolve from the pre-approved FAQ with no model call.
   * An honest message beats a broken input.
   */
  setDegraded(message) {
    this.input.disabled = true;
    this.input.placeholder = 'Free-form questions are off right now';
    this.querySelector('button[type=submit]').disabled = true;
    this.note.textContent = message;
    this.note.hidden = false;
  }
}

customElements.define('ask-box', AskBox);
