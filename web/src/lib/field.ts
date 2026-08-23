/**
 * Field backdrops for the planner.
 *
 * What is drawn here is geometry the FTC Docs state outright: the origin at the
 * centre of the field, 6x6 tiles of 24in, and the two perimeter configurations
 * — square, and diamond (the perimeter rotated 45 degrees to the audience).
 * DECODE is documented as a square field with the alliance areas inverted, so
 * that is offered as its own arrangement.
 *
 * What is NOT here is any season's tape layout. Those are not in the index, and
 * a path planner that draws last season's tape in the wrong place is worse than
 * one that draws none: somebody plans an auto against it. For a specific
 * season, drop in your own field image — it stays on your machine, and it is
 * accurate because you chose it.
 *
 * Nothing in this file is traced from FIRST's field renderings. See NOTICE.
 */
export type FieldMode = 'grid' | 'square' | 'square-inverted' | 'diamond' | 'decode';

export interface FieldOption { id: FieldMode; label: string; note: string }

export const FIELD_OPTIONS: FieldOption[] = [
  { id: 'grid', label: 'Tiles only', note: 'Six by six 24in tiles, no alliance areas.' },
  { id: 'square', label: 'Square field', note: 'Alliance walls facing each other.' },
  { id: 'square-inverted', label: 'Square, inverted', note: 'The arrangement the docs describe for DECODE.' },
  { id: 'diamond', label: 'Diamond field', note: 'Perimeter rotated to the audience.' },
  { id: 'decode', label: 'DECODE 2025-26', note: 'Tape laid out from the official FIELD Setup Guide.' },
];

/**
 * DECODE tape, in planner inches, with the audience wall at y = 0.
 *
 * Every line here is transcribed from the 2025-2026 *FIRST* Tech Challenge
 * Event FIELD Setup Guide, section 8 "Initial Tape Installation", not traced
 * from a rendering. The guide places tape against the TILE grid rather than by
 * absolute measurement, so the grid is the source of truth: columns A-F are
 * 24in tiles from x = 0, rows 1-6 are 24in tiles from y = 0 at the audience
 * side, column seams U..Z fall at x = 0, 24, 48, 72, 96, 120 and row seams
 * 0..6 at the same values in y. The centre, which the guide calls X3, is
 * therefore (72, 72).
 *
 * Where the guide gives a number it is used exactly: SPIKE MARKS and GATE ZONE
 * segments are 10in, BASE ZONES are 18in squares, and the SECRET TUNNEL lines
 * sit 16.75in from the inside of seam V or Z.
 */
export type Tape = { x1: number; y1: number; x2: number; y2: number; c: 'white' | 'red' | 'blue' };

const T = 24;                       // tile
const CENTRE = 72;                  // seam X / seam 3
const line = (x1: number, y1: number, x2: number, y2: number, c: Tape['c']): Tape => ({ x1, y1, x2, y2, c });
const box = (x: number, y: number, w: number, h: number, c: Tape['c']): Tape[] => ([
  line(x, y, x + w, y, c), line(x + w, y, x + w, y + h, c),
  line(x + w, y + h, x, y + h, c), line(x, y + h, x, y, c),
]);

export const DECODE_TAPE: Tape[] = [
  // Step 1 — back LAUNCH LINE: a V from the back corners to the centre.
  line(0, 6 * T, CENTRE, CENTRE, 'white'),
  line(6 * T, 6 * T, CENTRE, CENTRE, 'white'),
  // Step 2 — front LAUNCH LINE: an inverted V over tiles C1 and D1, apex at X1.
  line(2 * T, 0, CENTRE, T, 'white'),
  line(4 * T, 0, CENTRE, T, 'white'),
  // Step 3 — BASE ZONES: 18in squares against seams W/1 and Y/1.
  ...box(2 * T, T - 18, 18, 18, 'red'),
  ...box(4 * T - 18, T - 18, 18, 18, 'blue'),
  // Step 4 — SPIKE MARKS: 10in, centred on seam V or Z, on each row centreline.
  ...[2, 3, 4].flatMap((row) => {
    const y = (row - 1) * T + T / 2;
    return [line(T - 5, y, T + 5, y, 'white'), line(5 * T - 5, y, 5 * T + 5, y, 'white')];
  }),
  // Step 5 — GATE ZONES: 10in from seam V/Z toward the near wall, along seam 3.
  line(T - 10, CENTRE - 0.5, T, CENTRE - 0.5, 'blue'),
  line(T - 10, CENTRE + 0.5, T, CENTRE + 0.5, 'blue'),
  line(5 * T, CENTRE - 0.5, 5 * T + 10, CENTRE - 0.5, 'red'),
  line(5 * T, CENTRE + 0.5, 5 * T + 10, CENTRE + 0.5, 'red'),
  // Step 6 — LOADING ZONES: the inner edges of the audience-side corner tiles.
  line(T, 0, T, T, 'white'), line(0, T, T, T, 'white'),
  line(5 * T, 0, 5 * T, T, 'white'), line(5 * T, T, 6 * T, T, 'white'),
  // Step 7 — SECRET TUNNEL ZONES: 16.75in inside seam V/Z, seam 1 to seam 3.
  line(T - 16.75, T, T - 16.75, CENTRE, 'red'),
  line(5 * T + 16.75, T, 5 * T + 16.75, CENTRE, 'blue'),
];

/** Inside faces of the perimeter panels: 3580mm, per the FTC Docs measurements. */
export const INSIDE_SPAN_IN = 3580 / 25.4;
