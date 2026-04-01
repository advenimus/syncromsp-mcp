# SyncroMSP MCP - API Endpoint Testing Results

**Tested Against:** cloudwise.syncromsp.com  
**Date:** 2026-04-01  
**Tester:** Claude (automated via api-client.ts)

---

## Phase 1: Read-Only Tests (Completed)

| Category | Endpoints Tested | Passed | Failed |
|----------|-----------------|--------|--------|
| List endpoints | 18 | 18 | 0 |
| Single record (GET by ID) | 3 | 3 | 0 |
| Comments / sub-resources | 1 | 1 | 0 |
| Settings endpoints | 4 | 4 | 0 |
| **Total** | **26** | **26** | **0** |

<details>
<summary>Full read-only test results</summary>

### List Endpoints (GET with pagination)

| Endpoint | Tool Name | Status | Items Found |
|----------|-----------|--------|-------------|
| GET /me | admin_get_me | PASS | User: Chris Vautour (admin) |
| GET /tickets | tickets_list | PASS | 50 (page 1 of 11) |
| GET /customers | customers_list | PASS | 16 (page 1 of 1) |
| GET /customer_assets | assets_list | PASS | 50 (page 1 of 2, 68 total) |
| GET /invoices | invoices_list | PASS | 25 (page 1 of 22) |
| GET /contacts | contacts_list | PASS | 50 |
| GET /settings | admin_get_settings | PASS | Account: CloudWise |
| GET /search?query=test | admin_search | PASS | Found results |
| GET /appointments | appointments_list | PASS | 0 |
| GET /appointment_types | appointments_list_types | PASS | 4 |
| GET /contracts | contracts_list | PASS | 12 |
| GET /leads | leads_list | PASS | 3 |
| GET /rmm_alerts | rmm_list_alerts | PASS | 44 |
| GET /products | products_list | PASS | 20 |
| GET /estimates | estimates_list | PASS | 13 |
| GET /payments | payments_list | PASS | 25 |
| GET /wiki_pages | admin_list_wiki | PASS | 13 |
| GET /vendors | admin_list_vendors | PASS | 4 |
| GET /users | admin_list_users | PASS | 1 |
| GET /schedules | scheduling_list | PASS | 24 |
| GET /ticket_timers | time_list_timers | PASS | 100 |
| GET /canned_responses | admin_list_canned_responses | PASS | 15 |
| GET /portal_users | admin_list_portal_users | PASS | 12 |
| GET /timelogs | time_list_timelogs | PASS | (returned data) |
| GET /items | admin_list_items | PASS | 0 |
| GET /purchase_orders | admin_list_purchase_orders | PASS | 1 |

### Single Record Retrieval (GET by ID)

| Endpoint | Tool Name | Status | Record |
|----------|-----------|--------|--------|
| GET /tickets/{id} | tickets_get | PASS | Ticket #108430330 |
| GET /tickets/{id}/comments | tickets_get_comments | PASS | Ticket #108430330 comments |
| GET /customers/{id} | customers_get | PASS | Customer #34288070 |
| GET /customer_assets/{id} | assets_get | PASS | Asset #12313068 |

### Settings Endpoints

| Endpoint | Tool Name | Status |
|----------|-----------|--------|
| GET /settings | admin_get_settings | PASS |
| GET /settings/tabs | admin_get_tabs | PASS |
| GET /settings/printing | admin_get_printing | PASS |
| GET /tickets/settings | tickets_settings | PASS |

</details>

---

## Phase 2: CRUD Tests (Create → Read → Update → Delete)

Testing each resource with a full lifecycle. All test records use "[MCP-TEST]" prefix for easy identification. Each resource is tested one at a time, and the test record is deleted after verification.

### CRUD Test Order (safest → most impactful)

