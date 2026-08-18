import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ask, type Citation, type Excerpt } from '../lib/ask';
import { renderMarkdown } from '../lib/markdown';
import './answer.css';

type Status = 'idle' | 'retrieving' | 'streaming' | 'done' | 'refused' | 'error';

interface Initial {
  question: string;
  answerMd: string;
  citations: Citation[];
  excerpts: Excerpt[];
  slug: string | null;
}

interface Props {
  question: string;
  initial?: Initial | null;
  /** '/api/ask' for questions, '/api/explain-error' for stack traces. */
  endpoint?: string;
}

const STAGES = [
  'Searching the documentation index',
  'Matching sections by meaning',
  'Merging keyword and semantic results',
  'Reading the retrieved sections',
];

export default function AnswerView({ question, initial = null, endpoint = '/api/ask' }: Props) {
  const [status, setStatus] = useState<Status>(initial ? 'done' : 'idle');
  const [answer, setAnswer] = useState(initial?.answerMd ?? '');
  const [citations, setCitations] = useState<Citation[]>(initial?.citations ?? []);
  const [excerpts, setExcerpts] = useState<Excerpt[]>(initial?.excerpts ?? []);
  const [slug, setSlug] = useState<string | null>(initial?.slug ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [stage, setStage] = useState(0);
  const [beyond, setBeyond] = useState('');
  const [agent, setAgent] = useState<{ escalated: boolean; queries: string[] | null;
    interpretation: string | null; reranked: boolean } | null>(null);

  const sourcesRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const excerptFor = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of excerpts) m.set(e.chunkId, e.text);
    return m;
  }, [excerpts]);

  // ---- the interaction that matters: citation -> source ------------------
  const focusSource = useCallback((n: number) => {
    setActive(n);
    const el = document.getElementById(`src-${n}`);
    const pane = sourcesRef.current;
    if (!el) return;
    if (pane && pane.scrollHeight > pane.clientHeight + 4) {
      pane.scrollTo({ top: el.offsetTop - pane.offsetTop - 12, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    el.animate?.(
      [{ backgroundColor: 'rgba(176,82,44,0.13)' }, { backgroundColor: 'transparent' }],
      { duration: 1100, easing: 'cubic-bezier(0.22,0.61,0.24,1)' },
    );
  }, []);

  // Citation chips are produced by the markdown renderer as raw HTML, so the
  // handler is delegated from the prose container rather than bound per-node.
  useEffect(() => {
    const root = proseRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button.cite');
      if (!t) return;
      e.preventDefault();
      focusSource(Number(t.dataset.cite));
    };
    const onOver = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button.cite');
      if (t) setActive(Number(t.dataset.cite));
    };
    root.addEventListener('click', onClick);
    root.addEventListener('mouseover', onOver);
    return () => { root.removeEventListener('click', onClick); root.removeEventListener('mouseover', onOver); };
  }, [focusSource, answer]);

  // ---- streaming ----------------------------------------------------------
  useEffect(() => {
    if (initial || started.current || !question) return;
    started.current = true;
    setStatus('retrieving');

    const ticker = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 900);
    const controller = new AbortController();

    ask(question, {
      onMeta: (meta) => {
        clearInterval(ticker);
        setCitations(meta.citations || []);
        setExcerpts(meta.excerpts || []);
        setAgent(meta.agent || null);
        if (meta.refused) setStatus('refused');
        else setStatus('streaming');
        if (meta.cached) setNotice('Served from cache.');
        if (meta.degraded) {
          setNotice('Daily answer limit reached — showing the matching documentation sections instead.');
        }
      },
      onToken: (t) => setAnswer((a) => a + t),
      onBeyondStart: () => setBeyond((b) => b || ' '),
      onBeyond: (t) => setBeyond((b) => (b === ' ' ? '' : b) + t),
      onDegrade: (p) => {
        setNotice('The answer service is unavailable right now — here are the matching sections.');
        setAnswer(p.answerMd);
      },
      onDone: (p) => {
        setStatus((s) => (s === 'refused' ? 'refused' : 'done'));
        if (p.slug) {
          setSlug(p.slug);
          window.history.replaceState({}, '', `/q/${p.slug}`);
        }
      },
      onError: (m) => { clearInterval(ticker); setError(m); setStatus('error'); },
    }, { endpoint, signal: controller.signal }).catch((e) => {
      clearInterval(ticker);
      setError(e?.message === 'Failed to fetch'
        ? 'Could not reach the Sharp AI service.'
        : (e?.message || 'Something went wrong.'));
      setStatus('error');
    });

    return () => { clearInterval(ticker); controller.abort(); };
  }, [question, initial, endpoint]);

  const html = useMemo(
    () => renderMarkdown(answer, citations.length),
    [answer, citations.length],
  );

  // Rendered with zero citations available, so a stray [3] can never become a
  // clickable chip that implies a source it does not have.
  const beyondHtml = useMemo(() => renderMarkdown(beyond.trim(), 0), [beyond]);

  const busy = status === 'retrieving';

  return (
    <div className="av">
      <div className="av__head wrap">
        <p className="eyebrow">Question</p>
        <h1 className="av__q">{question}</h1>
        {notice && <p className="av__notice">{notice}</p>}
      </div>

      <div className="av__split">
        {/* ---------------- answer ---------------- */}
        <section className="av__answer" aria-live="polite">
          <div className="av__panehead">
            <span className="eyebrow">Answer</span>
            {status === 'streaming' && <span className="av__pulse" aria-label="Writing" />}
            {agent?.escalated && (
              <span className="av__agent" title={agent.interpretation || undefined}>
                re-searched{agent.reranked ? ' · reranked' : ''}
              </span>
            )}
            {slug && status === 'done' && (
              <button
                type="button"
                className="av__copy"
                onClick={() => navigator.clipboard?.writeText(`${location.origin}/q/${slug}`)}
              >Copy link</button>
            )}
          </div>

          {busy && (
            <div className="av__loading">
              <span className="av__bar" />
              <p>{STAGES[stage]}…</p>
            </div>
          )}

          {error && (
            <div className="av__error">
              <p>{error}</p>
              <p className="av__errorhint">
                You can still search the documentation directly at{' '}
                <a href="https://gm0.org" rel="noopener">gm0.org</a>.
              </p>
            </div>
          )}

          <div className="prose av__prose" ref={proseRef} dangerouslySetInnerHTML={{ __html: html }} />

          {beyond.trim() && (
            <section className="beyond" aria-labelledby="beyond-h">
              <header className="beyond__head">
                <span className="eyebrow" id="beyond-h">Beyond the documentation</span>
              </header>
              <p className="beyond__warn">
                Not from the indexed sources. This is general engineering
                reasoning — uncited, unverified, and not saved to this page.
                Treat it as a starting point, not an answer.
              </p>
              <div className="prose beyond__body" dangerouslySetInnerHTML={{ __html: beyondHtml }} />
            </section>
          )}

          {status === 'done' && answer && (
            <p className="av__verify">
              Generated from the sources on the right. Verify anything that matters
              against the linked documentation before you build or wire it.
            </p>
          )}
        </section>

        {/* ---------------- sources ---------------- */}
        <aside className="av__sources" ref={sourcesRef}>
          <div className="av__panehead av__panehead--sticky">
            <span className="eyebrow">Retrieved sources</span>
            {citations.length > 0 && <span className="av__count">{citations.length}</span>}
          </div>

          {citations.length === 0 && !busy && (
            <p className="av__empty">No documentation sections matched this question.</p>
          )}

          {citations.map((c) => {
            const text = excerptFor.get(c.chunkId);
            return (
              <article
                key={c.chunkId}
                id={`src-${c.n}`}
                className={`src${active === c.n ? ' src--active' : ''}`}
                onMouseEnter={() => setActive(c.n)}
              >
                <header className="src__head">
                  <span className="src__n">{c.n}</span>
                  <div>
                    <p className="src__path">{c.headingPath}</p>
                    <p className="src__meta">
                      {c.sourceName}
                      <span className="src__dot">·</span>
                      {c.license}
                    </p>
                  </div>
                </header>

                {text ? (
                  <div
                    className="src__body prose"
                    // Chunk bodies carry light markdown from the ingest parser
                    // (admonition prefixes, code fences, lists). Rendering it
                    // makes the pane read like the documentation it came from.
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(stripHeader(text), 0) }}
                  />
                ) : (
                  <p className="src__restricted">
                    This section is under {c.license} and cannot be quoted here.
                    Open the source to read it.
                  </p>
                )}

                <a className="src__link" href={c.url} target="_blank" rel="noopener noreferrer">
                  Open {c.sourceName}
                  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
                    <path d="M2.5 8.5 8.5 2.5M4 2.5h4.5V7" fill="none" stroke="currentColor"
                      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </article>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

/** Chunks carry a `# Page \n ## Path` header for retrieval; the pane already shows it. */
function stripHeader(text: string) {
  return text.split('\n\n').slice(1).join('\n\n').trim() || text;
}
