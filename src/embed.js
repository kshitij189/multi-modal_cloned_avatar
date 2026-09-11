/**
 * The portfolio overlay.
 *
 * One script tag on kshitij189.github.io/portflio drops a launcher onto the page; tapping
 * it opens a full overlay with the avatar in it.
 *
 *   <script src="https://kshitij-agent.pages.dev/embed.js" defer></script>
 *
 * To be clear about what this is NOT: this does not render inside an email. Email clients
 * strip every script, iframe and custom element, so nothing interactive can exist there
 * (PRD §2.1). This runs on Kshitij's own site, which he controls and which executes real
 * JavaScript. The email contains a link; this is what the link leads to.
 *
 * Design constraints, both non-negotiable:
 *
 *  - **Shadow DOM.** The host page has its own CSS reset, fonts and z-index stack. An
 *    open shadow root isolates the launcher completely in both directions. Open rather
 *    than closed: closed adds no real security here and makes debugging miserable.
 *  - **An iframe for the overlay itself.** The agent runs on its own origin, so it cannot
 *    read the portfolio's DOM and the portfolio cannot read its state. postMessage is the
 *    only channel, and both ends validate origin explicitly.
 *
 * Cost to the portfolio when nobody taps it: one script tag and ~4KB. No fonts, no
 * frameworks, no network calls until the launcher is clicked.
 */

(function () {
  const AGENT_ORIGIN = new URL(document.currentScript.src).origin;
  const script = document.currentScript;
  const position = script.dataset.position ?? 'bottom-right';

  // A token in the URL fragment survives the click-through from the emailed link, so a
  // recruiter arriving at kshitij189.github.io/portflio#k=abc123 still gets greeted by name.
  const token = (/[#&]k=([A-Za-z0-9_-]{6,32})/.exec(location.hash) ?? [])[1] ?? null;

  const host = document.createElement('div');
  host.setAttribute('data-kshitij-agent', '');
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      .launcher {
        position: fixed; z-index: 2147483000;
        ${position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
        ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        display: flex; align-items: center; gap: 10px;
        padding: 10px 16px 10px 12px;
        border: 1px solid rgba(125,211,160,.35); border-radius: 999px;
        background: #0b0e14; color: #e8eaf0; cursor: pointer;
        font: 500 14px/1.2 system-ui, -apple-system, sans-serif;
        box-shadow: 0 8px 28px rgba(0,0,0,.45);
      }
      .launcher:hover { border-color: #7dd3a0; }
      .launcher:focus-visible { outline: 2px solid #7dd3a0; outline-offset: 2px; }
      .dot {
        width: 30px; height: 30px; border-radius: 50%; flex: none;
        background: radial-gradient(circle at 50% 38%, #1b2130, #0b0e14);
        border: 1px solid rgba(125,211,160,.5);
        display: grid; place-items: center; font-size: 15px;
      }
      .pulse { animation: p 2.6s ease-in-out infinite; }
      @keyframes p { 0%,100% { box-shadow: 0 0 0 0 rgba(125,211,160,.35);} 50% { box-shadow: 0 0 0 9px rgba(125,211,160,0);} }
      @media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

      .overlay {
        position: fixed; inset: 0; z-index: 2147483001;
        background: rgba(4,6,10,.82);
        -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
        display: grid; place-items: center; padding: 16px;
      }
      .panel {
        position: relative; width: min(560px, 100%); height: min(760px, 92vh);
        border: 1px solid rgba(232,234,240,.12); border-radius: 16px;
        overflow: hidden; background: #0b0e14;
        box-shadow: 0 24px 80px rgba(0,0,0,.6);
      }
      iframe { width: 100%; height: 100%; border: 0; display: block; }
      .close {
        position: absolute; top: 10px; right: 10px; z-index: 2;
        width: 34px; height: 34px; border-radius: 50%;
        border: 1px solid rgba(232,234,240,.2); background: rgba(11,14,20,.9);
        color: #e8eaf0; cursor: pointer; font: 16px/1 system-ui;
      }
      .close:focus-visible { outline: 2px solid #7dd3a0; outline-offset: 2px; }
      [hidden] { display: none !important; }
    </style>

    <button class="launcher pulse" part="launcher" aria-haspopup="dialog">
      <span class="dot" aria-hidden="true">🗣</span>
      <span>Let Kshitij walk you through it</span>
    </button>

    <div class="overlay" hidden role="dialog" aria-modal="true" aria-label="AI representation of Kshitij Tripathi">
      <div class="panel">
        <button class="close" aria-label="Close">✕</button>
      </div>
    </div>`;

  const launcher = root.querySelector('.launcher');
  const overlay = root.querySelector('.overlay');
  const panel = root.querySelector('.panel');
  const closeBtn = root.querySelector('.close');
  let frame = null;
  let lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    launcher.hidden = true;
    overlay.hidden = false;

    if (!frame) {
      // Built only on first open — a recruiter who never taps this costs zero requests.
      frame = document.createElement('iframe');
      frame.allow = 'autoplay';
      frame.src = `${AGENT_ORIGIN}/${token ? `hi/${token}` : ''}?embed=1`;
      frame.title = 'AI representation of Kshitij Tripathi';
      panel.appendChild(frame);
    }
    closeBtn.focus();
    document.addEventListener('keydown', onKey);
  }

  function close() {
    overlay.hidden = true;
    launcher.hidden = false;
    document.removeEventListener('keydown', onKey);
    // Stop any speech immediately. Nothing is worse than a voice that keeps talking
    // after someone has closed the thing.
    frame?.contentWindow?.postMessage({ source: 'kshitij-portfolio', v: 1, type: 'close' }, AGENT_ORIGIN);
    lastFocus?.focus?.();
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  launcher.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Messages from the agent frame. Origin is validated on every one — never trust a
  // message because of its shape alone, and never post with targetOrigin "*".
  window.addEventListener('message', (e) => {
    if (e.origin !== AGENT_ORIGIN) return;
    const msg = e.data;
    if (!msg || msg.source !== 'kshitij-agent') return;

    switch (msg.type) {
      case 'close':
        close();
        break;
      case 'scroll_to': {
        // The agent can point at the section of the portfolio it is talking about.
        const id = String(msg.payload?.section ?? '').replace(/[^a-z0-9._-]/gi, '');
        const target = id && document.getElementById(id);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
      default:
        // Unknown types are ignored, not errored — that is what keeps the two repos
        // independently deployable.
        break;
    }
  });

  document.body.appendChild(host);
})();
