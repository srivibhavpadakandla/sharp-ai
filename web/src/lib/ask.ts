/** SSE client for the Worker's /api/ask and /api/explain-error endpoints. */
import { API_BASE } from './config';
import { getTurnstileToken } from './turnstile';

export interface Citation {
  n: number; chunkId: string; sourceId: string; sourceName: string;
  pageTitle: string; sectionTitle: string; headingPath: string;
  url: string; license: string; canExcerpt: boolean;
  /** full | summarize | link — decides what the source card may show. */
  mode?: 'full' | 'summarize' | 'link';
}
export interface Excerpt { chunkId: string; n: number; text: string }

export interface CiteCheck {
  checked: number;
  ok: boolean;
  outOfRange: number[];
  weak: Array<{ n: number; overlap: number; claim: string }>;
}

export interface Validation {
  ok: boolean;
  checked: number;
  sdkVersion: string;
  unknownTypes: string[];
  unknownMethods: string[];
  notes: string[];
}

export interface AskCallbacks {
  onMeta(meta: { citations: Citation[]; excerpts: Excerpt[]; category?: string | null;
                 cached?: boolean; refused?: boolean; degraded?: boolean;
                 agent?: { escalated: boolean; queries: string[] | null;
                           interpretation: string | null; reranked: boolean } | null }): void;
  onToken(text: string): void;
  /** Ungrounded reasoning begins. Everything after this is uncited by construction. */
  onBeyondStart(): void;
  onBeyond(text: string): void;
  /** SDK validation report for generated code. Warnings, never blocks. */
  onValidation(report: Validation): void;
  /** Do the [n] markers point at the sections they claim? */
  onCiteCheck(report: CiteCheck): void;
  onDegrade(payload: { reason: string; answerMd: string }): void;
  onDone(payload: { slug: string | null }): void;
  onError(message: string): void;
}

export async function ask(
  question: string,
  cb: AskCallbacks,
  { endpoint = '/api/ask', signal, history = [], specs = null }: {
    endpoint?: string; signal?: AbortSignal;
    /** The team's robot configuration, if they have entered one. */
    specs?: string | null;
    /** Prior turns, for resolving what a follow-up refers to. */
    history?: Array<{ question: string; answer: string }>;
  } = {},
) {
  let turnstileToken = '';
  try {
    turnstileToken = await getTurnstileToken();
  } catch {
    // Turnstile unreachable (offline dev, blocked script): let the Worker decide.
    turnstileToken = '';
  }

  const res = await fetch(API_BASE + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, turnstileToken, history, specs }),
    signal,
  });

  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j.error === 'rate-limited') {
        // "Shortly" was wrong for a day limit, and contradicted the meter
        // directly below it, which says when the count actually resets.
        const when = j.scope === 'day' ? 'They reset at midnight UTC.' : 'Try again shortly.';
        detail = `You have hit the ${j.limit}-question ${j.scope} limit. ${when}`;
      } else if (j.error === 'question-too-long') {
        detail = `Questions are limited to ${j.maxChars} characters.`;
      } else if (j.error === 'turnstile-failed') {
        detail = 'Could not verify this browser. Reload and try again.';
      } else if (j.error) detail = j.error;
    } catch { /* keep the status */ }
    cb.onError(detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const evLine = raw.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
      if (!evLine || !dataLine) continue;
      const event = evLine.slice(6).trim();
      let payload: any;
      try { payload = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

      if (event === 'meta') cb.onMeta(payload);
      else if (event === 'token') cb.onToken(payload.t);
      else if (event === 'beyond_start') cb.onBeyondStart();
      else if (event === 'beyond') cb.onBeyond(payload.t);
      else if (event === 'validation') cb.onValidation(payload);
      else if (event === 'citecheck') cb.onCiteCheck(payload);
      else if (event === 'degrade') cb.onDegrade(payload);
      else if (event === 'done') cb.onDone(payload);
      else if (event === 'error') cb.onError(payload.message || 'Something went wrong.');
    }
  }
}
