// Policy co-signers in the smart-account signature map.
//
// A policy-governed key that signs WITHOUT its policies is rejected by the
// wallet before the policy is ever consulted, which reads as a broken signer
// rather than a missing co-signer. These pin the map shape that works.

import { Address, Keypair, xdr } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPasskeyX402Signer,
  createSessionKeySigner,
  MISSING_POLICY_COSIGNER_HINT,
  looksLikeMissingPolicyCosigner,
  missingPolicyCosignerError,
} from "./x402-signer";
import { MissingPolicyCosignerError } from "./x402-types";

const WALLET = "CAFIATCEAZJTGQQKFL3N2YB6VMCUN2UYX4QD5A3FALDRU7UJJ6OWBKOW";
const POLICY_A = "CC24EVD6SD7WF2U4GSIBGU7V6LCN3MLZOJZAZCRQNDS3X6KYIL45K2E3";
const POLICY_B = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
const PASSPHRASE = "Test SDF Network ; September 2015";

/** An unsigned V1 auth entry whose credential address is the wallet. */
function unsignedEntry(): string {
  const entry = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(WALLET).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(POLICY_B).toScAddress(),
          functionName: "transfer",
          args: [],
        }),
      ),
      subInvocations: [],
    }),
  });
  return entry.toXDR("base64");
}

/** The decoded `Vec[Map[key → sig]]` signature the signer produced. */
function signatureMapOf(signedXdr: string): xdr.ScMapEntry[] {
  const entry = xdr.SorobanAuthorizationEntry.fromXDR(signedXdr, "base64");
  const sig = entry.credentials().address().signature();
  return sig.vec()![0]!.map()!;
}

const variantOf = (v: xdr.ScVal) => v.vec()![0]!.sym().toString();

async function sign(policies?: readonly string[]) {
  const signer = createSessionKeySigner({
    address: WALLET,
    secretKey: Keypair.random().secret(),
    ...(policies ? { policies } : {}),
  });
  return signatureMapOf(
    await signer.signAuthEntry(unsignedEntry(), {
      networkPassphrase: PASSPHRASE,
      expirationLedger: 1000,
    }),
  );
}

describe("policy co-signers in the signature map", () => {
  it("emits ed25519 only when no policies are configured", async () => {
    const entries = await sign();
    expect(entries).toHaveLength(1);
    expect(variantOf(entries[0]!.key())).toBe("Ed25519");
  });

  it("adds a Policy entry alongside the ed25519 signature", async () => {
    const entries = await sign([POLICY_A]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => variantOf(e.key()))).toEqual(["Ed25519", "Policy"]);
  });

  it("carries the policy's address in the key and a unit Policy signature", async () => {
    const entries = await sign([POLICY_A]);
    const policyEntry = entries[1]!;
    const addr = Address.fromScVal(policyEntry.key().vec()![1]!).toString();
    expect(addr).toBe(POLICY_A);
    // The policy authorises by running, not by producing bytes.
    expect(policyEntry.val().vec()).toHaveLength(1);
    expect(variantOf(policyEntry.val())).toBe("Policy");
  });

  it("orders Ed25519 before Policy, as ScVal ordering requires", async () => {
    // Soroban rejects an unsorted map. "Ed25519" < "Policy" on the leading symbol.
    const entries = await sign([POLICY_A]);
    expect(variantOf(entries[0]!.key())).toBe("Ed25519");
    expect(variantOf(entries[1]!.key())).toBe("Policy");
  });

  it("orders multiple policies deterministically by address bytes", async () => {
    const forward = await sign([POLICY_A, POLICY_B]);
    const reversed = await sign([POLICY_B, POLICY_A]);
    const addrs = (es: xdr.ScMapEntry[]) =>
      es.slice(1).map((e) => Address.fromScVal(e.key().vec()![1]!).toString());

    // Configuration order must not change the emitted map.
    expect(addrs(forward)).toEqual(addrs(reversed));
    expect(addrs(forward)).toHaveLength(2);
  });

  it("rejects a policy address that is not a contract", async () => {
    expect(() =>
      createSessionKeySigner({
        address: WALLET,
        secretKey: Keypair.random().secret(),
        policies: ["GAVU25UK4ISUJIH6KWLXX6XDKKCR3GNZ27RZ5WABRSE42ZADV2LB3ZLU"],
      }),
    ).toThrow(/policy address must be a contract/);
  });
});

// ── the policy-governed failure mode (issue #387) ────────────────────────────
//
// The wallet wraps EVERY auth failure in its generic Error(Contract, #110). A
// policy-governed key configured WITHOUT its policies produces that same opaque
// refusal with no diagnostic, and it must not be confused with a policy
// refusing an over-budget payment (same #110, but a nested policy__ call).

