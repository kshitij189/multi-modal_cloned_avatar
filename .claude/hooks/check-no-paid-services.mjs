#!/usr/bin/env node
/**
 * Zero-budget enforcement.
 *
 * Blocks a commit that introduces a dependency, hostname, or credential name
 * belonging to a service that charges money or requires a payment method on file.
 *
 * Two modes:
 *   --mode=claude   PreToolUse hook. Reads hook JSON on stdin, only acts on
 *                   `git commit`, emits a permissionDecision and exits 2 to block.
 *   --mode=git      .githooks/pre-commit. Exits 1 to block.
 *
 * Both modes bind the same rule. The Claude hook binds the agent; the git hook binds
 * the human. Neither alone is sufficient — see PRD §1.
 *
 * Matching is on PACKAGE NAMES and HOSTNAMES, never bare substrings. That is
 * deliberate: `openai/gpt-oss-120b` is a *Groq* model ID on a free tier, and a
 * substring match on "openai" would block it. Precision matters more than reach here,
 * because a hook that cries wolf gets disabled.
 *
 * Reviewed exceptions go in .claude/allowed-services.json:
 *   { "allow": [{ "id": "some-package", "reason": "...", "reviewed": "2026-09-06" }] }
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MODE = (process.argv.find((a) => a.startsWith('--mode=')) || '--mode=git').split('=')[1];

/** Packages that imply a paid service or a stored payment method. */
const PAID_PACKAGES = [
  ['openai', 'OpenAI API is paid. Use the Gemini → Groq → Workers AI chain.'],
  ['@anthropic-ai/sdk', 'Anthropic API is paid. Not a runtime dependency of this project.'],
  ['elevenlabs', 'ElevenLabs voice cloning tiers are paid. Use Chatterbox (MIT), rendered offline.'],
  ['@elevenlabs/elevenlabs-js', 'ElevenLabs is paid. Use Chatterbox (MIT), rendered offline.'],
  ['@deepgram/sdk', 'Deepgram is paid. Use the Web Speech API, with Groq Whisper as fallback.'],
  ['assemblyai', 'AssemblyAI is paid. Use the Web Speech API, with Groq Whisper as fallback.'],
  ['stripe', 'This project takes no payments and needs no payment SDK.'],
  ['twilio', 'Paid. Nothing in this project sends SMS or places calls.'],
  ['@sendgrid/mail', 'Paid above a small tier and requires a card. This project sends no email.'],
  ['mailgun.js', 'Paid. This project sends no email.'],
  ['@pinecone-database/pinecone', 'Paid, and there is no vector DB in this design. See docs/why-no-vector-db.md.'],
  ['weaviate-ts-client', 'No vector DB in this design. See docs/why-no-vector-db.md.'],
  ['chromadb', 'No vector DB in this design — the corpus goes in the prompt whole. See docs/why-no-vector-db.md.'],
  ['@upstash/redis', 'Requires an account with card-gated tiers, and there is no Redis in this design. Use Workers KV or D1.'],
  ['ioredis', 'No Redis in this design. Use Workers KV or D1. See CLAUDE.md, stack rule.'],
  ['redis', 'No Redis in this design. Use Workers KV or D1. See CLAUDE.md, stack rule.'],
  ['pg', 'No Postgres in this design. Use Cloudflare D1. See CLAUDE.md, stack rule.'],
  ['@planetscale/database', 'Paid. Use Cloudflare D1.'],
  ['@neondatabase/serverless', 'Card-gated beyond the free tier. Use Cloudflare D1.'],
  ['mongodb', 'Atlas free tier terms shift and there is no Mongo in this design. Use D1.'],
  ['@supabase/supabase-js', 'Free tier projects pause and paid tiers need a card. Use KV + D1.'],
  ['replicate', 'Pay-per-second inference. Render offline on Colab instead.'],
  ['@fal-ai/client', 'Pay-per-call inference. Render offline on Colab instead.'],
  ['together-ai', 'Paid inference. Use the Gemini → Groq → Workers AI chain.'],
  ['@mistralai/mistralai', 'Paid. Use the existing provider chain.'],
  ['cohere-ai', 'Paid. Use the existing provider chain.'],
  ['aws-sdk', 'AWS requires a card on file.'],
  ['@aws-sdk/client-s3', 'AWS requires a card on file.'],
  ['@google-cloud/storage', 'Google Cloud requires a card. Note: @google/generative-ai (AI Studio) is fine and is NOT this.'],
  ['@azure/openai', 'Azure requires a card.'],
  ['@sentry/browser', 'Free tier is card-gated on signup for some regions; this project logs via wrangler tail.'],
  ['@datadog/browser-logs', 'Paid.'],
  ['algoliasearch', 'Paid above a small tier.'],
  ['@auth0/auth0-spa-js', 'Paid above a small tier. This project has no accounts.'],
  ['@clerk/clerk-js', 'Paid. This project has no accounts.'],
];

