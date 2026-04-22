# DocHub — Open Items Audit

Snapshot taken **2026-04-19**. Planning doc only — nothing below has been
touched in this session. Checkboxes are yours to tick off as work lands.

---

## 🔴 P0 — Security debt (carried over from 2026-04-10 review)

The Linode→Dell migration left artifacts on disk that should have been
cleaned up but weren't.

- [ ] Dispose of **`~/archive/from-linode-2026-04-10/creds.csv`** (42 KB plaintext)
      → decide: encrypt at rest, import into DocHub vault + delete, or move
      to offline secrets manager
- [ ] Dispose of **`~/archive/from-linode-2026-04-10/itflow.sql`** (97 MB full
      DB dump, contains hashed passwords + API keys + all client data) and
      its companion `itflow_import.sql`, `itflow_import.py`,
      `itflow_import_report.md`
- [ ] **Decommission old Linode `45.79.134.250`** — still pingable (~27 ms
      round-trip from the Dell host). Before cancellation:
  - Rotate the GitHub PAT that's sitting in its `.git-credentials`
  - Wipe `.bash_history` (contains ~17 inlined TOKEN / SECRET / PASSWORD
    patterns from past shell sessions)
  - Delete the `creds.csv` + `itflow*.sql` copies still on that host
  - Then cancel at Linode
- [ ] **Remove `changeme_before_production` placeholder** from committed
      `docker-compose.yml`. Runtime overrides it via `env_file: .env`, but
      a public-repo reader shouldn't see fake DB creds. Either delete the
      line and rely on env_file, or replace with `REPLACE_ME`.

---

## 🟠 P1 — Operational drift visible in `cron.log`

Daily sync is running cleanly overall (Syncro: 140 clients, 417 assets, 47
contacts) but three integrations are firing empty or unauthorized.

- [ ] **UnifiLocal: `"Unauthorized"`** on every nightly sync — credentials
      drifted or the controller's local admin was changed. Re-auth in
      Settings → Integrations.
- [ ] **Alerts: `skipped — Resend API key or alert email not configured`**.
      If Teams webhook alarms are now the intended channel for expiry /
      breach / uptime alerts, this is fine to leave as-is — just confirm
      the intent and delete the Resend scaffolding. Otherwise, wire Resend.
- [ ] **Synology: `0 devices`** — integration works, just no devices
      registered yet. Add devices when ready (not a bug).
- [ ] **Domains: `0 checked`** — likewise, no domains populated. Ops data,
      not code.

---

## 🟡 P2 — claude.md roadmap remaining

Two items on DocHub's in-repo roadmap never got picked up.

- [ ] **RBAC middleware** — restrict TECH users from reading sensitive
      credential fields (passwords, API keys, private keys). ADMIN sees
      everything, TECH sees redacted values. Mirrors TicketHub's
      finance-blind pattern but applied to secrets instead of money.
- [ ] **Add Michael Frye StaffUser record** — deferred until platform stable;
      platform is stable now, this is a 2-minute admin task once auth +
      RBAC line up.

---

## 🟢 P3 — Latent bugs

- [ ] Unauth root redirect emits `callbackUrl=https://0.0.0.0:3000/` from
      `NextRequest.url`. Cosmetic / not exploitable, but fix on the next
      auth-code touch. See `project_dochub_auth_callback_bug.md` in Claude
      memory.

---

## 🔵 Feature gaps still open (from competitor research 2026-04-09)

Most of that original 18-item list shipped. These six didn't:

- [x] ~~**Network discovery scanner**~~ — ✅ **superseded by PCC Scout**.
      Scout-side "Send to DocHub" button lives on each prospect detail page;
      DocHub exposes `POST /api/scout/ingest` (bearer-token) which upserts
      assets keyed by MAC scoped to `dataSource='SCOUT'` within a picked
      location. Shipped 2026-04-19 in DocHub commit `2f52a1c` (local only —
      see Scout memory for push-to-registry notes). *Follow-up*: add a
      `dataSource=SCOUT` filter chip to DocHub's asset list so imported
      rows are easy to review.
- [ ] **IP access control** for staff login — restrict Azure AD login to
      known IP ranges (office egress + tailnet + VPN). IT Glue has this.
- [ ] **Automated password rotation** — trigger AD / Entra / M365 password
      rotations from DocHub when a credential rolls. Requires Graph admin
      consent; coordinate with the M365 Application Access Policy you
      already have scoped to `accounting@` + `helpdesk@`.
- [ ] **Contract / renewal tracking** separate from software licenses —
      vendor MSAs, managed-services agreements, lease renewals. A Vendors
      tab exists (`a8b4486`); extending it with contract records + renewal
      dates is probably enough.
- [ ] **Onboarding / offboarding runbooks triggered by lifecycle events** —
      new user / departed user / new client. Runbook history page exists;
      this is a hook on Person/Client status transitions.
- [ ] **Bulk email to client contacts** — maintenance-window notifications
      to a client's contact list. Reasonable question: does this belong in
      DocHub or TicketHub, since TicketHub owns email send infra via M365?

---

## ⚪ Integration-adjacent thoughts (not commitments)

- **PCC Scout handoff** — if Scout surfaces new MACs/IPs on a subnet, the
  obvious DocHub ingest path is a signed webhook that creates/updates
  `Asset` records scoped by client. Needs one API endpoint on DocHub's side,
  a mapping rule for "which client does this subnet belong to," and a
  review queue so auto-ingested assets don't get blindly trusted.
- **BizHub write-back** — once BizHub is live, won bids / awarded grants
  should land in DocHub as a project record attached to the relevant
  client. Small API surface (`POST /api/projects` or similar).
- **TicketHub cross-sync is deep** — tickets on asset detail, Persons
  flowing both ways, shared vault. Any new DocHub work should check
  whether it affects a TicketHub cross-link before merging.

---

## What this doc is not

- Not a fire drill — every P0 item is low-probability but high-cost-if-realised
- Not a commitment schedule — use it to pick, not to guilt
- Not a feature wishlist — wishlist still lives in the original
  competitive-research memory; this is the audited subset that still applies

## How to use

Pick one per session. Mark the box when it lands. When this doc drifts out
of date, re-audit by running `git log --since="<date>" --oneline` and
cross-referencing with whatever else has moved in memory.
