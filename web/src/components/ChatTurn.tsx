import AnswerEvidence from './AnswerEvidence';
import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../lib/config';
import { renderMarkdown } from '../lib/markdown';
import { answerMarkdown } from '../lib/conversations';
import type { Turn } from '../lib/chat-types';

export default function ChatTurn({ turn, index, isActive, onFocus, patch, onRetry, onFollowUp, disabled }: {
  turn: Turn; index: number; isActive: boolean; onFocus: () => void;
  patch: (id: number, fn: (t: Turn) => Partial<Turn>) => void;
  onRetry: () => void;
  onFollowUp: (question: string) => void;
  disabled: boolean;
}) {
  const html = useMemo(
    () => renderMarkdown(turn.answer, turn.citations.length),
    [turn.answer, turn.citations.length],
  );
  const [copied, setCopied] = useState(false);
  const copyAnswer = async () => {
    try { await navigator.clipboard.writeText(answerMarkdown(turn)); setCopied(true); }
    catch { setCopied(false); }
  };
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t); }, [copied]);
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

        <div className="turn__identity"><span className="turn__mark" aria-hidden="true">✳</span> Sharp AI</div>
        {(turn.status === 'thinking' || (turn.status === 'streaming' && !turn.answer && !turn.beyond)) && (
          <div className="turn__thinking" role="status">
            <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>
            <span>{turn.status === 'streaming' ? 'Writing your answer' : 'Finding the right documentation'}…</span>
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

        {turn.error && <div className="turn__error" role="alert">{turn.error}</div>}
        {turn.status === 'stopped' && <p className="turn__notice">Response stopped.</p>}
        {(turn.status === 'error' || turn.status === 'stopped') && (
          <button className="chat-action" type="button" onClick={onRetry}>Try again</button>
        )}

        <div className="prose turn__prose" dangerouslySetInnerHTML={{ __html: html }} />

        <AnswerEvidence claims={turn.evidence || []} citations={turn.citations} />
        {turn.status === 'done' && turn.tutor?.followUps?.length && <div className="tutor-followups" aria-label="Suggested follow-up replies">
          {turn.tutor.followUps.map((question) => <button type="button" className="chat-action" key={question} disabled={disabled} onClick={() => onFollowUp(question)}>{question}</button>)}
        </div>}
        {turn.status === 'done' && turn.answer && (
          <div className="rate">
            <button className="rate__btn" type="button" onClick={copyAnswer}>{copied ? 'Copied' : 'Copy answer'}</button>
            <span>Helpful?</span>
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
                ? `Checked against the FTC SDK ${turn.validation.sdkVersion} — referenced SDK symbols were recognized. This is not a compilation or runtime test.`
                : `Checked against the FTC SDK ${turn.validation.sdkVersion} — some symbols were not recognized. Check the installed SDK and library versions.`}
            </p>
            {turn.validation.notes.map((n) => (
              <p key={n} className="sdkcheck__note"
                 dangerouslySetInnerHTML={{ __html: renderMarkdown(n, 0) }} />
            ))}
          </section>
        ) : null}

        {turn.beyond.trim() && (
          <section className="beyond">
            <header className="beyond__head"><span className="eyebrow">Beyond the documentation</span></header>
            <p className="beyond__warn">
              Not from the indexed sources. General engineering reasoning —
              uncited, unverified, and not included in saved chats.
            </p>
            <div className="prose beyond__body" dangerouslySetInnerHTML={{ __html: beyondHtml }} />
          </section>
        )}
      </div>
    </article>
  );
}
