import { renderMarkdown } from '../lib/markdown';
import type { Citation } from '../lib/ask';
import './sources.css';

/** Shared by the chat rail and the permanent /q/ split-pane. */
export default function SourceCard({ citation: c, text, active, onEnter }: {
  citation: Citation;
  text?: string;
  active: boolean;
  onEnter?: () => void;
}) {
  const body = text ? text.split('\n\n').slice(1).join('\n\n').trim() || text : null;
  return (
    <article id={`src-${c.n}`} className={`src${active ? ' src--active' : ''}`} onMouseEnter={onEnter}>
      <header className="src__head">
        <span className="src__n">{c.n}</span>
        <div>
          <p className="src__path">{c.headingPath}</p>
          <p className="src__meta">{c.sourceName}<span className="src__dot">·</span>{c.license}</p>
        </div>
      </header>
      {body ? (
        <div className="src__body prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(body, 0) }} />
      ) : (
        <p className="src__restricted">
          This section is under {c.license} and cannot be quoted here. Open the source to read it.
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
}
