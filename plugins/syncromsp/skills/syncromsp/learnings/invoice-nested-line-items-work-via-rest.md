---
name: Invoice line_items nested in POST /invoices do work (raw REST)
description: POST /api/v1/invoices with a JSON line_items array creates the lines and honors product_category; POST /invoices/{id}/line_items ignores product_category
discovered: 2026-09-22
tags: [billing, invoices, api]
---

# Invoice line_items nested in POST /invoices do work (raw REST)

## Context
Building an n8n automation that creates monthly usage invoices through the Syncro REST API (HTTP Request node, JSON body, header API key).

## What you found
- POST /api/v1/invoices with `{ customer_id, date, due_date, name, line_items: [{ item, name, quantity, cost, price, taxable, product_category: "Services" }] }` created the invoice AND its line item in one call. The line kept `product_category: "Services"` and the invoice kept `name`.
- POST /api/v1/invoices/{id}/line_items with the same fields created the line, but Syncro set `product_category` to the `item` text and ignored the value sent. PUT on that line item did not change it either.
- PUT /api/v1/invoices/{id} accepts `name` (the invoice title), even though the invoices_update MCP tool does not expose it.
- Verified for invoices through raw REST only. Not verified for estimates or tickets, or through the invoices_create MCP tool.

## How to apply
When an invoice line needs a specific product_category (for example "Services" for accounting sync), send the line nested in the invoice create body, then GET the invoice to confirm the line and subtotal. This contradicts the "line_items on create are ignored" note in references/api-quirks.md and references/billing.md for the raw invoice endpoint.

## Related
references/api-quirks.md, references/billing.md
