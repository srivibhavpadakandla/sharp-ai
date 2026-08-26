/**
 * Field elements for the speculation lab.
 *
 * The AI never produces geometry. It fills in this schema, and the geometry is
 * built from it deterministically — so a hex prism declared 4in across flats is
 * 4in across flats, and can be measured to prove it. A generated mesh could not
 * promise that, and this whole tool is worthless if a piece is not the size it
 * says it is.
 */
import { FIELD_IN } from './pedro';

export type Shape = 'box' | 'cylinder' | 'hex-prism' | 'ring' | 'cone' | 'sphere';

export interface Dims {
  /** box */ w?: number; d?: number; h?: number;
  /** cylinder, cone, sphere, ring */ diameter?: number; height?: number;
  /** hex-prism */ acrossFlats?: number;
  /** ring */ tube?: number;
}

export interface Element {
  id: string;
  name: string;
  kind: 'scoring-element' | 'field-element';
  shape: Shape;
  dims: Dims;
  colour: string;
  /** Field position in inches, origin at the audience-left corner. z is off the floor. */
  x: number; y: number; z: number;
  /** Rotation about the vertical axis, degrees. */
  rot: number;
}

/** Half-extents in inches: x across, y deep, z up. Pure geometry, no rendering. */
export function extents(el: Element): { x: number; y: number; z: number } {
  const d = el.dims;
  switch (el.shape) {
    case 'box':
      return { x: (d.w ?? 4) / 2, y: (d.d ?? 4) / 2, z: (d.h ?? 4) / 2 };
    case 'cylinder':
    case 'cone':
      return { x: (d.diameter ?? 4) / 2, y: (d.diameter ?? 4) / 2, z: (d.height ?? 4) / 2 };
    case 'sphere': {
      const r = (d.diameter ?? 4) / 2;
      return { x: r, y: r, z: r };
    }
    case 'hex-prism': {
      // Across flats is the measurement people quote; the corners stick out
      // further, and that is what has to fit through a gap.
      const af = d.acrossFlats ?? 4;
      const acrossCorners = af / Math.cos(Math.PI / 6);
      return { x: acrossCorners / 2, y: acrossCorners / 2, z: (d.height ?? 2) / 2 };
    }
    case 'ring': {
      const outer = (d.diameter ?? 6) / 2 + (d.tube ?? 1);
      return { x: outer, y: outer, z: (d.tube ?? 1) };
    }
  }
}

/** The dimension a robot has to open its grabber to, worst case. */
export function graspSpan(el: Element): number {
  const e = extents(el);
  return 2 * Math.max(e.x, e.y);
}

export interface Finding {
  level: 'fail' | 'warn' | 'ok';
  what: string;
  detail: string;
}

const R102_CUBE = 18;

/**
 * Physical checks, not taste. Every one is a measurement against a stated rule
 * or a fact about the field, so a pass means something.
 */
export function check(elements: Element[]): Finding[] {
  const out: Finding[] = [];

  for (const el of elements) {
    const e = extents(el);

    if (el.x - e.x < 0 || el.x + e.x > FIELD_IN || el.y - e.y < 0 || el.y + e.y > FIELD_IN) {
      out.push({ level: 'fail', what: el.name, detail: 'Sits partly outside the 12ft field.' });
    }
    if (el.z < 0) {
      out.push({ level: 'fail', what: el.name, detail: 'Sits below the floor.' });
    }

    if (el.kind === 'scoring-element') {
      const span = graspSpan(el);
      if (span >= R102_CUBE) {
        out.push({
          level: 'fail',
          what: el.name,
          detail: `${span.toFixed(1)}in across. A robot that could hold it could not itself start inside the ${R102_CUBE}in cube (R102).`,
        });
      } else if (span > R102_CUBE - 4) {
        out.push({
          level: 'warn',
          what: el.name,
          detail: `${span.toFixed(1)}in across leaves under 4in of robot around it inside the ${R102_CUBE}in cube. Carrying one is most of a legal robot.`,
        });
      }
      if (el.shape === 'hex-prism') {
        const af = el.dims.acrossFlats ?? 4;
        const corners = af / Math.cos(Math.PI / 6);
        if (corners - af > 1) {
          out.push({
            level: 'warn',
            what: el.name,
            detail: `Across corners is ${corners.toFixed(1)}in against ${af.toFixed(1)}in across flats. A gap sized to the flats will jam.`,
          });
        }
      }
    }
  }

  // Two solids cannot occupy the same place. Checked on footprint and height,
  // which is enough to catch a layout that could never be built.
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const a = elements[i]; const b = elements[j];
      const ea = extents(a); const eb = extents(b);
      const overlap = Math.abs(a.x - b.x) < ea.x + eb.x
        && Math.abs(a.y - b.y) < ea.y + eb.y
        && Math.abs((a.z + ea.z) - (b.z + eb.z)) < ea.z + eb.z;
      if (overlap) {
        out.push({ level: 'fail', what: `${a.name} / ${b.name}`, detail: 'These two intersect.' });
      }
    }
  }

  if (!out.length) out.push({ level: 'ok', what: 'Everything placed', detail: 'Inside the field, no intersections, all pieces carryable by a legal robot.' });
  return out;
}

export const STARTERS: Element[] = [
  { id: 'hex', name: 'Hex token', kind: 'scoring-element', shape: 'hex-prism',
    dims: { acrossFlats: 4, height: 1.5 }, colour: '#6edb9a', x: 48, y: 48, z: 0.75, rot: 0 },
  { id: 'goal', name: 'Stack post', kind: 'field-element', shape: 'cylinder',
    dims: { diameter: 3, height: 24 }, colour: '#4a90e2', x: 72, y: 96, z: 12, rot: 0 },
];
