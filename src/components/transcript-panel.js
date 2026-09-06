/**
 * The transcript. THE PRIMARY UI — not a fallback.
 *
 * A large share of recruiters open this on a phone in an open-plan office and will never
 * enable audio (PRD §3.3). This panel must be complete and useful with the video never
 * played and the sound never on.
 *
 * aria-live="polite" so a screen reader announces answers as they arrive.
 */

class TranscriptPanel extends HTMLElement {
  connectedCallback() {
    this.className = 'block';
    this.innerHTML = `
      <div class="space-y-3" role="log" aria-live="polite" aria-label="Conversation transcript"></div>`;
    this.log = this.firstElementChild;
  }

  /** @param {'agent'|'you'|'system'} who */
  add(who, text, { pending = false } = {}) {
    const row = document.createElement('div');
    const isAgent = who === 'agent';
    const isSystem = who === 'system';

    row.className = isSystem
      ? 'text-xs text-muted italic'
      : isAgent
        ? 'rounded-lg bg-panel px-4 py-3 text-[15px] leading-relaxed'
        : 'rounded-lg border border-paper/10 px-4 py-2 text-[15px] text-paper/70';

    if (!isSystem) {
      const label = document.createElement('div');
      label.className = 'mb-1 text-[11px] uppercase tracking-wide text-muted';
      label.textContent = isAgent ? 'Kshitij (AI)' : 'You';
      row.appendChild(label);
    }

    const body = document.createElement('p');
    body.className = pending ? 'opacity-60' : '';
    body.textContent = pending ? 'Thinking…' : text;
    row.appendChild(body);

    this.log.appendChild(row);
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return { row, body };
  }

  /** Citations are what separate this from a generic chatbot. Show them. */
  addCitations(row, nodes) {
    if (!nodes?.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'mt-2 flex flex-wrap gap-1.5';
    wrap.setAttribute('aria-label', 'Sources for this answer');
    for (const n of nodes) {
      const chip = document.createElement('span');
      chip.className = 'rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent';
      chip.textContent = n;
      wrap.appendChild(chip);
    }
    row.appendChild(wrap);
  }
}

customElements.define('transcript-panel', TranscriptPanel);
