/**
 * The 2026-2027 season, as the indexed manual describes it.
 *
 * Names are quoted from the manual rather than from memory: section 2 calls the
 * FIRST-wide season CANOPY, and section 1.4.1 calls the FTC game BIOBUZZ
 * presented by RTX. Whether the game has dropped is still read from the index
 * at request time rather than hard-coded to a date — the page follows the
 * corpus, so it cannot claim a game the index cannot answer questions about.
 *
 * The game was revealed at kickoff on 12 September 2026 and the V1 manual is
 * indexed, so this file no longer frames the season as pending.
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
 * How the MATCH is played, in the manual's own vocabulary (section 10.1).
 * Stated here so the page can orient a reader in two sentences without
 * reproducing FIRST's text; everything quantitative stays behind the ask flow,
 * where it comes back cited.
 */
export const GAME_SHAPE = {
  auto: '30 seconds',
  transition: '8 seconds',
  teleop: '2 minutes',
  elements: ['POLLEN', 'NECTAR'],
  summary:
    'ROBOTS collect POLLEN and NECTAR, move them to their GARDEN, place them into FLOWERS, '
    + 'and LAUNCH them into their CELLS to tip a HIVE. Each HIVE TIP releases more NECTAR into '
    + 'play, and in the last minute ALLIANCES can enter all of it. MATCHES end with ROBOTS '
    + 'claiming FLOWERS and returning to their LOADING ZONE.',
} as const;

/**
 * What is worth asking now that the game is known. Each runs through the normal
 * ask flow, so every answer is cited and checkable — the point of the page is
 * that the analysis is grounded, not that it is confident.
 *
 * These replaced the pre-kickoff set, which asked what could be inferred from a
 * manual whose game sections were still placeholders. Those questions were
 * answerable in August and are dead weight in September.
 */
export interface Angle { q: string; why: string }

export const ANGLES: Angle[] = [
  {
    q: 'How do you score points in BIOBUZZ?',
    why: 'The whole point table in one answer: what each action is worth in AUTO and in TELEOP.',
  },
  {
    q: 'What are POLLEN and NECTAR, and how do they differ?',
    why: 'There are two SCORING ELEMENTS this season. Your intake has to handle both.',
  },
  {
    q: 'How does a HIVE TIP work and what does it release?',
    why: 'It is the 20-point action and it gates how much NECTAR enters play. Start here.',
  },
  {
    q: 'What can a robot do in the 30-second autonomous period?',
    why: 'AUTO is unchanged in length but now has an 8-second transition after it. Plan both.',
  },
  {
    q: 'How much can a robot expand once the match starts?',
    why: 'R105 finally has numbers: a fixed expanded volume, held mechanically and not in software.',
  },
  {
    q: 'How does an alliance own a FLOWER, and when can it start?',
    why: 'FLOWER scoring unlocks late in the MATCH, so it is an endgame plan rather than a cycle.',
  },
  {
    q: 'What are the ranking points this season and how do you earn them?',
    why: 'Ranking is not just wins. Which RPs you chase changes what you build.',
  },
  {
    q: 'How is the BIOBUZZ manual written differently, and what is the spirit of the rule?',
    why: 'FIRST rewrote the manual around intent and referee judgement. It changes how rules are read.',
  },
];
