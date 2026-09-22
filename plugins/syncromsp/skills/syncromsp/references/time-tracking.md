# Time tracking & labor

There are two ways to track labor on a ticket. Both end in a **charge** step. Skipping it means the work is tracked but not billed.

| Situation | Use |
|-----------|-----|
| Logging work that already happened ("I spent 45 min on this") | Two-step pattern: `tickets_add_timer` then `tickets_charge_timer` |
| The tech is starting work now and wants a running clock | Live timer: `time_create_timer`, pause/resume as needed, `time_stop_timer`, then charge if needed |

Ticket timers and timer entries are the same record in Syncro. A live timer's `id` is the `timer_entry_id` that `tickets_charge_timer` and `tickets_update_timer` expect.

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

## Live timers

Use these when the tech wants the clock running while they work.

```
1. time_create_timer({ ticket_id, product_id, notes })   // starts running now
2. time_pause_timer({ id }) / time_start_timer({ id })   // optional: pause for a break, resume after
3. time_stop_timer({ id })
4. If the stopped timer has no ticket_line_item_id:
   tickets_charge_timer({ ticket_id, timer_entry_id: id })
```

- **Ask for the labor type first** and pass it as `product_id`, same as the two-step pattern.
- **The timer always belongs to the API token's owner.** `time_create_timer` has no `user_id`. To log time for a different tech, use `tickets_add_timer` with their `user_id`.
- **One active timer per tech per ticket.** If one is already running or paused on that ticket, `time_create_timer` resumes and returns it instead of making a second.
- **`billable` left out = the account default.** Pass it only when the user says the time is or isn't billable.
- **Stopping may already charge.** If the account has "charge timers by default" on, `time_stop_timer` creates the line item itself. Check `ticket_line_item_id` in the stop response before calling `tickets_charge_timer`, or you will bill twice.
- **Finding a timer to pause or stop:** `time_list_timers({ ticket_id, status: "running" })` (or `"paused"`).
- **Invalid moves return 422:** starting a running or stopped timer, pausing one that isn't running, stopping one that's already stopped.

## Timer states

- **Running / paused / stopped** — live timers from `time_create_timer`. Filter with `time_list_timers({ status })`.
- A timer from `tickets_add_timer` with `duration_minutes` set is **logged** but not yet charged.
- After `tickets_charge_timer` (or an auto-charging stop), the entry becomes a **charged time log** linked to a billable line item.

Before charging, fix details with `tickets_update_timer` (notes, duration, start, product, user) or `time_update_timer` (billable only).

## Reading time on tickets

- `time_list_timelogs` — employee clock in/out records; filter by user
- `time_list_timers` — ticket timers; filter by `ticket_id`, `user_id`, `status` (running/paused/stopped), `customer_id`, or `billing_status` (non-billable/unbilled/billed/invoiced)
- `time_get_last_timelog` — the current user's most recent clock in/out record
- `time_update_timelog` — edit a clock in/out record
- `time_update_timer` — set a ticket timer's `billable` flag (nothing else)
- `tickets_get` includes summary totals; for line-by-line detail use `time_list_timers({ ticket_id })`

## Common pitfalls

- Forgetting `start_at` → API rejects the timer.
- Using `tickets_add_line_item` for labor → time isn't tracked, just billed.
- Charging a timer twice → creates duplicate billable line items. Check for an existing charge before re-running, especially after `time_stop_timer` on accounts that charge on stop.
- Leaving a live timer running → it keeps counting. When the user says they're done, stop it.
- Wrong labor product on a contract customer → bills them when contract should cover it.
