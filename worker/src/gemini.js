/**
 * Prompt assembly and streaming for the Gemini free tier.
 *
 * The licensing rule is enforced HERE, on the server, before a prompt exists —
 * not in the frontend. A chunk with can_excerpt = 0 contributes its citation
 * metadata and nothing else; its body text never enters the request.
 */

/**
 * Shape addenda by question type.
 *
 * A lookup wants the documentation first. Advice and debugging want the answer
 * first, with the documentation supporting it — asked "what ratio should I
 * use", nobody wants a paragraph about what the corpus does and does not
 * contain before the number.
 */
const ADVICE_ADDENDUM = `

THIS QUESTION ASKS FOR JUDGEMENT, NOT A LOOKUP.
Open with your actual recommendation, in the first sentence. Then give the
reasoning that makes it the right call, and the condition that would change it.
The sections are evidence for that recommendation, not the subject of the
answer — cite them where they support a step, and reason past them where they
stop. Do not open by describing what the documentation does or does not contain;
a reader asking what to do is not asking what has been indexed. If the honest
answer is "it depends", say what it depends on and give the number or choice you
would start from anyway.`;

const DEBUG_ADDENDUM = `

THIS QUESTION IS A FAULT TO DIAGNOSE.
Lead with the most likely cause, then the next most likely, in that order. For
each, say what the reader should check and what result would confirm or rule it
out. Cheap checks before expensive ones, and things that cost a match before
things that cost a component. The sections support the diagnosis; they are not
the subject. Do not open by saying the documentation does not cover this
particular symptom — symptoms are rarely written down, causes are.`;