/** Hostnames that imply a paid API. */
const PAID_HOSTS = [
  ['api.openai.com', 'OpenAI API is paid.'],
  ['api.anthropic.com', 'Anthropic API is paid.'],
  ['api.elevenlabs.io', 'ElevenLabs is paid.'],
  ['api.d-id.com', 'D-ID is paid. Use recorded video (PRD §8.5).'],
  ['api.heygen.com', 'HeyGen is paid. Use recorded video (PRD §8.5).'],
  ['api.synthesia.io', 'Synthesia is paid. Use recorded video (PRD §8.5).'],
  ['api.deepgram.com', 'Deepgram is paid.'],
  ['api.assemblyai.com', 'AssemblyAI is paid.'],
  ['api.replicate.com', 'Replicate is pay-per-second.'],
  ['api.stripe.com', 'This project takes no payments.'],
  ['api.together.xyz', 'Together AI is paid.'],
  ['api.mistral.ai', 'Mistral API is paid.'],
];

/** Credential names that only exist if a paid service was wired up. */
const PAID_ENV_KEYS = [
  ['OPENAI_API_KEY', 'OpenAI API is paid.'],
  ['ANTHROPIC_API_KEY', 'Anthropic API is paid.'],
  ['ELEVENLABS_API_KEY', 'ElevenLabs is paid.'],
  ['DEEPGRAM_API_KEY', 'Deepgram is paid.'],
  ['ASSEMBLYAI_API_KEY', 'AssemblyAI is paid.'],
  ['STRIPE_SECRET_KEY', 'This project takes no payments.'],
  ['HEYGEN_API_KEY', 'HeyGen is paid.'],
  ['DID_API_KEY', 'D-ID is paid.'],
  ['REPLICATE_API_TOKEN', 'Replicate is pay-per-second.'],
  ['AWS_ACCESS_KEY_ID', 'AWS requires a card on file.'],
];

function loadAllowlist() {
  const p = join(ROOT, '.claude', 'allowed-services.json');
  if (!existsSync(p)) return new Set();
  try {
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    return new Set((doc.allow || []).map((e) => e.id));
  } catch {
    return new Set();
  }
}

function stagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function stagedContent(file) {
  try {
    return execSync(`git show :${JSON.stringify(file)}`, { cwd: ROOT, encoding: 'utf8' });
  } catch {
    try {
      return readFileSync(resolve(ROOT, file), 'utf8');
    } catch {
      return '';
    }
  }
}

function scan() {
  const allow = loadAllowlist();
  const violations = [];
  const files = stagedFiles();

  for (const file of files) {
    // Skip the enforcement machinery and the docs that legitimately name these vendors
    // in order to rule them out. Without this, the plan documents block their own commit.
    if (
      file.startsWith('.claude/hooks/') ||
      file.startsWith('.githooks/') ||
      file === 'PRD.md' ||
      file === 'CLAUDE.md' ||
      file === 'CHANGE_LOG.md' ||
      file === 'IMPLEMENTATION_PROGRESS.md' ||
      file.startsWith('.claude/agents/') ||
      file.startsWith('.claude/skills/') ||
      file.startsWith('docs/')
    ) {
      continue;
    }

    const text = stagedContent(file);
    if (!text) continue;

    // Dependency check — exact package names only.
    if (file.endsWith('package.json')) {
      let pkg;
      try {
        pkg = JSON.parse(text);
      } catch {
        continue;
      }
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const [name, reason] of PAID_PACKAGES) {
        if (Object.hasOwn(deps, name) && !allow.has(name)) {
          violations.push({ file, item: name, kind: 'dependency', reason });
        }
      }
      continue;
    }

    // Hostname check — matched inside a URL, not as a bare word.
    for (const [host, reason] of PAID_HOSTS) {
      if (allow.has(host)) continue;
      if (new RegExp(`https?://${host.replace(/\./g, '\\.')}`, 'i').test(text)) {
        violations.push({ file, item: host, kind: 'hostname', reason });
      }
    }

    // Credential-name check — as an identifier, not as prose.
    for (const [key, reason] of PAID_ENV_KEYS) {
      if (allow.has(key)) continue;
      if (new RegExp(`\\b${key}\\b`).test(text)) {
        violations.push({ file, item: key, kind: 'credential', reason });
      }
    }
  }

  return violations;
}

function render(violations) {
  const lines = [
    '',
    'BLOCKED — zero-budget rule (PRD §1, CLAUDE.md cost rule)',
    '',
  ];
  for (const v of violations) {
    lines.push(`  ${v.file}`);
    lines.push(`    ${v.kind}: ${v.item}`);
    lines.push(`    ${v.reason}`);
    lines.push('');
  }
  lines.push('This project must cost ₹0/month with no payment method on file anywhere.');
  lines.push('');
  lines.push('If this is a false positive, add a reviewed exception to');
  lines.push('.claude/allowed-services.json with an id, a reason, and today’s date.');
  lines.push('Do not weaken this hook.');
  lines.push('');
  return lines.join('\n');
}

function isGitCommit(cmd) {
  return /(^|[;&|]\s*)git\s+(-\S+\s+|--\S+(=\S+)?\s+)*commit\b/.test(cmd || '');
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  if (MODE === 'claude') {
    let input = {};
    try {
      input = JSON.parse((await readStdin()) || '{}');
    } catch {
      process.exit(0); // Malformed hook input must never block work.
    }
    if (input.tool_name !== 'Bash' || !isGitCommit(input.tool_input?.command)) process.exit(0);

    const violations = scan();
    if (violations.length === 0) process.exit(0);

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: render(violations),
        },
      })
    );
    process.exit(2);
  }

  const violations = scan();
  if (violations.length === 0) process.exit(0);
  process.stderr.write(render(violations));
  process.exit(1);
}

main();
