import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import UsageMeter from './UsageMeter';
import Mascot from './Mascot';
import { API_BASE } from '../lib/config';
import { ask, type Citation, type Excerpt, type Validation, type CiteCheck } from '../lib/ask';
import { renderMarkdown } from '../lib/markdown';
import SourceCard from './SourceCard';
import RobotSpecs from './RobotSpecs';
import { loadSpecs, specsForPrompt } from '../lib/specs';
import './sources.css';
import './chat.css';

type Status = 'thinking' | 'streaming' | 'done' | 'refused' | 'error';

interface Agent {
  escalated: boolean; queries: string[] | null;
  interpretation: string | null; reranked: boolean;
}

export interface Turn {
  id: number;
  question: string;
  answer: string;
  beyond: string;
  citations: Citation[];
  reason?: string;
  excerpts: Excerpt[];
  status: Status;
  agent: Agent | null;
  slug: string | null;
  notice: string | null;
  error: string | null;
  validation: Validation | null;
  citecheck: CiteCheck | null;
  rated: 'up' | 'down' | null;
}

const STAGES = [
  'Searching the documentation index',
  'Matching sections by meaning',
  'Re-reading the question',
  'Reading the retrieved sections',
];

const blankTurn = (id: number, question: string): Turn => ({
  id, question, answer: '', beyond: '', citations: [], excerpts: [],
  status: 'thinking', agent: null, slug: null, notice: null, error: null,
  validation: null, citecheck: null, rated: null,
});

export interface SeedTurn {
  question: string;
  answerMd: string;
  citations: Citation[];
  excerpts: Excerpt[];
  slug: string | null;
}

