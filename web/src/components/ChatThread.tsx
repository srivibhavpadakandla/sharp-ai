import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import UsageMeter from './UsageMeter';
import ChatTurn from './ChatTurn';
import ConversationHistory from './ConversationHistory';
import SourceCard from './SourceCard';
import RobotSpecs from './RobotSpecs';
import { CORPUS_SECTIONS, CORPUS_UPDATED } from '../lib/config';
import { ask } from '../lib/ask';
import { blankTurn, type Turn, type SeedTurn } from '../lib/chat-types';
import { loadConversations, saveConversations, conversationMarkdown, type Conversation } from '../lib/conversations';
import { loadSpecs, specsForPrompt } from '../lib/specs';
import './sources.css';
import './chat.css';
export type { Turn, SeedTurn } from '../lib/chat-types';

const STARTERS = [
  { label: 'Design a drivetrain', detail: 'Mechanisms & tradeoffs', q: 'What should I consider when choosing an FTC drivetrain?' },
  { label: 'Debug my robot', detail: 'A practical checklist', q: 'My robot loses power mid-match. What should I check first?' },
  { label: 'Write an OpMode', detail: 'Grounded in the FTC SDK', q: 'Show me a field-centric mecanum TeleOp with the FTC IMU.' },
  { label: 'Understand BIOBUZZ', detail: 'Rules & scoring', q: 'How does BIOBUZZ scoring work, and which rules should I read?' },
];

