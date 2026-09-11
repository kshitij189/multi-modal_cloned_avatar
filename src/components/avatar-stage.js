/**
 * The avatar.
 *
 * A stylized 2D face drawn in SVG, whose mouth is driven by the actual audio waveform in
 * real time via a Web Audio AnalyserNode.
 *
 * Why this design rather than video of a real face:
 *
 *   Every line this avatar speaks is generated fresh, so there is no recording that could
 *   be lipsynced in advance. Making a photoreal face move correctly against audio that
 *   did not exist a second ago needs a GPU at request time, which costs money. Reading
 *   the amplitude of the audio that IS playing costs nothing, runs at 60fps on a phone,
 *   and can never drift out of sync — because it is not predicting the sound, it is
 *   measuring it.
 *
 * It is also honest. A stylized avatar reads as an avatar; a not-quite-right photoreal
 * face reads as a bad deepfake, which is a worse outcome than not trying.
 *
 * Total cost: ~5KB of SVG and maths. No model, no download, no licence.
 */

class AvatarStage extends HTMLElement {
  connectedCallback() {
    this.className = 'relative block';
    this.innerHTML = `
      <svg viewBox="0 0 200 200" class="block w-full h-auto max-w-[220px] mx-auto"
           role="img" aria-label="Stylized animated avatar of Kshitij Tripathi">
        <defs>
          <radialGradient id="av-bg" cx="50%" cy="40%">
            <stop offset="0%" stop-color="#1b2130"/>
            <stop offset="100%" stop-color="#0b0e14"/>
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="96" fill="url(#av-bg)"/>
        <circle data-ring cx="100" cy="100" r="92" fill="none"
                stroke="#7dd3a0" stroke-width="1.5" opacity="0.25"/>

        <!-- head -->
        <ellipse cx="100" cy="104" rx="46" ry="52" fill="#2a3244"/>
        <path d="M54 88 Q100 46 146 88 Q146 58 100 54 Q54 58 54 88Z" fill="#141822"/>

        <!-- eyes: scaleY is animated for blinking -->
        <g data-eyes>
          <ellipse data-eye cx="82" cy="100" rx="5.5" ry="6.5" fill="#e8eaf0"/>
          <ellipse data-eye cx="118" cy="100" rx="5.5" ry="6.5" fill="#e8eaf0"/>
        </g>

        <!-- brows -->
        <path d="M72 86 Q82 82 92 86" stroke="#0b0e14" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M108 86 Q118 82 128 86" stroke="#0b0e14" stroke-width="3" fill="none" stroke-linecap="round"/>

        <!-- mouth: ry is driven by live audio amplitude -->
        <ellipse data-mouth cx="100" cy="132" rx="15" ry="2" fill="#0b0e14"/>
      </svg>

      <p data-state class="mt-2 text-center text-xs text-muted" aria-live="polite"></p>`;

    this.mouth = this.querySelector('[data-mouth]');
    this.eyes = [...this.querySelectorAll('[data-eye]')];
    this.ring = this.querySelector('[data-ring]');
    this.stateLabel = this.querySelector('[data-state]');

    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    this.level = 0;
    this.setState('idle');
    if (!this.reduced) {
      this.#blinkLoop();
      this.#renderLoop();
    }
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.blinkTimer);
  }

  /**
   * Attaches an AnalyserNode. Everything the mouth does flows from here.
   * @param {AnalyserNode} analyser
   */
  attachAnalyser(analyser) {
    this.analyser = analyser;
    this.buf = new Uint8Array(analyser.frequencyBinCount);
  }

  detachAnalyser() {
    this.analyser = null;
    this.level = 0;
  }

  /** @param {'idle'|'speaking'|'thinking'|'listening'} s */
  setState(s) {
    this.state = s;
    const label = { idle: '', speaking: 'Speaking', thinking: 'Thinking…', listening: 'Listening' }[s] ?? '';
    if (this.stateLabel) this.stateLabel.textContent = label;
    if (this.ring) this.ring.setAttribute('opacity', s === 'speaking' ? '0.6' : '0.25');
  }

  #blinkLoop() {
    const blink = () => {
      // Irregular intervals — a perfectly periodic blink is what makes an avatar feel dead.
      this.blinkTimer = setTimeout(() => {
        for (const e of this.eyes) e.setAttribute('ry', '0.6');
        setTimeout(() => {
          for (const e of this.eyes) e.setAttribute('ry', '6.5');
        }, 110);
        blink();
      }, 2200 + Math.random() * 3600);
    };
    blink();
  }

  #renderLoop() {
    const tick = () => {
      let target = 2;

      if (this.analyser) {
        this.analyser.getByteTimeDomainData(this.buf);
        // RMS of the waveform around the 128 midpoint. Amplitude, not frequency — we
        // want "how loud right now", which maps directly to how open a mouth should be.
        let sum = 0;
        for (let i = 0; i < this.buf.length; i++) {
          const v = (this.buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / this.buf.length);
        // Scale to a mouth opening, clamped so a loud syllable doesn't look like a yawn.
        target = 2 + Math.min(rms * 90, 16);
      }

      // Smooth towards the target. Raw per-frame RMS is jittery and reads as a twitch;
      // easing at ~0.35 keeps it responsive while looking like a jaw rather than a strobe.
      this.level += (target - this.level) * 0.35;
      this.mouth.setAttribute('ry', this.level.toFixed(2));
      this.mouth.setAttribute('rx', (15 - this.level * 0.18).toFixed(2));

      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
}

customElements.define('avatar-stage', AvatarStage);
