---
description: Diff Syncro's live OpenAPI spec against this repo's cached docs/swagger.json and report any new endpoints, query params, or request-body fields that the MCP server doesn't yet expose.
argument-hint: "[--apply]"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# Check Syncro API for new endpoints

You are auditing the SyncroMSP MCP server in this repository for API coverage gaps. The Syncro OpenAPI spec at `https://api-docs.syncromsp.com/swagger.json` is the source of truth. Your local cached copy lives at `docs/swagger.json`. The repository's tools live under `src/domains/*.ts`.

If the user passed `--apply` (check `$ARGUMENTS`), implement the additions after producing the report. Otherwise, produce only the report and ask whether to proceed.

## Step 1 — Fetch the live spec

Use a temp file outside the repo so we don't dirty the worktree before deciding to update:

```bash
TMP_SWAGGER="${TMPDIR:-/tmp}/syncro-swagger-live.json"
curl -fsSL -o "$TMP_SWAGGER" https://api-docs.syncromsp.com/swagger.json
test -s "$TMP_SWAGGER" || { echo "Failed to download spec"; exit 1; }
```

If the download fails, stop and tell the user.

## Step 2 — Diff against the cached spec

Run a Python diff covering three categories of drift:

```bash
python3 - <<'PY'
import json, os
tmp = os.environ.get("TMPDIR", "/tmp").rstrip("/") + "/syncro-swagger-live.json"
old = json.load(open("docs/swagger.json"))
new = json.load(open(tmp))

old_paths = old.get("paths", {})
new_paths = new.get("paths", {})

added_paths = sorted(set(new_paths) - set(old_paths))
removed_paths = sorted(set(old_paths) - set(new_paths))

method_diffs = []
for p in sorted(set(old_paths) & set(new_paths)):
    om, nm = set(old_paths[p]), set(new_paths[p])
    if om != nm:
        method_diffs.append((p, sorted(om), sorted(nm)))

def get_params(spec_paths, path, method):
    op = spec_paths.get(path, {}).get(method, {})
    return {x["name"]: x.get("description", "") for x in op.get("parameters", [])}

def get_body_props(spec_paths, path, method):
    op = spec_paths.get(path, {}).get(method, {})
    body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema", {})
    return set((body.get("properties") or {}).keys())

param_drift, body_drift = [], []
for p in sorted(set(old_paths) & set(new_paths)):
    for m in set(old_paths[p]) & set(new_paths[p]):
        added_params = set(get_params(new_paths, p, m)) - set(get_params(old_paths, p, m))
        if added_params:
            param_drift.append((p, m, sorted(added_params)))
        if m in ("post", "put", "patch"):
            added_body = get_body_props(new_paths, p, m) - get_body_props(old_paths, p, m)
            if added_body:
                body_drift.append((p, m, sorted(added_body)))

print("=== ADDED PATHS ===")
for p in added_paths:
    print(f"  {p} -> {sorted(new_paths[p].keys())}")
print("\n=== REMOVED PATHS ===")
for p in removed_paths:
    print(f"  {p}")
print("\n=== METHOD CHANGES ===")
for p, o, n in method_diffs:
    print(f"  {p}: {o} -> {n}")
print("\n=== ADDED QUERY PARAMS ON EXISTING ENDPOINTS ===")
for p, m, params in param_drift:
    print(f"  {m.upper()} {p}: {', '.join(params)}")
print("\n=== ADDED REQUEST-BODY FIELDS ON EXISTING ENDPOINTS ===")
for p, m, fields in body_drift:
    print(f"  {m.upper()} {p}: {', '.join(fields)}")
PY
```

## Step 3 — Map each gap to a MCP domain

For every added path, every added query param, and every added body field, identify which file under `src/domains/` should host the new tool or new field:

- Path → which `src/domains/*.ts` already references the same path prefix? (e.g., `/policy_folders` → new `policies` domain; `/customer_assets/...` → `assets.ts`; `/tickets/...` or `/ticket_*` → `tickets.ts`)
- Param drift → grep the domain file for the bare path (e.g., `client.get("/tickets"`) to locate the tool to extend
- Body drift → grep for the matching `client.post/put` call

Note any path with no obvious home — those are candidates for a new domain (register in `src/types.ts` `DOMAIN_NAMES`, `DOMAIN_DESCRIPTIONS`, and `src/domains/index.ts` `domainLoaders`).

## Step 4 — Produce the report

Output a punch list to the user with this exact shape:

```
## Syncro API drift report

### New endpoints (not in src/domains/)
- METHOD /path → suggested home: <domain.ts> as <proposed_tool_name>

### Added query params on existing tools
- <tool_name> (in <domain.ts>): <param1>, <param2>

### Added request-body fields on existing tools
- <tool_name> (in <domain.ts>): <field1>, <field2>

### Removed/changed (manual review)
- ...

### Suggested action
Run `/check-syncro-apis --apply` to implement the additions, or pick a subset.
```

If every section is empty, say so and stop — no action needed.

## Step 5 — If `--apply` was passed, implement

For each gap, follow the conventions already established in `src/domains/`:

- New domains: copy the structure of `src/domains/policies.ts` (named export `createDomain`, `DomainTool[]`, `DomainHandler` return).
- New tools in existing domains: insert near related tools, follow naming convention `<domain>_<verb>_<noun>` (e.g., `assets_get_installed_applications`).
- Use `requireId`/`optionalId`/`optionalString`/`optionalNumber`/`optionalBoolean`/`pickDefined` from `src/utils/validators.js` consistently.
- DELETE tools must gate on `args.confirmed === true` and return a textResult prompt when unconfirmed (see `policies_delete_folder` for the pattern).
- Use `jsonResult(...)` for successful responses, `textResult(...)` for confirmation prompts.

After editing source files:

1. Replace `docs/swagger.json` with the freshly fetched spec: `cp "$TMP_SWAGGER" docs/swagger.json`
2. Run `npm run build` — must succeed with no TS errors
3. Run `npm test` — all tests must pass
4. Update the domain table and endpoint count in `README.md` if a new domain was added
5. Report a summary of changes back to the user (file list + new tool count). Do not commit unless the user asks.

## Notes

- The cached `docs/swagger.json` only reflects what was current at the last refresh. If you want a deeper "ever-missed endpoint" audit, do a coverage diff: list every `paths` key in the live spec, grep each one against `src/domains/*.ts` (`client.get("...")`, `client.post("...")`, etc.), and flag any path with zero matches. This is a heavier check — only run it if the user asks.
- Don't rely on memory of what endpoints exist. Always re-fetch the live spec each invocation.
- Rate limit: Syncro's spec URL is unauthenticated and lightly cached. Don't loop calls.
