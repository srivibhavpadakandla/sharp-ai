/**
 * Pedro Pathing geometry and code generation.
 *
 * Coordinates follow Pedro's convention, taken from its Coordinates reference:
 * right-handed, x increases to the right, y increases up the field image, and
 * heading 0 faces +x with counter-clockwise positive. Headings are stored here
 * in DEGREES because that is what a person types; every emitted heading is
 * wrapped in Math.toRadians, because the PathBuilder reference is explicit that
 * all headings are radians.
 *
 * https://pedropathing.com/docs/pathing/reference/coordinates
 * https://pedropathing.com/docs/pathing/reference/path-builder
 */

export const FIELD_IN = 144;          // 6 x 6 tiles of 24 inches
export const TILE_IN = 24;

export interface Pt { x: number; y: number }

/** A pose the robot passes through. heading is degrees, Pedro convention. */
export interface Waypoint extends Pt {
  heading: number;
  name?: string;
}

export type Interp = 'linear' | 'constant' | 'tangent';

/**
 * The leg between waypoint i and i+1. `control` holds the INTERIOR control
 * points only: none is a BezierLine, one or two make a BezierCurve.
 */
export interface Segment {
  control: Pt[];
  interp: Interp;
  /** Fraction of the leg by which a linear turn should be finished. */
  endTime: number;
  /** Seconds to hold position after this leg, if any. */
  waitAfter?: number;
}

export interface PathModel {
  points: Waypoint[];
  segments: Segment[];
}

export const clampField = (v: number) => Math.max(0, Math.min(FIELD_IN, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Control points of a leg, endpoints included — what the Bezier is built from. */
export function legPoints(m: PathModel, i: number): Pt[] {
  return [m.points[i], ...m.segments[i].control, m.points[i + 1]];
}

/** de Casteljau, so any control-point count works with one implementation. */
export function bezierAt(pts: Pt[], t: number): Pt {
  let cur = pts;
  while (cur.length > 1) {
    const next: Pt[] = [];
    for (let i = 0; i < cur.length - 1; i += 1) {
      next.push({
        x: cur[i].x + (cur[i + 1].x - cur[i].x) * t,
        y: cur[i].y + (cur[i + 1].y - cur[i].y) * t,
      });
    }
    cur = next;
  }
  return cur[0];
}

/** Derivative, used for tangent heading. Degenerate legs return a zero vector. */
export function bezierTangent(pts: Pt[], t: number): Pt {
  const n = pts.length - 1;
  if (n < 1) return { x: 0, y: 0 };
  const d: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    d.push({ x: n * (pts[i + 1].x - pts[i].x), y: n * (pts[i + 1].y - pts[i].y) });
  }
  return bezierAt(d, t);
}

export interface SamplePoint { leg: number; t: number; p: Pt; s: number }

/**
 * Arc-length table over the whole chain.
 *
 * Bezier parameter t is not proportional to distance, so animating on raw t
 * makes the robot lurch through curves. Every lookup goes through cumulative
 * length instead.
 */
export function sampleChain(m: PathModel, perLeg = 120): { table: SamplePoint[]; total: number } {
  const table: SamplePoint[] = [];
  let s = 0;
  let prev: Pt | null = null;
  for (let leg = 0; leg < m.segments.length; leg += 1) {
    const pts = legPoints(m, leg);
    for (let k = 0; k <= perLeg; k += 1) {
      const t = k / perLeg;
      const p = bezierAt(pts, t);
      if (prev) s += Math.hypot(p.x - prev.x, p.y - prev.y);
      table.push({ leg, t, p, s });
      prev = p;
    }
  }
  return { table, total: s };
}

const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** Shortest signed turn from a to b, matching how a follower picks its direction. */
export function shortestDelta(a: number, b: number): number {
  let d = norm(b) - norm(a);
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export interface Pose { x: number; y: number; heading: number }   // heading radians

/** Pose at a distance along the chain. */
export function poseAtLength(m: PathModel, table: SamplePoint[], target: number): Pose {
  if (!table.length) return { x: 0, y: 0, heading: 0 };
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table[mid].s < target) lo = mid + 1; else hi = mid;
  }
  const at = table[lo];
  const seg = m.segments[at.leg];
  const a = (m.points[at.leg].heading * Math.PI) / 180;
  const b = (m.points[at.leg + 1].heading * Math.PI) / 180;

  let heading: number;
  if (seg.interp === 'constant') {
    heading = a;
  } else if (seg.interp === 'tangent') {
    const d = bezierTangent(legPoints(m, at.leg), at.t);
    heading = Math.hypot(d.x, d.y) < 1e-9 ? a : Math.atan2(d.y, d.x);
  } else {
    // Finish the turn by endTime, then hold — the behaviour the endTime
    // parameter describes in the interpolation reference.
    const k = seg.endTime > 0 ? Math.min(1, at.t / seg.endTime) : 1;
    heading = a + shortestDelta(a, b) * k;
  }
  return { x: at.p.x, y: at.p.y, heading };
}

