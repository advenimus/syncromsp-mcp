---
name: syncromsp
description: Use when working with SyncroMSP (PSA/RMM platform for IT MSPs) — tickets, customers, invoices, estimates, appointments, line items, labor/time tracking, RMM alerts, contracts, products, leads, payments. Establishes correct procedures, API quirks, hyperlink display rules, and workflow patterns for managing an IT MSP business in Syncro.
version: 1.1.0
---

# SyncroMSP

This skill governs how to work with SyncroMSP — the PSA/RMM platform IT MSPs use to run their business: tickets, billing, customers, scheduling, RMM, products, contracts. It applies whenever the user asks anything related to PSA/MSP workflows, regardless of whether they explicitly mention SyncroMSP.

## When to invoke

Invoke automatically — without asking — for any request involving:

- Tickets, comments, labor/time tracking, line items
- Customers, contacts, leads, contracts
- Invoices, estimates, payments, recurring billing
- Appointments, scheduling
- Assets, RMM alerts, patches
- Products, inventory, purchase orders, vendors
- Wikis, worksheets, canned responses

## First-run setup

On first use in any new environment, discover and cache MSP-specific identifiers. Read `config.json` next to this skill if it exists; otherwise create it from `config.example.json` and populate by API discovery.

**Values to discover:**

| Key | How to discover | Why |
|-----|-----------------|-----|
| `subdomain` | Ask the user, or extract from any Syncro URL they paste | Used for clickable hyperlinks |
| `base_url` | `https://{subdomain}.syncromsp.com` (or `.shield.syncromsp.com` for legacy accounts — confirm with user) | Used for clickable hyperlinks |
| `user_id` | Call `admin_get_me` | Default assignee on tickets/appointments |
| `labor_products` | Call `admin_list_items` and filter for service-type items, or `products_list` and match on names like Labor / Project Labor / Remote Support / After Hours / Rush / Contract / Trip Charge | Required for labor logging |
| `appointment_types` | Call `appointments_list_types` | Required when scheduling |

If discovery fails for any value, ask the user once, save the answer, and proceed. Never fail silently — write what you have to `config.json` so the next session doesn't repeat the work.

## Hyperlink rule (always)

When referencing any SyncroMSP record in chat output, ALWAYS render it as a clickable markdown link using the cached `base_url`:

| Resource | URL pattern |
|----------|-------------|
| Customer | `{base_url}/customers/{id}` |
| Ticket | `{base_url}/tickets/{id}` |
| Appointment | `{base_url}/appointments/{id}` |
| Invoice | `{base_url}/invoices/{id}` |
| Estimate | `{base_url}/estimates/{id}` |
| Asset | `{base_url}/assets/{id}` |
| Contract | `{base_url}/contracts/{id}` |
| Lead | `{base_url}/leads/{id}` |
| Product | `{base_url}/products/{id}` |
| Purchase Order | `{base_url}/purchase_orders/{id}` |

Format: `[Ticket #1234](https://...)` — never display a bare ID.

**This rule applies to chat output to the user only.** Do NOT use markdown links — or any other markdown — inside text you send to Syncro itself (see next rule).

## Plain text only in Syncro fields (always)

Every text field that Syncro stores and re-renders — ticket comment bodies, ticket comment subjects, ticket subjects/bodies, invoice/estimate notes, appointment notes, customer notes, wiki/worksheet bodies, etc. — is rendered as **literal text**. Markdown is NOT parsed. `**bold**` shows up as `**bold**`, `[link](url)` shows up as `[link](url)`, backticks show up as backticks.

When generating any string that will be sent to a Syncro `body`, `notes`, `subject`, or comment field:

- **No** `**bold**`, `*italic*`, `__underline__`, `~~strike~~`
- **No** `# Headers` — use ALL CAPS or a trailing colon (`Search engine optimization:`) for emphasis
- **No** `[text](url)` — paste the bare URL on its own line
- **No** backticks for inline code or fences
- **No** `>` blockquotes
- **Allowed**: plain hyphen bullets (`- item`), numbered lists (`1. item`), blank lines for paragraph breaks, ALL CAPS section headings — these all render as themselves and remain readable

This applies even when the source material the user gave you is markdown — translate it to plain text before posting. The hyperlink rule above is for chat output to the user; do not carry it into Syncro field content.

## Tool naming

This skill uses **unprefixed** tool names (e.g. `tickets_create`, `invoices_get`). Your environment may surface them under different prefixes (`mcp__syncromsp__*`, `mcp__claude_ai_Syncro_MCP_Tools__*`); call whichever prefix is loaded.

## Core principles

1. **Use tools proactively.** Never ask "should I look that up?" — just call the tool. If the user mentions a customer name, ticket number, invoice, etc., resolve it via API immediately.

2. **Confirm before customer-visible mutations.** For public ticket comments, sending invoices/estimates by email, or any irreversible customer-facing action, draft → show user → wait for explicit approval → post.

3. **Confirm comment visibility before posting.** Always confirm whether a ticket comment should be public (visible to customer), private (internal only), and whether to email the customer.

4. **Never silently lose data.** When `_create` endpoints don't accept nested `line_items`, follow up with `add_line_item` calls. Don't skip the second step. (See `references/billing.md` and `references/api-quirks.md`.)

5. **Read full data before reporting on it.** When asked about a ticket's status or activity, fetch the full comment thread (`tickets_get_comments`), not just the header from `tickets_list`.

6. **Default assignee = the configured technician.** Set `user_id` from cached config on every ticket, appointment, and timer.

7. **Money safety.** Never auto-charge a saved payment method without explicit per-charge user instruction. Never email an invoice/estimate without explicit approval.

## Reference files

For domain-specific procedures, read the relevant reference file at the start of related work:

- **`references/tickets.md`** — Ticket creation, statuses, comments, problem types
- **`references/time-tracking.md`** — Labor logging (timer + charge_timer two-step), labor product selection
- **`references/billing.md`** — Invoices, estimates, payments, recurring billing, line items
- **`references/appointments.md`** — Scheduling, appointment types, calendar workflows
- **`references/customers.md`** — Customers, contacts, leads, contracts
- **`references/rmm-and-assets.md`** — Assets, RMM alerts, patches
- **`references/api-quirks.md`** — Known API gotchas and workarounds (read this when something behaves unexpectedly)

## Self-evolution

This skill grows. When you discover a new gotcha, workflow improvement, or pattern that should persist across sessions:

1. Write a focused note to `learnings/<short-kebab-topic>.md` with the format defined in `learnings/README.md`.
2. If the learning conflicts with or supersedes existing reference content, update the reference file in the same change.
3. Tell the user what you learned and where you saved it.

**Read all `learnings/*.md` at the start of any non-trivial SyncroMSP work** — they may modify default skill behavior before they've been promoted into the references.

## What's NOT in this skill

- Specific user IDs, product IDs, appointment type IDs, or subdomain — those live in `config.json`, discovered per-install.
- Company-specific procedures, branding, or client lists — those belong in user CLAUDE.md / project memory, not this generic skill.
- Tool schemas — the MCP server provides them. This skill provides the *judgment* layer on top.
