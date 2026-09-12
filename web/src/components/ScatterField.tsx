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
  tilt: number;     // starting rotation of the card itself
  spin: number;     // degrees per second the card turns as it travels
  depth: number;    // scroll parallax factor
  opacity: number;
}

const COUNT = 22;

const ORBITERS: Orbiter[] = Array.from({ length: COUNT }, (_, i) => {
  // Four rings rather than three: with 22 plates, three rings crowded each
  // orbit enough that neighbouring cards touched at the ellipse's narrow ends.
  const ring = (i % 4) / 3;
  return {
    // scatter/ rather than art/: these plates are drawn at most ~7.8rem across
    // (the `size` below), and the full-size files are 900px wide. The home
    // page was fetching 220k of artwork to render it at 60-75px — 12 to 15
    // times more pixels than any of it could show. The 300px variants are
    // still oversampled for a retina screen at that size.
    src: `/art/scatter/cat-${ART[(i * 3) % ART.length]}.webp`,
    angle: (i / COUNT) * Math.PI * 2 + (i % 2 ? 0.35 : 0),
    ring,
    // Revolutions per second. The old 0.0075 was one lap every 133 seconds,
    // which read as a still image rather than as motion.
    speed: (0.035 - ring * 0.013) * (i % 2 ? -1 : 1),
    // Each plate also turns on its own axis as it travels, alternating
    // direction so the field does not read as one rigid wheel.
    spin: (7 + (i % 4) * 3) * (i % 3 ? 1 : -1),
    size: 3.9 + ring * 3.0 + (i % 3) * 0.45,
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

    let copy: { l: number; r: number; t: number; b: number }[] = [];
    let cx = 0;
    let cy = 0;

    /**
     * 1 well clear of the copy, ramping to 0 on top of it.
     *
     * Measured from the plate's edge, not its centre: a centre-only test left
     * plates whose bodies still lapped ~70px over the headline at full opacity.
     */
    const clarity = (x: number, y: number, half: number) => {
      let f = 1;
      for (const rc of copy) {
        const dx = Math.max(rc.l - x, 0, x - rc.r);
        const dy = Math.max(rc.t - y, 0, y - rc.b);
        f = Math.min(f, Math.min(1, Math.max(0, Math.hypot(dx, dy) - half) / 88));
      }
      return f;
    };

    /** Clear the measured copy, stay inside the viewport. */
    const measure = () => {
      const box = root.getBoundingClientRect();
      cx = box.width / 2;
      cy = box.height / 2;

      // Copy boxes in root-relative coordinates. Plates are not routed *around*
      // these — a keep-out ring wide enough to clear the headline does not fit
      // on the page at all — so they orbit freely and fade where they cross.
      //
      // Per-line glyph boxes, via Range, rather than each element's border box:
      // .hero__mark and .hero__actions are block level and report the full
      // container width, which laid two full-width no-go bands across the field
      // and blanked most of the orbit. Ragged lines also let plates tuck in
      // beside the short ones.
      copy = [];
      for (const sel of ['.hero__mark', '.hero__title', '.hero__lede', '.hero__actions']) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        for (const t of Array.from(range.getClientRects())) {
          if (t.width < 2 || t.height < 2) continue;
          copy.push({ l: t.left - box.left, r: t.right - box.left, t: t.top - box.top, b: t.bottom - box.top });
        }
        range.detach();
      }
    };

    // Cursor parallax. Target and current are separate so the field eases
    // toward the pointer instead of snapping, and it all folds into the single
    // transform write below rather than fighting the orbit for the property.
    let pxTarget = 0;
    let pyTarget = 0;
    let px = 0;
    let py = 0;
    const onPointer = (e: PointerEvent) => {
      pxTarget = (e.clientX / window.innerWidth - 0.5) * 2;
      pyTarget = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (!reduced) window.addEventListener('pointermove', onPointer, { passive: true });

    let raf = 0;
    const start = performance.now();

    const frame = (now: number) => {
      const t = reduced ? 0 : (now - start) / 1000;
      const scroll = window.scrollY;
      px += (pxTarget - px) * 0.045;
      py += (pyTarget - py) * 0.045;
      for (let i = 0; i < nodes.length; i += 1) {
        const o = ORBITERS[i];
        // A tilted square needs a wider box than its own width, so each plate
        // clamps against its own rotated half-extent rather than a shared
        // worst-case constant.
        // The plate turns as it goes, so clamp against the widest box it can
        // ever present — 45 degrees — not against its current angle.
        const rad = Math.PI / 4;
        // A tilted square needs a wider box than its own width, so each plate
        // sizes its orbit from its own rotated half-extent.
        const half = ((o.size * 16) / 2) * (Math.cos(rad) + Math.sin(rad));
        const fit = Math.max(0, Math.min(cx - half, (cy - half) / 0.62));
        // Pushed right out to the rim. The top of the ellipse passes through the
        // middle of the page, which is where the headline is, so anything on an
        // inner ring spent most of its orbit faded out and the corners of the
        // hero read as empty.
        const r = fit * (0.86 + 0.14 * o.ring);
        const a = o.angle + t * o.speed * Math.PI * 2;
        const x = cx + Math.cos(a) * r + px * o.depth * 46;
        // Squashed vertically so the field reads as a wide ellipse, not a wheel.
        const y = cy + Math.sin(a) * r * 0.62 - scroll * o.depth + py * o.depth * 30;
        const turn = o.tilt + t * o.spin;
        nodes[i].style.transform =
          `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${turn.toFixed(2)}deg)`;
        nodes[i].style.opacity = (o.opacity * clarity(x, y, (o.size * 16) / 2)).toFixed(3);
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

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
    };
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