describe("policyGoverned declaration", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("warns when a key declared policy-governed carries no policies", () => {
    createSessionKeySigner({
      address: WALLET,
      secretKey: Keypair.random().secret(),
      policyGoverned: true,
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/policyGoverned is set but .*policies.* is empty/));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Error(Contract, #110)"));
  });

  it("does not warn when policies accompany the declaration", () => {
    createSessionKeySigner({
      address: WALLET,
      secretKey: Keypair.random().secret(),
      policies: [POLICY_A],
      policyGoverned: true,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("does not warn when the declaration is absent or false", () => {
    createSessionKeySigner({ address: WALLET, secretKey: Keypair.random().secret() });
    createSessionKeySigner({
      address: WALLET,
      secretKey: Keypair.random().secret(),
      policyGoverned: false,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns for the passkey signer too", () => {
    createPasskeyX402Signer({
      address: WALLET,
      webAuthn: { async sign() { throw new Error("not called"); } },
      policyGoverned: true,
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("createPasskeyX402Signer"));
  });
});

// Captured verbatim from testnet (shared with the mcp payer's fixtures). Both
// carry the wallet's generic auth wrapper; only one shows a policy invocation.
const MALFORMED_MAP_DIAGNOSTICS = `HostError: Error(Auth, InvalidAction)
   0: [Diagnostic Event] contract:CBIELTK6, topics:[error, Error(Auth, InvalidAction)], data:["failed account authentication with error", CAFIATCE, Error(Contract, #110)]`;

const POLICY_REFUSED_DIAGNOSTICS = `HostError: Error(Auth, InvalidAction)
   0: [Diagnostic Event] contract:CBIELTK6, topics:[error, Error(Auth, InvalidAction)], data:["failed account authentication with error", CAFIATCE, Error(Contract, #110)]
   1: [Failed Diagnostic Event] contract:CAFIATCE, topics:[error, Error(Contract, #110)], data:"escalating Ok(ScErrorType::Contract) frame-exit to Err"
   2: [Failed Diagnostic Event] contract:CAFIATCE, topics:[error, Error(Contract, #1)], data:["contract try_call failed", policy__, [CAFIATCE, [Ed25519, Bytes(89b1)], [[Contract, {args: [CAFIATCE, GAVU25UK, 6000000], contract: CBIELTK6, fn_name: transfer}]]]]
   3: [Failed Diagnostic Event] contract:CC24EVD6, topics:[log], data:["VM call trapped with HostError", policy__, Error(Contract, #1)]`;

describe("looksLikeMissingPolicyCosigner", () => {
  it("classifies a bare #110 with no policy invocation as a missing co-signer", () => {
    expect(looksLikeMissingPolicyCosigner(MALFORMED_MAP_DIAGNOSTICS)).toBe(true);
  });

  it("does NOT classify a #110 whose nested policy call refused as a config error", () => {
    // Same top-level code, different fix: this is the budget being enforced.
    expect(looksLikeMissingPolicyCosigner(POLICY_REFUSED_DIAGNOSTICS)).toBe(false);
  });

  it("ignores failures that carry no #110 at all", () => {
    expect(looksLikeMissingPolicyCosigner("Error(Contract, #1)"))
      .toBe(false);
    expect(looksLikeMissingPolicyCosigner("internal server error")).toBe(false);
    expect(looksLikeMissingPolicyCosigner("Error(Contract, #11)"))
      .toBe(false);
  });
});

describe("missingPolicyCosignerError", () => {
  it("names the cause, the fix, and the hint", () => {
    const err = missingPolicyCosignerError(MALFORMED_MAP_DIAGNOSTICS);
    expect(err).toBeInstanceOf(MissingPolicyCosignerError);
    expect(err.name).toBe("MissingPolicyCosignerError");
    expect(err.message).toContain(MISSING_POLICY_COSIGNER_HINT);
    expect(err.message).toMatch(/pass every policy/i);
    expect(err.message).toMatch(/createSessionKeySigner/);
  });

  it("preserves the raw diagnostics and the alternative cause", () => {
    const err = missingPolicyCosignerError(MALFORMED_MAP_DIAGNOSTICS);
    expect(err.message).toContain(MALFORMED_MAP_DIAGNOSTICS);
    expect(err.message).toMatch(/policy refusing an over-budget payment/);
  });

  it("carries the hint constant verbatim for greppers", () => {
    expect(MISSING_POLICY_COSIGNER_HINT).toBe(
      "this signer may require policies to be configured",
    );
  });
});