/** Footprint corners of a robot centred at pose, for drawing and bounds checks. */
export function robotCorners(p: Pose, widthIn: number, lengthIn: number): Pt[] {
  const c = Math.cos(p.heading);
  const s = Math.sin(p.heading);
  const hl = lengthIn / 2;
  const hw = widthIn / 2;
  // Length runs along the heading axis, width across it.
  return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => ({
    x: p.x + u * c - v * s,
    y: p.y + u * s + v * c,
  }));
}

export interface Warning { level: 'error' | 'warn'; text: string }

/**
 * Checks drawn from Pedro's own Bezier Curves page: repeated control points and
 * collinear points given out of order both produce degenerate paths it cannot
 * follow, and three or more interior control points are discouraged outright.
 */
export function validate(m: PathModel, widthIn: number, lengthIn: number): Warning[] {
  const out: Warning[] = [];
  const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;

  m.points.forEach((p, i) => {
    if (p.x < 0 || p.x > FIELD_IN || p.y < 0 || p.y > FIELD_IN) {
      out.push({ level: 'error', text: `Waypoint ${i + 1} is outside the field.` });
    }
  });

  m.segments.forEach((seg, i) => {
    const pts = legPoints(m, i);
    if (seg.control.length >= 3) {
      out.push({ level: 'warn', text: `Leg ${i + 1} has ${seg.control.length} control points. Pedro's docs advise against three or more.` });
    }
    for (let a = 0; a < pts.length; a += 1) {
      for (let b = a + 1; b < pts.length; b += 1) {
        if (near(pts[a], pts[b])) {
          out.push({ level: 'error', text: `Leg ${i + 1} repeats a control point, which makes the path degenerate.` });
          a = pts.length; break;
        }
      }
    }
    // A control point that sits on the start-end line but outside the span is
    // the "(10,10), (0,0), (20,20)" case the docs call out by name.
    if (seg.control.length === 1) {
      const [s0, c0, e0] = pts;
      const cross = (e0.x - s0.x) * (c0.y - s0.y) - (e0.y - s0.y) * (c0.x - s0.x);
      const len = Math.hypot(e0.x - s0.x, e0.y - s0.y);
      if (len > 1 && Math.abs(cross) / len < 0.75) {
        const dot = ((c0.x - s0.x) * (e0.x - s0.x) + (c0.y - s0.y) * (e0.y - s0.y)) / (len * len);
        if (dot < 0 || dot > 1) {
          out.push({ level: 'error', text: `Leg ${i + 1} has a collinear control point outside the segment. Pedro calls this degenerate.` });
        }
      }
    }
  });

  const { table } = sampleChain(m, 40);
  const off = table.some((sp) => {
    const pose = poseAtLength(m, table, sp.s);
    return robotCorners(pose, widthIn, lengthIn)
      .some((c) => c.x < 0 || c.x > FIELD_IN || c.y < 0 || c.y > FIELD_IN);
  });
  if (off) out.push({ level: 'warn', text: 'The robot footprint leaves the field somewhere along this path.' });

  return out;
}

