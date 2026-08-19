/**
 * What kind of question is this?
 *
 * Everything used to be answered in one shape: here is what the sections say.
 * That shape is right for "what does R501 allow" and wrong for "what gear ratio
 * should I use" — the second wants judgement, with the documentation as support
 * rather than as the whole answer. Forcing the lookup shape onto an advice
 * question is what produced answers that conceded in the first line and then
 * gave the real answer somewhere underneath.
 */

const ADVICE = [
  /\b(should|would|recommend|suggest|advice|best|better|worth|prefer)\b/i,
  /\bwhich (one|should|is better)\b/i,
  /\bhow (do|would) (i|we|you) (choose|decide|pick)\b/i,
  /\b(vs\.?|versus|or)\b.*\?/i,
  /\bis it (ok|okay|fine|bad|good|worth)\b/i,
  /\bwhat.*(ratio|size|gauge|material|motor|wheel).*(for|on)\b/i,
  /\btradeoffs?\b/i,
];

const DEBUG = [
  /\b(why (does|is|won'?t|isn'?t|do)|not working|doesn'?t work|keeps? (dropping|failing|stalling|resetting|slipping))\b/i,
  /\b(browns? out|jitter|oscillat|overheat|stall|drift|skip|strip)\w*\b/i,
  /\b(fix|troubleshoot|diagnose|debug)\b/i,
];

const LOOKUP = [
  /\bwhat (goes|belongs) (in|into|on)\b/i,
  /\bwhat (does|is) (rule|r\d|g\d|i\d|a\d|e\d)\b/i,
  /\b(rule|manual|legal|allowed|permitted|inspection)\b/i,
  /\bwhat (is|are) (a|an|the)\b/i,
  /\bwhere (is|can i find)\b/i,
];

const any = (list, q) => list.some((re) => re.test(q));

/**
 * @returns {'advice'|'debug'|'lookup'} — debug wins over advice, and a rule
 * question is always a lookup no matter how it is phrased, because rule text is
 * the one place judgement is not wanted.
 */
export function intentOf(question) {
  const q = String(question || '');
  if (/\b(rule|legal|allowed|permitted|manual|inspection|penalt)\w*\b/i.test(q)) return 'lookup';
  if (any(DEBUG, q)) return 'debug';
  if (any(ADVICE, q)) return 'advice';
  if (any(LOOKUP, q)) return 'lookup';
  return 'advice';   // an open question is usually asking for judgement
}
