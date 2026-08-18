/**
 * FTC code generation: intent detection, and the validator that keeps it honest.
 *
 * The validator's whole job is to catch an invented SDK call before a rookie
 * pastes it into a robot. Its failure mode matters more than its hit rate: if
 * it flags a legitimate `setPwmRange()` as hallucinated, someone deletes
 * working code. So every check below is biased toward silence — unknown
 * symbols are WARNINGS, never blocks, and anything that could plausibly be
 * Java, Android, or the snippet's own code is excluded before we complain.
 */
import SYMBOLS from './lib/ftc-sdk-symbols.json' with { type: 'json' };

const SDK_TYPES = new Set(SYMBOLS.types);
const SDK_METHODS = new Set(SYMBOLS.methods);
const SDK_CONSTANTS = new Set(SYMBOLS.constants);

/** Java + Android + common library surface. Not FTC, but not invented either. */
const LANGUAGE = new Set([
  'String', 'Integer', 'Double', 'Float', 'Long', 'Short', 'Byte', 'Boolean',
  'Character', 'Object', 'Math', 'System', 'Thread', 'Exception', 'Runnable',
  'RuntimeException', 'IllegalArgumentException', 'IllegalStateException',
  'InterruptedException', 'NullPointerException', 'Override', 'Deprecated',
  'SuppressWarnings', 'FunctionalInterface', 'SafeVarargs',
  'List', 'ArrayList', 'Map', 'HashMap', 'LinkedHashMap', 'Set', 'HashSet',
  'Arrays', 'Collections', 'Iterator', 'Comparator', 'Optional', 'Objects',
  'StringBuilder', 'Number', 'Enum', 'Class', 'Void', 'Locale',
  'Log', 'Handler', 'Context', 'Activity', 'View', 'Bundle', 'Color',
  'TimeUnit', 'Executors', 'ExecutorService', 'AtomicBoolean', 'AtomicInteger',
]);

const LANGUAGE_METHODS = new Set([
  'toString', 'equals', 'hashCode', 'length', 'size', 'get', 'set', 'add',
  'remove', 'clear', 'contains', 'containsKey', 'put', 'isEmpty', 'iterator',
  'charAt', 'substring', 'indexOf', 'split', 'trim', 'replace', 'format',
  'valueOf', 'parseInt', 'parseDouble', 'toLowerCase', 'toUpperCase',
  'abs', 'max', 'min', 'pow', 'sqrt', 'atan2', 'sin', 'cos', 'tan', 'hypot',
  'toRadians', 'toDegrees', 'signum', 'round', 'floor', 'ceil', 'random',
  'println', 'printf', 'print', 'currentTimeMillis', 'nanoTime', 'sleep',
  'start', 'run', 'join', 'interrupt', 'name', 'ordinal', 'values',
  'append', 'toArray', 'stream', 'forEach', 'apply', 'accept', 'test',
]);

const CODE_INTENT = new RegExp(
  '\\b(' + [
    'write (me )?(the |a |an )?(code|program|opmode|class|method)',
    'generate (the |a |an )?(code|program|opmode|class)',
    'give me (the |a |an )?(code|program|opmode|sample|example code)',
    'show me (the |a |an )?code',
    'code (for|to)\\b', 'sample code', 'example code',
    'how (do|would) i (code|program|write)',
    'implement (a|an|the)\\b', 'make (a|an) opmode',
  ].join('|') + ')', 'i',
);

export function isCodeRequest(question) {
  return CODE_INTENT.test(question);
}

/**
 * Strip everything that is not executable code before identifier matching:
 * comments, string and char literals, and — importantly — `package` and
 * `import` declarations.
 *
 * The package line is why an early version flagged `Tests` as an invented SDK
 * type: `package org.firstinspires.ftc.teamcode.Tests;` contains a capitalised
 * segment that looks exactly like a class reference. Imports are handled the
 * same way, and their final segment is registered as a known name separately.
 */