const ident = (w: Waypoint, i: number) =>
  (w.name && /^[a-zA-Z_$][\w$]*$/.test(w.name) ? w.name : `pose${i + 1}`);

/** Pedro Pathing source for the chain. Headings are emitted as degrees-to-radians. */
export function generateJava(m: PathModel, className = 'GeneratedPath'): string {
  const names = m.points.map(ident);
  const poses = m.points
    .map((p, i) => `    private final Pose ${names[i]} = new Pose(${round2(p.x)}, ${round2(p.y)}, Math.toRadians(${round2(p.heading)}));`)
    .join('\n');

  const legs = m.segments.map((seg, i) => {
    const a = names[i];
    const b = names[i + 1];
    const geom = seg.control.length === 0
      ? `new BezierLine(${a}, ${b})`
      : `new BezierCurve(${a}, ${seg.control.map((c) => `new Pose(${round2(c.x)}, ${round2(c.y)})`).join(', ')}, ${b})`;
    let interp: string;
    if (seg.interp === 'constant') {
      interp = `.setConstantHeadingInterpolation(${a}.getHeading())`;
    } else if (seg.interp === 'tangent') {
      interp = '.setTangentHeadingInterpolation()';
    } else {
      interp = seg.endTime < 1
        ? `.setLinearHeadingInterpolation(${a}.getHeading(), ${b}.getHeading(), ${round2(seg.endTime)})`
        : `.setLinearHeadingInterpolation(${a}.getHeading(), ${b}.getHeading())`;
    }
    return `                .addPath(${geom})\n                ${interp}`;
  }).join('\n');

  return `package org.firstinspires.ftc.teamcode.pedroPathing;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;

@Autonomous(name = "${className}")
public class ${className} extends OpMode {

    private Follower follower;
    private PathChain path;

${poses}

    @Override
    public void init() {
        follower = Constants.createFollower(hardwareMap);
        follower.setStartingPose(${names[0]});
        path = follower.pathBuilder()
${legs}
                .build();
    }

    @Override
    public void start() {
        follower.followPath(path);
    }

    @Override
    public void loop() {
        follower.update();
        // isBusy() goes false once the follower has finished correcting.
        if (!follower.isBusy()) {
            telemetry.addLine("Path complete");
        }
        telemetry.addData("x", follower.getPose().getX());
        telemetry.addData("y", follower.getPose().getY());
        telemetry.addData("heading (deg)", Math.toDegrees(follower.getPose().getHeading()));
        telemetry.update();
    }
}
`;
}

/** A short, sane starting path so the page is never a blank grid. */
export function starterPath(): PathModel {
  return {
    points: [
      { x: 9, y: 60, heading: 0, name: 'startPose' },
      { x: 60, y: 84, heading: 90, name: 'scorePose' },
      { x: 108, y: 60, heading: 0, name: 'pickupPose' },
    ],
    segments: [
      { control: [], interp: 'linear', endTime: 0.8 },
      { control: [{ x: 84, y: 96 }], interp: 'linear', endTime: 0.8 },
    ],
  };
}

/* --- Sharing ------------------------------------------------------------- */

const INTERP_CODE: Record<Interp, string> = { linear: 'l', constant: 'c', tangent: 't' };
const CODE_INTERP: Record<string, Interp> = { l: 'linear', c: 'constant', t: 'tangent' };
const MAX_POINTS = 24;

/**
 * A path as a URL fragment, so a route can be sent to a teammate.
 *
 * Deliberately a compact readable format rather than base64 JSON: these get
 * pasted into Discord, and a legible string survives that better than an opaque
 * blob. Lives in the hash, so paths never reach the server or the query log.
 */
