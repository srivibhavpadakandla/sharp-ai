/**
 * The sizing limit the CAD viewer checks against, and where it came from.
 *
 * This IS the rule: R102 of the 2026-2027 Competition Manual (V0), which is
 * published even though the game sections are not. Quoted:
 *
 *   "STARTING CONFIGURATION is limited to an 18-inch Cube. In the STARTING
 *    CONFIGURATION ... the ROBOT must be fully self-contained within an
 *    18 in. (45.70 cm) wide, by 18 in. (45.70 cm) long, by 18 in. (45.70 cm)
 *    high volume."
 *
 * Two things the geometry cannot know, so the UI says them instead of implying
 * a clean pass: pre-loaded SCORING ELEMENTS may extend outside the cube, and
 * R103 requires the ROBOT hold the configuration self-supported — a model that
 * fits only while leaning on the sizing tool is not legal.
 */
export interface Limit { x: number; y: number; z: number }

export const DEFAULT_LIMIT: Limit = { x: 18, y: 18, z: 18 };

export const LIMIT_SOURCE = {
  provisional: false,
  label: 'R102, the 18in starting cube',
  note: 'Measured against the bounding box only. Pre-loaded SCORING ELEMENTS may extend outside it, and R103 additionally requires the ROBOT to hold this configuration self-supported.',
  url: 'https://ftc-resources.firstinspires.org/ftc/game/manual',
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
