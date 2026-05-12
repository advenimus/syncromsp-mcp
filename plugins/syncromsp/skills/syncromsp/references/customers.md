# Customers, contacts, leads, contracts

## Customers (the company / account)

- `customers_autocomplete` — **fastest lookup by partial name**. Use this when the user types a name; don't list all customers and filter client-side.
- `customers_list` — paginated list with filters (use when you need bulk data)
- `customers_get` — full customer record including custom fields
- `customers_latest` — recently created
- `customers_create` / `customers_update` / `customers_delete`

A customer record holds the **company / account**. Individual people are **contacts**.

## Contacts (people at the customer)

Contacts are linked to a customer.

- `contacts_create({ customer_id, ... })`
- `contacts_list` — supports filtering by `customer_id`
- `contacts_get` / `contacts_update` / `contacts_delete`

When creating a ticket, you can set `contact_id` to identify the specific person who reported the issue. This drives email replies to that contact rather than the customer's primary email.

## Leads (pre-customer pipeline)

- `leads_list` / `leads_get` / `leads_create` / `leads_update`

Syncro doesn't have a one-shot "convert to customer" tool. Workflow:

1. Capture lead info via `leads_create` or import.
2. When converting: `customers_create` with the lead's data, then `leads_update` to set `status` to converted (or whatever your pipeline uses).
3. Optionally link by storing the new `customer_id` in a custom field on the lead.

## Contracts (service agreements)

Contracts often determine billing rate (e.g. covered hours, contract labor zero-rate).

- `contracts_list` — all contracts; filter by customer
- `contracts_get` — full detail
- `contracts_create` / `contracts_update` / `contracts_delete`

**Before quoting labor**, check whether the customer has an active contract. If yes, "Contract Labor" (zero-rate) may apply for covered hours. Ask the user.

## Phone numbers

A customer can have multiple phones (main, mobile, fax, etc.).

- `customers_list_phones` — all phones for a customer
- `customers_create_phone` / `customers_update_phone` / `customers_delete_phone`

## Caller-ID lookup

`admin_caller_id` resolves an incoming phone number to a customer/contact. Useful when the user says "this number called, who is it?"

## Portal users

Customers can have portal accounts for self-service ticket submission.

- `admin_list_portal_users` / `admin_create_portal_user` / `admin_update_portal_user` / `admin_delete_portal_user`
- `admin_create_portal_invitation` — send a setup link to a contact

## Search across everything

`admin_search` is a global search — customers, contacts, tickets, invoices, assets all together. Use this when you don't know which entity type the user means.
