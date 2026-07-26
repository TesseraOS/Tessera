import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 — the request signer for the S3-compatible {@link
 * import('../../ports/blob.js').BlobStore} (F-056, ADR-0059 §5).
 *
 * Hand-rolled over `node:crypto` + global `fetch` rather than taking `@aws-sdk/client-s3`, which pulls
 * ~60 `@smithy/*` packages into the server image for the five operations this adapter needs. The repo
 * has ruled the same way twice (ADR-0024 `fetch` over Octokit; ADR-0026 a text vector literal over the
 * pgvector helper) and NFR-18 points the same way.
 *
 * **This is a pure function** — no clock, no network, no environment — precisely so it can be pinned
 * offline against the published AWS test vectors. That testability is most of why signing is separated
 * from the adapter at all.
 */

/** Static credentials. `sessionToken` supports STS/assumed-role setups. */
export interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

export interface SigV4Options {
  readonly region: string;
  /** `s3` here; parameterized because the algorithm is not S3-specific. */
  readonly service: string;
  /** Signing instant. Injected rather than read from the clock so signatures are reproducible. */
  readonly date: Date;
}

export interface SigV4Request {
  readonly method: string;
  /**
   * Full request URL, including any query string.
   *
   * **The path must already be canonically encoded** — it is signed **verbatim**, exactly as
   * `fetch` will put it on the wire. This is not a convenience choice; it is the only way the two can
   * agree. Encoding here as well would double-encode a path the caller already escaped (`a%20b`
   * becomes `a%2520b`) and every request with a space or non-ASCII character in it would come back
   * `SignatureDoesNotMatch` — measured against MinIO, not theorised. And the signer *cannot* safely
   * encode a raw path either: `URL` leaves `!'()*` unescaped in `pathname`, so a raw path is already
   * lossy by the time it arrives.
   *
   * Callers building a path from user input should map each segment through {@link uriEncode}.
   */
  readonly url: URL;
  /** Headers to sign. `host` is derived from the URL when absent. */
  readonly headers: Readonly<Record<string, string>>;
  /** Hex SHA-256 of the body, or the literal `UNSIGNED-PAYLOAD`. */
  readonly payloadHash: string;
}

const ALGORITHM = 'AWS4-HMAC-SHA256';

/** Hex SHA-256, the hash AWS uses everywhere in this algorithm. */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Uint8Array | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * RFC 3986 percent-encoding as AWS defines it: everything except `A-Za-z0-9-_.~` is encoded.
 *
 * `encodeURIComponent` is *almost* right — it leaves `!'()*` unescaped, which AWS requires escaped, so
 * those are fixed up. It already emits uppercase hex and encodes non-ASCII as UTF-8 bytes, both of
 * which AWS also requires. Getting this wrong is the classic SigV4 failure: the signature computes
 * cleanly and the server rejects it with no useful detail.
 */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Encode a `/`-delimited path segment-by-segment, leaving the separators intact. */
export function encodePath(segments: readonly string[]): string {
  return segments.map(uriEncode).join('/');
}

/** Canonical query string: sorted by encoded name (then value), both components encoded. */
function canonicalQuery(url: URL): string {
  const pairs: Array<[string, string]> = [];
  for (const [name, value] of url.searchParams) pairs.push([uriEncode(name), uriEncode(value)]);
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([name, value]) => `${name}=${value}`).join('&');
}

/** `YYYYMMDDTHHMMSSZ` and `YYYYMMDD` — the two AWS timestamp forms. */
function amzDates(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * Sign a request and return every header that was signed, plus `Authorization`. The caller sends
 * exactly these — sending an unsigned extra header is fine, but changing a signed one invalidates the
 * signature.
 */
export function signRequestV4(
  request: SigV4Request,
  credentials: SigV4Credentials,
  options: SigV4Options,
): Record<string, string> {
  const { amzDate, dateStamp } = amzDates(options.date);

  // Header names are canonicalized to lowercase and sorted; values are trimmed.
  //
  // `x-amz-content-sha256` is deliberately NOT added here even though S3 requires it: it is an
  // S3 convention, not part of SigV4, and adding it unconditionally would change `SignedHeaders` for
  // every service — which would make this function untestable against the published AWS vectors, the
  // one independent check available offline. The adapter passes it in `headers`.
  const signed: Record<string, string> = { host: request.url.host };
  for (const [name, value] of Object.entries(request.headers)) {
    signed[name.toLowerCase()] = value.trim();
  }
  signed['x-amz-date'] = amzDate;
  if (credentials.sessionToken !== undefined) {
    signed['x-amz-security-token'] = credentials.sessionToken;
  }

  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map((name) => `${name}:${signed[name]!}\n`).join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    request.method.toUpperCase(),
    // Verbatim — see SigV4Request.url. This is what `fetch` will send, so it is what must be signed.
    request.url.pathname === '' ? '/' : request.url.pathname,
    canonicalQuery(request.url),
    canonicalHeaders,
    signedHeaders,
    request.payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, options.region);
  const kService = hmac(kRegion, options.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return {
    ...signed,
    authorization:
      `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