export function encodePath(m: PathModel): string {
  const pts = m.points
    .map((p) => [round2(p.x), round2(p.y), round2(p.heading), p.name || ''].join(','))
    .join('_');
  const segs = m.segments
    .map((s) => [
      INTERP_CODE[s.interp],
      round2(s.endTime),
      ...s.control.flatMap((c) => [round2(c.x), round2(c.y)]),
    ].join(','))
    .join('_');
  return `p=${pts}&s=${segs}`;
}

const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Parse a shared path. Every value is bounded: this is untrusted input from a
 * URL somebody else wrote, and it drives a render loop.
 */
export function decodePath(hash: string): PathModel | null {
  try {
    const q = new URLSearchParams(hash.replace(/^#/, ''));
    const rawP = q.get('p');
    const rawS = q.get('s');
    if (!rawP) return null;

    const points: Waypoint[] = rawP.split('_').slice(0, MAX_POINTS).map((row) => {
      const [x, y, h, name] = row.split(',');
      return {
        x: clampField(num(x)),
        y: clampField(num(y)),
        heading: Math.max(-3600, Math.min(3600, num(h))),
        name: name && /^[a-zA-Z_$][\w$]{0,31}$/.test(name) ? name : undefined,
      };
    });
    if (points.length < 2) return null;

    const rows = (rawS || '').split('_');
    const segments: Segment[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const parts = (rows[i] || '').split(',');
      const control: Pt[] = [];
      // Only whole coordinate pairs, and never more than Pedro will follow.
      for (let k = 2; k + 1 < parts.length && control.length < 2; k += 2) {
        control.push({ x: clampField(num(parts[k])), y: clampField(num(parts[k + 1])) });
      }
      segments.push({
        interp: CODE_INTERP[parts[0]] || 'linear',
        endTime: Math.min(1, Math.max(0.1, num(parts[1], 0.8))),
        control,
      });
    }
    return { points, segments };
  } catch {
    return null;
  }
}

/* --- Importing existing Java --------------------------------------------- */

const NUM = String.raw`[-+]?\d*\.?\d+`;
/* A heading argument is either Math.toRadians(n) or a bare number. Matching it
   with [^)]* fails: the class stops at the inner paren of toRadians, so the
   captured text lost its ")" and every imported heading silently became 0. */
const ANGLE = String.raw`(?:Math\.toRadians\s*\(\s*${NUM}\s*\)|${NUM})`;

/** `Math.toRadians(90)` -> 90 degrees; a bare number is treated as radians. */
function angleToDegrees(raw: string): number {
  const rad = raw.match(new RegExp(String.raw`Math\.toRadians\(\s*(${NUM})\s*\)`));
  if (rad) return Number(rad[1]);
  const bare = Number(raw.trim());
  return Number.isFinite(bare) ? (bare * 180) / Math.PI : 0;
}

export interface ImportResult {
  model: PathModel | null;
  note: string;
}

/**
 * Read a PathChain back out of Java.
 *
 * Teams already have autos written; being able to see an existing one on the
 * field is more useful than only ever generating new code. This reads the
 * shapes Pedro's own examples use — named Pose constants, BezierLine and
 * BezierCurve in a pathBuilder chain — and reports plainly when it cannot,
 * rather than silently producing a path that is not the one in the file.
 */
export function parseJava(src: string): ImportResult {
  if (!src.trim()) return { model: null, note: 'Paste some Java to import.' };

  // Named poses: `Pose scorePose = new Pose(60, 84, Math.toRadians(90));`
  const poses = new Map<string, Waypoint>();
  const poseRe = new RegExp(
    String.raw`(\w+)\s*=\s*new\s+Pose\s*\(\s*(${NUM})\s*,\s*(${NUM})\s*(?:,\s*(${ANGLE}))?\s*\)`, 'g');
  for (const m of src.matchAll(poseRe)) {
    poses.set(m[1], {
      x: clampField(Number(m[2])),
      y: clampField(Number(m[3])),
      heading: m[4] ? angleToDegrees(m[4]) : 0,
      name: m[1],
    });
  }

  // Legs, in source order, with whatever interpolation call follows each.
  const legRe = new RegExp(
    String.raw`\.addPath\s*\(\s*new\s+(BezierLine|BezierCurve)\s*\(([\s\S]*?)\)\s*\)([\s\S]*?)(?=\.addPath|\.build|$)`, 'g');

  const points: Waypoint[] = [];
  const segments: Segment[] = [];
  let unresolved = 0;

  const resolve = (token: string): Waypoint | null => {
    const t = token.trim();
    const named = poses.get(t);
    if (named) return { ...named };
    const inline = t.match(new RegExp(String.raw`^new\s+Pose\s*\(\s*(${NUM})\s*,\s*(${NUM})\s*(?:,\s*(${ANGLE}))?\s*\)$`));
    if (inline) {
      return {
        x: clampField(Number(inline[1])),
        y: clampField(Number(inline[2])),
        heading: inline[3] ? angleToDegrees(inline[3]) : 0,
      };
    }
    return null;
  };

  for (const m of src.matchAll(legRe)) {
    const kind = m[1];
    // Split the constructor arguments on top-level commas only, so a nested
    // `new Pose(84, 96)` stays in one piece.
    const args: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of m[2]) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
      cur += ch;
    }
    args.push(cur);
    if (args.length < 2) continue;

    const start = resolve(args[0]);
    const end = resolve(args[args.length - 1]);
    if (!start || !end) { unresolved += 1; continue; }

    const control: Pt[] = [];
    if (kind === 'BezierCurve') {
      for (const a of args.slice(1, -1)) {
        const c = resolve(a);
        if (c && control.length < 2) control.push({ x: c.x, y: c.y });
      }
    }

    const tail = m[3] || '';
    let interp: Interp = 'linear';
    let endTime = 1;
    if (/setConstantHeadingInterpolation/.test(tail)) interp = 'constant';
    else if (/setTangentHeadingInterpolation/.test(tail)) interp = 'tangent';
    else {
      const lin = tail.match(/setLinearHeadingInterpolation\s*\(([\s\S]*?)\)\s*(?:;|\.|$)/);
      if (lin) {
        const parts = lin[1].split(',');
        if (parts.length >= 3) {
          const t = Number(parts[parts.length - 1]);
          if (Number.isFinite(t)) endTime = Math.min(1, Math.max(0.1, t));
        }
      }
    }

    // Chain them: the end of one leg is the start of the next.
    if (!points.length) points.push(start);
    else {
      const last = points[points.length - 1];
      if (Math.hypot(last.x - start.x, last.y - start.y) > 0.5) points.push(start);
    }
    points.push(end);
    segments.push({ control, interp, endTime });
  }

  if (points.length < 2) {
    return {
      model: null,
      note: poses.size
        ? 'Found Pose declarations but no .addPath chain to read.'
        : 'No pathBuilder chain found. Paste the buildPaths method or the chain itself.',
    };
  }
  // A leg per gap, or the model is inconsistent.
  while (segments.length > points.length - 1) segments.pop();
  while (segments.length < points.length - 1) segments.push({ control: [], interp: 'linear', endTime: 1 });

  const note = unresolved
    ? `Imported ${segments.length} legs. Skipped ${unresolved} that referenced a pose defined elsewhere.`
    : `Imported ${segments.length} legs.`;
  return { model: { points, segments }, note };
}

