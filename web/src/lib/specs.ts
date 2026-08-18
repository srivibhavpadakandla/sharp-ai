/**
 * The team's robot configuration.
 *
 * Generated code is only useful if it compiles against the robot in front of
 * you. Without this, every OpMode comes back with placeholder names like
 * "leftFront" that have to be hand-edited to match the configuration file —
 * which is exactly the step a rookie gets wrong.
 *
 * Stored in localStorage, never sent anywhere except alongside a question.
 * There are no accounts on this site and this does not change that.
 */

export interface RobotSpecs {
  drivetrain: string;
  motors: string;
  hub: string;
  odometry: string;
  mechanisms: string;
  notes: string;
  updatedAt?: string;
}

export const EMPTY: RobotSpecs = {
  drivetrain: '', motors: '', hub: '', odometry: '', mechanisms: '', notes: '',
};

const KEY = 'sharp-ai:robot-specs';

export function loadSpecs(): RobotSpecs {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch { return { ...EMPTY }; }
}

export function saveSpecs(s: RobotSpecs) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, updatedAt: new Date().toISOString() }));
  } catch { /* private browsing — the feature is optional */ }
}

export function hasSpecs(s: RobotSpecs) {
  return Boolean(s.drivetrain || s.motors || s.hub || s.odometry || s.mechanisms || s.notes);
}

/** Only the fields that were filled in — blanks would just be noise in a prompt. */
export function specsForPrompt(s: RobotSpecs): string | null {
  const rows: Array<[string, string]> = [
    ['Drivetrain', s.drivetrain],
    ['Motor / servo configuration names', s.motors],
    ['Control system', s.hub],
    ['Odometry', s.odometry],
    ['Other mechanisms', s.mechanisms],
    ['Notes', s.notes],
  ];
  const filled = rows.filter(([, v]) => v && v.trim());
  if (!filled.length) return null;
  return filled.map(([k, v]) => `${k}: ${v.trim()}`).join('\n').slice(0, 1200);
}

export const FIELDS: Array<{ key: keyof RobotSpecs; label: string; placeholder: string }> = [
  { key: 'drivetrain', label: 'Drivetrain',
    placeholder: 'mecanum, 4 motors, goBILDA 312 RPM' },
  { key: 'motors', label: 'Configuration names',
    placeholder: 'leftFront, leftBack, rightFront, rightBack, lift, intake' },
  { key: 'hub', label: 'Control system',
    placeholder: 'Control Hub + Expansion Hub, Driver Hub' },
  { key: 'odometry', label: 'Odometry',
    placeholder: 'two dead wheels + IMU, or goBILDA Pinpoint' },
  { key: 'mechanisms', label: 'Other mechanisms',
    placeholder: 'linear slide lift on a spool, servo claw' },
  { key: 'notes', label: 'Anything else',
    placeholder: 'motor directions, gear ratios, what is already tuned' },
];
