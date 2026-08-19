import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate } from 'animejs';
import {
  FIELD_IN, TILE_IN, bezierAt, generateJava, legPoints, poseAtLength, robotCorners,
  sampleChain, starterPath, validate, clampField, round2, encodePath, decodePath, parseJava,
  schedule, distanceAtTime, hitsObstacle, DEFAULT_LIMITS,
  type Interp, type PathModel, type Pt, type Limits, type Obstacle,
} from '../lib/pedro';
import './pathsim.css';

const DIMS_KEY = 'sharp-ai:robot-dims';
type Handle = { kind: 'point'; i: number } | { kind: 'control'; leg: number; i: number };

const readDims = () => {
  try {
    const r = JSON.parse(localStorage.getItem(DIMS_KEY) || '');
    if (r && r.w > 0 && r.l > 0) return { w: r.w, l: r.l };
  } catch { /* first visit */ }
  return { w: 18, l: 18 };
};

export default function PathSim() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<PathModel>(starterPath);
  const [copied, setCopied] = useState('');
  const [paste, setPaste] = useState('');
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  /** Trace the robot's footprint along the route — the Visualizer calls these onion layers. */
  const [ghosts, setGhosts] = useState(true);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [importNote, setImportNote] = useState('');

  /**
   * Only report success if the write actually succeeded. clipboard.writeText
   * rejects when the document is not focused or the permission is refused, and
   * claiming "Copied" regardless means the user pastes stale text.
   */
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied(`${what}:failed`);
    }
    setTimeout(() => setCopied(''), 2200);
  };
  const [sel, setSel] = useState<Handle | null>({ kind: 'point', i: 0 });
  const [dims, setDims] = useState({ w: 18, l: 18 });
  const [playing, setPlaying] = useState(true);
  const [u, setU] = useState(0);              // position along the chain, 0..1
  const drag = useRef<Handle | null>(null);
  const uRef = useRef(0);
  /** 0..1 — how much of the route has been drawn in. Animated on arrival. */
  const reveal = useRef(0);
  const moved = useRef(false);
  const past = useRef<PathModel[]>([]);

  /** Snapshot before a discrete edit, so Cmd-Z can step back through them. */
  const remember = (m: PathModel) => {
    past.current.push(m);
    if (past.current.length > 50) past.current.shift();
  };
  const undo = () => {
    const prev = past.current.pop();
    if (prev) setModel(prev);
  };

  useEffect(() => {
    setDims(readDims());
    try {
      const raw = JSON.parse(localStorage.getItem('sharp-ai:sim') || '');
      if (raw?.limits?.xVel > 0) setLimits({ ...DEFAULT_LIMITS, ...raw.limits });
      if (Array.isArray(raw?.obstacles)) setObstacles(raw.obstacles.slice(0, 12));
    } catch { /* first visit */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('sharp-ai:sim', JSON.stringify({ limits, obstacles })); }
    catch { /* private browsing */ }
  }, [limits, obstacles]);

  // A path in the hash wins over the starter path.
  useEffect(() => {
    const shared = decodePath(window.location.hash);
    if (shared) setModel(shared);
  }, []);

  // Keep the hash current so the address bar is always shareable, without
  // pushing history entries for every pixel of a drag.
  useEffect(() => {
    const id = setTimeout(() => {
      history.replaceState(null, '', `#${encodePath(model)}`);
    }, 250);
    return () => clearTimeout(id);
  }, [model]);
  useEffect(() => { uRef.current = u; }, [u]);

  const { table, total } = useMemo(() => sampleChain(model), [model]);
  const sched = useMemo(() => schedule(model, limits), [model, limits]);
  // The playhead runs on time now, not distance, so a wait actually costs
  // something on the scrubber instead of being invisible.
  const atDistance = useMemo(
    () => distanceAtTime(sched, u * sched.totalSeconds),
    [sched, u],
  );
  const warnings = useMemo(() => {
    const out = validate(model, dims.w, dims.l);
    // Sample the route and report the first obstacle the footprint touches.
    for (const o of obstacles) {
      const hit = table.some((sp, i) => i % 4 === 0
        && hitsObstacle(robotCorners(poseAtLength(model, table, sp.s), dims.w, dims.l), o));
      if (hit) out.push({ level: 'error', text: `The robot passes through ${o.name}.` });
    }
    return out;
  }, [model, dims, obstacles, table]);
  const java = useMemo(() => generateJava(model), [model]);

  // Advance at a plausible cruise so the preview reads as motion, not a scrub.
  useEffect(() => {
    if (!playing || sched.totalSeconds < 0.05) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // Real seconds against the estimated duration, so the preview runs at
      // the speed the schedule claims.
      const next = uRef.current + dt / sched.totalSeconds;
      setU(next >= 1 ? 0 : next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, sched.totalSeconds]);

  // Keyboard: nudge, delete, undo, play. A planner you can only drive with a
  // mouse makes fine positioning tedious.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === ' ') { e.preventDefault(); setPlaying((v) => !v); return; }
      if (!sel) return;
      const step = e.shiftKey ? 5 : 1;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
      };
      if (nudge[e.key]) {
        e.preventDefault();
        const [dx, dy] = nudge[e.key];
        remember(model);
        setModel((m) => {
          if (sel.kind === 'point') {
            return { ...m, points: m.points.map((w, i) => (i === sel.i
              ? { ...w, x: round2(clampField(w.x + dx)), y: round2(clampField(w.y + dy)) } : w)) };
          }
          return { ...m, segments: m.segments.map((s, leg) => (leg !== sel.leg ? s
            : { ...s, control: s.control.map((cp, i) => (i === sel.i
              ? { x: round2(clampField(cp.x + dx)), y: round2(clampField(cp.y + dy)) } : cp)) })) };
        });
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.kind === 'point') {
        e.preventDefault(); remember(model); removePoint(sel.i);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const draw = useCallback(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const css = cv.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== css * dpr) { cv.width = css * dpr; cv.height = css * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = css / FIELD_IN;
    const X = (x: number) => x * k;
    const Y = (y: number) => css - y * k;      // y up, per Pedro's coordinates
    ctx.clearRect(0, 0, css, css);

    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--accent').trim() || '#6edb9a';
    const ink = style.getPropertyValue('--ink').trim() || '#e9edf2';

    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(0, 0, css, css);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= FIELD_IN / TILE_IN; i += 1) {
      const p = i * TILE_IN * k;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, css); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(css, p); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.strokeRect(0.5, 0.5, css - 1, css - 1);

    for (const o of obstacles) {
      ctx.fillStyle = 'rgba(255,143,107,0.14)';
      ctx.strokeStyle = 'rgba(255,143,107,0.7)';
      ctx.lineWidth = 1.5;
      const x = X(o.x);
      const y = Y(o.y + o.h);
      ctx.fillRect(x, y, o.w * k, o.h * k);
      ctx.strokeRect(x, y, o.w * k, o.h * k);
      ctx.fillStyle = 'rgba(255,190,167,0.85)';
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(o.name, x + 4, y + 4);
    }

    // control polygon of the selected leg only — all of them at once is noise
    if (sel) {
      const leg = sel.kind === 'control' ? sel.leg : Math.min(sel.i, model.segments.length - 1);
      if (leg >= 0 && model.segments[leg]?.control.length) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        legPoints(model, leg).forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Stroked from the arc-length table rather than per-leg bezier steps, so the
    // draw-in advances at a constant rate instead of racing through short legs.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const upto = total * reveal.current;
    let started = false;
    for (const sp of table) {
      if (sp.s > upto) break;
      if (!started) { ctx.moveTo(X(sp.p.x), Y(sp.p.y)); started = true; }
      else ctx.lineTo(X(sp.p.x), Y(sp.p.y));
    }
    ctx.stroke();

    model.segments.forEach((seg, leg) => {
      seg.control.forEach((c) => {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), 5, 0, Math.PI * 2); ctx.fill();
      });
    });

    model.points.forEach((p, i) => {
      const on = sel?.kind === 'point' && sel.i === i;
      ctx.fillStyle = on ? accent : ink;
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), on ? 8 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0e12';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), X(p.x), Y(p.y));
      // heading tick
      const h = (p.heading * Math.PI) / 180;
      ctx.strokeStyle = on ? accent : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(p.x), Y(p.y));
      ctx.lineTo(X(p.x + Math.cos(h) * 9), Y(p.y + Math.sin(h) * 9));
      ctx.stroke();
    });

    // The swept footprint, drawn under the robot. A route can look clear as a
    // line and still not fit an 18 inch robot through the gap, which is only
    // visible once the body is drawn along it.
    if (ghosts && total > 0.5 && reveal.current > 0.98) {
      const step = 9;                       // inches between traces
      ctx.lineWidth = 1;
      for (let s = 0; s <= total; s += step) {
        const gp = poseAtLength(model, table, s);
        const gc = robotCorners(gp, dims.w, dims.l);
        const hit = obstacles.some((o) => hitsObstacle(gc, o))
          || gc.some((q) => q.x < 0 || q.x > FIELD_IN || q.y < 0 || q.y > FIELD_IN);
        ctx.strokeStyle = hit ? 'rgba(255,143,107,0.55)' : 'rgba(110,219,154,0.16)';
        ctx.beginPath();
        gc.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Y(q.y)) : ctx.moveTo(X(q.x), Y(q.y))));
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (total > 0.5 && reveal.current > 0.98) {
      const pose = poseAtLength(model, table, atDistance);
      const corners = robotCorners(pose, dims.w, dims.l);
      ctx.fillStyle = 'rgba(110,219,154,0.16)';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      corners.forEach((c, i) => (i ? ctx.lineTo(X(c.x), Y(c.y)) : ctx.moveTo(X(c.x), Y(c.y))));
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // front edge, so the heading is unambiguous
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X(corners[0].x), Y(corners[0].y));
      ctx.lineTo(X(corners[1].x), Y(corners[1].y));
      ctx.stroke();
    }
  }, [model, sel, u, total, table, dims, obstacles, atDistance, ghosts]);

  useEffect(() => { draw(); }, [draw]);

  // Draw the route on once, when the planner first appears.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { reveal.current = 1; draw(); return; }
    const state = { v: 0 };
    const a = animate(state, {
      v: 1, duration: 1100, ease: 'inOut(2)',
      onUpdate: () => { reveal.current = state.v; draw(); },
    });
    return () => { a.pause(); reveal.current = 1; };
  }, []);
  useEffect(() => {
    const on = () => draw();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [draw]);

  const toField = (e: React.PointerEvent) => {
    const cv = canvas.current!;
    const r = cv.getBoundingClientRect();
    const k = r.width / FIELD_IN;
    return { x: (e.clientX - r.left) / k, y: (r.height - (e.clientY - r.top)) / k };
  };

  const hit = (p: Pt): Handle | null => {
    const tol = 5;
    for (let i = 0; i < model.points.length; i += 1) {
      if (Math.hypot(model.points[i].x - p.x, model.points[i].y - p.y) < tol) return { kind: 'point', i };
    }
    for (let leg = 0; leg < model.segments.length; leg += 1) {
      const cs = model.segments[leg].control;
      for (let i = 0; i < cs.length; i += 1) {
        if (Math.hypot(cs[i].x - p.x, cs[i].y - p.y) < tol) return { kind: 'control', leg, i };
      }
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toField(e);
    const h = hit(p);
    moved.current = false;
    if (h) {
      drag.current = h; setSel(h);
      remember(model);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    moved.current = true;
    const p = toField(e);
    const x = round2(clampField(p.x));
    const y = round2(clampField(p.y));
    const d = drag.current;
    setModel((m) => {
      if (d.kind === 'point') {
        const points = m.points.map((w, i) => (i === d.i ? { ...w, x, y } : w));
        return { ...m, points };
      }
      const segments = m.segments.map((s, leg) => (leg !== d.leg ? s
        : { ...s, control: s.control.map((c, i) => (i === d.i ? { x, y } : c)) }));
      return { ...m, segments };
    });
  };

  const onUp = (e: React.PointerEvent) => {
    // A press on empty field that never moved is a click: drop a waypoint
    // there. Appending at a fixed offset from the last one, which is what this
    // did before, means every new point lands somewhere you did not ask for.
    if (!drag.current && !moved.current) {
      const p = toField(e);
      if (p.x >= 0 && p.x <= FIELD_IN && p.y >= 0 && p.y <= FIELD_IN) {
        remember(model);
        setModel((m) => ({
          points: [...m.points, { x: round2(p.x), y: round2(p.y), heading: m.points[m.points.length - 1].heading }],
          segments: [...m.segments, { control: [], interp: 'linear' as Interp, endTime: 0.8 }],
        }));
        setSel({ kind: 'point', i: model.points.length });
      }
    }
    if (drag.current && !moved.current) past.current.pop();   // nothing changed
    drag.current = null;
  };

  const addPoint = () => { remember(model); setModel((m) => {
    const last = m.points[m.points.length - 1];
    const p = { x: round2(clampField(last.x + 18)), y: round2(clampField(last.y - 18)), heading: last.heading };
    return {
      points: [...m.points, p],
      segments: [...m.segments, { control: [], interp: 'linear' as Interp, endTime: 0.8 }],
    };
  }); };

  const removePoint = (i: number) => setModel((m) => {
    if (m.points.length <= 2) return m;
    const segIdx = i === 0 ? 0 : i - 1;
    return {
      points: m.points.filter((_, k) => k !== i),
      segments: m.segments.filter((_, k) => k !== segIdx),
    };
  });

  const setLegRaw = (leg: number, patch: Partial<{ interp: Interp; endTime: number; curved: boolean; waitAfter: number }>) =>
    setModel((m) => ({
      ...m,
      segments: m.segments.map((s, i) => {
        if (i !== leg) return s;
        const next = { ...s };
        if (patch.interp) next.interp = patch.interp;
        if (patch.endTime !== undefined) next.endTime = patch.endTime;
        if (patch.waitAfter !== undefined) next.waitAfter = patch.waitAfter;
        if (patch.curved !== undefined) {
          if (patch.curved && !s.control.length) {
            const a = m.points[i];
            const b = m.points[i + 1];
            // Offset perpendicular to the chord: a control point on the chord
            // itself is the degenerate case Pedro's docs warn about.
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            next.control = [{
              x: round2(clampField((a.x + b.x) / 2 - (dy / len) * 16)),
              y: round2(clampField((a.y + b.y) / 2 + (dx / len) * 16)),
            }];
          } else if (!patch.curved) next.control = [];
        }
        return next;
      }),
    }));

  const setLeg = (leg: number, patch: Partial<{ interp: Interp; endTime: number; curved: boolean; waitAfter: number }>) => {
    remember(model); setLegRaw(leg, patch);
  };

  const setPoint = (i: number, patch: Partial<{ x: number; y: number; heading: number; name: string }>) =>
    setModel((m) => ({ ...m, points: m.points.map((p, k) => (k === i ? { ...p, ...patch } : p)) }));

  const saveDims = (w: number, l: number) => {
    setDims({ w, l });
    try { localStorage.setItem(DIMS_KEY, JSON.stringify({ w, l })); } catch { /* private mode */ }
  };

  const activePoint = sel?.kind === 'point' ? sel.i : null;
  const activeLeg = sel?.kind === 'control' ? sel.leg
    : activePoint !== null ? Math.min(activePoint, model.segments.length - 1) : 0;
  const pose = total > 0.5 ? poseAtLength(model, table, atDistance) : null;

  return (
    <div className="sim">
      <div className="sim__stage">
        <canvas
          ref={canvas}
          className="sim__canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <div className="sim__transport">
          <button type="button" className="sim__play" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range" min={0} max={1} step={0.001} value={u}
            onChange={(e) => { setPlaying(false); setU(Number(e.target.value)); }}
            aria-label="Position along path"
          />
          <span className="sim__read">
            {pose
              ? `${(u * sched.totalSeconds).toFixed(1)}s / ${sched.totalSeconds.toFixed(1)}s · ${sched.totalInches.toFixed(0)} in · x ${pose.x.toFixed(1)} · y ${pose.y.toFixed(1)} · ${((pose.heading * 180) / Math.PI).toFixed(0)}°`
              : '—'}
          </span>
        </div>
      </div>

      <div className="sim__side">
        <section className="sim__card">
          <h2>Robot</h2>
          <div className="sim__row">
            <label>Width in
              <input type="number" min={1} max={40} value={dims.w}
                onChange={(e) => saveDims(Number(e.target.value) || 1, dims.l)} />
            </label>
            <label>Length in
              <input type="number" min={1} max={40} value={dims.l}
                onChange={(e) => saveDims(dims.w, Number(e.target.value) || 1)} />
            </label>
          </div>
          <div className="sim__row">
            <label>Forward in/s
              <input type="number" min={1} max={200} value={limits.xVel}
                onChange={(e) => setLimits({ ...limits, xVel: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label>Strafe in/s
              <input type="number" min={1} max={200} value={limits.yVel}
                onChange={(e) => setLimits({ ...limits, yVel: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
          </div>
          <div className="sim__row">
            <label>Accel in/s²
              <input type="number" min={1} max={400} value={limits.maxAccel}
                onChange={(e) => setLimits({ ...limits, maxAccel: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label>Brake in/s²
              <input type="number" min={1} max={400} value={limits.maxDecel}
                onChange={(e) => setLimits({ ...limits, maxDecel: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
          </div>
          <p className="sim__hint">
            A mecanum robot strafes slower than it drives, so the two speeds are separate.
            The {sched.totalSeconds.toFixed(1)}s estimate is geometry and these limits only —
            no traction, weight or heading cost — so a real robot will be slower. Over a
            144&Prime; field most legs never reach top speed at all; acceleration is usually
            what binds.
          </p>
          <label className="sim__check">
            <input type="checkbox" checked={ghosts} onChange={(e) => setGhosts(e.target.checked)} />
            Trace the robot along the route
          </label>
          <p className="sim__hint sim__keys">
            Click the field to add a point · arrows nudge, shift for 5&Prime; ·
            delete removes · space plays · {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}Z undoes
          </p>
          <button type="button" className="sim__share" onClick={() =>
            copy('link', `${location.origin}${location.pathname}#${encodePath(model)}`)}>
            {copied === 'link' ? 'Link copied'
              : copied === 'link:failed' ? 'Copy the address bar instead'
              : 'Copy a link to this path'}
          </button>
        </section>

        <section className="sim__card">
          <h2>Waypoints</h2>
          <ol className="sim__list">
            {model.points.map((p, i) => (
              <li key={i} className={activePoint === i ? 'is-on' : ''}>
                <button type="button" onClick={() => setSel({ kind: 'point', i })}>{i + 1}</button>
                <input className="sim__name" value={p.name ?? ''} placeholder={`pose${i + 1}`}
                  onChange={(e) => setPoint(i, { name: e.target.value })} />
                <input type="number" value={p.x} step={0.5}
                  onChange={(e) => setPoint(i, { x: clampField(Number(e.target.value)) })} aria-label={`x of waypoint ${i + 1}`} />
                <input type="number" value={p.y} step={0.5}
                  onChange={(e) => setPoint(i, { y: clampField(Number(e.target.value)) })} aria-label={`y of waypoint ${i + 1}`} />
                <input type="number" value={p.heading} step={5}
                  onChange={(e) => setPoint(i, { heading: Number(e.target.value) })} aria-label={`heading of waypoint ${i + 1}`} />
                <button type="button" className="sim__del" onClick={() => removePoint(i)}
                  disabled={model.points.length <= 2} aria-label={`Delete waypoint ${i + 1}`}>×</button>
              </li>
            ))}
          </ol>
          <div className="sim__labels"><span>name</span><span>x</span><span>y</span><span>heading°</span></div>
          <button type="button" className="sim__add" onClick={addPoint}>Add waypoint</button>
        </section>

        {model.segments[activeLeg] && (
          <section className="sim__card">
            <h2>Leg {activeLeg + 1} → {activeLeg + 2}</h2>
            <div className="sim__seg">
              <label className="sim__check">
                <input type="checkbox" checked={model.segments[activeLeg].control.length > 0}
                  onChange={(e) => setLeg(activeLeg, { curved: e.target.checked })} />
                Curved (BezierCurve)
              </label>
              <select value={model.segments[activeLeg].interp}
                onChange={(e) => setLeg(activeLeg, { interp: e.target.value as Interp })}
                aria-label="Heading interpolation">
                <option value="linear">Linear heading</option>
                <option value="constant">Constant heading</option>
                <option value="tangent">Tangent heading</option>
              </select>
              <label className="sim__wait">
                Wait after this leg
                <span>
                  <input type="number" min={0} max={30} step={0.5}
                    value={model.segments[activeLeg].waitAfter ?? 0}
                    onChange={(e) => setLeg(activeLeg, { waitAfter: Math.max(0, Number(e.target.value) || 0) })} />
                  s
                </span>
              </label>
              {model.segments[activeLeg].interp === 'linear' && (
                <label className="sim__end">
                  Turn done by {model.segments[activeLeg].endTime.toFixed(2)}
                  <input type="range" min={0.1} max={1} step={0.05}
                    value={model.segments[activeLeg].endTime}
                    onChange={(e) => setLeg(activeLeg, { endTime: Number(e.target.value) })} />
                </label>
              )}
            </div>
          </section>
        )}

        <section className="sim__card">
          <h2>Obstacles</h2>
          <ol className="sim__obs">
            {obstacles.map((o, i) => (
              <li key={o.id}>
                <input value={o.name} aria-label={`Name of obstacle ${i + 1}`}
                  onChange={(e) => setObstacles(obstacles.map((q, k) => k === i ? { ...q, name: e.target.value.slice(0, 24) } : q))} />
                {(['x', 'y', 'w', 'h'] as const).map((f) => (
                  <input key={f} type="number" value={o[f]} step={2} aria-label={`${f} of obstacle ${i + 1}`}
                    onChange={(e) => setObstacles(obstacles.map((q, k) => k === i
                      ? { ...q, [f]: clampField(Number(e.target.value) || 0) } : q))} />
                ))}
                <button type="button" className="sim__del" aria-label={`Delete obstacle ${i + 1}`}
                  onClick={() => setObstacles(obstacles.filter((_, k) => k !== i))}>×</button>
              </li>
            ))}
          </ol>
          {obstacles.length > 0 && (
            <div className="sim__labels sim__labels--obs"><span>name</span><span>x</span><span>y</span><span>w</span><span>h</span></div>
          )}
          <button type="button" className="sim__add" disabled={obstacles.length >= 12}
            onClick={() => setObstacles([...obstacles, {
              id: `o${Date.now().toString(36)}`, name: `Obstacle ${obstacles.length + 1}`,
              x: 60, y: 60, w: 24, h: 24,
            }])}>Add obstacle</button>
          <p className="sim__hint">Anything the robot must not drive through. Checked against the footprint along the whole route.</p>
        </section>

        {warnings.length > 0 && (
          <section className="sim__card sim__warn">
            <h2>Checks</h2>
            <ul>
              {warnings.map((w, i) => (
                <li key={i} className={w.level === 'error' ? 'is-err' : ''}>{w.text}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="sim__card">
          <h2>Import existing Java</h2>
          <textarea
            className="sim__paste"
            value={paste}
            placeholder={'Paste a buildPaths method or a pathBuilder chain\u2026'}
            spellCheck={false}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button type="button" className="sim__share" onClick={() => {
            const res = parseJava(paste);
            setImportNote(res.note);
            if (res.model) { remember(model); setModel(res.model); setSel({ kind: 'point', i: 0 }); }
          }}>Read it onto the field</button>
          {importNote && <p className="sim__hint">{importNote}</p>}
        </section>

        <section className="sim__card">
          <div className="sim__codehead">
            <h2>Pedro Pathing code</h2>
            <button type="button" onClick={() => copy('code', java)}>
              {copied === 'code' ? 'Copied' : copied === 'code:failed' ? 'Select it manually' : 'Copy'}
            </button>
          </div>
          <pre className="sim__code"><code>{java}</code></pre>
        </section>
      </div>
    </div>
  );
}
