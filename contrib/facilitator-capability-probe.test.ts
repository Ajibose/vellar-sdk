import { describe, it, expect, vi } from "vitest";
import {
  probeFacilitator,
  checkCapabilityMismatches,
  formatMismatches,
  formatCapabilities,
} from "./facilitator-capability-probe";

describe("probeFacilitator", () => {
  it("returns capabilities from /capabilities endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          networks: ["stellar:testnet"],
          schemes: ["exact"],
          areFeesSponsored: true,
          version: "1.0.0",
        }),
    });

    const result = await probeFacilitator("https://facilitator.example.com", {
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result!.networks).toEqual(["stellar:testnet"]);
    expect(result!.schemes).toEqual(["exact"]);
    expect(result!.areFeesSponsored).toBe(true);
    expect(result!.version).toBe("1.0.0");
    expect(result!.url).toBe("https://facilitator.example.com");
  });

  it("falls back to /health when /capabilities fails", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            network: "stellar:testnet",
            sponsorsFees: true,
          }),
      });

    const result = await probeFacilitator("https://facilitator.example.com", {
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result!.networks).toEqual(["stellar:testnet"]);
    expect(result!.areFeesSponsored).toBe(true);
  });

  it("returns null when both endpoints fail", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await probeFacilitator("https://facilitator.example.com", {
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).toBeNull();
  });

  it("returns null on timeout", async () => {
    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("aborted")), 200);
        }),
    );

    const result = await probeFacilitator("https://facilitator.example.com", {
      timeoutMs: 50,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).toBeNull();
  });

  it("handles various response shapes", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          supportedNetworks: ["stellar:pubnet"],
          supportedSchemes: ["exact", "upto"],
          feeSponsorship: false,
        }),
    });

    const result = await probeFacilitator("https://facilitator.example.com", {
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result!.networks).toEqual(["stellar:pubnet"]);
    expect(result!.schemes).toEqual(["exact", "upto"]);
    expect(result!.areFeesSponsored).toBe(false);
  });
});

describe("checkCapabilityMismatches", () => {
  const capabilities = {
    url: "https://facilitator.example.com",
    networks: ["stellar:testnet"],
    schemes: ["exact"],
    areFeesSponsored: true,
    raw: {},
  };

  it("returns empty list when everything matches", () => {
    const mismatches = checkCapabilityMismatches(capabilities, {
      network: "testnet",
      scheme: "exact",
      areFeesSponsored: true,
    });
    expect(mismatches).toHaveLength(0);
  });

  it("detects network mismatch", () => {
    const mismatches = checkCapabilityMismatches(capabilities, {
      network: "mainnet",
    });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.field).toBe("network");
    expect(mismatches[0]!.message).toContain("stellar:pubnet");
  });

  it("detects scheme mismatch", () => {
    const mismatches = checkCapabilityMismatches(capabilities, {
      network: "testnet",
      scheme: "upto",
    });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.field).toBe("scheme");
  });

  it("detects fee sponsorship mismatch", () => {
    const mismatches = checkCapabilityMismatches(capabilities, {
      network: "testnet",
      areFeesSponsored: false,
    });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]!.field).toBe("areFeesSponsored");
  });

  it("detects multiple mismatches", () => {
    const mismatches = checkCapabilityMismatches(capabilities, {
      network: "mainnet",
      scheme: "upto",
      areFeesSponsored: false,
    });
    expect(mismatches).toHaveLength(3);
  });
});

describe("formatMismatches", () => {
  it("returns 'no mismatches' for empty list", () => {
    expect(formatMismatches([])).toContain("No mismatches");
  });

  it("formats multiple mismatches", () => {
    const mismatches = [
      {
        field: "network",
        expected: "stellar:pubnet",
        actual: "stellar:testnet",
        message: "Facilitator does not support stellar:pubnet.",
      },
      {
        field: "areFeesSponsored",
        expected: true,
        actual: false,
        message: "Facilitator does not sponsor fees.",
      },
    ];
    const result = formatMismatches(mismatches);
    expect(result).toContain("mismatches");
    expect(result).toContain("stellar:pubnet");
    expect(result).toContain("sponsor fees");
  });
});

describe("formatCapabilities", () => {
  it("formats capabilities for display", () => {
    const capabilities = {
      url: "https://facilitator.example.com",
      networks: ["stellar:testnet", "stellar:pubnet"],
      schemes: ["exact"],
      areFeesSponsored: true,
      version: "1.0.0",
      raw: {},
    };
    const result = formatCapabilities(capabilities);
    expect(result).toContain("facilitator.example.com");
    expect(result).toContain("stellar:testnet");
    expect(result).toContain("stellar:pubnet");
    expect(result).toContain("yes");
    expect(result).toContain("1.0.0");
  });
});