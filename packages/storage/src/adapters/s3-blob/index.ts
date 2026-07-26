import { InternalError } from '@tessera/core';
import type { BlobStore } from '../../ports/blob.js';
import { blobKeySegments } from '../blob-key.js';
import { encodePath, sha256Hex, signRequestV4, type SigV4Credentials } from './sign.js';

export interface S3BlobOptions {
  /** Bucket name. Must already exist — this adapter never creates buckets. */
  readonly bucket: string;
  /** Region used for signing (MinIO accepts any consistent value; `us-east-1` is the usual default). */
  readonly region?: string;
  /**
   * Service endpoint, e.g. `https://s3.eu-west-1.amazonaws.com` or `http://localhost:9000` for MinIO.
   * Defaults to the AWS regional endpoint.
   */
  readonly endpoint?: string;
  /**
   * Put the bucket in the URL path (`{endpoint}/{bucket}/{key}`) rather than the host
   * (`{bucket}.{endpoint}/{key}`). **Required for MinIO** and any endpoint without wildcard DNS.
   */
  readonly forcePathStyle?: boolean;
  readonly credentials: SigV4Credentials;
  /** Injectable for tests; defaults to the global. */
  readonly fetch?: typeof globalThis.fetch;
  /** Injectable clock for reproducible signatures in tests. */
  readonly now?: () => Date;
}

const DEFAULT_REGION = 'us-east-1';

/**
 * Minimal XML extraction — enough for ListObjectsV2, the only XML this adapter parses.
 *
 * **Raw, undecoded** by design. Decoding here would mean a nested read (`Contents` then `Key`) decodes
 * the same text twice, and a key containing the literal `&#39;` — which the service sends as
 * `&amp;#39;` — would come back as `'`. One decode, at the leaf, is the rule.
 */
function rawBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? '');
}

/** The decoded text of the first `tag` element, or `undefined`. Decodes exactly once. */
function textOf(xml: string, tag: string): string | undefined {
  const raw = rawBlocks(xml, tag)[0];
  return raw === undefined ? undefined : decodeXmlText(raw);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
};

/**
 * Decode XML text, including **numeric** character references.
 *
 * The numeric forms are not optional politeness: MinIO returns a `'` in an object key as `&#39;`, not
 * `&apos;`, so a decoder that handled only named entities returned a key that did not match the one
 * just written — `list()` would silently disagree with `put()`.
 *
 * Deliberately a **single pass**: chained `.replace()` calls decode `&amp;#39;` to `'` (first `&amp;`
 * becomes `&`, then the result is re-read as an entity), which corrupts any key containing a literal
 * `&#39;`. One regex cannot re-read its own output.
 */
function decodeXmlText(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|(lt|gt|quot|apos|amp));/g,
    (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (decimal !== undefined) return String.fromCodePoint(Number(decimal));
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
      return name !== undefined ? (NAMED_ENTITIES[name] ?? match) : match;
    },
  );
}

/**
 * S3-compatible {@link BlobStore} (self-hosted/cloud, ADR-0003/0059) over `fetch` + a hand-rolled
 * SigV4 signer — no AWS SDK. Works against AWS S3, MinIO, and other S3-compatible services.
 *
 * Five operations, matching the port exactly: `PUT`, `GET`, `DELETE`, `HEAD`, and `ListObjectsV2`
 * (continuation-token paginated, so a bucket with more than 1000 objects lists completely).
 *
 * Key validation is **shared with the filesystem adapter** ({@link blobKeySegments}), so the two
 * profiles accept precisely the same key space — a `../evil` key is rejected identically by both.
 *
 * The bucket must already exist; provisioning is an operator concern, not this adapter's.
 */
