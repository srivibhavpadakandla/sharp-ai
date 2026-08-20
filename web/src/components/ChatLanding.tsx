import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ChatThread from './ChatThread';
import OrbitImages from './OrbitImages';
import './chatlanding.css';

/**
 * The /chat entry state.
 *
 * A full-bleed backdrop with one frosted search pill, and nothing else — no
 * nav, no copy, no cards. Typing a question swaps this out for the thread in
 * place rather than navigating, so the transition reads as entering the
 * conversation instead of loading a different page.
 */

/**
 * Small, single-subject drawings made specifically for the orbit: the wide
 * category plates are hairline work and dissolve into noise at ~110px, so
 * these were generated square, one object each, with heavier line weight.
 */
const ORBIT = ['mecanum', 'motor', 'servo', 'gear', 'hub', 'battery', 'odometry', 'pulley']
  .map((n) => `/orbit/${n}.webp`);

/** Fisher-Yates, so the parts do not sit in the same order every visit. */
function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  const [placeholder, setPlaceholder] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Order is shuffled per mount so the ring is not identical every visit.
  const orbit = useRef(shuffled(ORBIT));

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Grows with what you type instead of scrolling a single line out of view.
  // It is a textarea for exactly that reason — an <input> cannot wrap, so a
  // long question disappeared off the left edge as it was written.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const cap = Math.min(Math.round(window.innerHeight * 0.4), 340);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
  }, [value]);

  // Type the placeholder out a character at a time, hold it, delete it, move on.
  //
  // It used to swap the whole phrase at once every 2.6s, which read as the text
  // glitching rather than as a suggestion being offered. Typing makes the
  // intent obvious: these are things you could ask.
  useEffect(() => {
    if (entered) return;
    // Someone mid-thought should not have text moving underneath them.
    if (value) { setPlaceholder(''); return; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPlaceholder(PROMPTS[0]);
      return;
    }

    let phrase = 0;
    let chars = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const step = () => {
      const full = PROMPTS[phrase];
      chars += deleting ? -1 : 1;
      setPlaceholder(full.slice(0, chars));

      let wait = deleting ? 26 : 52 + Math.random() * 38;   // uneven, like a person
      if (!deleting && chars === full.length) {
        deleting = true;
        wait = 1900;                                        // let it be read
      } else if (deleting && chars === 0) {
        deleting = false;
        phrase = (phrase + 1) % PROMPTS.length;
        wait = 320;
      }
      timer = setTimeout(step, wait);
    };

    timer = setTimeout(step, 600);
    return () => clearTimeout(timer);
  }, [entered, value]);

  if (entered) return <ChatThread initialQuestion={entered} />;

  const submit = () => {
    const q = value.trim();
    if (q) setEntered(q.slice(0, 500));
  };

  return (
    <div className="cl">
      {/* The surface has no visible heading; a document still needs one. */}
      <h1 className="sr-only">Ask about your FTC robot</h1>
      <div className="cl__scrim" />

      {/* Decorative ring, positioned by our own CSS rather than the
          component's centreContent. Its layout model is a fixed square design
          box that is transform-scaled, with the centre content absolutely
          positioned inside it — which does not centre reliably inside a
          viewport-height hero. Three attempts left the pill 350px left and
          310px low. Owning the positioning is simpler and stays put. */}
      <div className="cl__orbitwrap" aria-hidden="true">
        <OrbitImages
          className="cl__orbit"
          images={orbit.current}
          altPrefix=""
          shape="ellipse"
          baseWidth={1400}
          radiusX={600}
          radiusY={330}
          itemSize={132}
          duration={52}
          easing="linear"
          responsive
          width="100%"
          height={1400}
        />
      </div>

      <form
        className="cl__form"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <div className="cl__pill">
          <svg className="cl__icon" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M13.5 13.5 17 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter asks, Shift+Enter breaks the line — the same contract as
              // the follow-up composer, so the two surfaces behave alike.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
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
