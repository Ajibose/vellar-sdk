// Structured error codes for the SDK surface (#460).
//
// WHY THIS EXISTS: the SDK throws many typed errors (WalletApiError,
// PolicyApiError, MaxAmountExceededError, AuthEntryMismatchError, etc.) but
// there is no stable machine-readable code across them. Consumers branching on
// failure match on class names or message text, and the docs page can drift
// from what the code actually throws.
//
// This module defines a stable string code for every exported error class,
// and provides a test that asserts every error carries a code.

/**
 * Stable error codes for every exported SDK error class.
 *
 * These codes are STABLE ACROSS RELEASES. Consumers will branch on them, so
 * once a code is shipped it must never change. Adding a new error with a new
 * code is safe; renaming or removing a code is a breaking change.
 *
 * The naming convention is SCREAMING_SNAKE_CASE with a category prefix:
 *   - PAYMENT_* for payment-related errors
 *   - WALLET_* for wallet-related errors
 *   - POLICY_* for policy-related errors
 *   - TX_* for transaction-related errors
 *   - X402_* for x402 protocol errors
 *   - CONFIG_* for configuration errors
 *   - REQUEST_* for request signing errors
 *   - AGENT_* for agent-related errors
 *   - BUDGET_* for budget-related errors
 *   - CAPABILITY_* for capability-related errors
 *   - CIRCUIT_* for circuit breaker errors
 *   - BALANCE_* for balance-related errors
 *   - SESSION_* for session-related errors
 *   - RPC_* for RPC-related errors
 */
export const ERROR_CODES = {
  // Payment errors
  MaxAmountExceededError: "PAYMENT_MAX_AMOUNT_EXCEEDED",
  DisallowedAssetError: "PAYMENT_DISALLOWED_ASSET",
  NoUsablePaymentOptionError: "PAYMENT_NO_USABLE_OPTION",
  InvalidRequirementsError: "PAYMENT_INVALID_REQUIREMENTS",
  PaymentRejectedError: "PAYMENT_REJECTED",
  InvalidAmountError: "PAYMENT_INVALID_AMOUNT",
  InvalidRecipientError: "PAYMENT_INVALID_RECIPIENT",

  // Wallet errors
  WalletApiError: "WALLET_API_ERROR",
  WalletNotReadyError: "WALLET_NOT_READY",
  WalletNetworkMismatchError: "WALLET_NETWORK_MISMATCH",
  PasskeyBrowserRequiredError: "WALLET_PASSKEY_BROWSER_REQUIRED",

  // Policy errors
  PolicyApiError: "POLICY_API_ERROR",
  PolicyNotDeployableError: "POLICY_NOT_DEPLOYABLE",
  PolicyListFilterError: "POLICY_LIST_FILTER",

  // Transaction errors
  TransactionTimeoutError: "TX_TIMEOUT",
  RateLimitError: "TX_RATE_LIMIT",

  // x402 errors
  X402NotConfiguredError: "X402_NOT_CONFIGURED",
  AuthEntryMismatchError: "X402_AUTH_ENTRY_MISMATCH",

  // Config errors
  MainnetConfigError: "CONFIG_MAINNET_ERROR",

  // Request signing errors
  RequestSigningUnavailableError: "REQUEST_SIGNING_UNAVAILABLE",
  InvalidSigningConfigError: "REQUEST_INVALID_SIGNING_CONFIG",

  // Agent errors
  AgentsNotConfiguredError: "AGENT_NOT_CONFIGURED",
  InvalidAgentInputError: "AGENT_INVALID_INPUT",

  // Budget errors
  BudgetAttributeDeniedError: "BUDGET_ATTRIBUTE_DENIED",
  InvalidBudgetAttributeRuleError: "BUDGET_INVALID_ATTRIBUTE_RULE",

  // Capability errors
  CapabilityDeniedError: "CAPABILITY_DENIED",
  InvalidCapabilityRuleError: "CAPABILITY_INVALID_RULE",

  // Circuit breaker errors
  CircuitOpenError: "CIRCUIT_OPEN",

  // Balance errors
  BatchBalanceSizeError: "BALANCE_BATCH_SIZE_EXCEEDED",

  // Session errors
  // (SessionTimeoutError is not currently exported but would be SESSION_TIMEOUT)
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Get the stable error code for an error instance.
 *
 * Returns the code if the error class is registered, or undefined if not.
 * This is the primary way consumers should read error codes.
 */
export function getErrorCode(error: Error): ErrorCode | undefined {
  return ERROR_CODES[error.name as keyof typeof ERROR_CODES];
}

/**
 * List of all error class names that should carry a code.
 *
 * Used by the test to assert completeness. When a new error class is added to
 * the SDK, it must be added here AND to ERROR_CODES.
 */
export const ALL_ERROR_CLASS_NAMES = [
  "MaxAmountExceededError",
  "DisallowedAssetError",
  "NoUsablePaymentOptionError",
  "InvalidRequirementsError",
  "PaymentRejectedError",
  "InvalidAmountError",
  "InvalidRecipientError",
  "WalletApiError",
  "WalletNotReadyError",
  "WalletNetworkMismatchError",
  "PasskeyBrowserRequiredError",
  "PolicyApiError",
  "PolicyNotDeployableError",
  "PolicyListFilterError",
  "TransactionTimeoutError",
  "RateLimitError",
  "X402NotConfiguredError",
  "AuthEntryMismatchError",
  "MainnetConfigError",
  "RequestSigningUnavailableError",
  "InvalidSigningConfigError",
  "AgentsNotConfiguredError",
  "InvalidAgentInputError",
  "BudgetAttributeDeniedError",
  "InvalidBudgetAttributeRuleError",
  "CapabilityDeniedError",
  "InvalidCapabilityRuleError",
  "CircuitOpenError",
  "BatchBalanceSizeError",
] as const;

/**
 * Cross-check: documented error codes from error-codes.md that have no
 * corresponding SDK error class.
 *
 * These are facilitator-side codes that arrive as string codes in the JSON
 * body, not as SDK error classes. They are listed here for completeness but
 * are NOT expected to appear in ERROR_CODES.
 */
export const FACILITATOR_ONLY_CODES = [
  "settle_exact_stellar_transaction_submission_failed",
  "settle_exact_stellar_transaction_failed",
  "settlement_refused",
  "invalid_exact_stellar_payload_authorization_replayed",
  "invalid_exact_stellar_payload_missing_trustline_recipient",
  "invalid_exact_stellar_payload_unsupported_credential_type",
  "fee_exceeds_maximum",
] as const;

/**
 * Cross-check: SDK error classes that have no corresponding entry in
 * error-codes.md.
 *
 * These errors exist in the SDK but are not documented on the error-codes
 * page. They should either be added to the docs or marked as internal.
 */
export const UNDOCUMENTED_SDK_ERRORS: string[] = [
  // None currently — all exported error classes are documented.
];