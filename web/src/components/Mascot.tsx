import { useEffect, useRef } from 'react';
import { animate, createMotionPath, utils } from 'animejs';
import './mascot.css';

/**
 * The robot from the path planner, driving a small loop while the answer is
 * being worked out.
 *
 * No face, deliberately: a face invites you to read a mood into it, and this
 * only ever means one thing — something is happening, or it is not. Motion
 * carries that on its own. It is the same square with a bright leading edge
 * that the planner draws on the field, so the thing that represents the site
 * thinking is the same object the site draws.
 */
export default function Mascot({ state = 'idle' }: { state?: 'idle' | 'thinking' | 'done' }) {
  const bot = useRef<SVGRectElement>(null);
  const path = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = bot.current;
    if (!el || !path.current) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    utils.remove(el);

    // Travels the loop and turns to face the direction it is going, so it
    // reads as driving rather than sliding. Parked, it just breathes, so a
    // still mascot does not look like a broken one.
    const anim = state === 'thinking'
      ? animate(el, { ...createMotionPath(path.current), duration: 2600, ease: 'inOutSine', loop: true })
      : animate(el, { scale: [1, 1.06], duration: 1900, ease: 'inOutSine', loop: true, alternate: true });

    // Must be a closure, not `anim.pause`. Handing React the bare method calls
    // it with no receiver, it throws reading `this.paused`, and a throw in an
    // effect cleanup tears down the whole tree — the chat island vanished and
    // the page went blank the moment an answer arrived.
    return () => { anim.pause(); utils.remove(el); };
  }, [state]);

  return (
    <svg className={`mascot mascot--${state}`} viewBox="0 0 68 40" aria-hidden="true">
      <path
        ref={path}
        className="mascot__path"
        d="M 10 30 C 14 10, 28 32, 34 20 C 40 8, 52 12, 56 22"
      />
      <rect ref={bot} className="mascot__bot" x="-5.5" y="-5.5" width="11" height="11" rx="2.4" />
    </svg>
  );
}