/* --- Timing and obstacles ------------------------------------------------ */

export interface Limits {
  /** in/s */ maxVel: number;
  /** in/s^2 */ maxAccel: number;
}

export const DEFAULT_LIMITS: Limits = { maxVel: 52, maxAccel: 55 };

/**
 * Time to cover a distance from a standstill back to a standstill, under a
 * trapezoidal velocity profile: accelerate, hold, decelerate. If the run is too
 * short to reach cruising speed the profile is a triangle instead.
 *
 * This is an estimate and nothing more. It does not model curvature, heading
 * changes, weight, or how much traction the wheels actually have, so a real
 * robot will be slower.
 */
export function runTime(distance: number, { maxVel, maxAccel }: Limits): number {
  const d = Math.max(0, distance);
  if (d < 1e-6 || maxVel <= 0 || maxAccel <= 0) return 0;
  const rampDistance = (maxVel * maxVel) / (2 * maxAccel);
  if (2 * rampDistance >= d) return 2 * Math.sqrt(d / maxAccel);   // never reaches maxVel
  return (2 * maxVel) / maxAccel + (d - 2 * rampDistance) / maxVel;
}

export interface Leg { index: number; length: number; seconds: number; waitAfter: number }
export interface Schedule {
  legs: Leg[];
  /** Seconds spent moving. */ driveSeconds: number;
  /** Seconds spent waiting. */ waitSeconds: number;
  totalSeconds: number;
  totalInches: number;
}

