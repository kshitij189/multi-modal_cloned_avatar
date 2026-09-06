/**
 * Entry point and state machine.
 *
 * Four states: pre-start → (video | text) → asking. That is the whole thing. The UI is
 * small on purpose — no framework, no build-time JSX, no state library. See PRD §8.7.
 *
 * The pre-start screen carries the entire product bet: the recruiter's name in the first
 * paint, the disclosure above the fold, and TWO equal entry points, because the one that
 * needs no audio is the one most people will take.
 */

import './components/disclosure-badge.js';
import './components/avatar-stage.js';
import './components/transcript-panel.js';
import './components/ask-box.js';

import { tokenFromPath, sessionId, fetchSession, track } from './lib/session.js';
import { ask } from './lib/stream.js';

const token = tokenFromPath();
const sid = sessionId();
const app = document.getElementById('app');
const history = [];

let session = null;
let started = false;

function shell() {
  app.innerHTML = `
    <a href="#main" class="sr-only">Skip to content</a>
    <main id="main" class="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-6 sm:py-10">
      <header data-head class="space-y-3"></header>
      <section data-stage></section>
      <section data-body class="flex-1 space-y-5"></section>
      <footer class="pt-2 text-xs text-muted">
        <a class="underline hover:text-paper" data-repo href="#">How this is built</a>
        · <a class="underline hover:text-paper" href="mailto:kttripathi317@gmail.com">Email Kshitij directly</a>
      </footer>
    </main>`;
  return {
    head: app.querySelector('[data-head]'),
    stage: app.querySelector('[data-stage]'),
    body: app.querySelector('[data-body]'),
    repo: app.querySelector('[data-repo]'),
  };
}

function renderPreStart(el) {
  const r = session.recruiter;

  // The first eight seconds are about THEM, not him. This heading is the whole reason
  // the personalisation layer exists.
  el.head.innerHTML = `
    <h1 class="text-2xl font-semibold leading-snug sm:text-3xl">
      ${r ? `Hi ${escape(r.name)} —<br class="sm:hidden" /> this is for you${r.company ? ` and the ${escape(r.role ?? 'role')} at ${escape(r.company)}` : ''}.`
          : 'An AI version of Kshitij Tripathi.'}
    </h1>
    <disclosure-badge></disclosure-badge>`;

  el.stage.innerHTML = '<avatar-stage></avatar-stage>';

  // Two entry points, same size class, side by side. "Just show me the text" is a
  // primary path (PRD §11.5), not a footer link.
  el.body.innerHTML = `
    <div class="flex flex-col gap-2 sm:flex-row">
      <button data-start
        class="flex-1 rounded-lg bg-accent px-5 py-3.5 text-base font-medium text-ink hover:brightness-110">
        ▶ Start · 30 sec
      </button>
      <button data-text
        class="flex-1 rounded-lg border border-paper/20 px-5 py-3.5 text-base font-medium text-paper hover:border-accent hover:text-accent">
        Just show me the text
      </button>
    </div>
    <p class="text-xs text-muted">Has sound. The text version has everything the video does.</p>`;

  const stage = el.stage.querySelector('avatar-stage');

  el.body.querySelector('[data-start]').addEventListener('click', () => {
    // Synchronous. No await before .play() or iOS silently refuses. See avatar-stage.js.
    stage.startFromGesture();
    track('start', token, sid);
    enterConversation(el, { video: true });
  });

  el.body.querySelector('[data-text]').addEventListener('click', () => {
    track('text_mode', token, sid);
    stage.collapse();
    enterConversation(el, { video: false });
  });
}

function enterConversation(el, { video }) {
  if (started) return;
  started = true;

  el.head.innerHTML = `
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm text-muted">${session.recruiter ? `For ${escape(session.recruiter.name)}${session.recruiter.company ? ` · ${escape(session.recruiter.company)}` : ''}` : 'Kshitij Tripathi'}</p>
        <h1 class="text-lg font-semibold">Ask me about my work</h1>
      </div>
    </div>
    <disclosure-badge compact></disclosure-badge>`;

  if (!video) el.stage.hidden = true;

  el.body.innerHTML = `
    <transcript-panel></transcript-panel>
    <ask-box></ask-box>`;

  const panel = el.body.querySelector('transcript-panel');
  const box = el.body.querySelector('ask-box');

  panel.add('agent', session.opening_line);
  box.setSuggestions(session.suggested_questions);

  if (session.offline) {
    box.setDegraded("I can't reach my backend right now — the summary above and Kshitij's email still work.");
  } else if (!session.features?.llm) {
    box.setDegraded("I'm out of model quota for today. The suggested questions still work — they're pre-written.");
  }

  box.addEventListener('ask', async (e) => {
    const text = e.detail.text;
    panel.add('you', text);
    track('q_asked', token, sid);
    box.setBusy(true);

    const pending = panel.add('agent', '', { pending: true });
    let answered = false;

    await ask(
      { token, sid, text, history: history.slice(-6) },
      {
        onAnswer(t) {
          answered = true;
          pending.body.classList.remove('opacity-60');
          pending.body.textContent = t;
          history.push({ role: 'user', text }, { role: 'assistant', text: t });
        },
        onCitation(nodes) {
          panel.addCitations(pending.row, nodes);
        },
        onError(err) {
          answered = true;
          pending.body.classList.remove('opacity-60');
          pending.body.textContent = err.fallback_text;
        },
        onDone() {
          if (!answered) {
            pending.body.textContent =
              "I didn't get an answer back. Kshitij is at kttripathi317@gmail.com — that always works.";
          }
          box.setBusy(false);
        },
      }
    );
  });

  box.querySelector('input')?.focus();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

async function boot() {
  const el = shell();
  session = await fetchSession(token, sid);

  const repoUrl = session.person?.links?.github;
  if (repoUrl) {
    el.repo.href = repoUrl;
    el.repo.addEventListener('click', () => track('repo_click', token, sid));
  } else {
    el.repo.remove();
  }

  renderPreStart(el);
}

window.addEventListener('pagehide', () => track('exit', token, sid), { once: true });

boot();
