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
export type FieldMode = 'grid' | 'square' | 'square-inverted' | 'diamond';

export interface FieldOption { id: FieldMode; label: string; note: string }

export const FIELD_OPTIONS: FieldOption[] = [
  { id: 'grid', label: 'Tiles only', note: 'Six by six 24in tiles, no alliance areas.' },
  { id: 'square', label: 'Square field', note: 'Alliance walls facing each other.' },
  { id: 'square-inverted', label: 'Square, inverted', note: 'The arrangement the docs describe for DECODE.' },
  { id: 'diamond', label: 'Diamond field', note: 'Perimeter rotated to the audience.' },
];

/** Inside faces of the perimeter panels: 3580mm, per the FTC Docs measurements. */
export const INSIDE_SPAN_IN = 3580 / 25.4;