| # | Resource | Create | Read | Update | Delete | Notes |
|---|----------|--------|------|--------|--------|-------|
| 1 | Wiki Page | PASS | PASS | PASS | PASS | Internal KB, very safe |
| 2 | Canned Response | PASS | PASS | PASS | PASS | Template text, safe |
| 3 | Vendor | PASS | PASS | PASS | N/A | No DELETE endpoint in API |
| 4 | Contact | PASS | PASS | PASS | PASS | On CloudWise_Internal customer |
| 5 | Lead | PASS | PASS | PASS | N/A | No DELETE endpoint in API |
| 6 | Contract | PASS | PASS | PASS | PASS | Soft-delete (returns null, not 404) |
| 7 | Product | PASS | PASS | PASS | N/A | No DELETE; disabled via PUT instead |
| 8 | Appointment Type | PASS | PASS | PASS | PASS | location_type required (not in swagger) |
| 9 | Appointment | PASS | PASS | PASS | PASS | Linked to ticket, bi-directional |
| 10 | Customer | PASS | PASS | PASS | PASS | Hard delete, 404 after |
| 11 | Estimate | PASS | PASS | PASS | PASS | Line items must be added separately |
| 12 | Ticket | PASS | PASS | PASS | PASS | Full CRUD + sub-resources |
| 13 | Ticket Comment | PASS | PASS | N/A | N/A | 3 modes: email, public, private |
| 14 | Ticket Line Item | PASS | PASS | N/A | N/A | Manual + product; name+desc required |
| 15 | Ticket Timer | PASS | PASS | PASS | N/A | start_at required |
| 16 | Invoice | PASS | PASS | PASS | PASS | Full CRUD + line items |
| 17 | Invoice Line Item | PASS | PASS | PASS | PASS | Manual + product; product auto-fills |
| 18 | Asset | PASS | PASS | PASS | N/A | Properties via PUT only, no DELETE |
| 19 | RMM Alert | PASS | PASS | N/A | PASS | Mute needs mute_for; delete = resolve |
| 20 | Schedule | PASS | PASS | PASS | PASS | Invoice-side fields not API-settable |
| 21 | Schedule Line Item | PASS | PASS | N/A | N/A | Uses cents (retail_cents/cost_cents) |
| 22 | Purchase Order | PASS | PASS | N/A | N/A | No update/delete; manual removal |
| 23 | PO Line Item | PASS | PASS | N/A | N/A | Requires maintain_stock product |
| 24 | Payment | PASS | PASS | N/A | N/A | apply_payments for multi-invoice; no delete |
| 25 | Portal User | PASS | PASS | PASS | PASS | Should always link contact_id |
| 26 | Customer Phone | PASS | PASS | PASS | PASS | Numbers auto-stripped of formatting |
| 27 | Payment Profile | SKIP | SKIP | SKIP | SKIP | Requires payment gateway tokens |
| 28 | Product Serial | PASS | PASS | PASS | N/A | No delete endpoint |
| 29 | Product SKU | PASS | PASS | PASS | N/A | No delete endpoint |
| 30 | Estimate Line Item | PASS | PASS | PASS | PASS | Tested in Test 11 |
| 31 | Worksheet Result | SKIP | PASS | SKIP | SKIP | Requires admin-configured templates |

### CRUD Test Details

Each completed test will be logged below with the test data used, IDs returned, and pass/fail status.

---

#### Test 1: Wiki Page - PASS
- **Create:** PASS — `POST /wiki_pages` → ID `380489`, name `[MCP-TEST] API Test Wiki Page`
- **Read:** PASS — `GET /wiki_pages/380489` returned correct name, body, slug
- **Update:** PASS — `PUT /wiki_pages/380489` changed name to `(UPDATED)`, body replaced, verified on re-read
- **Delete:** PASS — `DELETE /wiki_pages/380489` returned `{ success: true }`, confirmed 404 on re-read
- **Bug found:** `visibility` field rejects `"internal"` with 422 — valid enum values not documented in swagger. Omitting the field works fine (defaults are applied).

---

#### Test 2: Canned Response - PASS
- **Create:** PASS — `POST /canned_responses` → ID `276571`, title/body/subject set
- **Read:** PASS — Found in `GET /canned_responses` list (no GET-by-ID endpoint exists)
- **Update:** PASS — `PATCH /canned_responses/276571` changed title, body, subject; `updated_at` changed
- **Delete:** PASS — `DELETE /canned_responses/276571` returned 204, confirmed gone from list

---

