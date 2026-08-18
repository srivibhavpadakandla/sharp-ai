import { useEffect, useRef } from 'react';
import './scatterfield.css';

/**
 * A drifting field of documentation cards behind the hero.
 *
 * Each card is placed off the centre column so the headline and search stay
 * legible, and each carries its own depth factor — cards nominally "further
 * away" travel less on scroll, which is what produces parallax rather than a
 * single sheet sliding past.
 *
 * Motion is written straight to transform inside a rAF tick. No layout
 * properties are touched, so the whole field stays on the compositor.
 */

interface Card {
  src: string;
  /** viewport-relative placement, in % */
  x: number;
  y: number;
  w: number;        // width in vw — NOT rem, see the layout note
  rot: number;      // degrees
  depth: number;    // parallax factor: bigger = moves more
  opacity: number;
}

const ART = ['drivetrains', 'odometry', 'intakes', 'electronics', 'programming', 'rules', 'errors', 'build'];
const SHOTS = ['drivetrains', 'odometry', 'intakes', 'electronics', 'programming', 'rules', 'build'];

// Hand-placed against a keep-out rule rather than taste: the hero text is
// left-aligned, so the band from x 8% to 64% must stay empty at EVERY width.
//
// Widths are in vw, not rem. With rem widths the keep-out held at 1440 and
// broke at 1280 — each card kept its pixel width while its percentage position
// moved, so it crept into the text column. Sizing in the same unit family as
// the position is what makes the geometry stable.
const LAYOUT: Omit<Card, 'src'>[] = [
  // bleeding off the left edge
  { x: -5, y: 4, w: 9, rot: -8, depth: 0.30, opacity: 0.98 },
  { x: -4, y: 34, w: 7.5, rot: 6, depth: 0.14, opacity: 0.9 },
  { x: -6, y: 62, w: 10, rot: -4, depth: 0.38, opacity: 0.97 },
  { x: -3, y: 86, w: 6.5, rot: 9, depth: 0.20, opacity: 0.88 },
  // top strip, above the eyebrow
  { x: 22, y: -6, w: 6.5, rot: 12, depth: 0.24, opacity: 0.85 },
  { x: 44, y: -3, w: 6, rot: -10, depth: 0.10, opacity: 0.8 },
  // right field
  { x: 70, y: 2, w: 8.5, rot: -6, depth: 0.26, opacity: 0.95 },
  { x: 80, y: 20, w: 10, rot: 5, depth: 0.30, opacity: 0.98 },
  { x: 70, y: 44, w: 6.5, rot: 14, depth: 0.12, opacity: 0.86 },
  { x: 84, y: 56, w: 9, rot: -7, depth: 0.34, opacity: 0.95 },
  { x: 92, y: 34, w: 6.5, rot: -12, depth: 0.18, opacity: 0.84 },
  { x: 72, y: 74, w: 7.5, rot: 8, depth: 0.22, opacity: 0.9 },
  { x: 90, y: 88, w: 6.5, rot: -9, depth: 0.36, opacity: 0.86 },
  // bottom strip, below the example chips
  { x: 30, y: 94, w: 7.5, rot: -5, depth: 0.16, opacity: 0.82 },
  { x: 52, y: 97, w: 6.5, rot: 10, depth: 0.28, opacity: 0.8 },
];

const CARDS: Card[] = LAYOUT.map((l, i) => ({
  ...l,
  src: i % 3 === 2
    ? `/shots/doc-${SHOTS[i % SHOTS.length]}.webp`
    : `/art/cat-${ART[i % ART.length]}.webp`,
}));

export default function ScatterField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.scatter__card'));
    let raf = 0;

    const tick = () => {
      raf = 0;
      const y = window.scrollY;
      for (const el of nodes) {
        const depth = Number(el.dataset.depth || 0);
        const rot = Number(el.dataset.rot || 0);
        // Cards rise as the page falls, and rotate a touch further out — the
        // slight rotation drift is what stops it reading as a flat sheet.
        el.style.transform =
          `translate3d(0, ${(-y * depth).toFixed(2)}px, 0) rotate(${(rot + y * depth * 0.02).toFixed(2)}deg)`;
      }
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    window.addEventListener('scroll', onScroll, { passive: true });
    tick();
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="scatter" ref={ref} aria-hidden="true">
      {CARDS.map((c, i) => (
        <div
          key={i}
          className="scatter__card"
          data-depth={c.depth}
          data-rot={c.rot}
          style={{
            left: `${c.x}%`,
            top: `${c.y}%`,
            width: `${c.w}vw`,
            opacity: c.opacity,
            transform: `rotate(${c.rot}deg)`,
            animationDelay: `${0.05 * i}s`,
          }}
        >
          <img src={c.src} alt="" loading="lazy" decoding="async" />
        </div>
      ))}
    </div>
  );
}
