import { describe, it, expect } from "vitest";
import {
  computeBodyBinding,
  canonicalRequestStringWithBodyHash,
} from "./x402-request-auth-body-hash";

describe("computeBodyBinding", () => {
  it("returns 'absent:' for undefined body", async () => {
    expect(await computeBodyBinding(undefined)).toBe("absent:");
  });

  it("returns 'absent:' for null body", async () => {
    expect(await computeBodyBinding(null)).toBe("absent:");
  });

  it("returns 'empty:<hash>' for empty string", async () => {
    const binding = await computeBodyBinding("");
    expect(binding).toMatch(/^empty:[0-9a-f]{64}$/);
    // SHA-256 of empty string
    expect(binding).toBe(
      "empty:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns 'sha256:<hash>' for non-empty body", async () => {
    const binding = await computeBodyBinding('{"amount":"1000000"}');
    expect(binding).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces different bindings for different bodies", async () => {
    const a = await computeBodyBinding('{"amount":"1000000"}');
    const b = await computeBodyBinding('{"amount":"2000000"}');
    expect(a).not.toBe(b);
  });

  it("produces different bindings for different key orders", async () => {
    const a = await computeBodyBinding('{"a":"1","b":"2"}');
    const b = await computeBodyBinding('{"b":"2","a":"1"}');
    expect(a).not.toBe(b);
  });

  it("absent and empty produce different bindings", async () => {
    const absent = await computeBodyBinding(undefined);
    const empty = await computeBodyBinding("");
    expect(absent).not.toBe(empty);
  });

  it("produces deterministic output for the same input", async () => {
    const a = await computeBodyBinding("hello world");
    const b = await computeBodyBinding("hello world");
    expect(a).toBe(b);
  });
});

describe("canonicalRequestStringWithBodyHash", () => {
  const base = {
    method: "POST",
    path: "/verify",
    timestamp: "1727500000",
    nonce: "abcdef0123456789abcdef0123456789",
  };

  it("uses body binding instead of raw body", async () => {
    const result = await canonicalRequestStringWithBodyHash({
      ...base,
      body: '{"amount":"1000000"}',
    });
    const lines = result.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/verify");
    expect(lines[2]).toBe("1727500000");
    expect(lines[3]).toBe("abcdef0123456789abcdef0123456789");
    // Last line is the body binding, not the raw body
    expect(lines[4]).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lines[4]).not.toBe('{"amount":"1000000"}');
  });

  it("handles absent body", async () => {
    const result = await canonicalRequestStringWithBodyHash({
      ...base,
      body: undefined,
    });
    const lines = result.split("\n");
    expect(lines[4]).toBe("absent:");
  });

  it("handles empty body", async () => {
    const result = await canonicalRequestStringWithBodyHash({
      ...base,
      body: "",
    });
    const lines = result.split("\n");
    expect(lines[4]).toMatch(/^empty:[0-9a-f]{64}$/);
  });

  it("two different bodies produce different canonical strings", async () => {
    const a = await canonicalRequestStringWithBodyHash({
      ...base,
      body: '{"amount":"1000000"}',
    });
    const b = await canonicalRequestStringWithBodyHash({
      ...base,
      body: '{"amount":"2000000"}',
    });
    expect(a).not.toBe(b);
  });

  it("naive canonicalisation would collapse these to one signature (different key order)", async () => {
    // These two bodies are semantically equivalent but byte-different.
    // A naive canonicalisation that sorts keys would make them identical.
    // Our binding treats them as different because it hashes the raw bytes.
    const a = await canonicalRequestStringWithBodyHash({
      ...base,
      body: '{"a":"1","b":"2"}',
    });
    const b = await canonicalRequestStringWithBodyHash({
      ...base,
      body: '{"b":"2","a":"1"}',
    });
    expect(a).not.toBe(b);
  });
});