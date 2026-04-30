# SyncroMSP Skill

A reusable [Skill](https://docs.claude.com/en/docs/claude-code/skills) that gives Claude full operating context for the SyncroMSP MCP — workflows, API quirks, hyperlink display rules, and the procedures an IT MSP needs to run their business in Syncro.

This skill is **company-agnostic**. User-specific values (your subdomain, technician user_id, labor product IDs, appointment type IDs) are discovered at runtime via API calls and cached in a local `config.json`.

## What's in here

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill entry point — invocation rules, hyperlink rule, core principles, first-run setup |
| `config.example.json` | Template for the discovered/cached MSP-specific identifiers |
| `references/tickets.md` | Ticket creation, statuses, comments, problem types |
| `references/time-tracking.md` | Two-step labor logging (timer + charge_timer), labor product selection |
| `references/billing.md` | Invoices, estimates, payments, recurring billing, line items |
| `references/appointments.md` | Scheduling, appointment types |
| `references/customers.md` | Customers, contacts, leads, contracts, portal users |
| `references/rmm-and-assets.md` | Assets, RMM alerts, patches, vendors, POs |
| `references/api-quirks.md` | Known API gotchas and workarounds |
| `learnings/README.md` | Append-only log format — how Claude evolves the skill over time |

## Install

### Claude Code (CLI)

Copy this folder into your Claude Code skills directory:

```bash
cp -r skills/syncromsp ~/.claude/skills/syncromsp
```

The skill becomes available in any Claude Code session. The first time it's invoked, Claude will discover and cache your MSP-specific values in `~/.claude/skills/syncromsp/config.json`.

To install per-project instead of globally:

```bash
mkdir -p .claude/skills
cp -r skills/syncromsp .claude/skills/syncromsp
```

### Claude Desktop / claude.ai

Skills in Claude Desktop are managed through your Anthropic account on claude.ai and sync to the Desktop app automatically.

**Option A — Upload the released zip (recommended)**

Every tagged release of this repo publishes a versioned `syncromsp-skill.zip` as a release asset. The latest is always at:

```
https://github.com/advenimus/syncromsp-mcp/releases/latest/download/syncromsp-skill.zip
```

Steps:

1. Sign in to [claude.ai](https://claude.ai) with the same account you use in Claude Desktop. (Skills are a paid-plan preview feature — Pro / Team / Enterprise.)
2. Go to *Settings → Capabilities → Skills* and ensure Skills is enabled.
3. Download `syncromsp-skill.zip` from the [latest release](https://github.com/advenimus/syncromsp-mcp/releases/latest).
4. Upload the zip via the Skills page's "create / upload skill" option.
5. The skill is now available in claude.ai web AND Claude Desktop. Trigger it by mentioning Syncro / tickets / invoices / etc., or by typing `/syncromsp`.

**Option B — Build the zip locally**

If you want to ship local edits without cutting a release:

```bash
cd skills && zip -r ../syncromsp-skill.zip syncromsp -x "syncromsp/config.json"
```

Then upload the resulting `syncromsp-skill.zip` via the same Skills page.

**Option C — Project custom instructions (any plan)**

If your account doesn't have the Skills feature, paste the contents of `SKILL.md` into a Project's custom instructions. Append the reference files you want eager-loaded. Less elegant — references won't progressive-load — but it works on any plan.

## How it stays current

The skill includes a `learnings/` folder for appending discoveries that aren't yet in the references. When Claude finds a new API quirk, workflow improvement, or correction the user makes, it writes a focused note there. Periodically, validated learnings get promoted into the appropriate `references/*.md` file and the learning is removed.

If you customize the skill for your business, do so in `learnings/` first — don't edit `SKILL.md` or `references/` directly with company-specific content. Keep those files generic so the skill remains shareable.

## What does NOT live in this skill

- Specific user IDs, product IDs, or subdomains — those go in the runtime-generated `config.json`
- Company-specific procedures, branding, or client lists — those belong in your CLAUDE.md or project memory
- Tool schemas — the [SyncroMSP MCP server](../..) provides them. This skill provides the judgment layer on top.

## Updating

When a new version of this skill ships in the repo, re-copy it into `~/.claude/skills/syncromsp/` (preserve your local `config.json` and any `learnings/` files):

```bash
# From the syncromsp-mcp repo root
rsync -a --exclude config.json --exclude 'learnings/*.md' \
  skills/syncromsp/ ~/.claude/skills/syncromsp/
```
