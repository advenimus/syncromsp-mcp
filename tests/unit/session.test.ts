import { describe, it, expect, beforeEach } from "vitest";
import {
  getSession,
  navigateTo,
  navigateBack,
  setSession,
  removeSession,
} from "../../src/session.js";

describe("Session", () => {
  beforeEach(() => {
    removeSession("test-session");
  });

  it("should create a new session with null domain", () => {
    const session = getSession("test-session");
    expect(session.currentDomain).toBeNull();
  });

  it("should navigate to a domain", () => {
    const newState = navigateTo("test-session", "tickets");
    setSession("test-session", newState);

    const session = getSession("test-session");
    expect(session.currentDomain).toBe("tickets");
  });

  it("should navigate back to root", () => {
    const nav = navigateTo("test-session", "tickets");
    setSession("test-session", nav);

    const back = navigateBack("test-session");
    setSession("test-session", back);

    const session = getSession("test-session");
    expect(session.currentDomain).toBeNull();
  });

  it("should support multiple independent sessions", () => {
    const state1 = navigateTo("session-1", "tickets");
    setSession("session-1", state1);

    const state2 = navigateTo("session-2", "customers");
    setSession("session-2", state2);

    expect(getSession("session-1").currentDomain).toBe("tickets");
    expect(getSession("session-2").currentDomain).toBe("customers");

    removeSession("session-1");
    removeSession("session-2");
  });

  it("should return immutable state (new object on navigate)", () => {
    const original = getSession("test-session");
    const navigated = navigateTo("test-session", "tickets");

    expect(original.currentDomain).toBeNull();
    expect(navigated.currentDomain).toBe("tickets");
  });
});
