import { describe, it, expect } from "vitest";
import {
  requireId,
  requireNumber,
  requireString,
  optionalString,
  optionalNumber,
  optionalBoolean,
  optionalId,
  pickDefined,
} from "../../src/utils/validators.js";

describe("validators", () => {
  describe("requireId", () => {
    it("should accept positive integers", () => {
      expect(requireId(1)).toBe(1);
      expect(requireId(42)).toBe(42);
    });

    it("should reject non-positive", () => {
      expect(() => requireId(0)).toThrow();
      expect(() => requireId(-1)).toThrow();
    });

    it("should reject non-integers", () => {
      expect(() => requireId(1.5)).toThrow();
    });

    it("should reject non-numbers", () => {
      expect(() => requireId("1")).toThrow();
      expect(() => requireId(null)).toThrow();
      expect(() => requireId(undefined)).toThrow();
    });
  });

  describe("requireString", () => {
    it("should accept non-empty strings", () => {
      expect(requireString("hello", "test")).toBe("hello");
    });

    it("should trim whitespace", () => {
      expect(requireString("  hello  ", "test")).toBe("hello");
    });

    it("should reject empty strings", () => {
      expect(() => requireString("", "test")).toThrow();
      expect(() => requireString("  ", "test")).toThrow();
    });
  });

  describe("optionalString", () => {
    it("should return string for valid input", () => {
      expect(optionalString("hello")).toBe("hello");
    });

    it("should return undefined for null/undefined", () => {
      expect(optionalString(undefined)).toBeUndefined();
      expect(optionalString(null)).toBeUndefined();
    });

    it("should return undefined for empty strings", () => {
      expect(optionalString("")).toBeUndefined();
      expect(optionalString("  ")).toBeUndefined();
    });
  });

  describe("optionalBoolean", () => {
    it("should return boolean for valid input", () => {
      expect(optionalBoolean(true)).toBe(true);
      expect(optionalBoolean(false)).toBe(false);
    });

    it("should return undefined for non-boolean", () => {
      expect(optionalBoolean(undefined)).toBeUndefined();
      expect(optionalBoolean("true")).toBeUndefined();
    });
  });

  describe("pickDefined", () => {
    it("should remove undefined values", () => {
      const result = pickDefined({
        a: 1,
        b: undefined,
        c: "hello",
        d: null,
        e: undefined,
      });
      expect(result).toEqual({ a: 1, c: "hello", d: null });
    });
  });
});
