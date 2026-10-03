// --watch mode for the vellar inspect CLI command (#461).
//
// WHY THIS EXISTS: a settlement is not instant, so an operator checking on a
// payment runs inspect repeatedly by hand. src/tx-status.ts already implements
// exactly this polling loop, with injectable sleep and seams and a
// TransactionTimeoutError, and the CLI does not use it.
//
// This module implements a watch mode built on the same polling logic.
// The types and waitForTransaction are inlined here so contrib/ stays
// self-contained (no imports from src/).

export type TxStatus = "pending" | "success" | "failed";

export interface TxStatusReader {
  getStatus(hash: string): Promise<TxStatus>;
}

export class TransactionTimeoutError extends Error {
  constructor(hash: string, timeoutMs: number) {
    super(`Transaction ${hash} was still pending after ${timeoutMs}ms`);
    this.name = "TransactionTimeoutError";
  }
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Polls until the transaction reaches a final state; throws TransactionTimeoutError on timeout. */
export async function waitForTransaction(
  reader: TxStatusReader,
  hash: string,
  options: WaitOptions = {},
): Promise<"success" | "failed"> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;

  const deadline = now() + timeoutMs;
  for (;;) {
    let status: TxStatus;
    try {
      status = await reader.getStatus(hash);
    } catch {
      if (now() + intervalMs > deadline) throw new TransactionTimeoutError(hash, timeoutMs);
      await sleep(intervalMs);
      continue;
    }
    if (status !== "pending") return status;
    if (now() + intervalMs > deadline) throw new TransactionTimeoutError(hash, timeoutMs);
    await sleep(intervalMs);
  }
}

/** Exit codes for the watch command. */
export const WATCH_EXIT_CODES = {
  /** Transaction reached a final state (success or failed). */
  SUCCESS: 0,
  /** Transaction was confirmed as failed on-chain. */
  FAILED: 1,
  /** Transaction was still pending when the timeout expired. */
  TIMEOUT: 2,
} as const;

/** A status transition event, emitted during watch mode. */
export interface StatusTransition {
  from: TxStatus;
  to: TxStatus;
  timestamp: string;
}

export interface WatchOptions {
  /** Timeout in milliseconds. Default: 5 minutes.
   *
   * Justification: Stellar settlement latency is typically 5-10 seconds on
   * testnet, but can take longer under load. 5 minutes is generous enough to
   * cover edge cases without hanging indefinitely. */
  timeoutMs?: number;
  /** Polling interval in milliseconds. Default: 2 seconds. */
  intervalMs?: number;
  /** Output format. Default: "text". */
  format?: "text" | "json";
  /** Clock source (defaults to Date.now); overridable for tests. */
  now?: () => number;
  /** Sleep function (defaults to setTimeout); overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Writer function (defaults to console.log); overridable for tests. */
  write?: (line: string) => void;
}

/**
 * Watch a transaction until it reaches a final state or times out.
 *
 * Uses `waitForTransaction` — does NOT write a second polling loop.
 *
 * Returns an exit code:
 *   - 0: transaction reached a final state (success)
 *   - 1: transaction was confirmed as failed
 *   - 2: transaction timed out (still pending)
 */
export async function watchTransaction(
  reader: TxStatusReader,
  hash: string,
  options: WatchOptions = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
  const intervalMs = options.intervalMs ?? 2_000;
  const format = options.format ?? "text";
  const write = options.write ?? console.log;

  const emit = (transition: StatusTransition) => {
    if (format === "json") {
      write(JSON.stringify(transition));
    } else {
      const arrow = transition.from === transition.to ? "..." : "\u2192";
      write(`[${transition.timestamp}] ${transition.from} ${arrow} ${transition.to}`);
    }
  };

  try {
    emit({
      from: "pending",
      to: "pending",
      timestamp: new Date().toISOString(),
    });

    const result = await waitForTransaction(reader, hash, {
      timeoutMs,
      intervalMs,
      sleep: options.sleep,
      now: options.now,
    });

    emit({
      from: "pending",
      to: result,
      timestamp: new Date().toISOString(),
    });

    if (format === "text") {
      write("");
      write(`Transaction ${hash}: ${result}`);
    }

    return result === "success" ? WATCH_EXIT_CODES.SUCCESS : WATCH_EXIT_CODES.FAILED;
  } catch (err) {
    if (err instanceof TransactionTimeoutError) {
      if (format === "text") {
        write("");
        write(`Transaction ${hash}: timed out after ${timeoutMs}ms`);
        write("  The transaction may still settle. Check again later.");
      } else {
        write(
          JSON.stringify({
            event: "timeout",
            hash,
            timeoutMs,
            timestamp: new Date().toISOString(),
          }),
        );
      }
      return WATCH_EXIT_CODES.TIMEOUT;
    }
    throw err;
  }
}

/**
 * Create a TxStatusReader from a Horizon URL.
 *
 * This is a thin adapter that queries Horizon's transaction endpoint and
 * maps the response to a TxStatus.
 */
export function createHorizonTxStatusReader(baseUrl: string): TxStatusReader {
  return {
    async getStatus(hash: string): Promise<TxStatus> {
      const res = await fetch(`${baseUrl}/transactions/${hash}`);
      if (!res.ok) {
        if (res.status === 404) return "pending";
        throw new Error(`Horizon returned ${res.status} ${res.statusText}`);
      }
      const tx = (await res.json()) as { successful?: boolean };
      return tx.successful === true ? "success" : "failed";
    },
  };
}