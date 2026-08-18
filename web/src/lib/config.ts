import seedQuestions from '../../../worker/src/lib/seed-questions.json';

/** Worker origin. Overridden at build time with PUBLIC_API_BASE. */
export const API_BASE =
  (import.meta.env.PUBLIC_API_BASE as string | undefined)?.replace(/\/+$/, '')
  || 'http://127.0.0.1:8787';

/** Cloudflare's public testing site key — always passes. Replace for production. */
export const TURNSTILE_SITE_KEY =
  (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined)
  || '1x00000000000000000000AA';

export const SITE_URL =
  (import.meta.env.PUBLIC_SITE_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://sharp-ai-8a1.pages.dev';

export const SDK_VERSION = '11.2.1';

/** Indexed section count. Update with the ingest, not by editing prose. */
export const CORPUS_SECTIONS = 3039;

/**
 * When the corpus was last rebuilt. Surfaced in the footer because the index
 * is a snapshot: gm0 and ftc-docs both change during a season, nothing
 * re-ingests automatically, and a reader has no other way to tell how old an
 * answer's evidence is. Run ingest/scripts/refresh.sh and update this.
 */
export const CORPUS_UPDATED = '18 August 2026';

export const SITE_NAME = 'Sharp AI';
export const SITE_TAGLINE = 'Answers from the FTC documentation, with the source next to them.';

export const CATEGORIES = [
  { id: 'drivetrains', label: 'Drivetrains', blurb: 'Tank, mecanum, X-drive, wheels and gearing.' },
  { id: 'odometry',    label: 'Odometry',    blurb: 'Dead wheels, localization, IMUs, path following.' },
  { id: 'intakes',     label: 'Intakes',     blurb: 'Active and passive intakes, transfers, claws, turrets.' },
  { id: 'electronics', label: 'Electronics', blurb: 'Control Hub, motors, servos, sensors, wiring, power.' },
  { id: 'programming', label: 'Programming', blurb: 'OpModes, the SDK, PID control, vision, telemetry.' },
  { id: 'rules',       label: 'Rules',       blurb: 'Competition structure, inspection, awards, notebook.' },
  { id: 'errors',      label: 'Errors',      blurb: 'Stack traces, build failures and robot faults.' },
  { id: 'build',       label: 'Build & CAD', blurb: 'Structure, fasteners, manufacturing, design skills.' },
];

/** Shown before anyone has asked anything — seeds the browsable index. */
/** Shared with the seeding script so the two lists cannot drift apart. */
export const SEED_QUESTIONS: Record<string, string[]> =
  seedQuestions as Record<string, string[]>;
