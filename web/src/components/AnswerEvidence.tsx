import type {Citation} from '../lib/ask';
import type {EvidenceClaim} from '../lib/learning';
export default function AnswerEvidence({claims, citations}: {claims: EvidenceClaim[]; citations: Citation[]}) {
  if (!claims.length) return null;
  return <details className="answer-evidence"><summary>Check claims against sources · {claims.length}</summary>
    <p>Passages are matched by wording, not independently fact-checked. A matching passage can still be incomplete or contradict a claim.</p>
    {claims.map((claim, i) => <section key={i}><p className="evidence-claim">{claim.claim}</p>
      {claim.sources.map((source) => {const c = citations.find((c) => c.n === source.n); return <div className="evidence-source" key={source.n}>
        <strong>[{source.n}] {c?.sourceName || 'Missing citation'}</strong><small>{source.version} · {source.status === 'matched' ? 'Matching wording' : source.status === 'weak' ? 'Weak wording match — verify carefully' : source.status === 'restricted' ? 'Original passage cannot be reproduced' : 'Citation was not retrieved'}</small>
        {source.passage && <blockquote>{source.passage}</blockquote>}{c && /^https?:\/\//.test(c.url) && <a href={c.url} target="_blank" rel="noopener noreferrer">Read the full section ↗</a>}
      </div>;})}
    </section>)}
  </details>;
}
