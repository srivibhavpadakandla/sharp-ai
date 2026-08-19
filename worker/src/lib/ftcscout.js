/**
 * FTC Scout — live team and event data.
 *
 * This is not documentation and is deliberately kept out of the indexed corpus.
 * A team's OPR changes every weekend; embedding it would bake a stale number
 * into a permanent page. It is fetched per question instead, labelled as live,
 * and never persisted with the answer.
 *
 * https://api.ftcscout.org — no key required.
 */

const BASE = 'https://api.ftcscout.org/rest/v1';

/** FTC team numbers are 1–5 digits; require a nearby word so years don't match. */
const TEAM_RE = /(?:\bteam\b|\bnumber\b|#)\s*#?\s*(\d{1,5})\b|\b(\d{4,5})\s*(?:'s|\bteam\b)/i;

export function teamNumberIn(question) {
  const m = String(question || '').match(TEAM_RE);
  if (!m) return null;
  const n = Number(m[1] || m[2]);
  return Number.isInteger(n) && n > 0 && n <= 99999 ? n : null;
}

const get = async (path, ms = 4000) => {
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: AbortSignal.timeout(ms),
      headers: { accept: 'application/json', 'user-agent': 'SharpAI (FTC docs assistant)' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;                 // live data is a bonus; never fail the answer
  }
};

/**
 * Team identity plus this season's OPR, if the API has it.
 * @returns {Promise<{team: object, stats: object|null, season: number}|null>}
 */
export async function lookupTeam(number, season) {
  const team = await get(`/teams/${number}`);
  if (!team || !team.number) return null;
  // The season rolls over mid-year; ask for the current one and fall back.
  const stats = await get(`/teams/${number}/quick-stats?season=${season}`)
    || await get(`/teams/${number}/quick-stats?season=${season - 1}`);
  return { team, stats, season };
}

/** A prompt block. Plain prose so the model treats it as facts, not JSON. */
export function describeTeam({ team, stats, season }) {
  const where = [team.city, team.state, team.country].filter(Boolean).join(', ');
  const lines = [
    `LIVE DATA from FTC Scout (https://ftcscout.org/teams/${team.number}) — not from the indexed documentation:`,
    `Team ${team.number} is "${team.name}"${where ? `, based in ${where}` : ''}.`,
  ];
  if (team.schoolName) lines.push(`Affiliated with ${team.schoolName}.`);
  if (team.rookieYear) lines.push(`Rookie year ${team.rookieYear}.`);
  if (team.sponsors?.length) lines.push(`Sponsors listed: ${team.sponsors.slice(0, 6).join(', ')}.`);
  if (stats?.tot) {
    const r = (s) => (s && s.value != null
      ? `${s.value.toFixed(1)}${s.rank ? ` (rank ${s.rank}${stats.count ? ` of ${stats.count}` : ''})` : ''}`
      : 'not available');
    lines.push(
      `For the ${stats.season ?? season} season its OPR is ${r(stats.tot)} overall, `
      + `${r(stats.auto)} autonomous, ${r(stats.dc)} driver-controlled, ${r(stats.eg)} endgame.`,
    );
  } else {
    lines.push('FTC Scout has no scoring data for this team this season.');
  }
  lines.push('These figures change as the season is played; say the season they are from.');
  return lines.join('\n');
}
