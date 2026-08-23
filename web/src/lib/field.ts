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
export type FieldMode = 'grid' | 'square' | 'square-inverted' | 'diamond'
  | 'decode' | 'centerstage' | 'freight' | 'ultimate';

export interface FieldOption { id: FieldMode; label: string; note: string }

export const FIELD_OPTIONS: FieldOption[] = [
  { id: 'grid', label: 'Tiles only', note: 'Six by six 24in tiles, no alliance areas.' },
  { id: 'square', label: 'Square field', note: 'Alliance walls facing each other.' },
  { id: 'square-inverted', label: 'Square, inverted', note: 'The arrangement the docs describe for DECODE.' },
  { id: 'diamond', label: 'Diamond field', note: 'Perimeter rotated to the audience.' },
  { id: 'decode', label: 'DECODE 2025-26', note: 'Full tape layout, from the official FIELD Setup Guide.' },
  { id: 'centerstage', label: 'CENTERSTAGE 2023-24', note: 'Wings and pixel stack locators. Backstage needs the truss position.' },
  { id: 'freight', label: 'Freight Frenzy 2021-22', note: 'Barcodes and alliance hub markers, at the measured offsets.' },
  { id: 'ultimate', label: 'Ultimate Goal 2020-21', note: 'Launch line and starter stacks.' },
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

/**
 * Earlier seasons, from their own Field Setup Guides.
 *
 * These are partial and the picker says so. Each guide describes some tape
 * against the tile grid or with a stated measurement — those are transcribed
 * exactly — and some relative to field elements whose positions the text never
 * gives (CENTERSTAGE's Backstage runs "along the edge of the tiles closest to
 * the Backdrop", and the Backdrop's own placement is in a figure). Those lines
 * are left out rather than estimated: a planner that draws tape in roughly the
 * right place is the failure mode worth avoiding.
 *
 * Viewed from the audience at y = 0, blue is on the left, as the guides state.
 */
const sq = (cx: number, cy: number, side: number, c: Tape['c']): Tape[] =>
  box(cx - side / 2, cy - side / 2, side, side, c);

/** 2020-2021, Ultimate Goal. Launch line 80in from the audience wall. */
export const ULTIMATE_TAPE: Tape[] = [
  line(0, 80, 6 * T, 80, 'white'),
  // Starter stacks: front edge of the tile, 3rd row back, 2nd column in.
  ...sq(36, 2 * T, 2, 'blue'),
  ...sq(6 * T - 36, 2 * T, 2, 'red'),
];

/** 2021-2022, Freight Frenzy. */
export const FREIGHT_TAPE: Tape[] = [
  // Alliance hub markers: over the 2nd tile seam in, centred on the 3rd tile.
  ...sq(2 * T, 2.5 * T, 2, 'blue'),
  ...sq(4 * T, 2.5 * T, 2, 'red'),
  // Barcodes: closest edge 34.25in from the alliance-wall tile edge; sets at
  // 25.75in and 73in from the near wall; squares 8.38in apart.
  ...[25.75, 73].flatMap((y0) => [0, 8.38, 16.76].flatMap((dy) => [
    ...sq(34.25 + 1, y0 + dy + 1, 2, 'blue'),
    ...sq(6 * T - 34.25 - 1, y0 + dy + 1, 2, 'red'),
  ])),
];

/** 2023-2024, CENTERSTAGE. */
export const CENTERSTAGE_TAPE: Tape[] = [
  // Wings: corner diagonals touching one tile, on the side opposite each
  // Backdrop. The blue Wing sits in the corner opposite the blue Backdrop.
  line(0, T, T, 0, 'blue'),
  line(6 * T - T, 0, 6 * T, T, 'red'),
  // Pixel stack locators: six 6in white lines against the far wall, set 11in
  // either side of the seam between tiles D and E, plus one on the seam.
  ...[4 * T, 4 * T - 11 - 6, 4 * T + 11].flatMap((x) => [
    line(x, 6 * T, x + 6, 6 * T, 'white'),
    line(6 * T - x - 6, 6 * T, 6 * T - x, 6 * T, 'white'),
  ]),
];

export const SEASON_TAPE: Partial<Record<FieldMode, Tape[]>> = {
  decode: DECODE_TAPE,
  centerstage: CENTERSTAGE_TAPE,
  freight: FREIGHT_TAPE,
  ultimate: ULTIMATE_TAPE,
};
