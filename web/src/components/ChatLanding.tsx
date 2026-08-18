import { useEffect, useRef, useState } from 'react';
import ChatThread from './ChatThread';
import './chatlanding.css';

/**
 * The /chat entry state.
 *
 * A full-bleed backdrop with one frosted search pill, and nothing else — no
 * nav, no copy, no cards. Typing a question swaps this out for the thread in
 * place rather than navigating, so the transition reads as entering the
 * conversation instead of loading a different page.
 */

const BACKDROPS = [
  'drivetrains', 'odometry', 'intakes', 'electronics',
  'programming', 'build', 'rules', 'errors',
];

/** Fisher-Yates, so a visit sees a different order rather than the same loop. */
function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const HOLD_MS = 6500;

const PROMPTS = [
  'mecanum drive',
  'odometry pods',
  'why my robot browns out',
  'a lift that holds position',
  'an OpMode for encoders',
];

export default function ChatLanding() {
  const [entered, setEntered] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [placeholder, setPlaceholder] = useState(PROMPTS[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Order is shuffled per mount so repeat visits do not replay the same
  // sequence; every plate is rendered and crossfaded by opacity, which keeps
  // the transition on the compositor and avoids a flash of unloaded image.
  const plates = useRef(shuffled(BACKDROPS));
  const [plate, setPlate] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (entered) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setPlate((i) => (i + 1) % plates.current.length), HOLD_MS);
    return () => clearInterval(t);
  }, [entered]);

  // Cycle the placeholder so the pill suggests what this is for without
  // needing a paragraph of instructions next to it.
  useEffect(() => {
    if (entered) return;
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % PROMPTS.length;
      setPlaceholder(PROMPTS[i]);
    }, 2600);
    return () => clearInterval(t);
  }, [entered]);

  if (entered) return <ChatThread initialQuestion={entered} />;

  const submit = () => {
    const q = value.trim();
    if (q) setEntered(q.slice(0, 500));
  };

  return (
    <div className="cl">
      {plates.current.map((name, i) => (
        <img
          key={name}
          className={`cl__art${i === plate ? ' is-active' : ''}`}
          src={`/art/cat-${name}.webp`}
          alt=""
          decoding="async"
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      ))}
      <div className="cl__scrim" />

      <form
        className="cl__form"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="cl__pill">
          <svg className="cl__icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            aria-label="Ask about your FTC robot"
            maxLength={500}
            spellCheck
          />
          {value.trim() && (
            <button type="submit" aria-label="Ask">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        <p className="cl__hint">Ask anything about building, wiring or programming an FTC robot</p>
      </form>
    </div>
  );
}
