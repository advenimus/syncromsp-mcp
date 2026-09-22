# RMM, assets, alerts, scripts

## Assets (managed devices)

Assets are workstations, servers, network gear, or any tracked device.

- `assets_list` — filter by customer, type, status
- `assets_list_by_contact` — the devices linked to one contact ("what machines does Jane use?"), sorted by name, 50 per page
- `assets_get` — full asset detail (hardware, software, user, last-seen, etc.)
- `assets_get_patches` — patch status / missing patches per device
- `assets_get_installed_applications` — installed software (name, vendor, version, install date), 100 per page
- `assets_chat_info` — chat-formatted summary (good for quick context)
- `assets_create` / `assets_update`

Assets link to customers and may link to contracts (for contract-covered devices).

## RMM Alerts

- `rmm_list_alerts` — open alerts; filter by customer / asset / severity / resolved status
- `rmm_get_alert` — single alert detail
- `rmm_create_alert` — manual alert (rare; usually agent-generated)
- `rmm_mute_alert` — silence without resolving (e.g. known noisy alert)
- `rmm_delete_alert` — remove (destructive — confirm first; usually mute is correct)

When investigating an issue, **check active alerts on the asset before diving into logs** — the agent may have already detected what you're looking at.

## Running scripts

`rmm_schedule_script` runs one of the account's RMM scripts on one asset, either now or once at a set time. It runs code on a customer's machine, so treat it like any customer-facing action:

1. **Get the script ID from the user.** No API lists scripts. Ask the user for the ID from the script's page in Syncro. Never guess.
2. **Show the user the plan and wait for a yes:** script name/ID, asset (as a hyperlink), customer, and when it will run.
3. Call with `confirmed: true` only after that yes. The tool refuses without it.
4. **Log it on a ticket** (private comment naming the script, asset, and time) so there is an audit trail.

Details:

- `run_type: "now"` runs right away. `run_type: "later"` needs `next_time` (ISO 8601).
- Recurring schedules are rejected by the API (422). Set those up in Syncro.
- `runtime_variables` fills the script's variables, keyed by name. `run_as` and `mav_options` (Malwarebytes scans) pass straight through.
- The response only says the script was scheduled. The API can't read script output, so tell the user to check the asset's script history in Syncro.
- To run on several devices, repeat per asset. Get approval for the full list once, then go.

## Patch management

`assets_get_patches` returns missing/installed patches per device.

Use this when:

- Planning maintenance windows
- After a security incident (e.g. supply-chain CVE) to identify affected devices
- Auditing compliance posture for a customer

For bulk patching, list assets for the customer, then iterate `assets_get_patches`.

## User devices (Syncro user / agent endpoints)

`admin_*_user_device` tools manage devices tied to internal Syncro **users** (your techs), not customer assets. Don't confuse:

- `assets_*` → customer-owned managed devices
- `admin_*_user_device` → tech-owned devices for Syncro app login / 2FA

## Vendors and inventory

For RMM-adjacent procurement (e.g. ordering replacement hardware):

- `admin_list_vendors` / `admin_create_vendor` / `admin_update_vendor` / `admin_get_vendor`
- `admin_list_purchase_orders` / `admin_get_purchase_order` / `admin_create_purchase_order` / `admin_receive_purchase_order` / `admin_add_po_line_item`
- `admin_update_purchase_order` — change only `status`, `general_notes`, `shipping_cents`, `delivery_tracking`, or `vendor_id`. Syncro won't mark a PO `Finished` while any line is unreceived; receive the lines first.
- `admin_add_po_attachment` — attach a quote, invoice, or packing slip. Give one source:
  - `file_url` — a direct download link. Works everywhere, including claude.ai. Share links that open a preview page fail with a clear message; ask the user for the direct-download version (e.g. Dropbox `?dl=1`).
  - `file_path` — a full path to a file on the user's computer. Claude Code / Desktop only.
  - `file_base64` + `filename` — only for tiny files you generate yourself (e.g. a short CSV). Never base64 a user's PDF; the whole file would have to be written out.
  - A file the user attached in a claude.ai chat can't be forwarded. Ask them for a link instead.
  - JPEG, PNG, GIF, PDF, CSV, XLS, or XLSX only; the extension must match the real file type. Max 10 MB and 10 files per PO; the same file twice is rejected.

When a CVE or hardware failure means you need to order replacements, link the PO to the affected customer/asset via the line items.

## Common RMM workflows

**"Is everything healthy at customer X?"**

1. `rmm_list_alerts` filtered by customer, unresolved → outstanding issues
2. `assets_list` for that customer → device count and last-seen
3. Summarize with hyperlinks to assets and alerts

**"Apply this CVE patch to all affected devices"**

1. `assets_list` (filter by OS / customer if scoped)
2. For each, `assets_get_patches` → identify the CVE patch
3. Push a fix with `rmm_schedule_script` (after user approval, see Running scripts) or schedule a maintenance ticket
4. Track via tickets, not just alerts (tickets give you the audit trail)
