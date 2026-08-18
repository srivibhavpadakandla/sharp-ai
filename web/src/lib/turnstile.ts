/**
 * Turnstile in interaction-only mode: invisible unless Cloudflare actually
 * wants to challenge someone. Tokens are single use, so every ask resets the
 * widget and waits for a fresh one.
 */
import { TURNSTILE_SITE_KEY } from './config';

declare global {
  interface Window { turnstile?: any; __sharpTurnstile?: TurnstileHandle }
}

interface TurnstileHandle {
  widgetId: string;
  pending: Array<(token: string) => void>;
  token: string | null;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  if (existing) return new Promise((r) => existing.addEventListener('load', () => r()));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile-script-failed'));
    document.head.appendChild(s);
  });
}

export async function getTurnstileToken(timeoutMs = 12000): Promise<string> {
  await loadScript();

  let handle = window.__sharpTurnstile;
  if (!handle) {
    const host = document.createElement('div');
    host.id = 'turnstile-host';
    host.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:60';
    document.body.appendChild(host);

    const h: TurnstileHandle = { widgetId: '', pending: [], token: null };
    h.widgetId = window.turnstile.render(host, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interaction-only',
      callback: (token: string) => {
        h.token = token;
        h.pending.splice(0).forEach((fn) => fn(token));
      },
    });
    handle = h;
    window.__sharpTurnstile = h;
  }

  if (handle.token) {
    const t = handle.token;
    handle.token = null;
    // Prime the next token in the background so the following ask is instant.
    try { window.turnstile.reset(handle.widgetId); } catch { /* noop */ }
    return t;
  }

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('turnstile-timeout')), timeoutMs);
    handle!.pending.push((token) => {
      clearTimeout(timer);
      handle!.token = null;
      try { window.turnstile.reset(handle!.widgetId); } catch { /* noop */ }
      resolve(token);
    });
  });
}
