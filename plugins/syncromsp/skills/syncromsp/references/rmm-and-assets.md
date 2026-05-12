# RMM, assets, alerts

## Assets (managed devices)

Assets are workstations, servers, network gear, or any tracked device.

- `assets_list` — filter by customer, type, status
- `assets_get` — full asset detail (hardware, software, user, last-seen, etc.)
- `assets_get_patches` — patch status / missing patches per device
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

When a CVE or hardware failure means you need to order replacements, link the PO to the affected customer/asset via the line items.

## Common RMM workflows

**"Is everything healthy at customer X?"**

1. `rmm_list_alerts` filtered by customer, unresolved → outstanding issues
2. `assets_list` for that customer → device count and last-seen
3. Summarize with hyperlinks to assets and alerts

**"Apply this CVE patch to all affected devices"**

1. `assets_list` (filter by OS / customer if scoped)
2. For each, `assets_get_patches` → identify the CVE patch
3. Push via Syncro's RMM scripting (if exposed by your MCP build) or schedule a maintenance ticket
4. Track via tickets, not just alerts (tickets give you the audit trail)
