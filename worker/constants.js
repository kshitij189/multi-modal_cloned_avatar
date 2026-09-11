/**
 * Every model ID and provider endpoint in the project. Nowhere else.
 *
 * This file exists because model IDs go stale fast and a stale ID produces a 400 that
 * looks like an outage. Groq deprecated `llama-3.3-70b-versatile` and
 * `llama-3.1-8b-instant` on 2026-06-17; planning this project from memory would have
 * shipped a dead ID. `npm run check:quotas` verifies every ID here against each
 * provider's models endpoint.
 *
 * All IDs verified 2026-09-06.
 */

/**
 * The provider chain, in order. Generalises the Gemini→Groq pattern from CortexMCP to
 * three tiers across two vendors — two free tiers with correlated failure modes are one
 * tier with extra steps.
 *
 * Each provider lists models in preference order. Free-tier model availability is not
 * uniform, so a 404/400 on one model falls through to the next within the same provider
 * before the chain moves on.
 */
export const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini (AI Studio)',
    // Free tier, no card. Google no longer publishes per-model RPM/TPM/RPD in its docs —
    // confirm actual limits at aistudio.google.com/rate-limit.
    models: ['gemini-3.8-flash', 'gemini-2.5-flash'],
    endpoint: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    keyBinding: 'GEMINI_API_KEY',
  },
  {
    id: 'groq',
    label: 'Groq',
    // Free tier, no card. Rate limits are ORG-WIDE, not per-key — more keys do not help.
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    endpoint: () => 'https://api.groq.com/openai/v1/chat/completions',
    keyBinding: 'GROQ_API_KEY',
  },
  {
    id: 'workers-ai',
    label: 'Cloudflare Workers AI',
    // 10,000 neurons/day free, no extra key — uses the AI binding. Weakest quality of the
    // three, which is correct for a third-tier fallback. Non-zero usage here is a signal
    // that tiers 1 and 2 are failing.
    models: ['@cf/meta/llama-3.1-8b-instruct'],
    endpoint: null, // uses env.AI binding, not fetch
    keyBinding: null,
  },
];

/** Speech-to-text fallback when the browser's Web Speech API is unavailable (v1). */
export const STT = {
  provider: 'groq',
  model: 'whisper-large-v3-turbo',
  endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
  maxFileBytes: 25 * 1024 * 1024,
};

/**
 * Text-to-speech chain. Everything the avatar says is generated fresh, so TTS runs on
 * the request path — which makes the neuron economics the whole design constraint.
 *
 * Verified 2026-09-11 against developers.cloudflare.com/workers-ai/platform/pricing/:
 * the Workers Free plan allows 10,000 neurons/day, and
 *
 *   @cf/myshell-ai/melotts     18.63 neurons per audio MINUTE
 *   @cf/deepgram/aura-1     1,363.64 neurons per 1k CHARACTERS
 *   @cf/deepgram/aura-2-en  2,727.27 neurons per 1k CHARACTERS
 *
 * Aura sounds more human — Cloudflare describes it as applying "natural pacing,
 * expressiveness and fillers". It is also roughly 70x more expensive per minute of
 * speech: a single 90-second walkthrough costs ~3,700 neurons on Aura-1 versus ~28 on
 * MeloTTS. At 10,000 neurons/day that is ~3 visits versus ~150.
 *
 * So MeloTTS is the voice. Aura stays configured but unused by default — switching voice
 * identity partway through a conversation is jarring, so mixing them is worse than
 * picking one. Flip TTS_PRIMARY only after listening to both.
 */
export const TTS = {
  primary: 'melotts',
  voices: {
    melotts: { model: '@cf/myshell-ai/melotts', neuronsPerAudioMinute: 18.63, lang: 'en' },
    'aura-1': { model: '@cf/deepgram/aura-1', neuronsPer1kChars: 1363.64, speaker: 'orion' },
  },
  // Browser speechSynthesis is the floor — free, instant, always available, and the only
  // thing that still works when the neuron budget is gone.
  browserFallback: true,
  // Speech runs at roughly 14 characters per second. Used to price a request in neurons
  // BEFORE spending them, since MeloTTS bills per audio minute rather than per character.
  charsPerSecond: 14,
  maxCharsPerCall: 700,
};

/** Circuit breaker: skip a provider that is failing rather than probing it every request. */
export const BREAKER = {
  failureThreshold: 3,
  openSeconds: 60,
  kvPrefix: 'cb:',
};

/** Quota guards. See PRD §12.5. */
export const LIMITS = {
  perTokenCallsPerDay: 40,
  perSessionCalls: 15,
  minMsBetweenCalls: 1500,
  maxAnswerWords: 120,
  // The opening walkthrough is a monologue, not an answer — ~90 seconds of speech at a
  // natural pace. Still verified against the corpus like everything else.
  maxWalkthroughWords: 260,
  maxHistoryTurns: 3,
  maxQuestionChars: 600,
  // Neurons reserved for speech out of the 10,000/day Workers AI allowance. The rest is
  // headroom for the third-tier LLM fallback, which should normally sit at zero.
  ttsNeuronBudget: 8000,
  // Daily budget per provider before the chain demotes it. Conservative against the
  // unverified Gemini RPD figure.
  dailyBudget: { gemini: 1000, groq: 5000, 'workers-ai': 500 },
  // Fractions of dailyBudget at which behaviour changes.
  demoteAt: 0.7,
  faqOnlyAt: 0.9,
};

export const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Origins allowed to call /api/*. Never "*". */
export const ALLOWED_ORIGINS = [
  // The live portfolio. The overlay is embedded here, so this origin is load-bearing —
  // without it the embed gets no audio and no answers.
  'https://kshitij189.github.io',
  'https://kshitij-agent.pages.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export const REFUSAL =
  "That's a good question — I'd rather have Kshitij answer that one directly. He's at kttripathi317@gmail.com.";