export default function ChatThread({ initialQuestion = '', endpoint = '/api/ask', seed = null }: {
  initialQuestion?: string; endpoint?: string; seed?: SeedTurn | null;
}) {
  const [turns, setTurns] = useState<Turn[]>(seed ? [{ ...blankTurn(0, seed.question),
    answer: seed.answerMd, citations: seed.citations, excerpts: seed.excerpts, slug: seed.slug, status: 'done' }] : []);
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  const [activeCite, setActiveCite] = useState<number | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const turnsRef = useRef(turns);
  const conversationsRef = useRef<Conversation[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const nextId = useRef(seed ? 1 : 0);
  const started = useRef(false);
  const lastCount = useRef(0);
  const specsRef = useRef<string | null>(specsForPrompt(loadSpecs()));
  const busy = turns.some((t) => t.status === 'thinking' || t.status === 'streaming');
  const activeTurn = turns[active] || turns.at(-1) || null;
  const anyCitations = turns.some((t) => t.citations.length && (t.answer || t.status === 'done' || t.status === 'refused'));

  const changeTurns = useCallback((fn: (all: Turn[]) => Turn[]) => {
    const next = fn(turnsRef.current);
    turnsRef.current = next;
    setTurns(next);
  }, []);
  const patch = useCallback((id: number, fn: (t: Turn) => Partial<Turn>) => {
    changeTurns((all) => all.map((t) => t.id === id ? { ...t, ...fn(t) } : t));
  }, [changeTurns]);

  const send = useCallback((question: string, retryId?: number) => {
    const q = question.trim().slice(0, 500);
    if (!q || busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    const id = retryId ?? nextId.current++;
    const index = retryId === undefined ? turnsRef.current.length : turnsRef.current.findIndex((t) => t.id === id);
    const history = turnsRef.current.slice(0, index).filter((t) => t.answer && t.status === 'done').slice(-2)
      .map((t) => ({ question: t.question, answer: t.answer }));
    changeTurns((all) => retryId === undefined ? [...all, blankTurn(id, q)] : all.map((t) => t.id === id ? blankTurn(id, q) : t));
    setActive(Math.max(0, index));
    setActiveCite(null);
    setDraft('');
    const update = (fn: (t: Turn) => Partial<Turn>) => { if (!controller.signal.aborted) patch(id, fn); };
    let finished = false;
    ask(q, {
      onMeta: (m) => update(() => ({ citations: m.citations || [], excerpts: m.excerpts || [], agent: m.agent || null,
        status: m.refused ? 'refused' : 'streaming', notice: null })),
      onToken: (text) => update((t) => ({ answer: t.answer + text })),
      onBeyondStart: () => update((t) => ({ beyond: t.beyond || ' ' })),
      onBeyond: (text) => update((t) => ({ beyond: t.beyond.trimStart() + text })),
      onValidation: (validation) => update(() => ({ validation })),
      onCiteCheck: (citecheck) => update(() => ({ citecheck })),
      onDegrade: (p) => update(() => ({ answer: p.answerMd, notice: null })),
      onDone: (p) => { finished = true; update((t) => ({ status: t.status === 'refused' ? 'refused' : 'done', slug: p.slug })); },
      onError: (message) => { finished = true; update(() => ({ status: 'error', error: message })); },
    }, { endpoint: index === 0 ? endpoint : '/api/ask', history, specs: specsRef.current, signal: controller.signal })
      .then(() => { if (!finished) update(() => ({ status: 'error', error: 'The connection ended before the answer finished. Try again.' })); })
      .catch((e) => update(() => ({ status: 'error', error: e?.message === 'Failed to fetch'
        ? 'Could not reach Sharp AI. Check your connection and try again.' : e?.message || 'Something went wrong.' })))
      .finally(() => { if (requestRef.current === controller) { busyRef.current = false; requestRef.current = null; } });
  }, [changeTurns, patch, endpoint]);

  const stop = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    busyRef.current = false;
    changeTurns((all) => all.map((t) => t.status === 'thinking' || t.status === 'streaming' ? { ...t, status: 'stopped' } : t));
  };
  const persist = useCallback(() => {
    if (!sessionId || !turnsRef.current.length) return;
    const item: Conversation = { id: sessionId, title: turnsRef.current[0].question.slice(0, 80),
      updatedAt: new Date().toISOString(), turns: turnsRef.current };
    const next = [item, ...conversationsRef.current.filter((c) => c.id !== sessionId)].slice(0, 30);
    conversationsRef.current = next;
    setConversations(next);
    setStorageError(!saveConversations(next));
  }, [sessionId]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setSourcesOpen(window.innerWidth >= 900);
    const saved = loadConversations();
    conversationsRef.current = saved;
    setConversations(saved);
    let previousId = '';
    try { previousId = sessionStorage.getItem('sharp-active-conversation') || ''; } catch { /* storage may be disabled */ }
    const previous = !initialQuestion && !seed ? saved.find((c) => c.id === previousId) : null;
    setSessionId(previous?.id || crypto.randomUUID());
    if (previous) { changeTurns(() => previous.turns); nextId.current = previous.turns.length; setActive(Math.max(0, previous.turns.length - 1)); }
    setReady(true);
    if (initialQuestion && !seed) send(initialQuestion);
    else composerRef.current?.focus({ preventScroll: true });
  }, [initialQuestion, seed, send, changeTurns]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem('sharp-active-conversation', sessionId); } catch { /* optional persistence */ }
    const timer = setTimeout(persist, busy ? 1000 : 100);
    return () => clearTimeout(timer);
  }, [turns, sessionId, ready, busy, persist]);
  useEffect(() => { document.title = turns[0] ? `${turns[0].question.slice(0, 60)} — Sharp AI` : 'Chat — Sharp AI'; }, [turns[0]?.question]);

  const newConversation = () => {
    stop(); persist(); changeTurns(() => []); nextId.current = 0;
    setSessionId(crypto.randomUUID()); setDraft(''); setActive(0); setActiveCite(null); setHistoryOpen(false);
    window.scrollTo({ top: 0 }); composerRef.current?.focus({ preventScroll: true });
  };
  const selectConversation = (c: Conversation) => {
    if (busyRef.current) return;
    persist(); setSessionId(c.id); changeTurns(() => c.turns); nextId.current = c.turns.length;
    setActive(Math.max(0, c.turns.length - 1)); setHistoryOpen(false); setActiveCite(null); setDraft('');
  };
  const deleteConversation = (id: string) => {
    if (id === sessionId) { changeTurns(() => []); setSessionId(crypto.randomUUID()); nextId.current = 0; }
    const next = conversationsRef.current.filter((c) => c.id !== id);
    conversationsRef.current = next; setConversations(next); setStorageError(!saveConversations(next));
  };
  const exportConversation = () => {
    const url = URL.createObjectURL(new Blob([conversationMarkdown(turns)], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'sharp-ai-conversation.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const streamedChars = turns.reduce((n, t) => n + t.answer.length + t.beyond.length, 0);
  useEffect(() => {
    if (!turns.length) { lastCount.current = 0; return; }
    const doc = document.documentElement;
    const newTurn = turns.length > lastCount.current;
    const nearBottom = doc.scrollHeight - window.scrollY - window.innerHeight < 200;
    lastCount.current = turns.length;
    if (!nearBottom && !newTurn) return;
    const target = newTurn ? threadRef.current?.querySelector<HTMLElement>('[data-turn]:last-of-type') : null;
    window.scrollTo({ top: target ? target.getBoundingClientRect().top + window.scrollY - 140 : doc.scrollHeight, behavior: 'auto' });
  }, [turns.length, streamedChars]);

  const focusSource = useCallback((index: number, n: number) => {
    setActive(index); setActiveCite(n); setSourcesOpen(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(`src-${n}`); const pane = railRef.current;
      if (!el || !pane) return;
      pane.scrollTo({ top: el.offsetTop - pane.offsetTop - 70, behavior: 'smooth' });
      el.focus({ preventScroll: true });
    });
  }, []);
  useEffect(() => {
    const root = threadRef.current;
    if (!root) return;
    const onClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cite = target.closest<HTMLElement>('button.cite');
      if (cite) { e.preventDefault(); focusSource(Number(cite.closest<HTMLElement>('[data-turn]')?.dataset.turn || 0), Number(cite.dataset.cite)); }
      const copy = target.closest<HTMLButtonElement>('button[data-copy-code]');
      if (copy) {
        try { await navigator.clipboard.writeText(copy.closest('.code-block')?.querySelector('code')?.textContent || '');
          copy.textContent = 'Copied'; setTimeout(() => { if (copy.isConnected) copy.textContent = 'Copy code'; }, 1800);
        } catch { copy.textContent = 'Copy failed'; }
      }
    };
    root.addEventListener('click', onClick); return () => root.removeEventListener('click', onClick);
  }, [focusSource]);
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  return <section className="chat-workspace">
    <div className="workspace-toolbar">
      <div className="workspace-title"><span className="workspace-dot" /> <strong>Robot workspace</strong><span className="workspace-subtitle">{CORPUS_SECTIONS.toLocaleString()} indexed sections</span></div>
      <div className="workspace-controls">
        <button type="button" className="chat-action" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>History{conversations.length ? ` · ${conversations.length}` : ''}</button>
        {turns.length > 0 && <button type="button" className="chat-action" onClick={exportConversation} disabled={busy}>Export</button>}
        {anyCitations && <button type="button" className="chat-action" aria-expanded={sourcesOpen} aria-controls="chat-sources" onClick={() => {
          if (!sourcesOpen && !activeTurn?.citations.length) setActive(Math.max(0, turns.findLastIndex((t) => t.citations.length > 0)));
          setSourcesOpen((v) => !v);
        }}>Sources</button>}
        <button type="button" className="chat-action chat-action--primary" onClick={newConversation}>+ New chat</button>
      </div>
    </div>
    <div className="workspace-body">
      {historyOpen && <ConversationHistory items={conversations} activeId={sessionId} busy={busy} onSelect={selectConversation} onDelete={deleteConversation} onClose={() => setHistoryOpen(false)} />}
      <div className={`chat${anyCitations && sourcesOpen ? '' : ' chat--norail'}`}>
        <div className="chat__thread" ref={threadRef}>
          <div className="chat__turns" aria-busy={busy}>
            {turns.map((t, i) => <ChatTurn key={t.id} turn={t} index={i} isActive={i === active} onFocus={() => setActive(i)} patch={patch} onRetry={() => send(t.question, t.id)} />)}
            {!turns.length && <div className="chat__empty">
              <span className="eyebrow">A workbench for your next idea</span>
              <h1>What are you<br />working on?</h1>
              <p>Build, program, and troubleshoot your FTC robot.<br className="desktop-break" /> Get an answer with the documentation beside it.</p>
              <div className="chat__starters">{STARTERS.map((s, i) => <button type="button" key={s.label} onClick={() => send(s.q)}>
                <span className="starter-number">0{i + 1}</span><strong>{s.label}</strong><small>{s.detail}</small><span className="starter-arrow" aria-hidden="true">↗</span>
              </button>)}</div>
              <div className="chat__freshness"><span className="workspace-dot" /> Documentation refreshed {CORPUS_UPDATED} <a href="/about">Explore sources ↗</a></div>
            </div>}
          </div>
          <div className="composer-shell">
            <RobotSpecs onChange={(s) => { specsRef.current = specsForPrompt(s); }} />
            <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!busyRef.current) send(draft); }}>
              <div className="composer__field">
                <textarea ref={composerRef} rows={1} value={draft} maxLength={500} placeholder={turns.length ? 'Ask a follow-up…' : 'Ask about your FTC robot…'} aria-label="Ask a question"
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busyRef.current) send(draft); }
                  }} />
                {busy ? <button type="button" className="composer__send" onClick={stop} aria-label="Stop response"><span className="stop-square" /></button>
                  : <button className="composer__send" type="submit" disabled={!draft.trim()} aria-label="Send"><span aria-hidden="true">↑</span></button>}
              </div>
              <div className="composer__meta"><span>{draft.length > 400 ? `${draft.length}/500 characters` : 'Enter to send · Shift + Enter for a new line'}</span><span>{storageError ? 'Could not save — export to keep this chat' : 'Saved on this browser'}</span></div>
              <UsageMeter refreshKey={turns.filter((t) => t.status === 'done' || t.status === 'error' || t.status === 'stopped').length} />
              <p className="composer__note">AI can be wrong. Check the sources. Unofficial; not affiliated with <em>FIRST</em>. <a href="/about">Sources & licenses</a></p>
            </form>
          </div>
        </div>
        {anyCitations && sourcesOpen && <aside className="chat__rail" id="chat-sources" ref={railRef} aria-label="Answer sources">
          <div className="chat__railhead"><div><span className="eyebrow">Source notebook</span><p>Check the evidence.</p></div><span className="chat__count">{activeTurn?.citations.length || 0}</span><button className="chat-action rail-close" type="button" aria-label="Close sources" onClick={() => setSourcesOpen(false)}>×</button></div>
          {activeTurn?.citations.length ? activeTurn.citations.map((c) => <SourceCard key={c.chunkId} citation={c} text={activeTurn.excerpts.find((e) => e.chunkId === c.chunkId)?.text} active={activeCite === c.n} onEnter={() => setActiveCite(c.n)} />)
            : <p className="chat__railempty">Select a response to read its sources.</p>}
        </aside>}
      </div>
    </div>
  </section>;
}