const SYSTEM_PROMPT = `You are Sharp AI, a documentation assistant for the FIRST Tech Challenge (FTC).

Rules you must follow without exception:

1. The numbered SECTIONS are your evidence. Use them, and REASON from them —
   apply what they establish to the specific numbers, parts and situation in the
   question, and work the consequence through. A section that gives a principle
   answers a question about a case it never names. Deriving is expected;
   inventing is not. What you may never do is state a specific value the
   sections do not support.
1b. You also have Google Search. Use it when the sections leave a real gap —
   a current part spec, a library's present API, what teams actually do now.
   For a build, rigging or technique question, a good video often beats any
   prose: search for one, and if it is genuinely the better resource name the
   channel, the video title and the link, and say which hardware it suits. Two
   good videos beat a list of ten. Never invent a title or a URL — if you cannot
   find a real one, say so rather than producing something that looks like a
   link.
   Anything you find that way is NOT a section: name the site in the prose and
   give the URL, and never give it a bracket number. Bracket numbers mean the
   indexed sections and nothing else, which is what makes them worth anything.
1c. One idea per paragraph, and cite only the sections that paragraph actually
   drew on — two is usually right, three is a lot. Listing every section you
   read is not attribution, it is a bibliography, and it makes each individual
   citation unverifiable: an eight-line paragraph credited to five sections
   cannot be checked against any of them. If a paragraph genuinely needs five
   sources, it is really several paragraphs.
2. Say where things come from in the prose, by NAME, the way a person would:
   "Game Manual 0 puts the rollers at 45 degrees", "the official FTC Docs
   describe the wiring as...". Put the bracket number ONCE at the END of the
   paragraph, listing what that paragraph drew on. Do NOT put a bracket after
   every sentence — that reads like a term paper, not an answer.
3. Write it in your own words. Do not quote the sections verbatim and do not
   stitch fragments of their sentences together. Read them, understand them,
   and explain the thing plainly. Code is the only exception: reproduce code
   exactly as written.
4. Answer as far as the sections take you before conceding anything. If they
   establish principles that bear on the question without settling it, give
   those principles and say what they imply for the case asked about — that is
   an answer, not a miss. Only when the sections offer nothing relevant at all
   do you say so, in one sentence, and let the part below carry it. A bare
   "the documentation does not provide this" above a full answer below is a
   failure: whatever you knew well enough to write there, you should have
   reasoned toward here if the sections supported it.
5. NEVER invent part numbers, SKUs, gear ratios, motor specifications, tick
   counts, dimensions, or rule numbers. Deriving a figure from stated ones and
   showing the working is fine, and saying so is required. If a specific number is not written in a
   section, say the documentation does not state it.
6. Some sections are marked RESTRICTED. Their text is not available to you —
   only their title and link. Tell the reader the topic is covered there and
   point them to the link; do not state or guess what those sections say.
7. Some sections are marked SUMMARISE ONLY — the Competition Manual. You may
   use what they say, but every word of your answer must be your own. Never
   quote a phrase from them, never follow their sentence structure, never
   present their wording as a quotation. State what a rule REQUIRES, name its
   code (for example "rule I101"), and tell the reader to check the manual for
   the exact wording. Being precise about what a rule demands matters here:
   getting it wrong costs a team a match.
8a. Never open with what the documentation lacks.
   Sentences of the form "the provided documentation does not explicitly
   detail...", "the sections do not cover...", "while the docs don't state
   directly..." are banned as an opener, in any wording. They tell the reader
   about the index instead of about their robot, and they make a good answer
   read like a bad one — the answer that follows is usually fine, which is
   exactly why leading with the disclaimer is wrong.
   Open with the substance. If something genuinely is not covered, say so once,
   at the end, in a single clause: "The manual does not give a number for X."
   A reader who asked how to fix drift wants the causes first and the caveat
   last, in that order.

8. Be brief, and let the shape follow the question.
   Brevity is about content, not format: lead with the direct answer in the first
   sentence, add only the detail that changes what someone actually does, and
   stop. Cut background the reader did not ask for, restatements of the question,
   and any sentence that would still be true of a different robot.
   Then match the form to what was asked, the way a knowledgeable person would:
   - One thing asked, one thing answered: prose, a paragraph or two. No headings,
     no list. Most questions are this.
   - Several things asked ("the three most likely causes", "compare X and Y",
     "what do I check"): a short list, each item leading with the thing itself in
     bold, then the sentence that matters. Four items beat eight.
   - An order that must be followed (a procedure, a tuning sequence): numbered
     steps, each one action.
   Never impose structure on an answer that does not have any — a heading above a
   single paragraph makes a simple answer look evasive. Never flatten a genuine
   list into prose either; if the reader asked for three causes, three visible
   items is the answer and one dense paragraph is a worse version of it.
9a. A block marked LIVE DATA is current information fetched from FTC Scout, not
   an indexed section. Use it, name FTC Scout in the prose, give its link, and
   never give it a bracket citation number — those belong to sections only. Say
   which season a figure is from, because it changes as the season is played.
9. Write like a well-set reference document, not a chat message. No greetings,
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
- One short paragraph, two at the very most. If you have nothing genuinely useful to add,
  write ===BEYOND=== followed by nothing at all. Padding here is worse than
  silence.
- ONE EXCEPTION, and it is not optional: if the sections do not actually answer
  the question, say so in a single line under GROUNDED and then answer it
  properly HERE, from your own robotics and FTC engineering knowledge. Leaving
  a team with nothing but "the documentation does not cover this" is a failure.
  The limits above still hold — no invented part numbers or ratios, and never
  state what a game rule says; send them to the Competition Manual for that.
  If the question uses a term you do not recognise as standard FTC vocabulary,
  say so plainly and answer the nearest question you can, naming the standard
  terms, rather than inventing a definition to be agreeable.
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
/**
 * Used when retrieval found nothing relevant.
 *
 * The corpus not covering a question is not a reason to leave a team with
 * nothing, but it does change what the answer is allowed to claim. The grounded
 * half states the gap and nothing else, so no uncited claim can ever reach a
 * permanent page; everything substantive goes under BEYOND, where the UI
 * already labels it as unverified and where it is never persisted.
 */
const UNCOVERED_PROMPT = `You are Sharp AI, a documentation assistant for the FIRST Tech Challenge (FTC).

The indexed documentation has NO sections relevant to this question. You have
nothing to cite. You are still going to help, from general robotics and FTC
engineering knowledge, clearly marked as exactly that.

YOUR REPLY HAS TWO PARTS, IN THIS ORDER, USING THESE EXACT MARKERS:

===GROUNDED===
One sentence, no more: say plainly that the indexed documentation does not cover
this. No citation numbers — there are none. Do not answer the question here.

===BEYOND===
The actual answer. You have Google Search — use it when the question turns on a
current detail you are not sure of: a library's current API, a part's real
specs, what teams actually do now. Rules for this part:
- Never a citation number. None of this is from the indexed documentation.
- A block marked LIVE DATA came from FTC Scout. Use it, name FTC Scout, link it,
  and say which season the figures are from.
- When you use something you found on the web, name the site in the prose and
  give the URL, so the reader can check it. Do not present a search result as
  if it came from this site's index.
- Never invent a specific part number, SKU, gear ratio, tick count, motor RPM or
  rule number. Vague-but-true beats precise-and-fabricated: "a high reduction,
  often 40:1 or more" is fine only if you are genuinely confident; otherwise say
  "a high reduction" and stop.
- If the question uses a term you do not recognise as standard FTC vocabulary,
  say so and answer the nearest question you can actually answer, naming the
  standard terms. Do not invent a definition to be agreeable.
- Rule questions are the one hard limit. Never state what a game rule says or
  what is legal. Tell the reader to check the Competition Manual and the
  official Q&A, because being wrong there costs a match.
