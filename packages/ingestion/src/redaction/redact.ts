import type { RedactionFinding } from '../domain.js';

/**
 * A named secret detector. `pattern` must carry the global flag; `replacement` may use `$n`
 * backreferences to preserve non-secret context (e.g. a key prefix or surrounding quotes) while
 * removing the secret value itself.
 */
interface SecretDetector {
  readonly id: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

const PLACEHOLDER = (id: string): string => `[redacted:${id}]`;

/**
 * Curated, ReDoS-safe detectors for common high-confidence secret formats. Ordered specific →
 * general so a token is attributed to its precise kind. This is **defense-in-depth and
 * deliberately conservative**: it targets well-known credential shapes (and quoted credential
 * assignments) to minimize false positives that would mangle ordinary code. It is not a guarantee
 * that every secret is caught — but a detected secret is never persisted (FR-9).
 */
const SECRET_DETECTORS: readonly SecretDetector[] = [
  {
    id: 'private-key-block',
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replacement: PLACEHOLDER('private-key-block'),
  },
  {
    id: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: PLACEHOLDER('jwt'),
  },
  {
    id: 'aws-access-key-id',
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g,
    replacement: PLACEHOLDER('aws-access-key-id'),
  },
  {
    id: 'github-token',
    pattern: /\b(?:gh[opusr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    replacement: PLACEHOLDER('github-token'),
  },
  {
    id: 'slack-token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replacement: PLACEHOLDER('slack-token'),
  },
  {
    id: 'google-api-key',
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g,
    replacement: PLACEHOLDER('google-api-key'),
  },
  {
    id: 'stripe-secret-key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    replacement: PLACEHOLDER('stripe-secret-key'),
  },
  {
    // Credentials embedded in a URL: scheme://user:PASSWORD@host → keep everything but the password.
    id: 'basic-auth-url',
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s:/@]+@/g,
    replacement: `$1${PLACEHOLDER('basic-auth-url')}@`,
  },
  {
    id: 'bearer-token',
    pattern: /\b(Bearer\s+)[A-Za-z0-9._-]{16,}/g,
    replacement: `$1${PLACEHOLDER('bearer-token')}`,
  },
  {
    // A secret-named key assigned a QUOTED value: keep the key + quotes, redact the value. Quoted
    // only, to avoid redacting ordinary unquoted code like `token = getToken()`.
    id: 'credential-assignment',
    pattern:
      /\b((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|token)["']?\s*[:=]\s*)(["'])([^"'\n]{6,})\2/gi,
    replacement: `$1$2${PLACEHOLDER('credential-assignment')}$2`,
  },
];

/** The outcome of redacting a piece of text. */
export interface RedactionResult {
  /** Text with every detected secret replaced by a placeholder. */
  readonly text: string;
  /** Per-detector match counts. Never contains a secret value (safe to log). */
  readonly findings: readonly RedactionFinding[];
}

/**
 * Scrub detected secrets from `text` before it is persisted (FR-9). Returns the scrubbed text and
 * count-only findings — the secret value itself is never returned, logged, or stored.
 */
export function redactSecrets(text: string): RedactionResult {
  let scrubbed = text;
  const findings: RedactionFinding[] = [];
  for (const detector of SECRET_DETECTORS) {
    const matches = scrubbed.match(detector.pattern);
    if (matches !== null && matches.length > 0) {
      findings.push({ detector: detector.id, count: matches.length });
      scrubbed = scrubbed.replace(detector.pattern, detector.replacement);
    }
  }
  return { text: scrubbed, findings };
}
