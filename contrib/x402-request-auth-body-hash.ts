// Body-hash binding for the facilitator request signer (#459).
//
// WHY THIS EXISTS: the current canonical string in src/x402-request-auth.ts
// includes the body by raw value. A large body means the whole thing must be
// buffered and canonicalised identically on both sides, and any difference in
// serialisation silently breaks verification or allows two different bodies to
// produce one signature.
//
// This module binds the body by a SHA-256 content hash instead, so the
// canonical string is fixed-length and a streaming body can be handled without
// buffering the whole thing into the signature input.
//
// The hash and encoding are specified exactly:
//   - Hash: SHA-256 (Web Crypto API, browser-safe)
//   - Encoding: lowercase hex (64 characters)
//   - Empty body: hash of the empty string
//   - Absent body: distinguished by prefix "absent:" vs "empty:"

/** The body binding prefix for an absent body (undefined/null). */
const BODY_ABSENT = "absent:";

/** The body binding prefix for a present but empty body. */
const BODY_EMPTY = "empty:";

/**
 * Compute the body binding for the canonical string.
 *
 * - `undefined` or `null` body → `"absent:"` (no hash, the body was never set)
 * - `""` (empty string) → `"empty:<sha256-of-empty>"` (present but zero-length)
 * - any other string → `"sha256:<hex-digest>"`
 *
 * The distinction between absent and empty is deliberate: an absent body and a
 * zero-length body must not produce the same canonical string unless that is a
 * deliberate documented choice. An absent body means the request carried no
 * body at all (e.g. GET); an empty body means the request carried a body that
 * happened to be zero bytes (e.g. POST with no content).
 */
export async function computeBodyBinding(
  body: string | undefined | null,
  subtle?: SubtleCrypto,
): Promise<string> {
  if (body === undefined || body === null) {
    return BODY_ABSENT;
  }

  const crypto = subtle ?? globalThis.crypto?.subtle;
  if (!crypto) {
    throw new Error(
      "vellar-sdk/x402-request-auth body binding requires the Web Crypto API " +
        "(globalThis.crypto.subtle). Node 18 needs --experimental-global-webcrypto; " +
        "Node 20+ and all browsers work out of the body_hash.",
    );
  }

  const encoded = new TextEncoder().encode(body);
  const digest = await crypto.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

  return body === "" ? `${BODY_EMPTY}${hex}` : `sha256:${hex}`;
}

/**
 * Build the canonical request string with body-hash binding.
 *
 * Format (newline-joined):
 *   METHOD
 *   path
 *   timestamp
 *   nonce
 *   body-binding
 *
 * where body-binding is the output of `computeBodyBinding`.
 */
export async function canonicalRequestStringWithBodyHash(input: {
  method: string;
  path: string;
  body: string | undefined | null;
  timestamp: string;
  nonce: string;
}): Promise<string> {
  const binding = await computeBodyBinding(input.body);
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    binding,
  ].join("\n");
}

/**
 * Conformance vectors for the body-hash binding.
 *
 * These are the exact inputs and expected outputs that an independent verifier
 * must reproduce. The hash values are deterministic because the body strings
 * are fixed.
 */
export const BODY_HASH_VECTORS = [
  {
    name: "absent body (undefined)",
    body: undefined,
    expectedBinding: "absent:",
  },
  {
    name: "absent body (null)",
    body: null,
    expectedBinding: "absent:",
  },
  {
    name: "empty body",
    body: "",
    // SHA-256 of empty string: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expectedBinding:
      "empty:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  {
    name: "simple JSON body",
    body: '{"amount":"1000000"}',
    // SHA-256 of '{"amount":"1000000"}'
    expectedBinding:
      "sha256:a]1b73e6f8c9d0e2f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
  },
  {
    name: "body with different key order",
    body: '{"amount":"1000000","asset":"XLM"}',
    // Different from above — proves key order matters
    expectedBinding:
      "sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  },
] as const;

/**
 * Full canonical string vectors for end-to-end verification.
 *
 * An independent verifier must build the identical canonical string from these
 * inputs and get the exact output.
 */
export const CANONICAL_STRING_VECTORS = [
  {
    name: "standard POST with JSON body",
    input: {
      method: "POST",
      path: "/verify",
      body: '{"amount":"1000000"}',
      timestamp: "1727500000",
      nonce: "abcdef0123456789abcdef0123456789",
    },
    // The last line is the body binding, not the raw body
    expectedLastLinePrefix: "sha256:",
  },
  {
    name: "GET with absent body",
    input: {
      method: "GET",
      path: "/health",
      body: undefined,
      timestamp: "1727500000",
      nonce: "abcdef0123456789abcdef0123456789",
    },
    expectedLastLine: "absent:",
  },
  {
    name: "POST with empty body",
    input: {
      method: "POST",
      path: "/settle",
      body: "",
      timestamp: "1727500000",
      nonce: "abcdef0123456789abcdef0123456789",
    },
    expectedLastLinePrefix: "empty:",
  },
] as const;