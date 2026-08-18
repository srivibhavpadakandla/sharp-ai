import { useEffect, useRef, useState } from 'react';
import './search.css';

interface Props {
  autofocus?: boolean;
  placeholder?: string;
  initialValue?: string;
  size?: 'hero' | 'compact';
  maxChars?: number;
}

export default function SearchBox({
  autofocus = false,
  placeholder = 'Ask anything about building, wiring or programming an FTC robot…',
  initialValue = '',
  size = 'hero',
  maxChars = 500,
}: Props) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (autofocus) ref.current?.focus(); }, [autofocus]);

  // Grow with the question instead of scrolling inside a fixed box.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  }, [value]);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    window.location.href = `/ask?q=${encodeURIComponent(q.slice(0, maxChars))}`;
  };

  const over = value.length > maxChars;

  return (
    <form
      className={`sb sb--${size}`}
      onSubmit={(e) => { e.preventDefault(); if (!over) submit(); }}
    >
      <div className="sb__field">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={placeholder}
          spellCheck
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!over) submit(); }
          }}
          aria-label="Ask a question about FTC"
        />
        <button type="submit" disabled={!value.trim() || over} aria-label="Search">
          <span>Ask</span>
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path d="M2 7.5h10M8 3.5l4 4-4 4" fill="none" stroke="currentColor"
              strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="sb__meta">
        <span className={over ? 'sb__count sb__count--over' : 'sb__count'}>
          {over ? `${value.length} / ${maxChars} — too long` : ''}
        </span>
      </div>
    </form>
  );
}