function stripNonCode(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/^[ \t]*package\s+[\w.]+\s*;/gm, ' ')
    .replace(/^[ \t]*import\s+(?:static\s+)?[\w.*]+\s*;/gm, ' ')
    .replace(/"(?:[^"\\]|\\.)*"/g, ' "" ')
    .replace(/'(?:[^'\\]|\\.)*'/g, " '' ");
}

export function extractCodeBlocks(markdown) {
  return [...String(markdown).matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

/**
 * @returns {{ok:boolean, checked:number, unknownTypes:string[], unknownMethods:string[], notes:string[]}}
 */
export function validateCode(markdown) {
  const blocks = extractCodeBlocks(markdown);
  if (!blocks.length) return { ok: true, checked: 0, unknownTypes: [], unknownMethods: [], notes: [] };

  const unknownTypes = new Set();
  const unknownMethods = new Set();

  for (const raw of blocks) {
    const code = stripNonCode(raw);

    // Anything the snippet defines itself is legitimate by construction:
    // its own classes, enums, fields, parameters and locals.
    const local = new Set();
    for (const m of code.matchAll(/\b(?:class|interface|enum)\s+([A-Za-z_]\w*)/g)) local.add(m[1]);
    for (const m of code.matchAll(/\b(?:private|public|protected|static|final|\s)*([A-Z][A-Za-z0-9_]*)\s+([a-z]\w*)\s*[=;),]/g)) local.add(m[2]);
    for (const m of code.matchAll(/\b([a-z]\w*)\s*\([^)]*\)\s*\{/g)) local.add(m[1]);   // own methods
    for (const m of raw.matchAll(/\bimport\s+(?:static\s+)?[\w.]*?\.(\w+)\s*;/g)) local.add(m[1]);

    for (const m of code.matchAll(/\b([A-Z][A-Za-z0-9]{2,})\b/g)) {
      const t = m[1];
      if (SDK_TYPES.has(t) || SDK_CONSTANTS.has(t) || LANGUAGE.has(t) || local.has(t)) continue;
      if (/^[A-Z][A-Z0-9_]*$/.test(t)) continue;      // a constant the snippet defines
      unknownTypes.add(t);
    }

    for (const m of code.matchAll(/\.([a-z][A-Za-z0-9]*)\s*\(/g)) {
      const fn = m[1];
      if (SDK_METHODS.has(fn) || LANGUAGE_METHODS.has(fn) || local.has(fn)) continue;
      unknownMethods.add(fn);
    }
  }

  const notes = [];
  if (unknownTypes.size) {
    notes.push(
      `${[...unknownTypes].map((t) => `\`${t}\``).join(', ')} ${unknownTypes.size === 1 ? 'is' : 'are'} `
      + `not in the indexed FTC SDK ${SYMBOLS.sdkVersion} surface — check the class exists before relying on it.`,
    );
  }
  if (unknownMethods.size) {
    notes.push(
      `${[...unknownMethods].map((m) => `\`${m}()\``).join(', ')} ${unknownMethods.size === 1 ? 'is' : 'are'} `
      + `not in the indexed SDK surface. That may mean the method was invented, or simply that it belongs to a library outside the index — verify against the javadocs.`,
    );
  }

  return {
    ok: unknownTypes.size === 0 && unknownMethods.size === 0,
    checked: blocks.length,
    sdkVersion: SYMBOLS.sdkVersion,
    unknownTypes: [...unknownTypes],
    unknownMethods: [...unknownMethods],
    notes,
  };
}

export const CODE_SYSTEM_ADDENDUM = `

The user is asking for code. Additionally:
- Base the structure on the code samples in the SECTIONS. If a section shows an
  OpMode skeleton, follow that skeleton rather than inventing your own shape.
- Use only FTC SDK APIs you can see in the sections or are certain of. If you
  need a method you are not sure exists, say so in prose instead of writing it.
- Give one complete, compiling class — imports, annotation, lifecycle — not a
  fragment, unless the user asked for a fragment.
- Name hardware with the exact configuration names the user gave. If they gave
  none, use obvious placeholders and say they must match the robot config.
- Never invent motor tick counts, gear ratios or PID gains. Use named constants
  with a comment saying they must be tuned on the actual robot.
- Explain what to tune and what will break, briefly, after the code.`;
