import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ask, type Citation, type Excerpt } from '../lib/ask';
import { renderMarkdown } from '../lib/markdown';
import SourceCard from './SourceCard';
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
  excerpts: Excerpt[];
  status: Status;
  agent: Agent | null;
  slug: string | null;
  notice: string | null;
  error: string | null;
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
});

export default function ChatThread({
  initialQuestion = '',
  endpoint = '/api/ask',
}: { initialQuestion?: string; endpoint?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [stage, setStage] = useState(0);

  const threadRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);
  const started = useRef(false);

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
        clearInterval(ticker);
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
    }, { endpoint: id === 0 ? endpoint : '/api/ask', history } as any)
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
    if (initialQuestion) send(initialQuestion);
    else composerRef.current?.focus();
  }, [initialQuestion, send]);

  // Follow the conversation down as it grows, the way a chat surface should.
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: turns.length > 1 ? 'smooth' : 'auto' });
  }, [turns.length]);

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

  return (
    <div className="chat">
      <div className="chat__thread" ref={threadRef}>
        <div className="chat__turns">
          {turns.map((t, i) => (
            <TurnView
              key={t.id} turn={t} index={i} stage={stage}
              isActive={i === active} onFocus={() => setActive(i)}
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
          <p className="composer__note">
            Answers are generated from indexed documentation and can be wrong —
            check the source beside each claim. Follow-ups are not saved.
          </p>
        </form>
      </div>

      <aside className="chat__rail" ref={railRef}>
        <div className="chat__railhead">
          <span className="eyebrow">Sources</span>
          {activeTurn?.citations.length ? (
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
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TurnView({ turn, index, stage, isActive, onFocus }: {
  turn: Turn; index: number; stage: number; isActive: boolean; onFocus: () => void;
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

        {turn.status === 'thinking' && (
          <div className="turn__loading">
            <span className="turn__bar" />
            <p>{STAGES[stage]}…</p>
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
