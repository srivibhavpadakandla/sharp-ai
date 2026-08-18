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
