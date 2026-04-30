# Known API quirks

A running list of behaviors that aren't obvious from the API surface. When something behaves unexpectedly, check here first; if not listed, add a learning (see `learnings/README.md`).

## Create endpoints don't accept line_items

`invoices_create`, `estimates_create`, and `tickets_create` will silently ignore a `line_items` array passed at creation. Always follow with `*_add_line_item` calls. (See `references/billing.md`.)

## tickets_add_line_item requires both name AND description

Even when you pass a valid `product_id`, you must also supply `name` AND `description`. Omitting either returns an error. The product_id alone won't auto-populate them.

## tickets_comment requires subject

`tickets_comment` returns 422 without a `subject` field. The subject doesn't appear prominently in some UIs but is required by the API.

## tickets_list returns truncated comments

For full ticket comment history, call `tickets_get_comments`. Don't infer ticket activity from `tickets_list` — it returns a summary view that may not include all comments.

## tickets_add_timer requires start_at

`start_at` is mandatory even when you're logging "the 30 minutes I just spent". Pass current time or the actual start time as ISO 8601.

## Two-step labor charging

`tickets_add_timer` records time but does not bill. You MUST follow with `tickets_charge_timer` using the returned `timer_entry_id`. (See `references/time-tracking.md`.)

## Pagination is opt-in per endpoint

List endpoints generally paginate. Always check whether a result might be page 1 of many. For invoices and time logs especially, pages 2+ are common during reconciliation work.

## Date filtering uses ISO 8601

`since_updated_at`, `from`, `to` parameters expect ISO 8601 (`2026-04-01T00:00:00Z`). Date-only strings (`2026-04-01`) may parse but behave inconsistently across endpoints.

## Recurring invoices link via schedule_id

To find a customer's recurring invoice across months, group by `schedule_id` rather than by invoice subject or line item names.

## No invoice category filter

There is no built-in "filter by service type" on invoices. Scan line item names or invoice subject to identify e.g. backup-service invoices. Brittle — prefer `schedule_id` queries when possible.

## customers_autocomplete vs customers_list

`customers_autocomplete` is much faster for "find customer by partial name". Don't fetch the full list and filter client-side.

## admin_search is global

`admin_search` searches across customers, tickets, invoices, assets. Use it when entity type is ambiguous; don't try each type-specific endpoint in turn.

## Destructive operations require confirmation

The MCP layer requires confirmation for DELETE operations (and other destructive actions). If you're scripting a flow, pass the confirmation parameter when prompted; otherwise the operation will be blocked.

## Rate limit: 180 req/min

The MCP server enforces a token-bucket rate limit matching Syncro's API limit. Long-running batch operations will throttle automatically — don't try to parallelize aggressively.

## subdomain parameter on tools

Some tools accept a `subdomain` parameter. The MCP server typically has its own configured subdomain; you don't need to pass it. Override only if you know what you're doing (e.g. multi-tenant setups).

## comments_attributes vs tickets_comment

To create a ticket WITH an initial comment in one call, use `comments_attributes` inside `tickets_create`. To add a comment to an existing ticket, use `tickets_comment`. They have slightly different field shapes:

- `comments_attributes[].body / subject / hidden / do_not_email`
- `tickets_comment(ticket_id, body, subject, hidden, do_not_email)`

The semantics are the same; the shape differs. Don't try to reuse `comments_attributes` shape for `tickets_comment`.
