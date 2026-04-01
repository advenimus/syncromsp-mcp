import type { DomainHandler, DomainName } from "../types.js";
import type { SyncroApiClient } from "../api-client.js";

const domainCache = new Map<DomainName, DomainHandler>();

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
};

export async function loadDomain(name: DomainName, client: SyncroApiClient): Promise<DomainHandler> {
  const cached = domainCache.get(name);
  if (cached) return cached;

  const loader = domainLoaders[name];
  if (!loader) throw new Error(`Unknown domain: ${name}`);

  const module = await loader();
  const handler = module.createDomain(client);
  domainCache.set(name, handler);
  return handler;
}

export function clearDomainCache(): void {
  domainCache.clear();
}
