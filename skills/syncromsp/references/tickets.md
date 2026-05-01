# Tickets

## Creating tickets

Required mindset:

- Put the issue **description in the ticket body** (not as a comment after creation).
- Set `user_id` to the cached technician ID (default assignee).
- Default `status="New"`. Use `"Scheduled"` ONLY if you are also creating an appointment in the same flow.
- Choose `problem_type` from context. Common values:
  - **Incident** — something broke
  - **Change Request** — planned modification
  - **Regular Maintenance** — recurring upkeep
  - **Project Work** — scoped initiative
  - **Password Reset** — credential recovery
  - **Access Request** — permissions / new account
  - **Bug** — software defect (not infrastructure)
  - **User Management** — onboarding / offboarding
  - **Other** — none of the above
- `subject` should be concise and human-readable. The body is for detail.

### Initial comment at creation

If the customer should receive a confirmation, include an initial public comment via `comments_attributes`:

```json
{
  "comments_attributes": [{
    "body": "Hi {{name}}, we received your request and will follow up shortly.",
    "subject": "Ticket Received",
    "hidden": false,
    "do_not_email": true
  }]
}
```

Rules:

- Initial comment at creation must be **public** (`hidden: false`). Don't post a private comment as the first interaction.
- The ticket `body` and the initial comment serve different purposes. The body is internal context for the tech; the comment is the customer-visible message. Don't substitute one for the other.

## Statuses

| Status | Meaning |
|--------|---------|
| New | Just opened, not triaged |
| In Progress | Tech actively working |
| Resolved | Work complete, awaiting close-out |
| Waiting for Parts | Blocked on physical inventory |
| Waiting on Customer | Ball is in customer's court (you posted a public comment expecting reply) |
| Customer Reply | Customer has replied; awaiting tech response |
| Scheduled | Appointment exists for this ticket |
| On Hold (Technician) | Tech-side pause |
| On Hold (Customer) | Customer-side pause |

**Transition rules:**

- After posting a public comment that expects a reply → set status to `"Waiting on Customer"`.
- "Customer Reply" is typically set automatically by inbound email/portal automation, not manually.
- When you simultaneously create an appointment → `"Scheduled"`.
- When work is done → `"Resolved"` (the system or a separate workflow closes it later).

## Comments

`tickets_comment` requires a `subject` field — omitting it returns 422.

Comment `body` and `subject` are rendered as **plain text** by Syncro — markdown is not parsed. See the "Plain text only in Syncro fields" rule in `SKILL.md`. Use ALL CAPS for emphasis, hyphen bullets for lists, bare URLs (no `[text](url)`), and blank lines for paragraph breaks. Never paste markdown directly from a doc or chat — translate it first.

**Workflow for any non-trivial outbound comment:**

1. Draft the comment.
2. Show the user the draft and ask: public, private, or email-customer?
3. Wait for explicit approval.
4. Post via `tickets_comment` with the right `hidden` and `do_not_email` flags.
5. Update ticket status accordingly (usually `"Waiting on Customer"` after a public comment that expects reply).

For routine internal-only notes ("logged 30 min troubleshooting") you don't need approval — but still mark them private (`hidden: true`).

To get the **full comment history**, use `tickets_get_comments`. Don't infer ticket activity from `tickets_list` or `tickets_get` payloads — they may be truncated.

## Reading ticket activity

When the user asks "what's happening on ticket X" or similar:

1. `tickets_get` for the ticket header (status, assignee, customer, problem_type)
2. `tickets_get_comments` for the full thread
3. `time_list_timelogs` filtered by ticket for labor entries
4. Summarize chronologically, with hyperlinks to the ticket and any referenced records

## Linking tickets to other records

Tickets reference: `customer_id`, `user_id` (assignee), optionally `asset_id`, `contact_id`. When creating, ensure customer is set; assignee defaults to cached `user_id`.

## Attachments

- `tickets_attach_file` — attach
- `tickets_delete_attachment` — remove

## Line items on tickets

Use `tickets_add_line_item` for products/parts that need to appear on the eventual invoice for the ticket. **Do NOT use it for labor** — labor goes through the timer flow (see `time-tracking.md`).

`tickets_add_line_item` quirk: requires both `name` AND `description` even when `product_id` is set.

## Custom ticket forms / worksheets

Some tickets have associated forms (e.g. onboarding checklists). See `admin_list_ticket_forms`, `admin_get_ticket_form`, `admin_process_ticket_form`. For asset-tied questionnaires see `admin_list_worksheets`.
