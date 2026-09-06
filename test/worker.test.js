/**
 * Worker smoke tests.
 *
 * These run with NO bindings and NO API keys, which is the point: every route must
 * behave sanely when KV, D1, Workers AI and every provider key are absent. That is not a
 * hypothetical — it is exactly the state of a fresh clone, and it is close to the state
 * during a Cloudflare incident.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ctx = { waitUntil: (p) => p?.catch?.(() => {}) };
const emptyEnv = {}; // no TOKENS, no DB, no AI, no keys

const req = (path, init = {}) => new Request(`https://agent.kshitij.dev${path}`, init);
const post = (path, body, init = {}) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...init });

async function sseEvents(res) {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((f) => f.startsWith('data:'))
    .map((f) => JSON.parse(f.slice(5).trim()));
}

test('/api/health responds with no bindings configured', async () => {
  const res = await worker.fetch(req('/api/health'), emptyEnv, ctx);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.status, 'ok');
  assert.equal(j.bindings.kv, false);
  assert.equal(j.bindings.d1, false);
  assert.ok(j.content.node_count > 0);
  assert.match(j.content.retrieval, /none/);
});

test('/api/session returns the generic payload for an unknown token, never an error', async () => {
  const res = await worker.fetch(req('/api/session?token=doesnotexist'), emptyEnv, ctx);
  assert.equal(res.status, 200, 'an unknown token must never produce an error status');
  const j = await res.json();
  assert.equal(j.personalised, false);
  assert.equal(j.recruiter, null);
  assert.ok(j.opening_line.length > 0);
  assert.ok(j.suggested_questions.length >= 1);
});

test('/api/session rejects a malformed token without spending a KV read', async () => {
  const res = await worker.fetch(req('/api/session?token=../../etc/passwd'), emptyEnv, ctx);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).personalised, false);
});

test('v0 advertises mic and tts as OFF — they are v1', async () => {
  const res = await worker.fetch(req('/api/session'), emptyEnv, ctx);
  const j = await res.json();
  assert.equal(j.features.mic, false);
  assert.equal(j.features.tts, false);
});

test('/api/ask serves an FAQ hit with no provider and no keys', async () => {
  const res = await worker.fetch(post('/api/ask', { text: 'What are your salary expectations?', sid: 's1' }), emptyEnv, ctx);
  assert.equal(res.status, 200);
  const evts = await sseEvents(res);
  const answer = evts.find((e) => e.type === 'answer');
  assert.ok(answer, 'expected an answer event');
  assert.match(answer.text, /kttripathi317@gmail\.com/);
  assert.equal(evts.find((e) => e.type === 'done').provider, 'faq');
});

test('/api/ask answers "do you know React" candidly from the FAQ', async () => {
  const res = await worker.fetch(post('/api/ask', { text: 'Do you know React?', sid: 's1' }), emptyEnv, ctx);
  const answer = (await sseEvents(res)).find((e) => e.type === 'answer');
  assert.match(answer.text, /backend engineer/i);
});

test('/api/ask emits a renderable error when every provider is unavailable', async () => {
  // No keys, no AI binding — the chain must exhaust and still produce fallback_text.
  const res = await worker.fetch(post('/api/ask', { text: 'Walk me through DocProcessor', sid: 's1' }), emptyEnv, ctx);
  assert.equal(res.status, 200, 'the stream itself still opens');
  const evts = await sseEvents(res);
  const err = evts.find((e) => e.type === 'error');
  assert.ok(err, 'expected an error event');
  assert.ok(err.fallback_text?.length > 0, 'every error must carry text the client can render');
  assert.ok(evts.find((e) => e.type === 'done'), 'must always close with done');
});

test('/api/ask rejects an empty question with usable text', async () => {
  const res = await worker.fetch(post('/api/ask', { text: '   ', sid: 's1' }), emptyEnv, ctx);
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fallback_text.length > 0);
});

test('/api/ask survives malformed JSON', async () => {
  const bad = req('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oh no' });
  const res = await worker.fetch(bad, emptyEnv, ctx);
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fallback_text.length > 0);
});

test('/api/event always returns 204, even for junk', async () => {
  for (const body of [{ type: 'start', sid: 's1' }, { type: 'not-a-real-event' }, {}]) {
    const res = await worker.fetch(post('/api/event', body), emptyEnv, ctx);
    assert.equal(res.status, 204);
  }
});

test('CORS is an explicit allowlist, never *', async () => {
  const allowed = await worker.fetch(req('/api/health', { headers: { Origin: 'https://kshitij.dev' } }), emptyEnv, ctx);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://kshitij.dev');

  const denied = await worker.fetch(req('/api/health', { headers: { Origin: 'https://evil.example' } }), emptyEnv, ctx);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('unknown routes 404 rather than throwing', async () => {
  const res = await worker.fetch(req('/api/nope'), emptyEnv, ctx);
  assert.equal(res.status, 404);
});
