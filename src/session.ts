import type { DomainName } from "./types.js";

export interface SessionState {
  currentDomain: DomainName | null;
}

const sessions = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState {
  let session = sessions.get(sessionId);
  if (!session) {
    session = { currentDomain: null };
    sessions.set(sessionId, session);
  }
  return session;
}

export function navigateTo(sessionId: string, domain: DomainName): SessionState {
  const session = getSession(sessionId);
  return { ...session, currentDomain: domain };
}

export function navigateBack(sessionId: string): SessionState {
  const session = getSession(sessionId);
  return { ...session, currentDomain: null };
}

export function setSession(sessionId: string, state: SessionState): void {
  sessions.set(sessionId, state);
}

export function removeSession(sessionId: string): void {
  sessions.delete(sessionId);
}

let defaultSessionId = "default";

export function getDefaultSessionId(): string {
  return defaultSessionId;
}

export function setDefaultSessionId(id: string): void {
  defaultSessionId = id;
}