export function createS3BlobStore(options: S3BlobOptions): BlobStore {
  const region = options.region ?? DEFAULT_REGION;
  const doFetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? ((): Date => new Date());
  const base = options.endpoint ?? `https://s3.${region}.amazonaws.com`;

  /** Build the request URL for a key (or the bucket root when `key` is undefined). */
  function urlFor(key: string | undefined, query?: Record<string, string>): URL {
    const endpoint = new URL(base);
    // Canonically encoded here, and the signer then signs `url.pathname` verbatim — assigning an
    // encoded pathname preserves it exactly, so what is signed is byte-for-byte what is sent.
    const encodedKey = key === undefined ? '' : encodePath(blobKeySegments(key));

    if (options.forcePathStyle === true) {
      endpoint.pathname = `/${options.bucket}${encodedKey === '' ? '' : `/${encodedKey}`}`;
    } else {
      endpoint.host = `${options.bucket}.${endpoint.host}`;
      endpoint.pathname = `/${encodedKey}`;
    }
    for (const [name, value] of Object.entries(query ?? {})) {
      endpoint.searchParams.set(name, value);
    }
    return endpoint;
  }

  async function send(
    method: string,
    url: URL,
    body?: Uint8Array,
  ): Promise<{ status: number; text: () => Promise<string>; bytes: () => Promise<Uint8Array> }> {
    const payloadHash = sha256Hex(body ?? '');
    const headers = signRequestV4(
      {
        method,
        url,
        // S3 requires this header; SigV4 itself does not, which is why the signer takes it as input
        // rather than adding it (see sign.ts).
        headers: { 'x-amz-content-sha256': payloadHash },
        payloadHash,
      },
      options.credentials,
      { region, service: 's3', date: now() },
    );

    const response = await doFetch(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });

    return {
      status: response.status,
      text: () => response.text(),
      bytes: async () => new Uint8Array(await response.arrayBuffer()),
    };
  }

  /** Turn a non-2xx into a typed error, including the service's own message when it sent one. */
  async function fail(
    operation: string,
    key: string | undefined,
    response: { status: number; text: () => Promise<string> },
  ): Promise<never> {
    const body = await response.text().catch(() => '');
    const code = textOf(body, 'Code');
    const message = textOf(body, 'Message');
    throw new InternalError(`S3 ${operation} failed`, {
      details: {
        status: response.status,
        ...(key !== undefined ? { key } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(message !== undefined ? { message } : {}),
      },
    });
  }

  return {
    async put(key, data) {
      const response = await send('PUT', urlFor(key), data);
      if (response.status < 200 || response.status >= 300) await fail('put', key, response);
    },

    async get(key) {
      const response = await send('GET', urlFor(key));
      if (response.status === 404) return undefined;
      if (response.status < 200 || response.status >= 300) await fail('get', key, response);
      return response.bytes();
    },

    async delete(key) {
      const response = await send('DELETE', urlFor(key));
      // S3 answers 204 for a delete whether or not the object existed — the port's "no error if
      // absent" contract, for free. A 404 from a stricter implementation is equally fine.
      if (response.status === 404) return;
      if (response.status < 200 || response.status >= 300) await fail('delete', key, response);
    },

    async exists(key) {
      const response = await send('HEAD', urlFor(key));
      if (response.status === 404) return false;
      if (response.status < 200 || response.status >= 300) await fail('exists', key, response);
      return true;
    },

    async list(prefix) {
      const keys: string[] = [];
      let token: string | undefined;

      // Paginated: S3 caps a response at 1000 keys, so a single request would silently truncate.
      do {
        const query: Record<string, string> = { 'list-type': '2' };
        if (prefix !== undefined) query['prefix'] = prefix;
        if (token !== undefined) query['continuation-token'] = token;

        const response = await send('GET', urlFor(undefined, query));
        if (response.status < 200 || response.status >= 300) {
          await fail('list', undefined, response);
        }
        const xml = await response.text();

        // Only <Contents><Key> entries are objects; <CommonPrefixes> would also contain <Key>-like
        // data in other list modes, but we never request a delimiter, so there are none.
        for (const contents of rawBlocks(xml, 'Contents')) {
          const key = textOf(contents, 'Key');
          if (key !== undefined) keys.push(key);
        }

        token =
          textOf(xml, 'IsTruncated') === 'true' ? textOf(xml, 'NextContinuationToken') : undefined;
      } while (token !== undefined);

      return keys;
    },
  };
}

/** Re-exported so callers can type credentials without reaching into the signer module. */
export type { SigV4Credentials };
