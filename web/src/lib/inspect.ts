/**
 * The sizing limit the CAD viewer checks against, and where it came from.
 *
 * This IS the rule: R102 of the 2026-2027 Competition Manual (V1, the BIOBUZZ
 * manual published at kickoff). R102 survived kickoff unchanged. Quoted:
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
 *
 * The starting cube is only half the size story now; see EXPANSION_LIMIT below
 * for what the ROBOT may grow into once the MATCH starts.
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

function axisCheck(axis: AxisCheck['axis'], label: string, actual: number, cap: number): AxisCheck {
  const over = actual - cap;
  return { axis, label, actual, limit: cap, over, pass: over <= TOLERANCE_IN };
}

export function checkSize(size: { x: number; y: number; z: number }, limit: Limit): AxisCheck[] {
  const axes: Array<[AxisCheck['axis'], string]> = [['x', 'Width'], ['z', 'Depth'], ['y', 'Height']];
  return axes.map(([axis, label]) => axisCheck(axis, label, size[axis], limit[axis]));
}

/**
 * R105, which the V1 manual finally puts numbers on.
 *
 * Before kickoff this rule existed but deferred its dimensions, so the viewer
 * could only check the starting cube and a team had no way to know whether a
 * deployed mechanism was legal. Quoted: a ROBOT "must remain within a 18 in.
 * (45.70 cm) by 24 in. (61.0 cm) by 29 in. (73.65 cm) tall sizing volume when
 * fully expanded per G416".
 *
 * Two things the rule says that the numbers alone do not:
 *
 *   - The 29 in is ALWAYS the vertical dimension; the manual fixes the volume's
 *     orientation relative to the FIELD surface.
 *   - The 18 x 24 footprint is NOT axis-fixed. A ROBOT 24 in wide and 18 in
 *     deep is the same legal box turned ninety degrees. So the check sorts the
 *     two horizontal dimensions and compares them against the sorted limit —
 *     testing x against 18 and z against 24 would fail a legal ROBOT purely for
 *     how it happens to be oriented in the CAD file.
 */
export const EXPANSION_LIMIT = {
  /** The horizontal box, smaller side first. Orientation is the team's choice. */
  footprint: [18, 24],
  /** Always measured vertically from the FIELD surface. */
  height: 29,
} as const;

export const EXPANSION_SOURCE = {
  label: 'R105, the expansion limit',
  note: 'Measured when fully expanded. R105 also requires the limit be held by physical construction rather than software, and forbids deliberately detaching components; G416 penalises exceeding it during a MATCH.',
  url: 'https://ftc-resources.firstinspires.org/ftc/game/manual',
} as const;

/**
 * Check a fully-expanded bounding box against R105.
 *
 * Returns the same shape as checkSize so the viewer can render both tables
 * with one component.
 */
export function checkExpansion(size: { x: number; y: number; z: number }): AxisCheck[] {
  const [narrow, long] = [size.x, size.z].sort((a, b) => a - b);
  const [capNarrow, capLong] = EXPANSION_LIMIT.footprint;
  return [
    axisCheck('x', 'Footprint, short side', narrow, capNarrow),
    axisCheck('z', 'Footprint, long side', long, capLong),
    axisCheck('y', 'Height', size.y, EXPANSION_LIMIT.height),
  ];
}

