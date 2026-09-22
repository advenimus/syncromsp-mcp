import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../../src/api-client.js";
import { createDomain } from "../../../src/domains/time.js";

function createMockClient() {
  const client = new SyncroApiClient({ apiKey: "test", subdomain: "test" });
  vi.spyOn(client, "get").mockResolvedValue({ ticket_timers: [] });
  vi.spyOn(client, "post").mockResolvedValue({ id: 1 });
  vi.spyOn(client, "patch").mockResolvedValue({ id: 1 });
  return client;
}

function findTool(client: SyncroApiClient, name: string) {
  return createDomain(client).getTools().find((t) => t.definition.name === name)!;
}

describe("Time Domain", () => {
  let client: SyncroApiClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should register the timer lifecycle tools", () => {
    const names = createDomain(client).getTools().map((t) => t.definition.name);

    expect(names).toEqual(expect.arrayContaining([
      "time_list_timers",
      "time_create_timer",
      "time_start_timer",
      "time_pause_timer",
      "time_stop_timer",
      "time_update_timer",
    ]));
  });

  it("should filter timers by ticket, user, and state", async () => {
    await findTool(client, "time_list_timers").handler({ ticket_id: 5, user_id: 2, status: "running" });

    expect(client.get).toHaveBeenCalledWith("/ticket_timers", { ticket_id: 5, user_id: 2, status: "running" });
  });

  it("should create a timer with only the fields given", async () => {
    await findTool(client, "time_create_timer").handler({ ticket_id: 10, notes: "Onsite", billable: false });

    expect(client.post).toHaveBeenCalledWith("/ticket_timers", { ticket_id: 10, notes: "Onsite", billable: false });
  });

  it("should require a ticket_id to create a timer", async () => {
    await expect(findTool(client, "time_create_timer").handler({ notes: "x" })).rejects.toThrow("ticket_id");
    expect(client.post).not.toHaveBeenCalled();
  });

  it.each([
    ["time_start_timer", "/ticket_timers/7/start"],
    ["time_pause_timer", "/ticket_timers/7/pause"],
    ["time_stop_timer", "/ticket_timers/7/stop"],
  ])("%s should POST to %s", async (name, path) => {
    await findTool(client, name).handler({ id: 7 });

    expect(client.post).toHaveBeenCalledWith(path);
  });

  it("should send billable when updating a timer", async () => {
    await findTool(client, "time_update_timer").handler({ id: 3, billable: true });

    expect(client.patch).toHaveBeenCalledWith("/ticket_timers/3", { billable: true });
  });

  it("should reject a timer update without billable", async () => {
    await expect(findTool(client, "time_update_timer").handler({ id: 3 })).rejects.toThrow("billable");
    expect(client.patch).not.toHaveBeenCalled();
  });
});
