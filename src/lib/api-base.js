/**
 * Resolves the Worker API base URL.
 *
 * In local dev Vite proxies /api → localhost:8787, so a relative path works.
 * In production the Pages site and the Worker live on different origins
 * (*.pages.dev vs *.workers.dev), so we need the Worker's absolute URL.
 *
 * Once a custom domain is configured and the Worker route in wrangler.toml is
 * uncommented, both sit behind the same origin and this can go back to '/api'.
 */

const WORKER_ORIGIN = 'https://kshitij-agent.kshitij-dev.workers.dev';

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API = isLocal ? '/api' : `${WORKER_ORIGIN}/api`;
