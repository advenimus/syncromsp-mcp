# Appointments & scheduling

## Required fields

When creating an appointment:

- `user_id` — the technician (use cached `user_id`)
- `appointment_type_id` — from cached `appointment_types`
- `start_at`, `end_at` — ISO 8601
- `customer_id` — who it's with
- Optional: `ticket_id` (link to ticket), `subject`, `description`, `location`

## Common appointment types

| Type | Typical use |
|------|-------------|
| Our Office | Customer comes to your office |
| Phone Call | Scheduled phone consultation |
| Remote Support | Pre-arranged remote session |
| Onsite | Tech visits customer site |

Cached `appointment_types` map has the actual IDs; defaults match Syncro's stock types. If you create new types via `appointments_create_type`, update `config.json`.

## When you create an appointment for a ticket

Set the linked ticket's status to `"Scheduled"` in the same flow. The ticket's status reflects the operational state — when an appointment exists, the work is scheduled, not new or in-progress.

## Listing & reading

- `appointments_list` — filter by date range, user, customer
- `appointments_get` — single appointment with full details
- `appointments_list_types` — current type IDs (re-run if cache seems stale)

## Updating

- `appointments_update` — reschedule, change type, edit notes
- `appointments_delete` — cancel (destructive — confirm first)

## Patterns

- **Onsite work**: create appointment + ticket together; status `"Scheduled"`.
- **Phone consult**: appointment with type=Phone Call, often no ticket needed for short calls.
- **Recurring maintenance**: create individual appointments per occurrence (Syncro doesn't have native recurring appointment templates as of this writing — verify if the user expects this).

## Conflicts

`appointments_list` filtered by user + overlapping date range shows existing bookings. Check before scheduling, especially for the same technician.