/**
 * Per-leg lengths and a duration for the chain.
 *
 * A wait brings the robot to a stop, so the legs between two waits are treated
 * as one continuous run with a single accelerate/decelerate profile rather than
 * as separate stop-start hops.
 */
export function schedule(m: PathModel, limits: Limits): Schedule {
  const legs: Leg[] = [];
  for (let i = 0; i < m.segments.length; i += 1) {
    const pts = legPoints(m, i);
    let len = 0;
    let prev = bezierAt(pts, 0);
    for (let k = 1; k <= 120; k += 1) {
      const q = bezierAt(pts, k / 120);
      len += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
    legs.push({ index: i, length: len, seconds: 0, waitAfter: m.segments[i].waitAfter || 0 });
  }

  // Group into runs delimited by waits, time each run, then split that time
  // back across its legs in proportion to length.
  let driveSeconds = 0;
  let run: Leg[] = [];
  const closeRun = () => {
    if (!run.length) return;
    const dist = run.reduce((n, l) => n + l.length, 0);
    const t = runTime(dist, limits);
    for (const l of run) l.seconds = dist > 0 ? t * (l.length / dist) : 0;
    driveSeconds += t;
    run = [];
  };
  for (const l of legs) {
    run.push(l);
    if (l.waitAfter > 0) closeRun();
  }
  closeRun();

  const waitSeconds = legs.reduce((n, l) => n + l.waitAfter, 0);
  const totalInches = legs.reduce((n, l) => n + l.length, 0);
  return {
    legs,
    driveSeconds,
    waitSeconds,
    totalSeconds: driveSeconds + waitSeconds,
    totalInches,
  };
}

export interface Obstacle { id: string; name: string; x: number; y: number; w: number; h: number }

/** Axis-aligned overlap test between the robot footprint and an obstacle. */
export function hitsObstacle(corners: Pt[], o: Obstacle): boolean {
  // Separating-axis test on the obstacle's axes and the robot's two edge axes.
  const rect: Pt[] = [
    { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y },
    { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h },
  ];
  const axes: Pt[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < 2; i += 1) {
    const e = { x: corners[i + 1].x - corners[i].x, y: corners[i + 1].y - corners[i].y };
    const len = Math.hypot(e.x, e.y) || 1;
    axes.push({ x: -e.y / len, y: e.x / len });
  }
  for (const a of axes) {
    const proj = (pts: Pt[]) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const q of pts) {
        const v = q.x * a.x + q.y * a.y;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return [lo, hi];
    };
    const [aLo, aHi] = proj(corners);
    const [bLo, bHi] = proj(rect);
    if (aHi < bLo || bHi < aLo) return false;   // gap on this axis, no overlap
  }
  return true;
}

/** How far along the chain the robot is at a given time, holding still through waits. */
export function distanceAtTime(sch: Schedule, t: number): number {
  let time = 0;
  let dist = 0;
  for (const l of sch.legs) {
    if (t <= time + l.seconds) {
      const f = l.seconds > 0 ? (t - time) / l.seconds : 0;
      return dist + l.length * f;
    }
    time += l.seconds;
    dist += l.length;
    if (l.waitAfter > 0) {
      if (t <= time + l.waitAfter) return dist;   // parked
      time += l.waitAfter;
    }
  }
  return dist;
}
