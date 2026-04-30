# Time tracking & labor

Labor logging on tickets is **always two steps**. Skipping the second step means the work is tracked but not billed.

## The two-step pattern

### Step 1 — Add timer

```
tickets_add_timer({
  ticket_id,
  user_id,             // cached technician ID
  start_at,            // ISO 8601 datetime when work began (REQUIRED)
  duration_minutes,    // total minutes
  product_id,          // labor product ID — see selection below
  notes                // what was done — visible on the time log
})
```

Returns a `timer_entry_id`.

### Step 2 — Charge timer

```
tickets_charge_timer({
  ticket_id,
  timer_entry_id       // from step 1
})
```

This converts the time log into a billable charge on the ticket. **Without step 2, the time is recorded but never billed.**

## NEVER use `tickets_add_line_item` for labor

`tickets_add_line_item` adds a generic product/service line. Using it for labor:

- Skips the time log (no time tracking record exists)
- Misses rate-card pricing logic
- Confuses reporting and time-by-tech metrics

Always use the two-step timer flow above for billable labor. `tickets_add_line_item` is for **parts, hardware, software licenses, and one-off services** — not labor.

## Choosing the labor product

Always **ask the user which labor type to use before logging time** unless they've already specified it. The cached `labor_products` map provides the IDs.

| Type | When to use |
|------|-------------|
| Labor (default) | Standard onsite or general work |
| Project Labor | Project-scoped work, often discounted |
| Remote Support Labor | Remote support sessions |
| After Hours Labor | Outside business hours, premium rate |
| Rush Labor | Expedited / emergency response |
| Contract Labor | Covered under a service contract — usually $0 |
| Trip Charge | Travel / dispatch fee (not really "labor" but lives here) |

Rates differ — don't assume "Labor" is always right. If the customer is on a contract that covers some hours, "Contract Labor" zeroes out the charge while still recording the time.

## Timer states

- A timer with no `duration_minutes` is **running** — it accumulates until stopped.
- A timer with `duration_minutes` set is **logged** but not yet charged.
- After `tickets_charge_timer`, the entry becomes a **charged time log** linked to a billable line item.

`tickets_update_timer` to adjust a running or logged timer before charging.

## Reading time on tickets

- `time_list_timelogs` — all charged time entries; filter by ticket / user / date range
- `time_list_timers` — currently running or unbilled timers
- `time_get_last_timelog` — most recent entry for a ticket
- `time_update_timelog` / `time_update_timer` — edit existing entries
- `tickets_get` includes summary totals; for line-by-line detail use `time_list_timelogs`

## Common pitfalls

- Forgetting `start_at` → API rejects the timer.
- Using `tickets_add_line_item` for labor → time isn't tracked, just billed.
- Charging a timer twice → creates duplicate billable line items. Check for an existing charge before re-running.
- Wrong labor product on a contract customer → bills them when contract should cover it.