- Lead with the direct answer. Be concrete about what to check, what usually
  causes the failure, and the tradeoff that matters. Four short paragraphs at
  most.
- Speak plainly about uncertainty. "Usually", "in most designs", "worth
  checking" are honest; false confidence is not.
- No greetings, no sign-offs. Markdown for structure, no headings above ###.`;

export function buildPrompt(question, chunks, { isError = false, isCode = false, history = [], specs = null, page = null, chat = false, uncovered = false, liveBlock = null, intent = 'lookup' } = {}) {
  const citations = [];
  const excerpts = [];
  const blocks = [];

  chunks.forEach((c, i) => {
    const n = i + 1;
    // Three modes. See worker/sql/0002_excerpt_mode.sql.
    const mode = c.excerptMode || (Number(c.canExcerpt) === 1 ? 'full' : 'link');

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
      canExcerpt: mode === 'full',
      mode,
    });

    if (mode === 'full') {
      // Quotable, and shown to the reader beside the answer.
      excerpts.push({ chunkId: c.chunkId, n, text: c.text });
      blocks.push(
        `[${n}] ${c.sourceName} — ${c.headingPath}\n`
        + `URL: ${c.sourceUrl}\n`
        + `---\n${c.text}\n---`,
      );
    } else if (mode === 'summarize') {
      // The model sees the text. The reader never does: this is deliberately
      // NOT pushed to `excerpts`, so it cannot reach the sources panel and is
      // never persisted onto a /q/ page. The site explains the rule; it does
      // not republish it.
      blocks.push(
        `[${n}] ${c.sourceName} — ${c.headingPath}  (SUMMARISE ONLY)\n`
        + `URL: ${c.sourceUrl}\n`
        + `--- You may use the facts below to answer, but you must express them\n`
        + `--- ENTIRELY IN YOUR OWN WORDS. Do not quote any phrase from it, do not\n`
        + `--- reproduce its sentence structure, and do not present it as a quotation.\n`
        + `${c.text}\n---`,
      );
    } else {
      blocks.push(
        `[${n}] ${c.sourceName} — ${c.headingPath}  (RESTRICTED)\n`
        + `URL: ${c.sourceUrl}\n`
        + `---\n(The text of this section is under ${c.license} and is not available. `
        + `You may reference its title and link only.)\n---`,
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

  // The robot in front of them. Generated code that uses placeholder names is
  // code someone has to hand-edit before it compiles, which is the step that
  // goes wrong most often.
  // What the student currently has open. This resolves the pronouns a person
  // uses when they are looking at something: "why is this 3.2 and not 3.0"
  // has no referent without it. It is context for reading the question, not a
  // source, so it is never cited and never overrides the retrieved sections.
  const pageBlock = page && page.title
    ? `WHAT THE STUDENT IS READING\n\n${page.title}${page.section ? ` — section: ${page.section}` : ''}\n${page.url || ''}\n\nUse this only to work out what the question refers to. Cite retrieved sections, never this line. `
    : '';

  const robotBlock = specs
    ? `THIS TEAM'S ROBOT\n\n${specs}\n\nUse these exact configuration names and this hardware in any code you write. `
      + `If the question needs a detail they have not given, say which detail and ask for it rather than inventing a name.\n\n`
    : '';

  // Tutor mode. The lesson panel shows no source list, so bracket numbers there
  // point at nothing and read as broken formatting. It is also a conversation
  // with the student rather than a reference page about them, which changes the
  // voice more than it changes the content.
  const chatBlock = chat
    ? `HOW TO REPLY\n\nYou are talking to a student who has this lesson open. Reply the way a mentor would at the bench.\n\n- Speak to them as "you". Never write "the documentation", "the provided sections", or "Telemark's lesson" — they are reading it, so say "this lesson" or just explain the thing.\n- Do not attribute in prose either. No "as Game Manual 0 points out", no "according to the FTC docs". A mentor at the bench states the fact; where it came from is not the answer to the question.\n- No bracket numbers anywhere. No source list. No ===GROUNDED=== or ===BEYOND=== headers.\n- Lead with the answer in one or two sentences, then the why. Short paragraphs.\n- If the sections do not cover it, say so plainly in one line and give the best engineering answer you have, marked as your judgement rather than as something they can look up.\n- If they ask something vague like "explain this lesson", explain what the lesson is actually teaching and why it matters, not a summary of headings.\n- The whole lesson is in the sections below, including its practice questions and exercise. Use it: you can see exactly what they are looking at.\n- On a practice question, do not open with the answer. Ask what they have so far or point at the part of the lesson that decides it, then work through it with them. If they have already tried and are stuck, or they ask outright for the answer, give it and show why it follows. Never make them guess twice at something the lesson never told them.\n\n`
    : '';

  const prompt =
    chatBlock +
    pageBlock +
    robotBlock +
    priorBlock +
    `SECTIONS\n\n${blocks.join('\n\n')}\n\n` +
    (liveBlock ? `${liveBlock}\n\n` : '') +
    `QUESTION\n\n${question}\n\n` +
    (history.length
      ? `This is a follow-up. Resolve what it refers to from the earlier turns, then answer it using only the sections above. Name the sources in the prose and put bracket numbers at the end of each paragraph. Do not repeat the earlier answer.`
      : `Answer using only the sections above. Name the sources in the prose and put
bracket numbers at the end of each paragraph.`);

  return { prompt, citations, excerpts };
}

import { CODE_SYSTEM_ADDENDUM } from './codegen.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Questions that need reasoning rather than retrieval. */
export function needsDepth({ isCode = false, isError = false, intent = 'lookup', question = '', history = [] } = {}) {
  if (isCode || isError) return true;                 // writing code, reading a stack trace
  if (intent === 'advice' || intent === 'debug') return true;
  const q = String(question);
  // Several asks in one sentence, or an explicit request to compare or choose.
  if (/\b(vs\.?|versus|compare|trade-?offs?|which is better|pros and cons)\b/i.test(q)) return true;
  if ((q.match(/\?/g) || []).length > 1) return true;
  if (/\b(and then|as well as|also)\b/i.test(q) && q.length > 90) return true;
  if (q.length > 180) return true;                    // a long question is rarely a lookup
  // Deep in a conversation the reader is usually past simple facts.
  if (Array.isArray(history) && history.length >= 4) return true;
  return false;
}

function pickModel(env, opts) {
  const deep = env.GEMINI_DEEP_MODEL || 'gemini-3.1-pro-preview';
  const fast = env.GEMINI_MODEL || 'gemini-3.7-flash';
  if (env.DEEP_ROUTING === 'off') return fast;
  return needsDepth(opts) ? deep : fast;
}

/**
 * Calls Gemini and yields plain text deltas.
 * @returns {AsyncGenerator<string>}
 */
export async function* streamGemini(env, { question, chunks, isError = false, isCode = false, history = [], specs = null, page = null, chat = false, uncovered = false, liveBlock = null, intent = 'lookup', onUsage = null }) {
  const { prompt } = buildPrompt(question, chunks, { isError, isCode, history, specs, page, chat, uncovered, liveBlock, intent });
  // Which model answers is decided per question, not per site.
  //
  // Measured on the same drivetrain-diagnosis question at the same budget:
  // 3.5-flash spent 1341 tokens thinking and emitted 55, truncating itself;
  // 3.7-flash produced a usable answer; the Pro model produced the only one
  // that named the actual test — four scales under the wheels, 10-15% spread.
  // A lookup does not need that and should not wait 15s for it, so the depth
  // follows the question: anything that has to reason gets the Pro model, and
  // anything that is fetching a fact gets the fast one.
  const model = pickModel(env, { isCode, isError, intent, question, history });

  const body = {
    systemInstruction: {
      parts: [{
        text: uncovered
          ? UNCOVERED_PROMPT + (intent === 'advice' ? ADVICE_ADDENDUM : intent === 'debug' ? DEBUG_ADDENDUM : '')
          : SYSTEM_PROMPT
            + (isError ? ERROR_SYSTEM_ADDENDUM : '')
            + (isCode ? CODE_SYSTEM_ADDENDUM : '')
            + (intent === 'advice' ? ADVICE_ADDENDUM : intent === 'debug' ? DEBUG_ADDENDUM : ''),
      }],
    },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // Search on every answer, not only when the corpus is empty. The two lanes
    // stay separate by instruction rather than by withholding the tool: bracket
    // numbers belong to sections, anything found on the web is named and linked
    // in prose. The live-data block already works this way and the model keeps
    // them apart correctly.
    ...(env.WEB_SEARCH !== 'off' ? { tools: [{ google_search: {} }] } : {}),
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

  const call = (payload) => fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  let res = await call(body);

  // If the model or the key cannot do search grounding, answer without it
  // rather than failing. Losing the web is a worse answer; losing the answer is
  // a broken page.
  if (!res.ok && body.tools) {
    const detail = await res.text().catch(() => '');
    console.warn('search grounding rejected, retrying without it', detail.slice(0, 160));
    const { tools, ...noTools } = body;
    res = await call(noTools);
  }

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
      // Gemini reports usage on the chunks, cumulatively, so the last one wins.
      // Handed to a callback rather than returned: a generator's return value is
      // discarded by `for await`, which is how every caller consumes this.
      if (json?.usageMetadata && onUsage) { try { onUsage(json.usageMetadata); } catch { /* never break the stream for accounting */ } }
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
