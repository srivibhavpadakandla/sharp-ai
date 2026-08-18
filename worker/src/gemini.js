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
2. Cite a section for every factual claim, inline, using its bracket number:
   "Mecanum wheels have rollers at 45 degrees [2]." Put the citation at the end
   of the sentence it supports. Never cite a number that was not provided.
3. If the sections do not cover the question, say so plainly in one or two
   sentences and stop. Do not pad, do not guess, do not offer a general answer
   from memory. It is always better to say "the indexed documentation does not
   cover this" than to be plausibly wrong.
4. NEVER invent part numbers, SKUs, gear ratios, motor specifications, tick
   counts, dimensions, or rule numbers. If a specific number is not written in a
   section, say the documentation does not state it.
5. Some sections are marked RESTRICTED. Their text is not available to you —
   only their title and link. You may tell the reader that the topic is covered
   there and point them to the link, but you must not state, guess or
   paraphrase what those sections say.
6. Write like a well-set reference document, not a chat message. No greetings,
   no sign-offs, no "great question". Lead with the direct answer in one or two
   sentences, then the detail. Use short paragraphs; use a list only when the
   content is genuinely a list. Markdown for structure, no headings above ###.
7. Keep code samples verbatim from the sections when you include them.`;

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
export function buildPrompt(question, chunks, { isError = false } = {}) {
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

  const prompt =
    `SECTIONS\n\n${blocks.join('\n\n')}\n\n` +
    `QUESTION\n\n${question}\n\n` +
    `Answer using only the sections above, citing them by bracket number.`;

  return { prompt, citations, excerpts };
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Calls Gemini and yields plain text deltas.
 * @returns {AsyncGenerator<string>}
 */
export async function* streamGemini(env, { question, chunks, isError = false }) {
  const { prompt } = buildPrompt(question, chunks, { isError });
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';

  const body = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT + (isError ? ERROR_SYSTEM_ADDENDUM : '') }],
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.15,
      topP: 0.9,
      maxOutputTokens: 1600,
      thinkingConfig: { thinkingBudget: 0 },
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
