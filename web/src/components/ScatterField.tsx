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

// Hand-placed against a keep-out rule. The hero is CENTRED now, not
// left-aligned, so the empty band moved from the left column to the middle:
// nothing may sit between x 22% and 78%. Cards that sat at 14 and 76 still
// clipped the lede at 1280, where a 46ch text block is a larger share of the
// viewport than at 1440 — the keep-out has to be set by the narrow case.
// Widths are in vw so the geometry holds at every viewport width.
const LAYOUT: Omit<Card, 'src'>[] = [
  // left field
  { x: -4, y: 6,  w: 8,   rot: -8,  depth: 0.30, opacity: 0.95 },
  { x: 3,  y: 30, w: 6.5, rot: 7,   depth: 0.16, opacity: 0.85 },
  { x: -3, y: 56, w: 9,   rot: -5,  depth: 0.36, opacity: 0.95 },
  { x: 6,  y: 78, w: 7,   rot: 10,  depth: 0.22, opacity: 0.88 },
  { x: 9,  y: 12, w: 6,   rot: 13,  depth: 0.26, opacity: 0.8 },
  { x: 7,  y: 64, w: 7.5, rot: -9,  depth: 0.12, opacity: 0.82 },
  { x: 12, y: 94, w: 6,   rot: 5,   depth: 0.20, opacity: 0.78 },
  // top and bottom strips, clear of the centred text
  { x: 38, y: -13, w: 7,  rot: -6,  depth: 0.24, opacity: 0.85 },
  { x: 57, y: -11, w: 6,  rot: 11,  depth: 0.14, opacity: 0.8 },
  { x: 45, y: 101, w: 7,  rot: 8,   depth: 0.18, opacity: 0.8 },
  // right field
  { x: 82, y: 8,  w: 8,   rot: -7,  depth: 0.28, opacity: 0.92 },
  { x: 88, y: 30, w: 9,   rot: 6,   depth: 0.32, opacity: 0.95 },
  { x: 85, y: 56, w: 6.5, rot: 14,  depth: 0.13, opacity: 0.84 },
  { x: 90, y: 74, w: 8,   rot: -10, depth: 0.34, opacity: 0.9 },
  { x: 82, y: 94, w: 6,   rot: 9,   depth: 0.20, opacity: 0.8 },
];

const CARDS: Card[] = LAYOUT.map((l, i) => ({
  ...l,
  // Blueprint art only. The documentation screenshots read as grey text noise
  // at this size and rotation, and their blue admonition boxes fight the
  // palette — a photograph of a text page is not an image.
  src: `/art/cat-${ART[i % ART.length]}.webp`,
}));

export default function ScatterField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.scatter__card'));

    /**
     * Hide any card that actually overlaps the hero text.
     *
     * Hand-placing cards against the copy does not converge: the text block is
     * sized in ch and rem while the cards are sized in vw, so a layout tuned at
     * 1440 collides at 1280 and tuning for 1280 collides somewhere else. Three
     * rounds of moving coordinates by eye left more collisions than it started
     * with. Measuring is exact and needs no tuning.
     */
    const TEXT = ['.hero__mark', '.hero__title', '.hero__lede', '.hero__actions'];
    const declutter = () => {
      const boxes = TEXT.map((sel) => document.querySelector(sel))
        .filter(Boolean)
        .map((el) => (el as HTMLElement).getBoundingClientRect());
      if (!boxes.length) return;
      for (const el of nodes) {
        el.style.visibility = 'visible';
        const c = el.getBoundingClientRect();
        const clash = boxes.some((a) =>
          !(a.right < c.left || a.left > c.right || a.bottom < c.top || a.top > c.bottom));
        el.style.visibility = clash ? 'hidden' : 'visible';
      }
    };
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
    // after layout settles, and again whenever the box sizes change
    const settle = setTimeout(declutter, 120);
    // Fonts change the size of the text block. Measuring before Newsreader
    // loads gives a smaller box, so a card judged clear at measure time ends up
    // overlapping once the headline reflows wider.
    if (document.fonts?.ready) document.fonts.ready.then(declutter).catch(() => {});
    // The cards animate in from a 14px offset with up to 0.7s of stagger, so a
    // measurement at 120ms reads positions that are still moving. Re-run once
    // the entrance has settled — that, not the webfont, was what left a single
    // card overlapping at 1440.
    const settled = setTimeout(declutter, 1900);
    const ro = new ResizeObserver(declutter);
    for (const sel of TEXT) { const el = document.querySelector(sel); if (el) ro.observe(el); }
    window.addEventListener('resize', declutter);
    tick();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', declutter);
      clearTimeout(settle);
      clearTimeout(settled);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
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
