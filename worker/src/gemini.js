/**
 * Prompt assembly and streaming for the Gemini free tier.
 *
 * The licensing rule is enforced HERE, on the server, before a prompt exists —
 * not in the frontend. A chunk with can_excerpt = 0 contributes its citation
 * metadata and nothing else; its body text never enters the request.
 */

const SYSTEM_PROMPT = `You are Sharp AI, a documentation assistant for the FIRST Tech Challenge (FTC).

Rules you must follow without exception:

1. Answer ONLY from the numbered SECTIONS provided in the user message. They are
   the entire world of facts available to you. Your own prior knowledge of FTC,
   robotics, part catalogues or rules is not admissible evidence.
2. Say where things come from in the prose, by NAME, the way a person would:
   "Game Manual 0 puts the rollers at 45 degrees", "the official FTC Docs
   describe the wiring as...". Put the bracket number ONCE at the END of the
   paragraph, listing what that paragraph drew on. Do NOT put a bracket after
   every sentence — that reads like a term paper, not an answer.
3. Write it in your own words. Do not quote the sections verbatim and do not
   stitch fragments of their sentences together. Read them, understand them,
   and explain the thing plainly. Code is the only exception: reproduce code
   exactly as written.
4. If the sections do not cover the question, say so plainly in one or two
   sentences and stop. Do not pad, do not guess, do not offer a general answer
   from memory. It is always better to say "the indexed documentation does not
   cover this" than to be plausibly wrong.
5. NEVER invent part numbers, SKUs, gear ratios, motor specifications, tick
   counts, dimensions, or rule numbers. If a specific number is not written in a
   section, say the documentation does not state it.
6. Some sections are marked RESTRICTED. Their text is not available to you —
   only their title and link. Tell the reader the topic is covered there and
   point them to the link; do not state or guess what those sections say.
7. Be concise. Lead with the direct answer, give the detail that changes what
   someone does, and stop. Four short paragraphs is usually plenty.
8. Write like a well-set reference document, not a chat message. No greetings,
   no sign-offs, no "great question". Use short paragraphs; use a list only when
   the content is genuinely a list. Markdown for structure, no headings above ###.

YOUR REPLY HAS TWO PARTS, IN THIS ORDER, USING THESE EXACT MARKERS:

===GROUNDED===
The answer, under every rule above. Documentation only. Every claim cited.
This is the part that gets a permanent URL and is read by people who will act
on it, so it must be defensible line by line.

===BEYOND===
Optional. General robotics and FTC engineering reasoning that the sections do
not cover but that genuinely helps: what to check first, why the failure
happens physically, a tradeoff worth knowing, a common mistake. Rules for THIS
part only:
- Never put a citation number here. Nothing here is from the documentation.
- Still never invent a specific part number, SKU, gear ratio, tick count or
  rule number. Vague-but-true beats precise-and-fabricated. Say "a worm gear or
  a high reduction" rather than naming a ratio you do not know.
- Two short paragraphs at most. If you have nothing genuinely useful to add,
  write ===BEYOND=== followed by nothing at all. Padding here is worse than
  silence.
- Do not repeat the grounded answer in other words.
- Speak plainly about uncertainty. "Usually", "in most designs", "worth
  checking" are honest; false confidence is not.`;

const ERROR_SYSTEM_ADDENDUM = `

The user has pasted an FTC SDK stack trace or error message. Additionally:
- Open by naming what the error means in one sentence.
- Then give the likely causes in the robot's terms (wiring, configuration file
  names, hardware map, OpMode lifecycle), each cited.
- Then the concrete fix steps, cited.
- If the trace names a hardware device or configuration entry, quote it exactly.`;

/**
 * @returns {{prompt: string, citations: Array, excerpts: Array}}
 */
export function buildPrompt(question, chunks, { isError = false, isCode = false, history = [] } = {}) {
  const citations = [];
  const excerpts = [];
  const blocks = [];

  chunks.forEach((c, i) => {
    const n = i + 1;
    const allowed = Number(c.canExcerpt) === 1;

    citations.push({
      n,
      chunkId: c.chunkId,
      sourceId: c.sourceId,
      sourceName: c.sourceName,
      pageTitle: c.pageTitle,
      sectionTitle: c.sectionTitle,
      headingPath: c.headingPath,
      url: c.sourceUrl,
      license: c.license,
      canExcerpt: allowed,
    });

    if (allowed) {
      excerpts.push({ chunkId: c.chunkId, n, text: c.text });
      blocks.push(
        `[${n}] ${c.sourceName} — ${c.headingPath}\n` +
        `URL: ${c.sourceUrl}\n` +
        `---\n${c.text}\n---`,
      );
    } else {
      // Licensed material we may point at but not reproduce.
      blocks.push(
        `[${n}] ${c.sourceName} — ${c.headingPath}  (RESTRICTED)\n` +
        `URL: ${c.sourceUrl}\n` +
        `---\n(The text of this section is under ${c.license} and is not available. ` +
        `You may reference its title and link only.)\n---`,
      );
    }
  });

  // Prior turns are context for resolving what the question refers to. They are
  // NOT a source: nothing in them may be cited, and a claim that appeared in an
  // earlier answer still has to be supported by a section here.
  const priorBlock = history.length
    ? `EARLIER IN THIS CONVERSATION (context only — never cite this, never treat it as a source)\n\n` +
      history.map((h, i) =>
        `Q${i + 1}: ${h.question}\nA${i + 1}: ${String(h.answer || '').slice(0, 700)}`).join('\n\n') +
      `\n\n`
    : '';

  const prompt =
    priorBlock +
    `SECTIONS\n\n${blocks.join('\n\n')}\n\n` +
    `QUESTION\n\n${question}\n\n` +
    (history.length
      ? `This is a follow-up. Resolve what it refers to from the earlier turns, then answer it using only the sections above. Name the sources in the prose and put bracket numbers at the end of each paragraph. Do not repeat the earlier answer.`
      : `Answer using only the sections above. Name the sources in the prose and put
bracket numbers at the end of each paragraph.`);

  return { prompt, citations, excerpts };
}

