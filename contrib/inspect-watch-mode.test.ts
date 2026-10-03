import { describe, it, expect, vi } from "vitest";
import {
  watchTransaction,
  WATCH_EXIT_CODES,
  createHorizonTxStatusReader,
} from "./inspect-watch-mode";
import type { TxStatusReader, TxStatus } from "./inspect-watch-mode";

function makeReader(statuses: TxStatus[]): TxStatusReader {
  let i = 0;
  return {
    async getStatus() {
      return statuses[i++] ?? statuses[statuses.length - 1]!;
    },
  };
}

describe("watchTransaction", () => {
  it("returns SUCCESS exit code when transaction succeeds", async () => {
    const reader = makeReader(["success"]);
    const lines: string[] = [];
    const exitCode = await watchTransaction(reader, "abc123", {
      format: "text",
      write: (l) => lines.push(l),
    });
    expect(exitCode).toBe(WATCH_EXIT_CODES.SUCCESS);
    expect(lines.some((l) => l.includes("success"))).toBe(true);
  });

  it("returns FAILED exit code when transaction fails", async () => {
    const reader = makeReader(["failed"]);
    const lines: string[] = [];
    const exitCode = await watchTransaction(reader, "abc123", {
      format: "text",
      write: (l) => lines.push(l),
    });
    expect(exitCode).toBe(WATCH_EXIT_CODES.FAILED);
    expect(lines.some((l) => l.includes("failed"))).toBe(true);
  });

  it("returns TIMEOUT exit code when transaction times out", async () => {
    const reader = makeReader(["pending", "pending", "pending", "pending"]);
    const lines: string[] = [];
    const exitCode = await watchTransaction(reader, "abc123", {
      timeoutMs: 100,
      intervalMs: 50,
      format: "text",
      write: (l) => lines.push(l),
    });
    expect(exitCode).toBe(WATCH_EXIT_CODES.TIMEOUT);
    expect(lines.some((l) => l.includes("timed out"))).toBe(true);
  });

  it("emits status transitions in text format", async () => {
    const reader = makeReader(["pending", "pending", "success"]);
    const lines: string[] = [];
    await watchTransaction(reader, "abc123", {
      format: "text",
      write: (l) => lines.push(l),
    });
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.includes("pending"))).toBe(true);
    expect(lines.some((l) => l.includes("success"))).toBe(true);
  });

  it("emits one JSON line per transition", async () => {
    const reader = makeReader(["pending", "pending", "success"]);
    const lines: string[] = [];
    await watchTransaction(reader, "abc123", {
      format: "json",
      write: (l) => lines.push(l),
    });
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("timeout message includes hash and timeout", async () => {
    const reader = makeReader(["pending"]);
    const lines: string[] = [];
    await watchTransaction(reader, "abc123", {
      timeoutMs: 100,
      intervalMs: 50,
      format: "text",
      write: (l) => lines.push(l),
    });
    expect(lines.some((l) => l.includes("abc123"))).toBe(true);
    expect(lines.some((l) => l.includes("100ms") || l.includes("100"))).toBe(true);
  });

  it("timeout JSON includes event type", async () => {
    const reader = makeReader(["pending"]);
    const lines: string[] = [];
    await watchTransaction(reader, "abc123", {
      timeoutMs: 100,
      intervalMs: 50,
      format: "json",
      write: (l) => lines.push(l),
    });
    const timeoutLine = lines.find((l) => {
      try {
        return JSON.parse(l).event === "timeout";
      } catch {
        return false;
      }
    });
    expect(timeoutLine).toBeDefined();
    const parsed = JSON.parse(timeoutLine!);
    expect(parsed.hash).toBe("abc123");
    expect(parsed.timeoutMs).toBe(100);
  });
});

describe("createHorizonTxStatusReader", () => {
  it("returns 'pending' on 404", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const reader = createHorizonTxStatusReader("https://horizon-testnet.stellar.org");
    expect(await reader.getStatus("abc")).toBe("pending");
    globalThis.fetch = originalFetch;
  });

  it("returns 'success' for successful transaction", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ successful: true }),
    });
    const reader = createHorizonTxStatusReader("https://horizon-testnet.stellar.org");
    expect(await reader.getStatus("abc")).toBe("success");
    globalThis.fetch = originalFetch;
  });

  it("returns 'failed' for failed transaction", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ successful: false }),
    });
    const reader = createHorizonTxStatusReader("https://horizon-testnet.stellar.org");
    expect(await reader.getStatus("abc")).toBe("failed");
    globalThis.fetch = originalFetch;
  });
});