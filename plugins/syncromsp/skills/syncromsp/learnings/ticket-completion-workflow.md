---
name: Ticket completion workflow — assign, type, log labor, resolve
description: When finishing work on a ticket, always assign to the technician, set the problem type, log labor first, then mark resolved — in that order.
discovered: 2026-07-07
tags: [tickets, time-tracking, billing, workflow]
---

# Ticket completion workflow

## Context

After investigating and fixing an issue reported on a ticket, the user asked to log labor, assign the ticket, set its type, and mark it resolved — as one wrap-up sequence.

## What you found

This is a standing wrap-up pattern for closing out ticket work, not a one-off request:

1. Assign the ticket to the technician (`tickets_update` with `user_id` — the cached technician ID from `config.json`).
2. Set the problem type (`tickets_update` with `problem_type`, e.g. `"Bug"`). Note: this is the free-text `problem_type` field, not `ticket_type_id` — the account's `ticket_types` list (from `tickets_settings`) may only contain unrelated fixed types like "Approvals", so don't try to match "Bug" against that list.
3. Log labor via the two-step timer flow (`tickets_add_timer` → `tickets_charge_timer`) — see `references/time-tracking.md`.
4. Set status to `"Resolved"` (`tickets_update` with `status`).

Labor must be logged **before** the status changes to Resolved. Marking a ticket resolved first and logging time after risks the time entry getting skipped or looking like an afterthought on a closed ticket.

## How to apply

Whenever the user says a ticket is done / to close it out / "wrap this up" (or gives explicit instructions matching this shape), do these four things by default, in this order, without being asked each one individually:

1. Assign to the technician (defaults to the cached user unless the user names someone else).
2. Set problem type (ask the user if it's not obvious from context, per `time-tracking.md`'s existing rule to ask before picking a labor product — same principle applies to problem type when ambiguous).
3. Log time — two-step timer flow, charged (billable), with notes summarizing the work done.
4. Only then set status to Resolved.

If the user only asks for some of these (e.g. just "mark resolved"), still log labor first if time hasn't already been logged for the session's work — don't silently skip billable time.

## Related

- `references/time-tracking.md` — the two-step timer/charge mechanics this depends on.
