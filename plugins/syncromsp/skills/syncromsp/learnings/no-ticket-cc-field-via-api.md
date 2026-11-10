---
name: Tickets have no CC field reachable via the MCP API
description: tickets_create/tickets_update/tickets_comment expose only a single contact_id — there is no cc/cc_line param, and it is silently dropped if passed inside properties
discovered: 2026-07-08
tags: [tickets, contacts, api-quirks]
---

# Tickets have no CC field reachable via the MCP API

## Context

A request came in to open a ticket under one customer contact and "add a second person to the CC list" for an approval request. Needed a way to loop in a second contact beyond the ticket's primary contact.

## What you found

- `tickets_create`, `tickets_update`, and `tickets_comment` schemas only accept a single `contact_id` — no `cc`, `cc_line`, or watcher-style field exists in any of them.
- The ticket's full JSON (`tickets_get`) has no CC array either. The closest concept is `public_mentionables` — a list of the customer's contacts that the Syncro web UI's rich-text comment editor uses for `@mention` autocomplete, which in the UI also emails the mentioned contact. That mechanism is a UI/rich-text-editor feature, not exposed as a plain-text field or separate parameter via this API — passing `@Jane Doe` in a comment `body` string just posts literal text, it does not create a real mention.
- Tested writing `cc`/`cc_line` into `tickets_update`'s `properties` object as a no-op probe. Confirmed via re-fetch that `properties` stayed `{}` — the values were silently dropped, not stored anywhere.

## How to apply

There is no way to add a second contact to a ticket's notification/CC list through this API. When a ticket needs to loop in someone beyond the primary contact:

1. Create/update the ticket normally with the primary `contact_id`.
2. Tell the user CC isn't API-reachable — adding a second contact/CC on a ticket is a manual step in the Syncro web UI (ticket page → CC field in the comment composer).
3. If the second person genuinely needs to be notified now (not just have manual-lookup access later), that requires a separate action outside Syncro — e.g. an email — and per the confirm-before-customer-facing-action rule, draft it and get explicit approval before sending. Don't default to sending it.

## Related

- `references/tickets.md` — ticket references (customer, assignee, contact)
- `references/api-quirks.md`
