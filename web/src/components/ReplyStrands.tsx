import { useEffect, useRef, useState } from 'react';
import Strands from './vendor/Strands';
import './replystrands.css';

/**
 * The strands the reply arrives on.
 *
 * Two states, and they are meant to feel different: thinking is slow and dim,
 * because nothing is being said yet; speaking is quicker and brighter, because
 * words are landing. The band is the same object in both, so the transition
 * reads as the same process changing pace rather than one thing replacing
 * another.
 *
 * The shader is additive, so on paper it is composited with multiply — see
 * the note in global.css about why light is not simply the dark version dimmed.
 */
const BRAND = ['#4a90e2', '#4fc3e8', '#6edb9a', '#9be870'];

export default function ReplyStrands({ state }: { state: 'thinking' | 'speaking' }) {
  const [light, setLight] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(20);
  useEffect(() => {
    const read = () => setLight(document.documentElement.dataset.theme === 'light');
    read();
    addEventListener('themechange', read);
    return () => removeEventListener('themechange', read);
  }, []);

  // The shader normalises x by height and shapes the field with
  // cos(uv.x * PI * 1.3), which only has one lobe while |uv.x| < 0.385. This
  // band is far wider than it is tall, so at a fixed scale uv.x ran well past
  // that and the field tiled — it drew a row of repeating lozenges instead of
  // strands. Scale has to track the aspect ratio, so it is measured.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.max(1.4, (width / height) / 2 / 0.34));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  const speaking = state === 'speaking';
  return (
    <div
      ref={box}
      className={`replystrands replystrands--${state}${light ? ' replystrands--light' : ''}`}
      aria-hidden="true"
    >
      <Strands
        colors={BRAND}
        count={speaking ? 6 : 4}
        speed={speaking ? 0.75 : 0.3}
        amplitude={speaking ? 1.5 : 1.05}
        waviness={speaking ? 2.4 : 1.6}
        thickness={light ? 0.26 : 0.3}
        glow={light ? 1.5 : 2.0}
        taper={1.5}
        spread={1.2}
        intensity={speaking ? 0.62 : 0.4}
        saturation={light ? 2.1 : 1.4}
        opacity={light ? 0.55 : (speaking ? 0.85 : 0.6)}
        scale={scale}
      />
    </div>
  );
}
