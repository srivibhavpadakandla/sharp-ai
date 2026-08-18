import { useEffect, useRef, useState } from 'react';
import './headersearch.css';

/**
 * Search pill centred in the header, present on every page.
 *
 * The site had no way to ask a question without first navigating to /chat or
 * the home hero. A persistent field means a question is always one keystroke
 * away — "/" focuses it from anywhere.
 */
const HINTS = [
  'mecanum drive',
  'odometry pods',
  'why my robot browns out',
  'an OpMode for encoders',
  'pedro pathing tuning',
];

export default function HeaderSearch() {
  const [value, setValue] = useState('');
  const [hint, setHint] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  // "/" focuses search, the way it does in most documentation sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) { e.preventDefault(); ref.current?.focus(); }
      if (e.key === 'Escape') ref.current?.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Same typed hint as the chat landing, so the two surfaces feel like one product.
  useEffect(() => {
    if (value) { setHint(''); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setHint(HINTS[0]); return; }
    let phrase = 0, chars = 0, deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = HINTS[phrase];
      chars += deleting ? -1 : 1;
      setHint(full.slice(0, chars));
      let wait = deleting ? 26 : 54 + Math.random() * 36;
      if (!deleting && chars === full.length) { deleting = true; wait = 1900; }
      else if (deleting && chars === 0) { deleting = false; phrase = (phrase + 1) % HINTS.length; wait = 320; }
      t = setTimeout(step, wait);
    };
    t = setTimeout(step, 700);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <form
      className="hsearch"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q) window.location.href = `/ask?q=${encodeURIComponent(q.slice(0, 500))}`;
      }}
    >
      <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={hint ? `Try '${hint}'` : 'Search the FTC documentation'}
        aria-label="Search the FTC documentation"
        maxLength={500}
      />
      {!value && <kbd>/</kbd>}
    </form>
  );
}
