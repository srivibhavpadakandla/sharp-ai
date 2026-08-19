/**
 * Is this question about FTC robotics, small talk, or something else entirely?
 *
 * The old test was `cosine >= 0.5 AND a vocabulary hit`, which failed both
 * ways: "hello" and "what can you do" were shown an off-topic refusal, and a
 * real robotics question phrased in unusual words was refused because the
 * retrieval score happened to be weak.
 *
 * Now it scores. Terms that only ever appear in this domain decide on their
 * own; generic engineering words need company; and a decent embedding score
 * can carry a question that used none of the vocabulary.
 */

/** Words that essentially cannot appear in a non-FTC question. */
const STRONG = [
  'ftc', 'first tech', 'mecanum', 'odometry', 'dead ?wheel', 'opmode', 'teleop',
  'hardwaremap', 'control hub', 'expansion hub', 'driver station', 'gobilda',
  'andymark', 'road ?runner', 'roadrunner', 'pedro ?path', 'ftclib', 'apriltag',
  'limelight', 'pinpoint', 'swerve', 'strafe', 'linear slide', 'game manual',
  'scrimmage', 'pidf', 'feedforward', 'dcmotor', 'servo', 'encoder', 'imu',
  'auton', 'autonomous', 'telemetry', 'game ?piece', 'game ?element', 'drivetrain', 'gear ?ratio', 'sprocket',
  'turret', 'outtake', 'localiz', 'trajectory', 'kinematics', 'robotics',
  'robot', 'alliance', 'ftc ?dashboard', 'rev ?hub', 'spark ?mini',
];

/** Words that are on-topic in this context but ordinary on their own. */
const WEAK = [
  'motor', 'wheel', 'chassis', 'gear', 'belt', 'chain', 'bearing', 'shaft',
  'torque', 'rpm', 'battery', 'wiring', 'sensor', 'gyro', 'vision', 'camera',
  'intake', 'claw', 'arm', 'lift', 'linkage', 'slide', 'tune', 'tuning',
  'pid', 'sdk', 'java', 'code', 'program', 'build', 'cad', 'field', 'match',
  'team', 'competition', 'inspection', 'notebook', 'judging', 'award', 'drive',
  'spline', 'path', 'pose', 'heading', 'tick', 'ramp', 'stall', 'brownout',
  'auto', 'preload', 'park', 'cycle', 'score', 'strafing', 'gamepad',
];

/** Small talk and questions about the site itself. */
const META = [
  /^\s*(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/i,
  /\bwhat (can|do) you (do|know)\b/i,
  /\bwho (made|built|created) (you|this)\b/i,
  /\bwhat (are|is) (you|this)( site| tool)?\b/i,
  /\bhow (do|does) (you|this) work\b/i,
  /\b(help|start|get started)\s*$/i,
  /\bare you (an? )?(ai|bot|human)\b/i,
];

const build = (list) => new RegExp('\\b(' + list.join('|') + ')', 'gi');
const STRONG_RE = build(STRONG);
const WEAK_RE = build(WEAK);

const count = (re, s) => {
  re.lastIndex = 0;
  return new Set((s.match(re) || []).map((m) => m.toLowerCase())).size;
};

/**
 * @returns {{ kind: 'meta'|'ftc'|'off', strong: number, weak: number }}
 */
export function classify(question, bestCosine = 0) {
  const q = String(question || '');
  if (META.some((re) => re.test(q))) return { kind: 'meta', strong: 0, weak: 0 };

  const strong = count(STRONG_RE, q);
  const weak = count(WEAK_RE, q);
  const cos = Number(bestCosine) || 0;

  // One unambiguous term is enough on its own.
  if (strong >= 1) return { kind: 'ftc', strong, weak };
  // Several ordinary engineering words together are a robotics question.
  if (weak >= 2) return { kind: 'ftc', strong, weak };
  // One ordinary word, but the embedding recognised the neighbourhood.
  if (weak >= 1 && cos >= 0.42) return { kind: 'ftc', strong, weak };
  // No vocabulary at all, but the embedding is confident.
  if (cos >= 0.62) return { kind: 'ftc', strong, weak };
  return { kind: 'off', strong, weak };
}
