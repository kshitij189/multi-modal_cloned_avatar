/**
 * Entry point and state machine.
 *
 * pre-start → (speaking | reading) → asking.
 *
 * The product bet lives on the pre-start screen: the recruiter's name in the first paint,
 * the disclosure above it, and two equal entry points — because a large share of people
 * open this on a phone in an open-plan office and will never turn audio on. Speaking is
 * the headline; reading is not a fallback.
 */

import './components/disclosure-badge.js';
import './components/avatar-stage.js';
import './components/transcript-panel.js';
import './components/ask-box.js';

import { tokenFromPath, sessionId, fetchSession, track } from './lib/session.js';
import { ask } from './lib/stream.js';
import { SpeechQueue, fetchWalkthrough, splitForSpeech } from './lib/speech.js';

const token = tokenFromPath();
const sid = sessionId();
const app = document.getElementById('app');
const history = [];

let session = null;
let started = false;
let speech = null;

function shell() {
  app.innerHTML = `
    <a href="#main" class="sr-only">Skip to content</a>
    <main id="main" class="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-6 sm:py-10">
      <header data-head class="space-y-3"></header>
      <section data-stage></section>
      <section data-body class="flex-1 space-y-5"></section>
      <footer class="pt-2 text-xs text-muted">
        <a class="underline hover:text-paper" data-repo href="#" target="_blank" rel="noopener">See the code</a>
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

  el.head.innerHTML = `
    <h1 class="text-2xl font-semibold leading-snug sm:text-3xl">
      ${r ? `Hi ${esc(r.name)} —<br class="sm:hidden" /> this is for you${r.company ? ` and the ${esc(r.role ?? 'role')} at ${esc(r.company)}` : ''}.`
          : 'An AI version of Kshitij Tripathi.'}
    </h1>
    <disclosure-badge></disclosure-badge>`;

  el.stage.innerHTML = '<avatar-stage></avatar-stage>';

  el.body.innerHTML = `
    <div class="flex flex-col gap-2 sm:flex-row">
      <button data-start
        class="flex-1 rounded-lg bg-accent px-5 py-3.5 text-base font-medium text-ink hover:brightness-110">
        ▶ Let him talk · ~90 sec
      </button>
      <button data-text
        class="flex-1 rounded-lg border border-paper/20 px-5 py-3.5 text-base font-medium text-paper hover:border-accent hover:text-accent">
        Just show me the text
      </button>
    </div>
    <p class="text-xs text-muted">Has sound. Everything he says is also written out below as he says it.</p>`;

  el.body.querySelector('[data-start]').addEventListener('click', (e) => {
    // Unlock audio SYNCHRONOUSLY inside the gesture. iOS Safari discards the gesture
    // across an await, and the context then silently refuses to start.
    speech = new SpeechQueue();
    const analyser = speech.unlock();
    e.currentTarget.disabled = true;
    track('start', token, sid);
    enterConversation(el, { speak: true, analyser });
  });

  el.body.querySelector('[data-text]').addEventListener('click', () => {
    track('text_mode', token, sid);
    enterConversation(el, { speak: false, analyser: null });
  });
}

async function enterConversation(el, { speak, analyser }) {
  if (started) return;
  started = true;

  el.head.innerHTML = `
    <div>
      <p class="text-sm text-muted">${session.recruiter ? `For ${esc(session.recruiter.name)}${session.recruiter.company ? ` · ${esc(session.recruiter.company)}` : ''}` : 'Kshitij Tripathi'}</p>
      <h1 class="text-lg font-semibold">${speak ? 'Introducing himself' : 'About Kshitij'}</h1>
    </div>
    <disclosure-badge compact></disclosure-badge>`;

  const stage = el.stage.querySelector('avatar-stage');
  if (analyser) stage.attachAnalyser(analyser);

  el.body.innerHTML = `
    <transcript-panel></transcript-panel>
    <div data-controls class="flex gap-2" hidden>
      <button data-skip class="rounded-lg border border-paper/20 px-3 py-1.5 text-xs text-paper/80 hover:border-accent hover:text-accent">
        Skip to questions
      </button>
    </div>
    <div data-ask hidden><ask-box></ask-box></div>`;

  const panel = el.body.querySelector('transcript-panel');
  const askWrap = el.body.querySelector('[data-ask]');
  const controls = el.body.querySelector('[data-controls]');
  const box = el.body.querySelector('ask-box');

  stage.setState('thinking');
  const thinking = panel.add('agent', '', { pending: true });

  // The monologue is generated fresh on every visit — nothing here is scripted.
  const script = await fetchWalkthrough(token, sid);

  if (!script) {
    thinking.body.classList.remove('opacity-60');
    thinking.body.textContent =
      "I couldn't reach my backend to put an introduction together. Everything about Kshitij is on this page, and he's at kttripathi317@gmail.com.";
    stage.setState('idle');
    openQuestions(el, panel, box, askWrap, controls);
    return;
  }

  thinking.row.remove();

  if (!speak) {
    // Reading path: the whole monologue at once, no audio, no permissions, no waiting.
    const row = panel.add('agent', script.text);
    panel.addCitations(row.row, script.cited);
    stage.setState('idle');
    openQuestions(el, panel, box, askWrap, controls);
    return;
  }

  // Speaking path. Captions appear chunk by chunk, in step with the audio, so a muted
  // recruiter sees exactly what a listening one hears.
  controls.hidden = false;
  let captionRow = null;
  let spoken = '';

  const finish = () => {
    stage.setState('idle');
    stage.detachAnalyser();
    controls.hidden = true;
    if (captionRow && script.cited?.length) panel.addCitations(captionRow.row, script.cited);
    openQuestions(el, panel, box, askWrap, controls);
  };

  el.body.querySelector('[data-skip]').addEventListener('click', () => {
    speech.stop();
    if (captionRow) captionRow.body.textContent = script.text;
    finish();
  });

  // Wire captions BEFORE playback starts, or the first chunk is spoken with nothing on
  // screen — which is exactly the moment a muted recruiter decides the page is broken.
  speech.onCaption = (text) => {
    spoken = spoken ? `${spoken} ${text}` : text;
    if (!captionRow) captionRow = panel.add('agent', spoken);
    else captionRow.body.textContent = spoken;
    captionRow.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  stage.setState('speaking');
  await speech.speak(script.chunks, {
    token,
    sid,
    serverTts: session.features?.tts !== false,
  }).catch(() => {});

  // If the browser voice was used, say so rather than letting it pass as the real thing.
  if (speech.usingBrowserVoice) {
    panel.add('system', "Using your device's voice — the server's speech quota is spent for today.");
  }
  if (captionRow) captionRow.body.textContent = script.text;
  finish();
}

function openQuestions(el, panel, box, askWrap, controls) {
  controls.hidden = true;
  askWrap.hidden = false;
  box.setSuggestions(session.suggested_questions);

  if (session.offline) {
    box.setDegraded("I can't reach my backend right now — Kshitij's email still works.");
  } else if (!session.features?.llm) {
    box.setDegraded("I'm out of model quota for today. The suggested questions still work.");
  }

  box.addEventListener('ask', async (e) => {
    const text = e.detail.text;
    panel.add('you', text);
    track('q_asked', token, sid);
    box.setBusy(true);

    const stage = el.stage.querySelector('avatar-stage');
    stage.setState('thinking');
    const pending = panel.add('agent', '', { pending: true });
    let answered = false;
    let answerText = '';

    await ask(
      { token, sid, text, history: history.slice(-6) },
      {
        onAnswer(t) {
          answered = true;
          answerText = t;
          pending.body.classList.remove('opacity-60');
          pending.body.textContent = t;
          history.push({ role: 'user', text }, { role: 'assistant', text: t });
        },
        onCitation(nodes) { panel.addCitations(pending.row, nodes); },
        onError(err) {
          answered = true;
          pending.body.classList.remove('opacity-60');
          pending.body.textContent = err.fallback_text;
        },
        async onDone() {
          if (!answered) {
            pending.body.textContent =
              "I didn't get an answer back. Kshitij is at kttripathi317@gmail.com — that always works.";
          }
          box.setBusy(false);

          // Speak the answer too, but only if the visitor chose the speaking path —
          // someone who picked "show me the text" has told us not to make noise.
          if (answerText && speech?.ctx) {
            const analyser = speech.analyser;
            if (analyser) stage.attachAnalyser(analyser);
            stage.setState('speaking');
            await speech.speak(splitForSpeech(answerText), {
              token, sid, serverTts: session.features?.tts !== false,
            }).catch(() => {});
            stage.detachAnalyser();
          }
          stage.setState('idle');
        },
      }
    );
  });

  box.querySelector('input')?.focus();
}

function esc(s) {
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

window.addEventListener('pagehide', () => {
  speech?.stop();
  track('exit', token, sid);
}, { once: true });

boot();
