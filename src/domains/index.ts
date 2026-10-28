import type { DomainHandler, DomainName } from "../types.js";
import type { SyncroApiClient } from "../api-client.js";

// Handlers close over their client, so the cache must be per client or one
// user's session would end up calling Syncro with another user's key.
let domainCache = new WeakMap<SyncroApiClient, ReadonlyMap<DomainName, DomainHandler>>();

const domainLoaders: Record<DomainName, () => Promise<{ createDomain: (client: SyncroApiClient) => DomainHandler }>> = {
  tickets: () => import("./tickets.js"),
  customers: () => import("./customers.js"),
  assets: () => import("./assets.js"),
  contacts: () => import("./contacts.js"),
  invoices: () => import("./invoices.js"),
  estimates: () => import("./estimates.js"),
  appointments: () => import("./appointments.js"),
  products: () => import("./products.js"),
  payments: () => import("./payments.js"),
  leads: () => import("./leads.js"),
  contracts: () => import("./contracts.js"),
  rmm: () => import("./rmm.js"),
  scheduling: () => import("./scheduling.js"),
  time: () => import("./time.js"),
  admin: () => import("./admin.js"),
  policies: () => import("./policies.js"),
};

export async function loadDomain(name: DomainName, client: SyncroApiClient): Promise<DomainHandler> {
  const perClient = domainCache.get(client) ?? new Map<DomainName, DomainHandler>();
  const cached = perClient.get(name);
  if (cached) return cached;

  const loader = domainLoaders[name];
  if (!loader) throw new Error(`Unknown domain: ${name}`);

  const module = await loader();
  const handler = module.createDomain(client);
  domainCache.set(client, new Map(perClient).set(name, handler));
  return handler;
}

export function releaseDomains(client: SyncroApiClient): void {
  domainCache.delete(client);
}

export function hasCachedDomains(client: SyncroApiClient): boolean {
  return domainCache.has(client);
}

export function clearDomainCache(): void {
  domainCache = new WeakMap();
}
