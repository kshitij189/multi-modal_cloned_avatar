/**
 * The video stage.
 *
 * Three browser realities are load-bearing here and every one of them has bitten
 * somebody before (CLAUDE.md gotchas):
 *
 *  1. preload="none" + a poster. A recruiter who never taps Start must cost ZERO media
 *     bytes. `preload="auto"` would fetch over a megabyte on page load.
 *  2. playsinline, or iOS hijacks the whole screen into fullscreen.
 *  3. .play() must be called SYNCHRONOUSLY inside the gesture handler. Any await before
 *     it loses the gesture context and playback fails silently on iOS Safari.
 *
 * The video is decorative by design — aria-hidden, with everything meaningful in the
 * transcript. A muted recruiter loses nothing.
 */

class AvatarStage extends HTMLElement {
  connectedCallback() {
    this.className = 'relative block w-full overflow-hidden rounded-xl bg-panel';
    this.innerHTML = `
      <video
        part="video"
        class="block w-full aspect-video object-cover"
        poster="/media/poster.webp"
        preload="none"
        playsinline
        crossorigin="anonymous"
        aria-hidden="true"
        tabindex="-1">
        <source src="/media/intro.mp4" type="video/mp4" />
        <track kind="captions" src="/media/intro.vtt" srclang="en" label="English" default />
      </video>
      <div data-fallback hidden
           class="absolute inset-0 flex items-center justify-center bg-panel p-4 text-center text-sm text-muted">
        Video didn't load — the transcript below has everything.
      </div>`;

    this.video = this.querySelector('video');

    this.video.addEventListener('error', () => this.showFallback());
    this.video.addEventListener('ended', () => this.dispatchEvent(new CustomEvent('clip-ended', { bubbles: true })));
  }

  /**
   * MUST be called synchronously from a user-gesture handler.
   * @returns {boolean} whether playback was initiated
   */
  startFromGesture() {
    if (!this.video) return false;
    // No await before this line. That is the whole trick.
    const p = this.video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => this.showFallback());
    }
    return true;
  }

  showFallback() {
    this.querySelector('[data-fallback]')?.removeAttribute('hidden');
    this.dispatchEvent(new CustomEvent('video-error', { bubbles: true }));
  }

  collapse() {
    this.classList.add('max-w-[9rem]', 'ml-auto');
  }
}

customElements.define('avatar-stage', AvatarStage);
