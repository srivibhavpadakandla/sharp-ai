/**
 * Maps a document path + title onto the seven browsable landing-page
 * categories. Path rules run first (they are precise); title keywords are the
 * fallback. Ordering matters — the first match wins.
 */
export const CATEGORIES = [
  { id: 'drivetrains',  label: 'Drivetrains',  blurb: 'Tank, mecanum, X-drive, swerve, wheels and gearing.' },
  { id: 'odometry',     label: 'Odometry',     blurb: 'Dead wheels, localization, IMUs and path following.' },
  { id: 'intakes',      label: 'Intakes',      blurb: 'Active and passive intakes, transfers, claws, turrets.' },
  { id: 'electronics',  label: 'Electronics',  blurb: 'Control Hub, motors, servos, sensors, wiring, power.' },
  { id: 'programming',  label: 'Programming',  blurb: 'OpModes, the SDK, PID control, vision, telemetry.' },
  { id: 'rules',        label: 'Rules',        blurb: 'Competition structure, inspection, awards, the notebook.' },
  { id: 'errors',       label: 'Errors',       blurb: 'Stack traces, build failures and robot faults.' },
  { id: 'build',        label: 'Build & CAD',  blurb: 'Structure, fasteners, manufacturing and design skills.' },
];

const PATH_RULES = [
  [/^common-mechanisms\/drivetrains/, 'drivetrains'],
  [/^common-mechanisms\/dead-wheels/, 'odometry'],
  [/^common-mechanisms\/(active-intake|passive-intake|transfers|turrets)/, 'intakes'],
  [/^common-mechanisms\//, 'build'],
  [/^power-and-electronics/, 'electronics'],
  [/^hardware-components/, 'electronics'],
  [/^software\/(concepts|adv-control-system)/, 'programming'],
  [/^software\//, 'programming'],
  [/^(awards|being-a-team|mission-statement)/, 'rules'],
  [/^(custom-manufacturing|design-skills|robot-showcase|appendix)/, 'build'],
];

const TITLE_RULES = [
  [/odometry|dead ?wheel|localiz|pose|road ?runner|pinpoint/i, 'odometry'],
  [/drivetrain|mecanum|tank drive|x-?drive|swerve|strafe/i, 'drivetrains'],
  [/intake|transfer|claw|turret|gripper/i, 'intakes'],
  [/motor|servo|sensor|wiring|battery|control hub|expansion hub|encoder|power/i, 'electronics'],
  [/opmode|java|kotlin|android studio|telemetry|pid|vision|apriltag|sdk|program/i, 'programming'],
  [/rule|inspection|award|notebook|portfolio|judg|competition|manual/i, 'rules'],
  [/error|exception|stack ?trace|troubleshoot|crash/i, 'errors'],
];

export function categorise(docPath, title = '') {
  for (const [re, id] of PATH_RULES) if (re.test(docPath)) return id;
  for (const [re, id] of TITLE_RULES) if (re.test(title)) return id;
  return 'build';
}