import { CODE_SYSTEM_ADDENDUM } from './codegen.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Calls Gemini and yields plain text deltas.
 * @returns {AsyncGenerator<string>}
 */
export async function* streamGemini(env, { question, chunks, isError = false, isCode = false, history = [] }) {
  const { prompt } = buildPrompt(question, chunks, { isError, isCode, history });
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash';

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT + (isError ? ERROR_SYSTEM_ADDENDUM : '') + (isCode ? CODE_SYSTEM_ADDENDUM : '') }],
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.15,
      topP: 0.9,
      // Thinking tokens are drawn from this same budget, so a tight cap
      // truncated the answer mid-word and the BEYOND section never arrived.
      // The cap exists to bound a runaway generation, not to shape length —
      // length is controlled by the prompt.
      // Thinking tokens are drawn from this same budget. A code request with
      // thinkingLevel:medium spent all 8192 reasoning and emitted a single
      // newline, so code gets a much larger ceiling. The cap bounds a runaway
      // generation; length is controlled by the prompt.
      maxOutputTokens: Number(
        isCode ? (env.MAX_OUTPUT_TOKENS_CODE || 24000) : (env.MAX_OUTPUT_TOKENS || 8192),
      ),
      // Thinking is on now. The model has to decide what the sections actually
      // support before writing, and which of its own knowledge is safe to add
      // below the line — both are reasoning steps, not retrieval steps.
      thinkingConfig: { thinkingLevel: env.THINKING_LEVEL || 'medium' },
    },
    safetySettings: [
      'HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT',
    ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
  };

  const res = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`), {
      status: res.status,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      const parts = json?.candidates?.[0]?.content?.parts || [];
      for (const p of parts) if (typeof p.text === 'string' && p.text) yield p.text;
    }
  }
}

// ---------------------------------------------------------------------------
// Splitting the two parts
// ---------------------------------------------------------------------------

export const GROUNDED_MARKER = '===GROUNDED===';
export const BEYOND_MARKER = '===BEYOND===';

/**
 * Incremental splitter for the streamed reply.
 *
 * The separation is enforced here, on the server, while the tokens are still
 * passing through — not by the frontend deciding what to show. Text before the
 * BEYOND marker is grounded and persistable; text after it is not, and is never
 * written to D1 or KV.
 */
export function createAnswerSplitter() {
  let buffer = '';
  let inBeyond = false;
  let headerDone = false;

  /**
   * Consume a leading ===GROUNDED=== if one is there.
   * @returns {boolean} false when we must wait for more input to decide.
   *
   * Stripping it with a plain replace() on each emitted slice is not enough:
   * the model streams the marker across chunk boundaries ("===GROUNDED" then
   * "==="), so neither slice ever contains the whole string and it leaks into
   * the answer. The decision has to be made on the accumulated buffer.
   */
  function consumeHeader() {
    if (headerDone) return true;
    const lead = buffer.replace(/^\s+/, '');
    if (lead.startsWith(GROUNDED_MARKER)) {
      buffer = lead.slice(GROUNDED_MARKER.length).replace(/^\n/, '');
      headerDone = true;
      return true;
    }
    // Still might become the marker once more arrives.
    if (lead.length < GROUNDED_MARKER.length && GROUNDED_MARKER.startsWith(lead)) return false;
    headerDone = true;      // the model simply did not emit it
    return true;
  }

  return {
    /** @returns {{grounded: string, beyond: string}} newly completed text */
    push(delta) {
      buffer += delta;
      let grounded = '';
      let beyond = '';

      if (!inBeyond && !consumeHeader()) return { grounded: '', beyond: '' };

      if (!inBeyond) {
        const idx = buffer.indexOf(BEYOND_MARKER);
        if (idx === -1) {
          // Hold back a marker-length tail so a marker split across two chunks
          // is never emitted as answer text.
          const safe = Math.max(0, buffer.length - BEYOND_MARKER.length);
          grounded = buffer.slice(0, safe);
          buffer = buffer.slice(safe);
        } else {
          grounded = buffer.slice(0, idx);
          buffer = buffer.slice(idx + BEYOND_MARKER.length);
          inBeyond = true;
          beyond = buffer;
          buffer = '';
        }
      } else {
        beyond = buffer;
        buffer = '';
      }

      return { grounded: stripGroundedMarker(grounded), beyond };
    },
    /** Flush whatever is still held back. */
    end() {
      if (!inBeyond) consumeHeader();
      const rest = buffer;
      buffer = '';
      return inBeyond
        ? { grounded: '', beyond: rest }
        : { grounded: stripGroundedMarker(rest), beyond: '' };
    },
    get startedBeyond() { return inBeyond; },
  };
}

function stripGroundedMarker(text) {
  // Belt and braces: consumeHeader handles the leading marker, this catches a
  // stray repeat anywhere in the body.
  return text.split(GROUNDED_MARKER).join('');
}

/**
 * Defence in depth: a citation marker in the ungrounded half would imply the
 * documentation said something it did not, so strip any that slip through.
 */
export function sanitiseBeyond(text) {
  // No trimming: this runs on every streamed delta, and trimming each one
  // welds the last word of one chunk to the first word of the next.
  return text.replace(/\[\d{1,2}(?:\s*,\s*\d{1,2})*\]/g, '');
}
