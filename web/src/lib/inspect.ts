/**
 * The sizing limit the CAD viewer checks against, and where it came from.
 *
 * IMPORTANT: this is NOT quoted from the 2026-27 Competition Manual. That
 * manual is indexed, but its robot sections are still placeholders until
 * kickoff on 12 September 2026 — there is no official 2026-27 sizing rule to
 * cite yet. 18 inches is the long-standing FTC sizing cube, referenced by Game
 * Manual 0, which is what the default reflects.
 *
 * After kickoff, re-ingest the manual and change `source` to the real rule.
 * Until then the UI says plainly that this is a default, not the rule, because
 * a tool that tells a team they passed inspection had better be right about
 * what it checked.
 */
export interface Limit { x: number; y: number; z: number }

export const DEFAULT_LIMIT: Limit = { x: 18, y: 18, z: 18 };

export const LIMIT_SOURCE = {
  provisional: true,
  label: 'the 18in sizing cube',
  note: 'Game Manual 0, not the 2026-27 manual — its robot rules are unpublished until kickoff on 12 September 2026.',
  url: 'https://gm0.org/en/latest/docs/common-mechanisms/transfers/transfer-types.html',
} as const;

export interface AxisCheck { axis: 'x' | 'y' | 'z'; label: string; actual: number; limit: number; over: number; pass: boolean }

/** Millimetre-ish slack: a model is not out of spec because of float noise. */
const TOLERANCE_IN = 0.02;

export function checkSize(size: { x: number; y: number; z: number }, limit: Limit): AxisCheck[] {
  const axes: Array<[AxisCheck['axis'], string]> = [['x', 'Width'], ['z', 'Depth'], ['y', 'Height']];
  return axes.map(([axis, label]) => {
    const actual = size[axis];
    const cap = limit[axis];
    const over = actual - cap;
    return { axis, label, actual, limit: cap, over, pass: over <= TOLERANCE_IN };
  });
}
