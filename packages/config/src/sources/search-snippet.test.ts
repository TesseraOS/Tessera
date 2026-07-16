import { describe, expect, it } from 'vitest';
import { extractSnippet } from './search-snippet.js';

/** Read back what the offsets point at — the only assertion that proves a highlight is honest. */
function highlighted(text: string, matches: readonly { start: number; end: number }[]): string[] {
  return matches.map((m) => text.slice(m.start, m.end));
}

describe('extractSnippet', () => {
  it('returns a contiguous window around the match, with offsets that land on the term', () => {
    const text =
      'The module opens with unrelated preamble. ' +
      'A quernstone grinds the grain into flour. ' +
      'Then more unrelated trailing prose follows.';

    const snippet = extractSnippet(text, 'quernstone', { maxChars: 80 });

    expect(snippet).toBeDefined();
    expect(snippet!.text).toContain('quernstone');
    // The highlight must mark exactly the matched term — not an approximation of it.
    expect(highlighted(snippet!.text, snippet!.matches)).toEqual(['quernstone']);
  });

  it('never exceeds maxChars', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu '.repeat(20);
    for (const maxChars of [40, 80, 120, 240]) {
      const snippet = extractSnippet(text, 'theta', { maxChars });
      expect(snippet!.text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('picks the window with the MOST matches, not merely the first', () => {
    const text =
      'ledger appears here alone. ' +
      'A long stretch of filler text that mentions nothing of interest whatsoever, padding. ' +
      'Later the ledger and the ledger and the ledger cluster together densely.';

    const snippet = extractSnippet(text, 'ledger', { maxChars: 90 });

    // The dense cluster wins — an excerpt should show where the query is most concentrated.
    expect(snippet!.matches.length).toBeGreaterThan(1);
    expect(snippet!.truncatedStart).toBe(true);
  });

  it('matches every distinct query term, not just the first', () => {
    const text = 'the reporting module imports the ledger module for balances';
    const snippet = extractSnippet(text, 'ledger reporting', { maxChars: 240 });

    expect(highlighted(snippet!.text, snippet!.matches).sort()).toEqual(['ledger', 'reporting']);
  });

  it('falls back to a leading window with NO matches when nothing matches lexically', () => {
    // A semantic-only hit legitimately has no lexical match. The excerpt is still worth showing —
    // but it must not fake a highlight it does not have.
    const text = 'Completely unrelated prose about entirely different subject matter altogether.';
    const snippet = extractSnippet(text, 'quernstone', { maxChars: 40 });

    expect(snippet!.matches).toEqual([]);
    expect(snippet!.text.length).toBeGreaterThan(0);
    expect(snippet!.truncatedStart).toBe(false);
    expect(snippet!.truncatedEnd).toBe(true);
  });

  it('reports truncation honestly at both ends', () => {
    const short = extractSnippet('a small body of text', 'small', { maxChars: 240 });
    expect(short!.truncatedStart).toBe(false);
    expect(short!.truncatedEnd).toBe(false);
    expect(short!.text).toBe('a small body of text');
  });

  it('collapses source whitespace so a code excerpt is legible on one line', () => {
    const code = 'export function ledger() {\r\n\t\tconst total = 0;\n\n\n    return total;\n}';
    const snippet = extractSnippet(code, 'ledger', { maxChars: 240 });

    // CRLF, tabs and blank-line runs all become single spaces; no raw newlines survive.
    expect(snippet!.text).not.toMatch(/[\r\n\t]/);
    expect(snippet!.text).not.toMatch(/ {2}/);
    expect(highlighted(snippet!.text, snippet!.matches)).toEqual(['ledger']);
  });

  it('handles unicode terms (the tokenizer is \\p{L}-based, not ASCII)', () => {
    const snippet = extractSnippet('el módulo contabilidad registra el saldo', 'contabilidad', {
      maxChars: 240,
    });
    expect(highlighted(snippet!.text, snippet!.matches)).toEqual(['contabilidad']);
  });

  it('is deterministic — the same inputs give the same excerpt', () => {
    const text = 'ledger one. filler filler filler. ledger two. filler. ledger three.';
    const runs = Array.from({ length: 5 }, () => extractSnippet(text, 'ledger', { maxChars: 50 }));
    // A search excerpt that shuffles between identical requests is a bug you cannot reproduce.
    for (const run of runs) expect(run).toEqual(runs[0]);
  });

  it('returns undefined only for empty text', () => {
    expect(extractSnippet('', 'ledger')).toBeUndefined();
    expect(extractSnippet('   \n\t  ', 'ledger')).toBeUndefined();
    expect(extractSnippet('something', 'ledger')).toBeDefined();
  });

  it('returns a leading window when the query has no terms at all', () => {
    const snippet = extractSnippet('some real content here', '!!! ???', { maxChars: 240 });
    expect(snippet!.matches).toEqual([]);
    expect(snippet!.text).toBe('some real content here');
  });

  it('does not open or close a window mid-word', () => {
    const text = 'alphabetical bookkeeping ledger reconciliation statement summary conclusion';
    const snippet = extractSnippet(text, 'reconciliation', { maxChars: 45 });

    // Every whole word in the excerpt must be a whole word of the source.
    const words = text.split(' ');
    for (const word of snippet!.text.split(' ')) {
      expect(words).toContain(word);
    }
  });

  it('clamps a pathologically small maxChars to something legible', () => {
    const snippet = extractSnippet('the ledger records every transaction faithfully', 'ledger', {
      maxChars: 1,
    });
    expect(snippet!.text.length).toBeGreaterThan(1);
    expect(highlighted(snippet!.text, snippet!.matches)).toEqual(['ledger']);
  });

  it('offsets are ascending and non-overlapping', () => {
    const text = 'ledger ledger ledger reporting ledger';
    const snippet = extractSnippet(text, 'ledger reporting', { maxChars: 240 });

    let previousEnd = -1;
    for (const match of snippet!.matches) {
      expect(match.start).toBeGreaterThanOrEqual(previousEnd);
      expect(match.end).toBeGreaterThan(match.start);
      previousEnd = match.end;
    }
  });
});
