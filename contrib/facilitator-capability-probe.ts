// Facilitator capability probe for the CLI and SDK (#462).
//
// WHY THIS EXISTS: the x402 flow assumes things about the facilitator: which
// network it settles on, which schemes it supports, and whether it sponsors
// fees. All of that is discovered per payment, from a 402 challenge. There is
// no way to ask a facilitator what it supports before trying to use it.
//
// This module implements a capability probe, exposed through both the SDK and
// the CLI, sharing one implementation.

/**
 * Facilitator capabilities as reported by the capability probe.
 *
 * Every field is treated as untrusted seller-controlled data, following the
 * discipline in src/x402-untrusted.ts.
 */
export interface FacilitatorCapabilities {
  /** The facilitator's own URL (echoed back). */
  url: string;
  /** Supported networks in CAIP-2 format (e.g. "stellar:testnet"). */
  networks: string[];
  /** Supported payment schemes (e.g. "exact"). */
  schemes: string[];
  /** Whether the facilitator sponsors fees. */
  areFeesSponsored: boolean;
  /** Facilitator version string, if reported. */
  version?: string;
  /** Raw response for debugging. */
  raw: unknown;
}

/**
 * Configuration mismatch between facilitator and local config.
 */
export interface CapabilityMismatch {
  field: string;
  expected: string | string[] | boolean;
  actual: string | string[] | boolean;
  message: string;
}

export interface ProbeOptions {
  /** Timeout in milliseconds for the capability request. */
  timeoutMs?: number;
  /** Fetch implementation (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * Query the facilitator for its supported networks, schemes, and
 * fee-sponsorship posture.
 *
 * Does NOT sign anything or read a key — this is a read-only probe.
 *
 * The facilitator's /health or /capabilities endpoint is tried first. If the
 * facilitator does not expose such an endpoint, this returns null rather than
 * inferring capability from a 402.
 */
export async function probeFacilitator(
  facilitatorUrl: string,
  options: ProbeOptions = {},
): Promise<FacilitatorCapabilities | null> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Try /capabilities first, then /health as fallback
    for (const endpoint of ["/capabilities", "/health"]) {
      try {
        const res = await fetchImpl(`${facilitatorUrl}${endpoint}`, {
          method: "GET",
          signal: controller.signal,
        });

        if (!res.ok) continue;

        const data = (await res.json()) as Record<string, unknown>;

        // Extract capabilities from the response
        const networks = extractNetworks(data);
        const schemes = extractSchemes(data);
        const areFeesSponsored = extractFeeSponsorship(data);
        const version = typeof data.version === "string" ? data.version : undefined;

        return {
          url: facilitatorUrl,
          networks,
          schemes,
          areFeesSponsored,
          version,
          raw: data,
        };
      } catch {
        // Try next endpoint
      }
    }

    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compare facilitator capabilities against local configuration.
 *
 * Returns a list of mismatches. An empty list means the facilitator is
 * compatible with the local config.
 */
export function checkCapabilityMismatches(
  capabilities: FacilitatorCapabilities,
  localConfig: {
    network: string;
    scheme?: string;
    areFeesSponsored?: boolean;
  },
): CapabilityMismatch[] {
  const mismatches: CapabilityMismatch[] = [];

  // Check network
  const caip2 = `stellar:${localConfig.network === "mainnet" ? "pubnet" : localConfig.network}`;
  if (!capabilities.networks.includes(caip2)) {
    mismatches.push({
      field: "network",
      expected: caip2,
      actual: capabilities.networks.join(", "),
      message: `Facilitator does not support ${caip2}. Supported: ${capabilities.networks.join(", ") || "(none)"}`,
    });
  }

  // Check scheme
  if (localConfig.scheme) {
    if (!capabilities.schemes.includes(localConfig.scheme)) {
      mismatches.push({
        field: "scheme",
        expected: localConfig.scheme,
        actual: capabilities.schemes.join(", "),
        message: `Facilitator does not support scheme '${localConfig.scheme}'. Supported: ${capabilities.schemes.join(", ") || "(none)"}`,
      });
    }
  }

  // Check fee sponsorship
  if (
    localConfig.areFeesSponsored !== undefined &&
    capabilities.areFeesSponsored !== localConfig.areFeesSponsored
  ) {
    mismatches.push({
      field: "areFeesSponsored",
      expected: localConfig.areFeesSponsored,
      actual: capabilities.areFeesSponsored,
      message: localConfig.areFeesSponsored
        ? "Facilitator does not sponsor fees, but local config requires it."
        : "Facilitator sponsors fees, but local config does not expect it.",
    });
  }

  return mismatches;
}

/**
 * Format capability mismatches for human-readable output.
 */
export function formatMismatches(mismatches: CapabilityMismatch[]): string {
  if (mismatches.length === 0) return "No mismatches — facilitator is compatible.";

  const lines = ["Facilitator capability mismatches:"];
  for (const m of mismatches) {
    lines.push(`  - ${m.message}`);
  }
  return lines.join("\n");
}

/**
 * Format capabilities for human-readable output.
 */
export function formatCapabilities(capabilities: FacilitatorCapabilities): string {
  const lines = [
    `Facilitator: ${capabilities.url}`,
    `  Networks: ${capabilities.networks.join(", ") || "(none)"}`,
    `  Schemes: ${capabilities.schemes.join(", ") || "(none)"}`,
    `  Fee sponsorship: ${capabilities.areFeesSponsored ? "yes" : "no"}`,
  ];
  if (capabilities.version) {
    lines.push(`  Version: ${capabilities.version}`);
  }
  return lines.join("\n");
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function extractNetworks(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.networks)) {
    return data.networks.filter((n): n is string => typeof n === "string");
  }
  if (Array.isArray(data.supportedNetworks)) {
    return data.supportedNetworks.filter((n): n is string => typeof n === "string");
  }
  if (typeof data.network === "string") {
    return [data.network];
  }
  return [];
}

function extractSchemes(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.schemes)) {
    return data.schemes.filter((s): s is string => typeof s === "string");
  }
  if (Array.isArray(data.supportedSchemes)) {
    return data.supportedSchemes.filter((s): s is string => typeof s === "string");
  }
  return [];
}

function extractFeeSponsorship(data: Record<string, unknown>): boolean {
  if (typeof data.areFeesSponsored === "boolean") return data.areFeesSponsored;
  if (typeof data.feeSponsorship === "boolean") return data.feeSponsorship;
  if (typeof data.sponsorsFees === "boolean") return data.sponsorsFees;
  return false;
}