export default function ChatThread({
  initialQuestion = '',
  endpoint = '/api/ask',
  seed = null,
}: { initialQuestion?: string; endpoint?: string; seed?: SeedTurn | null }) {
  // A /q/ page seeds the thread with its stored answer instead of streaming
  // one, so a permanent link and a live conversation are the same surface and
  // a visitor can follow up from something someone shared with them.
  const [turns, setTurns] = useState<Turn[]>(
    seed
      ? [{
          ...blankTurn(0, seed.question),
          answer: seed.answerMd,
          citations: seed.citations,
          excerpts: seed.excerpts,
          slug: seed.slug,
          status: 'done' as Status,
        }]
      : [],
  );
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [stage, setStage] = useState(0);

  const threadRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(seed ? 1 : 0);
  const started = useRef(false);
  const lastCount = useRef(0);
  const specsRef = useRef<string | null>(specsForPrompt(loadSpecs()));

  const busy = turns.some((t) => t.status === 'thinking' || t.status === 'streaming');
  const activeTurn = turns[active] || turns[turns.length - 1] || null;

  const patch = useCallback((id: number, fn: (t: Turn) => Partial<Turn>) => {
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...fn(t) } : t)));
  }, []);

  // ---- send -----------------------------------------------------------------
  const send = useCallback((question: string) => {
    const q = question.trim().slice(0, 500);
    if (!q) return;

    const id = nextId.current++;
    let history: Array<{ question: string; answer: string }> = [];
    setTurns((all) => {
      history = all.filter((t) => t.answer).slice(-2)
        .map((t) => ({ question: t.question, answer: t.answer }));
      return [...all, blankTurn(id, q)];
    });
    setActive((a) => (turns.length ? turns.length : a));
    setDraft('');

    const ticker = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 900);

    ask(q, {
      onMeta: (meta) => {
        clearInterval(ticker);   // stages describe retrieval; writing follows
        patch(id, () => ({
          citations: meta.citations || [],
          excerpts: meta.excerpts || [],
          agent: (meta.agent as Agent) || null,
          status: meta.refused ? 'refused' : 'streaming',
          notice: meta.cached
            ? 'Answered earlier — served from cache.'
            : meta.degraded
              ? 'Daily answer limit reached — showing the matching sections instead.'
              : null,
        }));
      },
      onToken: (t) => patch(id, (cur) => ({ answer: cur.answer + t })),
      onBeyondStart: () => patch(id, (cur) => ({ beyond: cur.beyond || ' ' })),
      onBeyond: (t) => patch(id, (cur) => ({ beyond: (cur.beyond === ' ' ? '' : cur.beyond) + t })),
      onValidation: (v) => patch(id, () => ({ validation: v })),
      onCiteCheck: (v) => patch(id, () => ({ citecheck: v })),
      onDegrade: (p) => patch(id, () => ({
        answer: p.answerMd,
        notice: 'The answer service is unavailable — here are the matching sections.',
      })),
      onDone: (p) => {
        patch(id, (cur) => ({ status: cur.status === 'refused' ? 'refused' : 'done', slug: p.slug }));
        // Only the opening question of a thread earns a permanent URL.
        if (p.slug && id === 0) window.history.replaceState({}, '', `/q/${p.slug}`);
        composerRef.current?.focus();
      },
      onError: (m) => { clearInterval(ticker); patch(id, () => ({ status: 'error', error: m })); },
    }, { endpoint: id === 0 ? endpoint : '/api/ask', history, specs: specsRef.current } as any)
      .catch((e) => {
        clearInterval(ticker);
        patch(id, () => ({
          status: 'error',
          error: e?.message === 'Failed to fetch'
            ? 'Could not reach the Sharp AI service.' : (e?.message || 'Something went wrong.'),
        }));
      });
  }, [patch, turns.length]);

  // ---- boot from ?q= --------------------------------------------------------
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialQuestion && !seed) send(initialQuestion);
    else composerRef.current?.focus();
  }, [initialQuestion, seed, send]);

  // Follow the conversation down as it grows, the way a chat surface should.
  //
  // Keyed on streamed length, not just turn count: the earlier version scrolled
  // once when a turn was appended, then the answer streamed in underneath and
  // ended up hidden behind the composer. Only auto-follows when the reader is
  // already near the bottom, so scrolling up to re-read is not yanked back.
  const streamedChars = turns.reduce((n, t) => n + t.answer.length + t.beyond.length, 0);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 220;
    if (!nearBottom && turns.length === lastCount.current) return;
    lastCount.current = turns.length;
    el.scrollTo({ top: el.scrollHeight, behavior: turns.length > 1 ? 'smooth' : 'auto' });
  }, [turns.length, streamedChars]);

  useEffect(() => { setActive(Math.max(0, turns.length - 1)); }, [turns.length]);

  // ---- citation -> source ---------------------------------------------------
  const focusSource = useCallback((turnIdx: number, n: number) => {
    setActive(turnIdx);
    setActiveCite(n);
    requestAnimationFrame(() => {
      const el = document.getElementById(`src-${n}`);
      const pane = railRef.current;
      if (!el || !pane) return;
      pane.scrollTo({ top: el.offsetTop - pane.offsetTop - 8, behavior: 'smooth' });
      el.animate?.([{ backgroundColor: 'rgba(176,82,44,0.14)' }, { backgroundColor: 'transparent' }],
        { duration: 1000, easing: 'cubic-bezier(0.22,0.61,0.24,1)' });
    });
  }, []);

  useEffect(() => {
    const root = threadRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button.cite');
      if (!btn) return;
      e.preventDefault();
      const turnEl = btn.closest<HTMLElement>('[data-turn]');
      focusSource(Number(turnEl?.dataset.turn ?? active), Number(btn.dataset.cite));
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [focusSource, active]);

  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  // Sources are known as soon as retrieval returns, but showing them before a
  // single word of the answer reads as though the citations came first and the
  // answer was fitted to them. They appear with the writing.
  const anyCitations = turns.some((t) => t.citations.length > 0
    && (t.answer || t.beyond || t.status === 'done' || t.status === 'refused'));

  return (
    <div className={`chat${anyCitations ? '' : ' chat--norail'}`}>
      <div className="chat__thread" ref={threadRef}>
        <div className="chat__turns">
          {turns.map((t, i) => (
            <TurnView
              key={t.id} turn={t} index={i} stage={stage}
              isActive={i === active} onFocus={() => setActive(i)} patch={patch}
            />
          ))}

          {!turns.length && (
            <div className="chat__empty">
              <h1>What are you building?</h1>
              <p className="serif-lede">
                Ask about drivetrains, odometry, wiring, OpModes — or paste an
                error. Every answer shows the documentation it came from, and
                you can keep asking follow-ups.
              </p>
              <ul className="chat__starters">
                {['How do I make my mecanum drive field centric?',
                  'Where should odometry pods be mounted?',
                  'Why does my robot lose power mid match?'].map((q) => (
                  <li key={q}><button type="button" onClick={() => send(q)}>{q}</button></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <RobotSpecs onChange={(s) => { specsRef.current = specsForPrompt(s); }} />

        <form
          className="composer"
          onSubmit={(e) => { e.preventDefault(); if (!busy) send(draft); }}
        >
          <div className="composer__field">
            <textarea
              ref={composerRef}
              rows={1}
              value={draft}
              disabled={busy}
              placeholder={turns.length ? 'Ask a follow-up…' : 'Ask about your FTC robot…'}
              onChange={(e) => { setDraft(e.target.value); grow(e.target); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!busy) send(draft);
                }
              }}
              aria-label="Ask a question"
            />
            <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <UsageMeter refreshKey={turns.length} />
          <p className="composer__note">
            Generated from indexed documentation and can be wrong — check the
            source beside each claim. Follow-ups are not saved. Unofficial, not
            affiliated with <em>FIRST</em>. Quotes{' '}
            <a href="https://gm0.org" target="_blank" rel="noopener">Game Manual 0</a>{' '}
            (CC BY-NC 4.0) and{' '}
            <a href="https://ftc-docs.firstinspires.org" target="_blank" rel="noopener">FTC Docs</a>{' '}
            (BSD 3-Clause). Built by Sharp Face Robotics.
          </p>
        </form>
      </div>

      {anyCitations && <aside className="chat__rail" ref={railRef}>
        <div className="chat__railhead">
          <span className="eyebrow">Sources</span>
          {activeTurn?.citations.length && (activeTurn.answer || activeTurn.beyond || activeTurn.status === 'done' || activeTurn.status === 'refused') ? (
            <span className="chat__count">{activeTurn.citations.length}</span>
          ) : null}
        </div>
        {activeTurn?.citations.length ? (
          activeTurn.citations.map((c) => (
            <SourceCard
              key={c.chunkId} citation={c}
              text={activeTurn.excerpts.find((e) => e.chunkId === c.chunkId)?.text}
              active={activeCite === c.n}
              onEnter={() => setActiveCite(c.n)}
            />
          ))
        ) : (
          <p className="chat__railempty">
            Documentation sections appear here as questions are answered.
          </p>
        )}
      </aside>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TurnView({ turn, index, stage, isActive, onFocus, patch }: {
  turn: Turn; index: number; stage: number; isActive: boolean; onFocus: () => void;
  patch: (id: number, fn: (t: Turn) => Partial<Turn>) => void;
}) {
  const html = useMemo(
    () => renderMarkdown(turn.answer, turn.citations.length),
    [turn.answer, turn.citations.length],
  );
  const beyondHtml = useMemo(() => renderMarkdown(turn.beyond.trim(), 0), [turn.beyond]);

  return (
    <article
      className={`turn${isActive ? ' turn--active' : ''}`}
      data-turn={index}
      onMouseEnter={onFocus}
    >
      {/* Only the person's message gets a container — the answer stays a
          document, which is what the split-pane reading experience needs. */}
      <div className="turn__you"><p>{turn.question}</p></div>

      <div className="turn__reply">
        {turn.notice && <p className="turn__notice">{turn.notice}</p>}

        {(turn.status === 'thinking'
          || (turn.status === 'streaming' && !turn.answer && !turn.beyond)) && (
          <div className="turn__loading">
            <Mascot state="thinking" />
            <span className="turn__bar" />
            {/* Retrieval finishing is not the answer starting. The indicator used
                to stop the moment sections came back, leaving the reader looking
                at sources and a blank space while the model was still writing. */}
            <p>{turn.status === 'streaming' ? 'Writing the answer' : STAGES[stage]}…</p>
          </div>
        )}

        {turn.agent?.escalated && (
          <p className="turn__agent" title={turn.agent.interpretation || undefined}>
            Searched again for{' '}
            {(turn.agent.queries || []).map((q, i) => (
              <span key={q}>{i > 0 ? ', ' : ''}<em>{q}</em></span>
            ))}
            {turn.agent.reranked ? ' · reranked' : ''}
          </p>
        )}

        {turn.error && <div className="turn__error">{turn.error}</div>}

        <div className="prose turn__prose" dangerouslySetInnerHTML={{ __html: html }} />

        {turn.status === 'done' && turn.answer && (
          <div className="rate">
            <span>Was this right?</span>
            {(['up', 'down'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={turn.rated === v ? 'rate__btn rate__btn--on' : 'rate__btn'}
                disabled={!!turn.rated}
                onClick={() => {
                  patch(turn.id, () => ({ rated: v }));
                  // Fire and forget: feedback must never block or fail loudly.
                  fetch(`${API_BASE}/api/feedback`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      verdict: v, question: turn.question, slug: turn.slug,
                      chunkIds: turn.citations.map((c) => c.chunkId),
                      sourceIds: [...new Set(turn.citations.map((c) => c.sourceId))],
                    }),
                  }).catch(() => {});
                }}
              >{v === 'up' ? 'Yes' : 'No'}</button>
            ))}
            {turn.rated === 'up' && <span className="rate__thanks">Logged — thank you.</span>}
            {/* A bare no says something is wrong but not what, and the reason is
                the part that can be acted on. The column already existed; the
                interface simply never asked. */}
            {turn.rated === 'down' && !turn.reason && (
              <span className="rate__why">
                What was wrong?
                {([
                  ['wrong', 'Incorrect'],
                  ['missing', 'Missed the question'],
                  ['thin', 'Too vague'],
                  ['long', 'Too long'],
                  ['source', 'Sources look wrong'],
                ] as const).map(([key, label]) => (
                  <button key={key} type="button" className="rate__chip"
                    onClick={() => {
                      patch(turn.id, () => ({ reason: key }));
                      fetch(`${API_BASE}/api/feedback`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          verdict: 'down', reason: key, question: turn.question, slug: turn.slug,
                          chunkIds: turn.citations.map((c) => c.chunkId),
                          sourceIds: [...new Set(turn.citations.map((c) => c.sourceId))],
                        }),
                      }).catch(() => {});
                    }}>{label}</button>
                ))}
              </span>
            )}
            {turn.reason && <span className="rate__thanks">Logged — that helps, thank you.</span>}
          </div>
        )}

        {turn.citecheck && !turn.citecheck.ok ? (
          <section className="citecheck">
            <p className="citecheck__head">Citation check</p>
            {turn.citecheck.outOfRange.length > 0 && (
              <p className="citecheck__note">
                {turn.citecheck.outOfRange.map((n) => `[${n}]`).join(', ')} point at
                sections that were not retrieved — treat those claims as uncited.
              </p>
            )}
            {turn.citecheck.weak.map((w) => (
              <p key={`${w.n}-${w.claim}`} className="citecheck__note">
                <strong>[{w.n}]</strong> may be the wrong section for “{w.claim}…” — check it before relying on it.
              </p>
            ))}
          </section>
        ) : null}

        {turn.validation?.checked ? (
          <section className={`sdkcheck${turn.validation.ok ? ' sdkcheck--ok' : ''}`}>
            <p className="sdkcheck__head">
              {turn.validation.ok
                ? `Checked against the FTC SDK ${turn.validation.sdkVersion} — every type and method in this code exists.`
                : `Checked against the FTC SDK ${turn.validation.sdkVersion} — some symbols are not in it.`}
            </p>
            {turn.validation.notes.map((n) => (
              <p key={n} className="sdkcheck__note"
                 dangerouslySetInnerHTML={{ __html: n.replace(/`([^`]+)`/g, '<code>$1</code>') }} />
            ))}
          </section>
        ) : null}

        {turn.beyond.trim() && (
          <section className="beyond">
            <header className="beyond__head"><span className="eyebrow">Beyond the documentation</span></header>
            <p className="beyond__warn">
              Not from the indexed sources. General engineering reasoning —
              uncited, unverified, and not saved.
            </p>
            <div className="prose beyond__body" dangerouslySetInnerHTML={{ __html: beyondHtml }} />
          </section>
        )}
      </div>
    </article>
  );
}