#### Test 3: Vendor - PASS (no delete)
- **Create:** PASS — `POST /vendors` → ID `798000`, all 12 fields populated
- **Read:** PASS — `GET /vendors/798000` returned all fields correctly
- **Update:** PASS — `PUT /vendors/798000` changed name, rep_first_name, notes; `updated_at` changed
- **Delete:** N/A — Syncro API has no `DELETE /vendors/{id}` endpoint (returns 404). Test vendor `798000` must be removed manually.
- **Code fix needed:** Remove vendor delete tool from `admin.ts` (endpoint doesn't exist)

---

#### Test 4: Contact - PASS
- **Create:** PASS — `POST /contacts` → ID `4378587`, on customer `CloudWise_Internal` (24152385)
- **Read:** PASS — `GET /contacts/4378587` returned all fields
- **Update:** PASS — `PUT /contacts/4378587` changed name, notes; `title` stored in `properties.title` (not top-level)
- **Delete:** PASS — `DELETE /contacts/4378587` returned `{ success: true }`, confirmed 404
- **Note:** `title` field maps to `properties.title` in API response, not a top-level field

---

#### Test 5: Lead - PASS (no delete)
- **Create:** PASS — `POST /leads` → ID `41071399`, name `[MCP-TEST] Test Lead`, business `MCP Test Corp`
- **Read:** PASS — `GET /leads/41071399` returned all fields; detail view includes `emails`, `attachments`, `appointments` arrays
- **Update:** PASS — `PUT /leads/41071399` changed last_name to `(UPDATED)`, `updated_at` changed
- **Delete:** N/A — Syncro API has no `DELETE /leads/{id}` endpoint (returns 404). Can use `PUT` with `disabled: true` to soft-delete. Lead `41071399` must be removed manually.
- **Note:** `likelihood` and `opportunity_amount_dollars` not visible in API response (may be stored but not returned)

---

#### Test 6: Contract - PASS
- **Create:** PASS — `POST /contracts` → ID `155982`, on `CloudWise_Internal`, amount `$100.00`, status `Active`
- **Read:** PASS — `GET /contracts/155982` returned flat object (no wrapper)
- **Update:** PASS — `PUT /contracts/155982` changed name, amount `100→200`, description
- **Delete:** PASS — `DELETE /contracts/155982` returned `{ success: true }`; GET returns `null` (soft-delete, not 404)
- **Note:** No `notes` field in API — `description` is the only text field. Activity/notes section in UI is not API-accessible.

---

#### Test 7: Product - PASS (no delete)
- **Create:** PASS — `POST /products` → ID `23389442`, all fields including cost/retail/UPC/stock/location
- **Read:** PASS — `GET /products/23389442` full object with `location_quantities`, `photos`, `product_skus`
- **Update:** PASS — Name, price_retail `49.99→59.99`, quantity `10→15`, notes updated
- **Delete:** N/A — No DELETE endpoint (404). Used `PUT` with `disabled: true` as fallback.
- **Quirk:** PUT may reset `maintain_stock` to `false` if not explicitly included. Syncro PUT seems to apply defaults for missing boolean fields rather than leaving them unchanged.

---

#### Test 8: Appointment Type - PASS
- **Create:** PASS — `POST /appointment_types` → ID `294531`. `location_type` is **required** (422 without it, not documented in swagger). Integer `0` = `"customer"`.
- **Read:** PASS — `GET /appointment_types/294531`
- **Update:** PASS — `PUT /appointment_types/294531` changed name and instructions
- **Delete:** PASS — `DELETE /appointment_types/294531` returned `{ success: true }`, confirmed 404
- **Bug fix:** `errors` field can be string (not just array) — fixed in `api-client.ts`

#### Test 9: Appointment - PASS
- **Create:** PASS — `POST /appointments` → ID `5560138523`, linked to ticket `108430330`, auto-populated description with ticket+customer details, auto-filled location from customer address
- **Read:** PASS — Includes nested `ticket` and full `customer` objects
- **Update:** PASS — Summary and description updated
- **Delete:** PASS — `DELETE /appointments/5560138523` returned `{ message: "deleted" }`, confirmed 404, ticket no longer references it
- **Important findings:**
  - Appointments should be linked to tickets via `ticket_id` when possible
  - `description` auto-populates with ticket details, customer info, and ticket URL
  - `location` auto-fills from customer address when appointment type has `location_type: "customer"`
  - Link is bi-directional: appointment has `ticket_id`, ticket has `appointments[]` array
  - **Use CloudWise_Internal (24152385) for all test creates going forward**

---

#### Test 10: Customer - PASS
- **Create:** PASS — `POST /customers` → ID `35692253`, auto-creates `phones[]` from phone/mobile fields
- **Read:** PASS — Detail view returns `ticket_links`, `invoice_links`, `phones[]`, `contracts[]`, `addresses[]`
- **Update:** PASS — Business name, phone, notes updated; boolean fields preserved correctly on partial update
- **Delete:** PASS — `DELETE /customers/35692253` returned `{ message: "Customer was deleted from the system." }`, confirmed 404
- **Findings:** Phone numbers auto-stripped of formatting. Customer auto-gets portal URL. Detail GET much richer than create response.

---

#### Test 11: Estimate + Line Items - PASS
- **Create:** PASS — `POST /estimates` → ID `23902944`, number `1016`, status `Draft`
- **Read:** PASS — Full object with nested customer + contacts
- **Update:** PASS — Name updated
- **Add Manual Line Item:** PASS — `POST /estimates/{id}/line_items` → ID `123196821`, qty 2 × $75, totals auto-calculated with 13% HST
- **Add Product Line Item:** PASS — `POST /estimates/{id}/line_items` with `product_id: 23096998` → ID `123196865`, auto-filled name/cost/price/taxable from product catalog
- **Update Line Item:** PASS — `PUT /estimates/{id}/line_items/{li_id}` changed name, qty, price
- **Delete Line Item:** PASS — `DELETE /estimates/{id}/line_items/{li_id}` returned updated estimate with recalculated totals
- **Delete Estimate:** PASS — `DELETE /estimates/23902944` returned `{ message: "We deleted # 1016." }`, confirmed 404
- **Critical MCP tool findings:**
  1. `line_items` array in `POST /estimates` create body is **IGNORED** — must add via `POST /estimates/{id}/line_items` after creation
  2. When adding with `product_id`, only `product_id` + `quantity` needed — API auto-fills item, name, cost, price, taxable from catalog
  3. `note` field IS stored but only visible in the add-line-item response, not in normal GET
  4. Tax auto-calculated from customer's `tax_rate_id`
  5. Line item delete returns the updated estimate with recalculated totals

---

#### Test 12: Ticket + Comments + Line Items + Timer - PASS
- **Create Ticket:** PASS — `POST /tickets` → ID `108443837`, number `5028`, on CloudWise_Internal
- **Read:** PASS — Includes `comments`, `line_items`, `ticket_timers`, `mentionables`
- **Update:** PASS — Subject, status `New→In Progress`, priority `Low→Normal`
- **Comment Types (3 modes):**
  - **Email reply** (`hidden: false`, `do_not_email: false`): PASS — sends real email to customer. This is the standard customer reply.
  - **Public note** (`hidden: false`, `do_not_email: true`): PASS — visible on portal/invoice, no email sent.
  - **Private/internal note** (`hidden: true`, `do_not_email: true`): PASS — tech-only, invisible to customer.
  - `tech` field can override the displayed technician name.
  - `subject` is **required** on all comments (422 without it, not in swagger).
  - `do_not_email` is write-only — not returned in GET response.
- **GET Comments:** PASS — `GET /tickets/{id}/comments` returns all comments in reverse chrono order.
- **Manual Line Item:** PASS — `name` and `description` are **required** (422 without them, unlike estimates).
- **Product Line Item:** PASS — `product_id` links to inventory, but `name` + `description` still required (unlike estimates which auto-fill from product catalog).
- **Add Timer:** PASS — `start_at` is **required** (422 without it). `duration_minutes` auto-calculates `end_time`. Timer auto-assigned default labor `product_id`.
- **Update Timer:** PASS — Notes updated. Duration change via `duration_minutes` did NOT update `active_duration`/`end_time` — may need to set `end_time` directly.
- **Delete Ticket:** PASS — (see below)

---

#### Test 16: Invoice + Line Items - PASS
- **Create Invoice:** PASS — `POST /invoices` → ID `1649793879`, number `1682`, `note` stored correctly
- **Read:** PASS — All fields including `note`, `po_number`
- **Update:** PASS — `po_number` and `note` updated
- **Manual Line Item:** PASS — `POST /invoices/{id}/line_items` → ID `123197177`, totals auto-calculated with 13% HST
- **Product Line Item (M365 Backup):** PASS — `product_id` only + `quantity` → auto-fills item, name, cost, price, taxable, product_category from catalog
- **Product Line Item (M365 Business Basic):** PASS — `product_id: 22739503` qty 10 → auto-filled, totals recalculated
- **Update Line Item:** PASS — Name, price updated
- **Delete Line Item:** PASS — Returns updated invoice with recalculated totals
- **Delete Invoice:** PASS — (see below)
- **Critical MCP tool findings (line item behavior across resource types):**
  - **Invoices + Estimates:** `product_id` + `quantity` is sufficient — API auto-fills name/cost/price/taxable from product catalog
  - **Tickets:** `product_id` requires `name` + `description` even with product_id (422 without them)
  - **All types:** `line_items` array in create body is **IGNORED** — must add via separate `POST /{resource}/{id}/line_items` endpoint
  - Invoice `note` IS returned in responses; estimate `note` is NOT returned in normal GET

---

#### Test 18: Asset - PASS (no delete)
- **Create:** PASS — `POST /customer_assets` → ID `12330977`, type `Syncro Device`, serial set
- **Read:** PASS — Full object with nested customer, properties
- **Update:** PASS — Name, serial updated. **Properties (hdd, manufacturer, model, os, cpu_name, ram, last_boot) all set successfully via PUT.**
- **Delete:** N/A — No DELETE endpoint for assets in Syncro API. Must remove manually.
- **Critical MCP tool findings:**
  1. `asset_type_name` must match an existing type in the account (e.g., "Syncro Device"). Unknown type names cause 422.
  2. `properties` on CREATE are **IGNORED** — must set via follow-up `PUT` after creation
  3. `properties` on UPDATE work perfectly for: `hdd`, `manufacturer`, `model`, `os`, `last_boot`, `cpu_name`, `ram` and any custom fields
  4. `asset_type_id` not exposed in GET — only `asset_type` (string name)
  5. MCP tool workflow for assets: CREATE (name, customer_id, type, serial) → then PUT to set properties

---

#### Test 19: RMM Alert - PASS
- **Create:** PASS — `POST /rmm_alerts` → ID `704649718`, linked to asset `SVR-CW-APP-1`. Response wrapper is `alert` (not `rmm_alert`)
- **Read:** PASS — `GET /rmm_alerts/{id}` uses `rmm_alert` wrapper (inconsistent with create)
- **Mute:** PASS — `POST /rmm_alerts/{id}/mute` requires `mute_for` body param. Valid value: `"forever"`. Other values like `"1h"`, `"60"`, `"1_hour"` all rejected. Not documented in swagger.
- **Delete:** PASS — `DELETE /rmm_alerts/{id}` returns `{ success: "true" }` and sets `resolved: true` (soft-resolve, not hard delete). Alert still readable.
- **Critical MCP tool findings:**
  1. **"Details" field in UI = `formatted_output`** — must be passed in POST body to populate. Not in swagger schema but accepted by API.
  2. **"Type" field in UI = `description`** — the alert type/trigger name.
  3. `properties` should include `trigger` and `description` to match real RMM alert structure.
  4. Create response wrapper is `alert`, GET wrapper is `rmm_alert` — inconsistent.
  5. Mute requires `mute_for: "forever"` (only known valid value). Not in swagger.
  6. Delete = soft-resolve (`resolved: true`), not hard delete.
  7. Error handler fix: `errors` can be nested object (e.g., `{ mute_for: ["..."] }`) — fixed in `api-client.ts`.

---

#### Test 20: Schedule + Line Item - PASS
- **Create:** PASS — `POST /schedules` → ID `503262`, Monthly, paused. Create response uses `lines` array (not `line_items`).
- **Read:** PASS — Returns `lines` array with full line item details
- **Update:** PASS — Name, frequency `Monthly→Quarterly` updated
- **Add Line Item:** PASS — `POST /schedules/{id}/add_line_item` → ID `1823298`. Uses `retail_cents`/`cost_cents` (integers) + returns `price_retail`/`price_cost` (decimals).
- **Delete:** PASS — (see below)
- **Critical MCP tool findings:**
  1. Schedule uses `lines` array, not `line_items`
  2. Line items use cents for input (`retail_cents`, `cost_cents`) but also return dollar values (`price_retail`, `price_cost`)
  3. Invoice-side fields NOT settable via API: "Name of Invoices that are generated", "Employee (for commission)", "Invoice Template", "Invoice Billing Terms", "Invoice Memo" — all silently ignored on PUT. These are UI-only settings.
  4. Always create schedules with `paused: true` to prevent auto-firing during setup

---

#### Test 22: Purchase Order + Line Item - PASS (no delete)
- **Create PO:** PASS — `POST /purchase_orders` → ID `2050182`, number `HB-20260401-1`, auto-generated from vendor prefix + date
- **Read:** PASS — Full object with nested vendor, `line_items` array
- **Add Line Item:** PASS — `POST /purchase_orders/{id}/create_po_line_item` → ID `8712038`. Product must have `maintain_stock: true` (422 otherwise).
- **Delete:** N/A — No DELETE or UPDATE endpoint for POs. Must remove manually.
- **Findings:**
  1. PO line items require stocked products (`maintain_stock: true`)
  2. `general_notes` accepted on create but not returned in GET
  3. PO number auto-generated from vendor name prefix + date
  4. Line item add returns `po_line_item` wrapper with `cost_cents`/`total_cents`, but PO `total` is in dollars

---

#### Test 24: Payment - PASS (no delete)
- **Create:** PASS — `POST /payments` → ID `44123334`, $1.00, method "Other", ref `MCP-TEST-PAY-001`
- **Read:** PASS — Full object with nested customer. `payment_amount` in dollars (not cents).
- **Payment Methods List:** PASS — Returns Credit Card, Cash, Check, Other, etc.
- **Delete:** N/A — No DELETE/UPDATE endpoint for payments. Must remove manually.
- **Critical MCP tool findings:**
  1. Input uses `amount_cents` but response returns `payment_amount` in dollars
  2. **`apply_payments` field (not in swagger):** Distributes payment across multiple invoices. Format: `{ "invoice_id": amount_in_cents, ... }`. Example from n8n workflow:
     ```json
     {
       "customer_id": 123,
       "amount_cents": 5000,
       "payment_method": "Interac e-Transfer",
       "ref_num": "REF-001",
       "apply_payments": { "456": 3000, "789": 2000 }
     }
     ```
  3. Unlinked payment (no `apply_payments` or `invoice_id`) creates account credit
  4. `payment_method` is a string matching method name (e.g., "Cash", "Check", "Credit Card", "Interac e-Transfer", "Other")
  5. MCP tool MUST be updated to include `apply_payments` parameter

---

#### Test 25: Portal User - PASS
- **Create:** PASS — `POST /portal_users` → ID `1034827`, auto-assigned `portal_group_id`
- **Read:** PASS — Found in list (no GET-by-ID endpoint)
- **Update:** PASS — Email changed, `contact_id` linked to John Doe (Test Account)
- **Delete:** PASS — `DELETE /portal_users/1034827` returned the deleted object, confirmed gone from list
- **Critical MCP tool findings:**
  1. Always create with `contact_id` to associate a person/name — without it, shows as anonymous email in UI
  2. Response is flat (no wrapper object)
  3. No GET-by-ID — verify via list only
  4. Auto-assigns `portal_group_id` from account defaults
  5. Delete returns the full deleted object (not a success message)

---

#### Test 26: Customer Phone - PASS
- **Create:** PASS — `POST /customers/{id}/phones` → ID `33808254`, number auto-stripped `555-0999→5550999`
- **Read:** PASS — Found in list via `GET /customers/{id}/phones`
- **Update:** PASS — Label, number, extension all updated
- **Delete:** PASS — `DELETE /customers/{id}/phones/{id}` returned `{ success: true }`, confirmed gone

---

#### Test 28: Product Serial - PASS (no delete)
- **Create:** PASS — `POST /products/{id}/product_serials` → ID `161225917`, status "In Stock", cost/retail from product
- **Read:** PASS — `GET /products/{id}/product_serials` returns list with `status`, `instance_price_cost/retail`
- **Update:** PASS — `PUT /products/{id}/product_serials/{id}` changed serial_number, condition, added notes
- **Delete:** N/A — No DELETE endpoint for serials

#### Test 29: Product SKU - PASS (no delete)
- **Create:** PASS — `POST /products/{id}/product_skus` → ID `1695498`, linked to vendor HostedBizz
- **Read:** PASS — `GET /products/{id}/product_skus` returns list with `vendor_name`, `sku`
- **Update:** PASS — `PUT /products/{id}/product_skus/{id}` changed SKU value
- **Delete:** N/A — No DELETE endpoint for SKUs
- **Note:** SKU input uses `value` field, but response returns it as `sku`

#### Test 31: Worksheet Result - SKIPPED
- **List:** PASS — `GET /tickets/{id}/worksheet_results` returns empty array
- **Create:** SKIPPED — Returns 404. Requires pre-configured worksheet templates in Syncro Admin. Account has no templates configured.
- **MCP tool note:** `worksheet_template_id` is required and must reference an existing admin-configured template

---

### Manual Cleanup Required

These test records have no DELETE endpoint and must be removed manually in Syncro:

| Resource | ID | Description |
|----------|------|-------------|
| Asset | 12330977 | [MCP-TEST] Test Workstation (UPDATED) |
| Lead | 41071399 | [MCP-TEST] Test Lead (UPDATED) |
| Vendor | 798000 | [MCP-TEST] Test Vendor Inc. (UPDATED) |
| Product | 23389442 | [MCP-TEST] Test Product Item (UPDATED) — disabled |
| Product | 23389542 | [MCP-TEST] Serialized Test Product — disabled |
| Purchase Order | 2050182 | HB-20260401-1 |
| Payment | 44123334 | $1.00 on CloudWise_Internal |
| RMM Alert | 704649718 | Resolved (soft-deleted) |
| RMM Alert | 704648506 | Resolved (soft-deleted) |

---

## Phase 3: Remaining Read Endpoints

| Endpoint | Tool Name | Status | Notes |
|----------|-----------|--------|-------|
| GET /customers/latest | customers_latest | PASS | Returns latest customers |
| GET /customers/autocomplete | customers_autocomplete | PASS | Found 1 match for "Cloud" |
| GET /customers/{id}/phones | customers_list_phones | PASS | 1 phone on CloudWise_Internal |
| GET /invoices/{id}/ticket | invoices_get_ticket | PASS | Got ticket for invoice 1649572214 |
| GET /products/categories | products_categories | PASS | Returns category tree with ancestry |
| GET /products/{id}/product_serials | products_list_serials | PASS | 1 serial found |
| GET /products/{id}/product_skus | products_list_skus | PASS | 1 SKU found |
| GET /payment_methods | payments_list_methods | PASS | 8 methods (Credit Card, Cash, Check, etc.) |
| GET /customers/{id}/payment_profiles | payments_list_profiles | PASS | 0 profiles (none configured) |
| GET /timelogs/last | time_get_last_timelog | PASS | Returns last timelog with in/out/lunch |
| GET /canned_responses/settings | admin_get_canned_settings | PASS | Returns categories list |
| GET /new_ticket_forms | admin_list_ticket_forms | PASS | 0 forms configured |
| GET /line_items | admin_list_line_items | PASS | 100 line items returned |
| GET /customer_assets/{id}/patches | assets_get_patches | PASS | Returns available_patches, installed_patches |
| GET /items | admin_list_items | PASS | 0 items |
| GET /callerid | admin_caller_id | FAIL | Returns non-JSON "Disabled" — feature not enabled on account |
| GET /products/barcode | products_barcode | PASS | Found product by UPC code |
| GET /customer_assets/chat_information_by_ids | assets_chat_info | PASS | Returns asset+customer summary |
| GET /tickets/{id}/worksheet_results | admin_list_worksheets | PASS | Returns empty array (tested earlier) |

## Phase 4: Action Endpoints (Not Yet Tested)

| Endpoint | Tool Name | Status | Notes |
|----------|-----------|--------|-------|
| POST /invoices/{id}/print | invoices_print | PENDING | Generates PDF |
| POST /invoices/{id}/email | invoices_email | PENDING | CAUTION: sends real email |
| POST /estimates/{id}/print | estimates_print | PENDING | Generates PDF |
| POST /estimates/{id}/email | estimates_email | PENDING | CAUTION: sends real email |
| POST /estimates/{id}/convert_to_invoice | estimates_convert_to_invoice | PENDING | Creates invoice |
| POST /tickets/{id}/print | tickets_print | PENDING | Generates PDF |
| POST /rmm_alerts/{id}/mute | rmm_mute_alert | PENDING | Mutes existing alert |
| PATCH /ticket_timers/{id} | time_update_timer | PENDING | Modifies timer |
