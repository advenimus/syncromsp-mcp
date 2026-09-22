import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncroApiClient } from "../../../src/api-client.js";
import { createDomain as createRmm } from "../../../src/domains/rmm.js";
import { createDomain as createAssets } from "../../../src/domains/assets.js";
import type { DomainHandler } from "../../../src/types.js";

function createMockClient() {
  const client = new SyncroApiClient({ apiKey: "test", subdomain: "test" });
  vi.spyOn(client, "get").mockResolvedValue({ assets: [] });
  vi.spyOn(client, "post").mockResolvedValue({ message: "Ok, script scheduled." });
  return client;
}

function findTool(domain: DomainHandler, name: string) {
  return domain.getTools().find((t) => t.definition.name === name)!;
}

describe("RMM Domain: rmm_schedule_script", () => {
  let client: SyncroApiClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("should not run anything until confirmed", async () => {
    const result = await findTool(createRmm(client), "rmm_schedule_script").handler({
      asset_id: 9, script_id: 3, run_type: "now",
    });

    expect(result.content[0].text).toContain("CONFIRMATION REQUIRED");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("should run a script now with runtime variables", async () => {
    await findTool(createRmm(client), "rmm_schedule_script").handler({
      asset_id: 9,
      script_id: 3,
      run_type: "now",
      next_time: "2026-10-01T02:00:00Z",
      runtime_variables: { path: "C:\\Temp" },
      confirmed: true,
    });

    expect(client.post).toHaveBeenCalledWith("/rmm/public_scripts/9/schedule", {
      script_id: 3,
      run_type: "now",
      freq: "once",
      script_options: { runtime_variables: { path: "C:\\Temp" } },
    });
  });

  it("should schedule a later run with next_time", async () => {
    await findTool(createRmm(client), "rmm_schedule_script").handler({
      asset_id: 9, script_id: 3, run_type: "later", next_time: "2026-10-01T02:00:00Z", confirmed: true,
    });

    expect(client.post).toHaveBeenCalledWith("/rmm/public_scripts/9/schedule", {
      script_id: 3,
      run_type: "later",
      freq: "once",
      next_time: "2026-10-01T02:00:00Z",
    });
  });

  it("should reject a later run without next_time", async () => {
    await expect(
      findTool(createRmm(client), "rmm_schedule_script").handler({ asset_id: 9, script_id: 3, run_type: "later", confirmed: true })
    ).rejects.toThrow("next_time");
    expect(client.post).not.toHaveBeenCalled();
  });

  it("should reject an unknown run_type", async () => {
    await expect(
      findTool(createRmm(client), "rmm_schedule_script").handler({ asset_id: 9, script_id: 3, run_type: "daily", confirmed: true })
    ).rejects.toThrow("run_type");
  });
});

describe("Assets Domain: assets_list_by_contact", () => {
  it("should list a contact's assets with paging", async () => {
    const client = createMockClient();

    await findTool(createAssets(client), "assets_list_by_contact").handler({ contact_id: 21, page: 2 });

    expect(client.get).toHaveBeenCalledWith("/customer_assets/assets_by_contact/21", { page: 2 });
  });
});
