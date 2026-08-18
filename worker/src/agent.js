/**
 * The agentic layer.
 *
 * Plain hybrid retrieval answers an on-target question well. It falls down on
 * questions whose words are not the documentation's words — "my lift keeps
 * falling down when I let go of the stick" is really about holding torque,
 * gravity compensation and slide friction, and none of those phrases are in the
 * question. So when the first retrieval pass looks weak, the model is brought
 * in to plan a better search and then to rerank what comes back.
 *
 * Escalation is deliberate, not automatic: a confident first pass skips both
 * extra calls. Easy questions cost one LLM call, hard ones cost three, and the
 * daily ceiling is spent where it changes the answer.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Cheap, non-streaming, JSON-only call used for planning and reranking. */
async function jsonCall(env, { system, user, schema, maxTokens = 512 }) {
  const model = env.GEMINI_FAST_MODEL || 'gemini-3.5-flash-lite';
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
        responseSchema: schema,
        // flash-lite rejects thinkingBudget outright; thinkingLevel is the
        // knob the 3.x models take. Without any thinking config it prefixes
        // the JSON with prose and the parse fails.
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
  });
  if (!res.ok) throw new Error(`plan/rerank ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  return JSON.parse(text);
}

/**
 * Should we spend two extra calls on this question?
 *
 * A first pass is "confident" when the embedding is sure, both retrievers agree
 * on several chunks, and most of the question's vocabulary is present in what
 * came back. Anything less and the search itself is the weak link.
 */
export function needsEscalation(question, stats, gate) {
  if (!gate.pass) return false;                       // refused: nothing to improve

  // The bar for skipping the agentic pass is deliberately high.
  //
  // An earlier, looser bar (cos 0.68 / overlap 3 / coverage 0.8) called
  // "our robot keeps browning out, what should we check first" confident, and
  // it had retrieved pages about design strategy. On a corpus this narrow those
  // numbers measure "this question is about FTC", not "we found the answer" —
  // almost any robot question clears them. Only a near-exact hit skips ahead.
  const confident =
    (stats.bestCosine ?? 0) >= 0.78 &&
    (stats.overlap ?? 0) >= 5 &&
    (stats.coverage ?? 0) >= 0.9;

  // Multi-part questions ("A vs B", "X and Y", two question marks) need more
  // than one search however good the scores look, because a single query can
  // only ever centre on one of the parts.
  const multipart = /\b(versus|vs\.?|compared to|difference between)\b/i.test(question)
    || (question.match(/\?/g) || []).length > 1;

  return !confident || multipart;
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    interpretation: { type: 'string' },
    queries: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
  },
  required: ['interpretation', 'queries'],
};

const PLAN_SYSTEM = `You plan documentation searches for a FIRST Tech Challenge (FTC) knowledge base.

You are given a team's question, in their own words, plus the headings that a
first naive search returned. Your job is NOT to answer. Your job is to work out
what the question is really about and write the search queries that will find it.

Rules:
- Translate symptoms into the vocabulary documentation actually uses. "My lift
  falls down when I let go" is about holding torque, gravity compensation, worm
  gears, and slide friction. "Robot drifts in auto" is about odometry error and
  localization. Write the queries in the documentation's words, not the team's.
- If the question has several parts, write one query per part.
- Each query is a short noun-phrase search string, not a sentence and not a
  question. 3 to 8 words.
- Between 1 and 4 queries. Prefer fewer if the question is simple.
- Cover different angles rather than rewording the same angle four times.
- If earlier conversation is shown, the question is probably a follow-up and
  will not stand on its own. "Why?", "what about the other one", "how do I tune
  it" only mean something in context. Resolve every pronoun and every implied
  subject from the earlier turns, and write queries that would work with no
  conversation attached.`;

export async function planSearch(env, question, firstPassHeadings, history = []) {
  const priorBlock = history.length
    ? `EARLIER IN THIS CONVERSATION\n${history.map((h, i) =>
        `Q${i + 1}: ${h.question}\nA${i + 1} (abridged): ${String(h.answer || '').slice(0, 400)}`).join('\n\n')}\n\n`
    : '';
  const user =
    priorBlock +
    `TEAM'S QUESTION\n${question}\n\n` +
    `WHAT A NAIVE SEARCH RETURNED\n${firstPassHeadings.map((h, i) => `${i + 1}. ${h}`).join('\n') || '(nothing useful)'}\n\n` +
    `Write the search queries that will actually find the answer.`;
  return jsonCall(env, { system: PLAN_SYSTEM, user, schema: PLAN_SCHEMA, maxTokens: 400 });
}

const RERANK_SCHEMA = {
  type: 'object',
  properties: {
    ranked: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 20 },
  },
  required: ['ranked'],
};

const RERANK_SYSTEM = `You rank FTC documentation sections by how well they answer a specific question.

You see each candidate's heading path and opening text. Return the numbers of the
best sections, most useful first, at most 16. Include a section if it carries
any evidence the question needs; the answer model is told to ignore sections
that do not help, so recall matters more than precision at this stage.

Judge by whether the section CONTAINS THE ANSWER, not by whether it shares words
with the question. A section titled with the question's exact words but covering
a different case is worse than a differently-titled section that actually
explains the mechanism. Drop candidates that are merely adjacent to the topic.`;

/**
 * Model-based reranking. Rank fusion is good at recall and mediocre at
 * precision — it cannot tell that "Gamepad Usage > Falling Edge Detector"
 * matched "falling" by accident. A model reading the candidates can.
 */
export async function rerank(env, question, candidates, topK = 16) {
  const listing = candidates.map((c, i) =>
    `[${i + 1}] ${c.headingPath}\n${c.text.split('\n\n').slice(1).join(' ').replace(/\s+/g, ' ').slice(0, 260)}`,
  ).join('\n\n');

  const { ranked } = await jsonCall(env, {
    system: RERANK_SYSTEM,
    user: `QUESTION\n${question}\n\nCANDIDATES\n\n${listing}`,
    schema: RERANK_SCHEMA,
    maxTokens: 200,
  });

  const seen = new Set();
  const picked = [];
  for (const n of ranked) {
    const c = candidates[n - 1];
    if (c && !seen.has(c.chunkId)) { seen.add(c.chunkId); picked.push(c); }
    if (picked.length >= topK) break;
  }
  // If the model returned nonsense, fall back to fusion order rather than
  // shipping an empty source list.
  for (const c of candidates) {
    if (picked.length >= topK) break;
    if (!seen.has(c.chunkId)) { seen.add(c.chunkId); picked.push(c); }
  }
  return picked;
}
