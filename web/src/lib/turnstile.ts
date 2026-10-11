import { TURNSTILE_SITE_KEY } from './config';
declare global { interface Window { turnstile?: any; __sharpTurnstile?: TurnstileHandle } }
interface TurnstileHandle { widgetId: string; pending: Array<(token: string) => void>; token: string | null }
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  const existing = !!script;
  script ||= document.createElement('script');
  const target = script;
  return new Promise((resolve, reject) => {
    target.addEventListener('load', () => resolve(), { once: true });
    target.addEventListener('error', () => { target.remove(); reject(new Error('turnstile-script-failed')); }, { once: true });
    if (!existing) { target.src = SCRIPT; target.async = true; document.head.appendChild(target); }
  });
}

function bounded<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Response stopped', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('turnstile-timeout')); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    work.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

export async function getTurnstileToken(timeoutMs = 12000, signal?: AbortSignal): Promise<string> {
  await bounded(loadScript(), timeoutMs, signal);
  if (signal?.aborted) throw new DOMException('Response stopped', 'AbortError');
  let handle = window.__sharpTurnstile;
  if (!handle) {
    const host = document.createElement('div');
    host.id = 'turnstile-host'; host.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:60';
    document.body.appendChild(host);
    const h: TurnstileHandle = { widgetId: '', pending: [], token: null };
    h.widgetId = window.turnstile.render(host, {
      sitekey: TURNSTILE_SITE_KEY, appearance: 'interaction-only',
      callback: (token: string) => { h.token = token; h.pending.splice(0).forEach((fn) => fn(token)); },
    });
    handle = h; window.__sharpTurnstile = h;
  }
  if (handle.token) {
    const token = handle.token; handle.token = null;
    try { window.turnstile.reset(handle.widgetId); } catch { /* next request will retry */ }
    return token;
  }
  const current = handle;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      current.pending = current.pending.filter((fn) => fn !== receive);
    };
    const abort = () => { cleanup(); reject(new DOMException('Response stopped', 'AbortError')); };
    const receive = (token: string) => {
      cleanup(); current.token = null;
      try { window.turnstile.reset(current.widgetId); } catch { /* next request will retry */ }
      resolve(token);
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error('turnstile-timeout')); }, timeoutMs);
    current.pending.push(receive); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
