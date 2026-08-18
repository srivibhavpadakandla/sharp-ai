/**
 * docutils / Sphinx HTML id generation.
 *
 * Sphinx derives a section's HTML anchor from its title with docutils'
 * `make_id`, and resolves collisions inside a document with a running
 * `id1`, `id2`, ... counter. Reproducing both exactly is what makes our deep
 * links (`page.html#mecanum-drive`) actually land on the right section.
 */

const NON_ID = /[^a-z0-9]+/g;

export function docutilsId(title) {
  const id = String(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(NON_ID, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9]+/, '');
  return id.replace(/^-+/, '');
}

/** Per-document anchor allocator that mirrors docutils' collision handling. */
export function createAnchorAllocator() {
  const used = new Set();
  let serial = 0;
  return {
    /** @param {string} title @param {string|null} explicit `.. _label:` above the heading */
    allocate(title, explicit) {
      if (explicit) {
        const e = docutilsId(explicit);
        if (e && !used.has(e)) {
          used.add(e);
          return e;
        }
      }
      const base = docutilsId(title);
      if (base && !used.has(base)) {
        used.add(base);
        return base;
      }
      // docutils falls back to a document-wide serial counter.
      for (;;) {
        serial += 1;
        const cand = `id${serial}`;
        if (!used.has(cand)) {
          used.add(cand);
          return cand;
        }
      }
    },
  };
}

/** URL slug for a question, used for permanent /q/<slug> pages. */
export function questionSlug(question, hash) {
  const base = String(question)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 10)
    .join('-')
    .slice(0, 70)
    .replace(/-+$/, '');
  return `${base || 'question'}-${hash.slice(0, 6)}`;
}

/** Whitespace/punctuation-insensitive question key used for cache + dedupe. */
export function normalizeQuestion(q) {
  return String(q)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
