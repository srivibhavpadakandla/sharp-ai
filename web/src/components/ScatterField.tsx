import { useEffect, useRef } from 'react';
import './scatterfield.css';

/**
 * Documentation plates orbiting the hero.
 *
 * Each card travels an elliptical path around the centre of the section — the
 * whole field revolves around the wordmark rather than each card spinning on
 * its own axis.
 *
 * Two things are computed rather than hand-tuned, because both were previously
 * a source of collisions:
 *
 *   - the inner radius is derived from the measured text block, so no orbit can
 *     ever cross the copy. Placing cards by eye did not converge: cards are
 *     sized in vw and the text in ch/rem, so a layout tuned at one width broke
 *     at another.
 *   - the outer radius is bounded by the viewport, so nothing leaves the page.
 *
 * Position is written straight to transform inside a single rAF loop, so the
 * orbit and the scroll parallax compose instead of fighting for the property.
 */

const ART = ['drivetrains', 'odometry', 'intakes', 'electronics', 'programming', 'rules', 'errors', 'build'];

interface Orbiter {
  src: string;
  angle: number;    // starting position on the ellipse, radians
  ring: number;     // 0 = innermost orbit, 1 = outermost
  speed: number;    // revolutions per second
  size: number;     // rem
  tilt: number;     // static rotation of the card itself
  depth: number;    // scroll parallax factor
  opacity: number;
}

const COUNT = 14;

const ORBITERS: Orbiter[] = Array.from({ length: COUNT }, (_, i) => {
  const ring = i % 3 === 0 ? 0 : i % 3 === 1 ? 0.55 : 1;
  return {
    src: `/art/cat-${ART[i % ART.length]}.webp`,
    angle: (i / COUNT) * Math.PI * 2 + (i % 2 ? 0.35 : 0),
    ring,
    // Outer rings sweep slower, which reads as depth rather than a spinning wheel.
    speed: (0.0075 - ring * 0.0028) * (i % 2 ? -1 : 1),
    size: 5.5 + ring * 3.2,
    tilt: -14 + (i * 37) % 28,
    depth: 0.10 + ring * 0.22,
    opacity: 0.72 + ring * 0.24,
  };
});

export default function ScatterField() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.scatter__card'));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    let inner = 0;
    let outer = 0;
    let cx = 0;
    let cy = 0;

    /** Clear the measured copy, stay inside the viewport. */
    const measure = () => {
      const box = root.getBoundingClientRect();
      cx = box.width / 2;
      cy = box.height / 2;

      const texts = ['.hero__mark', '.hero__title', '.hero__lede', '.hero__actions']
        .map((s) => document.querySelector(s))
        .filter(Boolean)
        .map((el) => (el as HTMLElement).getBoundingClientRect());

      // Furthest corner of the copy from the centre, plus half a card and a gap.
      let reach = 0;
      for (const t of texts) {
        const dx = Math.max(Math.abs(t.left - (box.left + cx)), Math.abs(t.right - (box.left + cx)));
        const dy = Math.max(Math.abs(t.top - (box.top + cy)), Math.abs(t.bottom - (box.top + cy)));
        reach = Math.max(reach, Math.hypot(dx, dy * 0.62));
      }
      const card = 0.5 * 9 * 16;                 // half the largest card, px
      inner = reach + card + 28;
      outer = Math.max(inner + 40, Math.min(box.width, box.height * 1.55) / 2 - card);
    };

    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      const scroll = window.scrollY;
      for (let i = 0; i < nodes.length; i += 1) {
        const o = ORBITERS[i];
        const r = inner + (outer - inner) * o.ring;
        const a = o.angle + t * o.speed * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        // Squashed vertically so the field reads as a wide ellipse, not a wheel.
        const y = cy + Math.sin(a) * r * 0.62 - scroll * o.depth;
        nodes[i].style.transform =
          `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${o.tilt}deg)`;
      }
      raf = requestAnimationFrame(frame);
    };

    measure();
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    for (const s of ['.hero__title', '.hero__lede', '.hero__actions']) {
      const el = document.querySelector(s);
      if (el) ro.observe(el);
    }
    // The webfont changes the size of the copy after first paint.
    document.fonts?.ready?.then(measure).catch(() => {});

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div className="scatter" ref={ref} aria-hidden="true">
      {ORBITERS.map((o, i) => (
        <div
          key={i}
          className="scatter__card"
          style={{ width: `${o.size}rem`, opacity: o.opacity, animationDelay: `${0.05 * i}s` }}
        >
          <img src={o.src} alt="" loading="lazy" decoding="async" />
        </div>
      ))}
    </div>
  );
}
