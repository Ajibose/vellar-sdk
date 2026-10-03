import { describe, it, expect } from "vitest";
import {
  ERROR_CODES,
  ALL_ERROR_CLASS_NAMES,
  getErrorCode,
  type ErrorCode,
} from "./structured-error-codes";

describe("structured error codes", () => {
  it("every error class name has a corresponding code", () => {
    for (const name of ALL_ERROR_CLASS_NAMES) {
      expect(ERROR_CODES).toHaveProperty(name);
      expect(typeof ERROR_CODES[name as keyof typeof ERROR_CODES]).toBe("string");
    }
  });

  it("every code is a non-empty string", () => {
    for (const [name, code] of Object.entries(ERROR_CODES)) {
      expect(code).toBeTruthy();
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it("codes are unique (no two errors share a code)", () => {
    const codes = Object.values(ERROR_CODES);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("codes follow SCREAMING_SNAKE_CASE convention", () => {
    const pattern = /^[A-Z][A-Z0-9_]+$/;
    for (const [name, code] of Object.entries(ERROR_CODES)) {
      expect(code).toMatch(pattern);
    }
  });

  it("getErrorCode returns the correct code for a known error", () => {
    // Simulate an error with a known name
    const error = new Error("test");
    error.name = "MaxAmountExceededError";
    expect(getErrorCode(error)).toBe("PAYMENT_MAX_AMOUNT_EXCEEDED");
  });

  it("getErrorCode returns undefined for an unknown error", () => {
    const error = new Error("test");
    error.name = "UnknownError";
    expect(getErrorCode(error)).toBeUndefined();
  });

  it("codes are stable across releases (snapshot)", () => {
    // This snapshot test catches accidental code changes. If a code changes,
    // the snapshot must be updated intentionally with a release note.
    expect(ERROR_CODES).toMatchInlineSnapshot(`
      {
        "AgentsNotConfiguredError": "AGENT_NOT_CONFIGURED",
        "AuthEntryMismatchError": "X402_AUTH_ENTRY_MISMATCH",
        "BatchBalanceSizeError": "BALANCE_BATCH_SIZE_EXCEEDED",
        "BudgetAttributeDeniedError": "BUDGET_ATTRIBUTE_DENIED",
        "CapabilityDeniedError": "CAPABILITY_DENIED",
        "CircuitOpenError": "CIRCUIT_OPEN",
        "DisallowedAssetError": "PAYMENT_DISALLOWED_ASSET",
        "InvalidAgentInputError": "AGENT_INVALID_INPUT",
        "InvalidAmountError": "PAYMENT_INVALID_AMOUNT",
        "InvalidBudgetAttributeRuleError": "BUDGET_INVALID_ATTRIBUTE_RULE",
        "InvalidCapabilityRuleError": "CAPABILITY_INVALID_RULE",
        "InvalidRecipientError": "PAYMENT_INVALID_RECIPIENT",
        "InvalidRequirementsError": "PAYMENT_INVALID_REQUIREMENTS",
        "InvalidSigningConfigError": "REQUEST_INVALID_SIGNING_CONFIG",
        "MainnetConfigError": "CONFIG_MAINNET_ERROR",
        "MaxAmountExceededError": "PAYMENT_MAX_AMOUNT_EXCEEDED",
        "NoUsablePaymentOptionError": "PAYMENT_NO_USABLE_OPTION",
        "PasskeyBrowserRequiredError": "WALLET_PASSKEY_BROWSER_REQUIRED",
        "PaymentRejectedError": "PAYMENT_REJECTED",
        "PolicyApiError": "POLICY_API_ERROR",
        "PolicyListFilterError": "POLICY_LIST_FILTER",
        "PolicyNotDeployableError": "POLICY_NOT_DEPLOYABLE",
        "RateLimitError": "TX_RATE_LIMIT",
        "RequestSigningUnavailableError": "REQUEST_SIGNING_UNAVAILABLE",
        "TransactionTimeoutError": "TX_TIMEOUT",
        "WalletApiError": "WALLET_API_ERROR",
        "WalletNetworkMismatchError": "WALLET_NETWORK_MISMATCH",
        "WalletNotReadyError": "WALLET_NOT_READY",
        "X402NotConfiguredError": "X402_NOT_CONFIGURED",
      }
    `);
  });
});