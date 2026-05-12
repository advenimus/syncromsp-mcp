# Billing — invoices, estimates, payments

## Critical API quirk: line_items on create are ignored

When calling `invoices_create` or `estimates_create` with a `line_items` array, **the line items are silently dropped**. You MUST add line items in a separate call after creation:

```
1. invoices_create({ customer_id, ... }) → returns { id, ... }
2. invoices_add_line_item({ invoice_id, product_id, name, description, quantity, price })  // repeat per line
```

Same for estimates: `estimates_create` then `estimates_add_line_item`.

For tickets: `tickets_create` then `tickets_add_line_item` (which requires both `name` AND `description`, even with `product_id`).

If you skip the second step, the invoice/estimate exists but is empty. Always validate by re-fetching after writes.

## Estimate → invoice conversion

`estimates_convert_to_invoice` is the canonical path. It preserves line items and customer association. **Don't manually copy data between estimate and invoice** — you'll lose line item integrity and break audit trail.

## Sending invoices / estimates

- `invoices_email` and `estimates_email` send via Syncro's mail system.
- `invoices_print` and `estimates_print` produce PDFs.

**Always confirm with the user before emailing.** Once sent, you can't recall it. Show:

- Recipient(s)
- Total amount
- Line item summary
- Subject / message

…and wait for explicit approval.

## Recurring / scheduled invoices

Recurring invoices share a `schedule_id` across months. To reconcile billing continuity (e.g. "did this month's invoice generate?"):

1. List invoices for the customer with `since_updated_at` set to the start of the period.
2. Group by `schedule_id`.
3. Compare to the previous period's set — any missing `schedule_id` means a recurring invoice didn't fire.

Date filters use ISO 8601 (e.g. `2026-04-01T00:00:00Z`). Date-only strings may parse but behave inconsistently.

## Pagination

Invoice list endpoints paginate. If a customer might have many invoices, fetch page 2+ until results are empty. Don't assume page 1 is complete — you'll silently miss data, especially during reconciliation work.

## Filtering by service type

There's no built-in "category" filter for invoices. To find e.g. all backup-service invoices:

1. Fetch invoices for the period.
2. Scan invoice line item names, invoice subject, or invoice notes for keywords.
3. Cache the matched set when iterating.

This is brittle — if your invoice naming changes, the filter breaks. Prefer to query by `schedule_id` or product when possible.

## Invoice ↔ ticket linkage

`invoices_get_ticket` returns the ticket associated with an invoice (when one exists, e.g. ticket-billed work). Use this to navigate from an invoice back to its source ticket.

## Payments

- `payments_create` — record a payment against an invoice
- `payments_create_profile` — save a customer's payment method (tokenized; PCI-safe)
- `payments_list_methods` — available payment methods configured in your Syncro
- `payments_list_profiles` / `payments_get_profile` / `payments_update_profile` / `payments_delete_profile` — manage saved methods
- `payments_list` / `payments_get` — read existing payments

Payment profiles let you charge later without re-collecting card info.

## Money safety (mandatory)

- **Never auto-charge a saved payment method** without explicit user instruction for that specific charge. "Charge their card on file for invoice X" requires confirmation each time, even if you've done it for the same customer before.
- **Never email an invoice/estimate** without explicit approval, even on the user's own request — re-confirm the recipient and total.
- **Don't delete invoices** without explicit confirmation. `invoices_delete` is destructive and may break audit trail.

## Line item edits

- `invoices_update_line_item` / `invoices_delete_line_item` — edit/remove existing lines
- `estimates_update_line_item` / `estimates_delete_line_item` — same for estimates

If a line was charged from a timer (labor), deleting the line item may not delete the underlying time log — verify with `time_list_timelogs`.
