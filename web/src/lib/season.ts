/**
 * The 2026-2027 season, as the indexed manual describes it.
 *
 * Names are quoted from the manual rather than from memory: section 2 calls the
 * FIRST-wide season CANOPY, and section 1.4.1 calls the FTC game BIOBUZZ
 * presented by RTX. No kickoff date is asserted — the manual does not carry one
 * in the indexed sections, and a countdown to a date nobody sourced is worse
 * than no countdown. Whether the game has dropped is read from the index at
 * request time instead.
 */
export const SEASON = {
  first: 'FIRST CANOPY',
  game: 'BIOBUZZ',
  presentedBy: 'RTX',
  years: '2026-2027',
  theme: 'Nature, biodiversity and the systems that keep a planet thriving.',
  link: 'https://www.firstinspires.org/first-canopy',
} as const;

/**
 * What is worth asking before the game is known. Each runs through the normal
 * ask flow, so every answer is cited and checkable — the point of the page is
 * that the analysis is grounded, not that it is confident.
 */
export interface Angle { q: string; why: string }

export const ANGLES: Angle[] = [
  {
    q: 'What robot construction rules are already published for the 2026-2027 season?',
    why: 'Section 12 is published while the game is not. These constrain your design today.',
  },
  {
    q: 'What does R102 require for the starting configuration?',
    why: 'The 18in cube is fixed regardless of what the game turns out to be.',
  },
  {
    q: 'What motors and actuators are legal this season?',
    why: 'Motor and servo limits decide your mechanism count before you know what to build.',
  },
  {
    q: 'How does advancement and ranking work this season?',
    why: 'Advancement points are published, and they shape whether you optimise for awards or play.',
  },
  {
    q: 'What is judged for the Control Award and the Innovate Award?',
    why: 'Both are published now, and both reward work you should be starting before kickoff.',
  },
  {
    q: 'What has FIRST said is changing about competition integrity this season?',
    why: 'Section 1.4.1 flags changes to game and field design. It is the closest thing to a hint.',
  },
  {
    q: 'What should an FTC team build or practise before the game is revealed?',
    why: 'Drivetrain, odometry and autonomous transfer between seasons. This is where to spend August.',
  },
];
