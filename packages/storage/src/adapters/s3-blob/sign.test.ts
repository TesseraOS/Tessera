import { describe, expect, it } from 'vitest';
import { encodePath, sha256Hex, signRequestV4, uriEncode } from './sign.js';

/**
 * The signer is pinned against the **published AWS SigV4 test-suite vectors**. That matters more here
 * than usual: this is a hand-rolled implementation of somebody else's protocol (ADR-0059 §5), so the
 * only trustworthy check is an expected value computed by AWS, not by us. A test that asserted our own
 * output would pass for any implementation, correct or not.
 *
 * Credentials, region, service, and timestamp below are the suite's fixed fixtures.
 */
const CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};
const OPTIONS = {
  region: 'us-east-1',
  service: 'service',
  date: new Date('2015-08-30T12:36:00Z'),
};
/** SHA-256 of the empty body — every vector below has no payload. */
const EMPTY = sha256Hex('');

function authorization(method: string, url: string): string {
  return signRequestV4(
    { method, url: new URL(url), headers: {}, payloadHash: EMPTY },
    CREDENTIALS,
    OPTIONS,
  )['authorization']!;
}

describe('SigV4 — published AWS test vectors', () => {
  it('get-vanilla', () => {
    expect(authorization('GET', 'https://example.amazonaws.com/')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('get-vanilla-query-order-key-case (query params sort by encoded name)', () => {
    expect(authorization('GET', 'https://example.amazonaws.com/?Param2=value2&Param1=value1')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500',
    );
  });

  it('get-unreserved (unreserved characters are never encoded)', () => {
    const unreserved = '-._~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    expect(authorization('GET', `https://example.amazonaws.com/${unreserved}`)).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=07ef7494c76fa4850883e2b006601f940f8a34d404d0cfa977f52a65bbf5f24f',
    );
  });
});

describe('uriEncode', () => {
  it('leaves the unreserved set alone', () => {
    expect(uriEncode('abcXYZ019-_.~')).toBe('abcXYZ019-_.~');
  });

  it('encodes the characters encodeURIComponent would wrongly pass through', () => {
    // The classic SigV4 trap: encodeURIComponent leaves !'()* alone, AWS requires them encoded.
    expect(uriEncode("!'()*")).toBe('%21%27%28%29%2A');
  });

  it('encodes a space as %20, never +', () => {
    expect(uriEncode('a b')).toBe('a%20b');
  });

  it('encodes non-ASCII as UTF-8 bytes in uppercase hex', () => {
    expect(uriEncode('é')).toBe('%C3%A9');
    expect(uriEncode('日')).toBe('%E6%97%A5');
  });

  it('encodes a slash when applied to a single segment', () => {
    // Path encoding splits on '/' first, so a slash INSIDE a segment must be escaped.
    expect(uriEncode('a/b')).toBe('a%2Fb');
  });
});

describe('signRequestV4 mechanics', () => {
  it('signs the session token when one is present', () => {
    const headers = signRequestV4(
      {
        method: 'GET',
        url: new URL('https://example.amazonaws.com/'),
        headers: {},
        payloadHash: EMPTY,
      },
      { ...CREDENTIALS, sessionToken: 'session-abc' },
      OPTIONS,
    );
    expect(headers['x-amz-security-token']).toBe('session-abc');
    expect(headers['authorization']).toContain('x-amz-security-token');
  });

  it('includes caller-supplied headers in SignedHeaders, lowercased and sorted', () => {
    const headers = signRequestV4(
      {
        method: 'PUT',
        url: new URL('https://example.amazonaws.com/key'),
        headers: { 'X-Amz-Content-Sha256': EMPTY, 'Content-Type': 'application/octet-stream' },
        payloadHash: EMPTY,
      },
      CREDENTIALS,
      OPTIONS,
    );
    expect(headers['authorization']).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
  });

  it('signs an already-encoded path VERBATIM — never double-encoding it', () => {
    // The bug this pins cost a real debugging round against MinIO: the signer used to re-encode
    // `url.pathname`, so a key with a space was signed as `a%2520b` while fetch sent `a%20b`, and
    // every such request came back 403 SignatureDoesNotMatch. Two signatures that must agree:
    // one over the URL the adapter built, one over the identical path spelled out by hand.
    const built = new URL('https://example.amazonaws.com');
    built.pathname = `/bucket/${encodePath(['a b', 'ünïcode', "name!'()*.txt"])}`;

    expect(built.pathname).toBe('/bucket/a%20b/%C3%BCn%C3%AFcode/name%21%27%28%29%2A.txt');

    const sign = (url: URL): string =>
      signRequestV4({ method: 'PUT', url, headers: {}, payloadHash: EMPTY }, CREDENTIALS, OPTIONS)[
        'authorization'
      ]!;

    expect(sign(built)).toBe(
      sign(
        new URL(
          'https://example.amazonaws.com/bucket/a%20b/%C3%BCn%C3%AFcode/name%21%27%28%29%2A.txt',
        ),
      ),
    );
  });

  it('produces a different signature when the payload hash changes', () => {
    const of = (payloadHash: string): string =>
      signRequestV4(
        {
          method: 'PUT',
          url: new URL('https://example.amazonaws.com/k'),
          headers: {},
          payloadHash,
        },
        CREDENTIALS,
        OPTIONS,
      )['authorization']!;
    expect(of(EMPTY)).not.toBe(of(sha256Hex('some body')));
  });
});
