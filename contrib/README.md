# Contributor Sandbox

This folder is the **only place** external contributor PRs may touch.
A PR against the `drips` branch that changes any file outside `contrib/` is closed automatically.

This folder contains reference implementations, standalone wrappers, and validation scripts addressing the assigned issues.

---

## 1. Fallback Path for x402-client Discovery Timeout (#279)

We implement `createX402ClientWithFallback` inside [contrib/x402-client-fallback.ts](file:///c:/Users/DELL/drips/luchi/vellar-sdk/contrib/x402-client-fallback.ts). 

### Behavior
- **`timeoutMs`**: Wraps the initial discovery request (`doFetch` call) in an `AbortController` timeout.
- **`fallbackResponse`**: If the request times out (aborted), it intercepts the failure and returns the configured fallback response (or a default 504 Gateway Timeout JSON response) with `isFallback: true` and `paid: false`.
- **Typings**: Leverages `X402FetchInitWithFallback` and `X402ResponseWithFallback`.

### Integration into Core
To integrate this into the main codebase:
1. Merge the properties `timeoutMs` and `fallbackResponse` into `X402FetchInit` inside `src/x402-types.ts`.
2. Merge `isFallback` into `X402Response` inside `src/x402-types.ts`.
3. Wrap the initial `doFetch` inside `x402Fetch` in `src/x402-client.ts` using the same `AbortController`/`setTimeout` logic.

---

## 2. Pre-release Smoke Test Script (#288)

We implement the smoke test script inside [contrib/smoke-test.mjs](file:///c:/Users/DELL/drips/luchi/vellar-sdk/contrib/smoke-test.mjs).

### Manual Run
Verify that the package core exports compile, load, and run correctly after building the package:
```sh
npm run build
node contrib/smoke-test.mjs
```

### Integration into Core
To run this automatically during releases, wire it in the root `package.json`'s `prepublishOnly` lifecycle hook:
```json
"prepublishOnly": "npm run typecheck && npm test && npm run build && node contrib/smoke-test.mjs"
```

---

## 3. Automated Changeset Validation in Release CI (#285)

We implement the validation script inside [contrib/validate-changeset.mjs](file:///c:/Users/DELL/drips/luchi/vellar-sdk/contrib/validate-changeset.mjs) and its unit tests inside [contrib/validate-changeset.test.ts](file:///c:/Users/DELL/drips/luchi/vellar-sdk/contrib/validate-changeset.test.ts).

### Manual Run
Run the validation script against simulated repository state:
```sh
node contrib/validate-changeset.mjs
```

### CI Check Integration
To enforce changeset entries for pull requests that touch source files (in `src/` or `packages/`), add a workflow step in `.github/workflows/ci.yml` (and check out with full history using `fetch-depth: 0`):
```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Validate Changeset
        if: github.event_name == 'pull_request'
        env:
          GITHUB_BASE_REF: ${{ github.base_ref }}
          PR_LABELS: ${{ join(github.event.pull_request.labels.*.name, ',') }}
        run: node contrib/validate-changeset.mjs
```

---

## 4. Stellar RPC Retry Outage Fixes (#277)

We implement a resilient wrapper for Stellar RPC servers inside [contrib/rpc-server.ts](file:///c:/Users/DELL/drips/luchi/vellar-sdk/contrib/rpc-server.ts).

### Retry Policy
- **Exponential Backoff with Jitter**: Retries failed calls up to 3 times (4 attempts total) with exponential delay ($100\text{ms}$ base, $1000\text{ms}$ max) and full random jitter to prevent retry storms.
- **Circuit Breaker**: Keys circuit breakers globally per RPC endpoint. If an endpoint fails 5 consecutive times, the breaker shifts to `OPEN` for a 10-second cooldown period, immediately fast-failing subsequent requests with `RpcCircuitBreakerError` to protect backend nodes.

### Integration into Core
To integrate this into the core SDK:
1. Re-export the wrapped `Server` class and `RpcCircuitBreakerError` from `src/rpc.ts`.
2. Swap the instantiation of `new rpc.Server(...)` for `new Server(...)` inside `src/balances-rpc.ts` and `src/tx-rpc.ts`.

---

## 5. Data Retention Guidance for Cached Session State (#292)

We implement the retention window inside [contrib/session-retention.ts](contrib/session-retention.ts),
with the full guidance in [contrib/session-retention.md](contrib/session-retention.md) and tests in
[contrib/session-retention.test.ts](contrib/session-retention.test.ts).

### Recommended Window
- **30 days of inactivity** (`DEFAULT_SESSION_MAX_AGE_MS`). Cached session state is not a credential
  (no key material; every signature still needs a live WebAuthn ceremony), but it is a durable link
  between a browser profile and an on-chain account, so it should not persist indefinitely.
- **Idle, not absolute**: age is measured from `lastActiveAt`, which `touch()` refreshes, so an
  active session renews while an abandoned one ages out.
- Shorten it for stricter deployments — a few hours for shared kiosks or custodial dashboards.
  See the deployment table in the guidance doc.

### Enforcement on Read
- **`withSessionRetention(adapter, { maxAgeMs })`** wraps any `SessionStorageAdapter`. On `load()`,
  state older than `maxAgeMs` yields `null` **and is cleared from the underlying storage** — expired
  state is evicted, not merely ignored.
- Wrapping the adapter rather than the store applies the window to every read path and composes with
  any adapter without the core store knowing retention exists.
- **`isSessionExpired(session, maxAgeMs?, now?)`** exposes the same rule as a pure helper.
- Unparseable `lastActiveAt` counts as expired; a future one (clock skew) never does; a failed
  eviction still reports expiry; a non-positive or `NaN` `maxAgeMs` throws a `RangeError` at wiring.

### Integration into Core
See [contrib/session-retention.md](contrib/session-retention.md) for the step-by-step recipe and the
proposed `README.md` section. In short:
1. Move `DEFAULT_SESSION_MAX_AGE_MS` and `isSessionExpired` into `src/session.ts`; export both from `src/index.ts`.
2. Add `maxAgeMs?: number` to `CreateSessionStoreOptions` and enforce it in `restore()`.
3. Add the proposed "Session retention" section to the root `README.md`.

> Note: `src/session.test.ts` does not currently parse on `dev` (an unterminated `it(` block in the
> teardown suite), which must be fixed before these tests can be ported there.

---

## 6. A Clearer Failure Mode for Policy-Governed Signers (#387)

We implement the diagnostics for the policy-governed failure mode inside
[contrib/policy-governed-signer-failure-mode.ts](contrib/policy-governed-signer-failure-mode.ts),
with unit tests in [contrib/policy-governed-signer-failure-mode.test.ts](contrib/policy-governed-signer-failure-mode.test.ts)
and an end-to-end proof in [contrib/policy-governed-signer-failure-mode.e2e.test.ts](contrib/policy-governed-signer-failure-mode.e2e.test.ts).

### Behavior

- **The failure**: a policy-governed key configured WITHOUT its `policies` signs an
  incomplete signature map, which the wallet rejects outright with `Error(Contract, #110)` —
  the wallet's GENERIC auth-failure wrapper. It reads as a broken signer, and #110 also covers
  policy refusals (over budget), so the code alone cannot say which fix applies. Verified on
  testnet: an ed25519-only map against a policy-governed wallet fails with #110; the same
  payment carrying the policy entries reaches the policy and is judged on its merits.
- **`looksLikeMissingPolicyCosigner(detail)`**: true only when #110 is present AND the
  diagnostics show no policy was ever invoked (`policy__` call absent). A policy refusal
  produces the same #110 with a nested `policy__` diagnostic and must NOT reclassify.
- **`missingPolicyCosignerError(detail)`**: the typed `MissingPolicyCosignerError` naming the
  fix (pass every policy in the key's `SignerLimits` as `policies`), the greppable hint
  constant, the alternative cause (a policy refusing an over-budget payment), and the raw
  diagnostics. Nothing was signed or settled by this rejection path.
- **`warnIfPolicyGovernedWithoutPolicies(kind, policies, policyGoverned)`**: warns (never
  refuses) when a key DECLARED `policyGoverned` carries no policies — the one combination
  that cannot work on chain, caught at construction before any RPC round-trip.
- **`withMissingPolicyCosignerClassification(doFetch)`**: a catch-side wrapper that turns the
  core client's generic `PaymentRejectedError` into the typed error for the missing-co-signer
  shape only. This is the standalone integration path — use it around `wallet.x402.fetch(...)`
  until core adopts the classification.

The E2E test drives the REAL client on unmodified `dev` (real signing, real 402 loop, real
XDR parsing; only the RPC transport and facilitator fetch are stubbed) and asserts the typed
error reaches the caller with a genuinely signed envelope in the `PAYMENT-SIGNATURE` header.

### Manual Run

```sh
npx vitest run contrib/policy-governed-signer-failure-mode.test.ts contrib/policy-governed-signer-failure-mode.e2e.test.ts
```

### Integration into Core

A complete implementation of this recipe already exists as commit `a34a4d4` (PR #421, closed
for touching files outside `contrib/`) on branch `feat/policy-governed-signer-failure-mode` —
maintainers can cherry-pick from it directly. In summary:

1. **`src/x402-types.ts`** — add the `MissingPolicyCosignerError` class (same shape as the one
   in the contrib module) alongside the other x402 error classes.
2. **`src/x402-signer.ts`** — move `MISSING_POLICY_COSIGNER_HINT`,
   `looksLikeMissingPolicyCosigner` and `missingPolicyCosignerError` from the contrib module
   (importing the error from `./x402-types`); add `policyGoverned?: boolean` to
   `SessionKeySignerConfig` and `PasskeyX402SignerConfig`; call
   `warnIfPolicyGovernedWithoutPolicies("createSessionKeySigner", policies, config.policyGoverned)`
   at the top of both factories (after policy validation, before returning the signer).
3. **`src/x402-client.ts`** — replace the generic rejection throw on the paid retry
   (`throw new PaymentRejectedError(\`x402 payment was not accepted…\`, reason)`) with the
   classifying version: build the `detail` string, and throw `missingPolicyCosignerError(detail)`
   when `looksLikeMissingPolicyCosigner(detail)`, else the existing `PaymentRejectedError`.
   Until this lands, consumers can wrap fetches with `withMissingPolicyCosignerClassification`
   — no core change needed.
4. **Docs** — add `MissingPolicyCosignerError` to the error-codes reference table and a short
   `policyGoverned` note to the x402 docs page.

> Prerequisite: `dev`'s `src/` currently has merge corruption that blocks the full suite
> (see the closed PR's repair commit): `src/session.test.ts` is missing the closing braces
> of the teardown suite before the "refresh & expiry edge cases" describe; `src/tx-rpc.ts`
> calls the nonexistent `Transaction.fromXDR` (should be `TransactionBuilder.fromXDR(xdr,
> networkPassphrase)`); `src/balances.ts` types `getBalancesBatch` tokens as full `TokenInfo[]`
> (the implementation only reads `contractId` — `Pick<TokenInfo, "contractId">[]`); and
> `src/x402-signer.ts` has a broken JSDoc comment (the capabilities block is missing its
> `/**` opener, so the file does not PARSE — `npm run typecheck` fails on `dev`) plus
> unreachable duplicate signing code after the `try/catch` in `createSessionKeySigner`
> (harmless at runtime; both removed when integrating). The contrib tests
> here do NOT depend on those repairs — they pass on unmodified `dev`, and import from
> `../src/x402-client.js` / `../src/x402-types.js` directly to avoid the one module that
> does not parse.
