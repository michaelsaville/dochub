# DocHub — Open Items Audit

Snapshot taken **2026-04-19**. Planning doc only — nothing below has been
touched in this session. Checkboxes are yours to tick off as work lands.

---

## 🔴 P0 — Security debt (carried over from 2026-04-10 review)

The Linode→Dell migration left artifacts on disk that should have been
cleaned up but weren't.

- [x] ~~Dispose of **`~/archive/from-linode-2026-04-10/creds.csv`** (42 KB plaintext)~~
      → **DONE 2026-05-28.** Verified all 578 passwords already in the vault
      (decrypt-match) and backfilled the 26 TOTP seeds that had never been
      migrated (ITFLOW creds had 0 TOTP). Then `shred -uvz` the file. Backup:
      `~/backup-dochub-pre-totp-backfill-20260528-234926.sql`.
- [x] ~~Dispose of **`~/archive/from-linode-2026-04-10/itflow.sql`** + companions~~
      → **DONE.** The 97 MB `itflow*.sql` dumps were already gone; shredded the
      remaining `itflow_import.py`. Preserved the secret-free `itflow_import_report.md`
      into `Notes/VibeCodeing Projects/DocHub/` then shredded the archive copy.
      (Only `dochubext.zip` — an extension build, no secrets — remains in the dir.)
- [x] ~~**Decommission old Linode `45.79.134.250`**~~ → **CONFIRMED GONE
      2026-05-29.** ICMP 100% loss (was ~27 ms in April), and TCP 22/80/443/3000
      all unreachable — the VM is decommissioned. Its on-disk secrets
      (`.bash_history`, `creds.csv`/`itflow*.sql` copies) went with it.
  - [ ] **Residual:** confirm the GitHub PAT that lived in that host's
        `.git-credentials` was rotated/revoked. The server is gone but the token
        could still be valid on GitHub — check
        github.com → Settings → Developer settings → Personal access tokens and
        delete any old/unrecognised one. (Independent of the dead VM.)
- [x] ~~**Remove `changeme_before_production` placeholder** from committed
      `docker-compose.yml`~~ → **DONE** (verified 2026-05-28: no longer present
      in `docker-compose.yml`).

---

## 🟢 Deploy pipeline — diagnosed + FIXED 2026-05-29 (commit `a5f01b4`)

The "push → CI → GHCR → Watchtower" model was broken. Root causes + fixes:

- [x] ~~Host CLI cannot pull from GHCR~~ → **FIXED.** The `ghcr.io` cred in
      `~/.docker/config.json` was an **expired classic PAT**. Re-logged in with
      the `gh` CLI token (`gh auth token | docker login ghcr.io -u
      michaelsaville --password-stdin`) — pull works. `deploy.sh` refreshes this
      login on every run so it can't silently expire again.
- [x] ~~Watchtower looks dead~~ → **REMOVED.** It was a zombie (running/healthy
      but the poll loop never executed — containerd store + `DOCKER_API_VERSION`
      pin; no logs even after a clean restart). Deleted the service from
      `docker-compose.yml` and the container.
- [x] ~~Containerd image-store gotcha~~ → **HANDLED.** New `./deploy.sh` always
      `docker pull`s then `compose rm -sf app && compose up -d app` (recreate
      from current `:latest`, never diff image IDs — they're unreliable here) and
      health-gates on `/login`. Verified end-to-end: push → CI → `./deploy.sh`.
- [ ] **Make `gh` auth durable** (optional) — `deploy.sh` depends on `gh` staying
      logged in. If it ever logs out, deploys fail at the login step with a clear
      error. A long-lived fine-grained PAT with `read:packages` would be an
      alternative, but the gh-token path needs no secret management.

## 🟠 P1 — Operational drift visible in `cron.log`

Daily sync is running cleanly overall (Syncro: 140 clients, 417 assets, 47
contacts) but three integrations are firing empty or unauthorized.

- [ ] **UnifiLocal: `"Unauthorized"`** on every nightly sync — credentials
      drifted or the controller's local admin was changed. Re-auth in
      Settings → Integrations.
- [x] ~~**Alerts: `skipped — Resend API key or alert email not configured`**~~
      → **DONE 2026-05-29.** Wired **ntfy push** (topic in `push:ntfy:topic`;
      subscribe in the ntfy app). Fixed a gate bug where a missing Resend config
      early-returned and skipped Teams/push too (commit `033f1fd`) — channels now
      fire independently; added `GET /api/cron/alerts?test=1`. Disabled the
      `warranties` category (`alerts:categories:warranties=false`) because 298
      long-expired asset warranties were flooding the "critical" bucket. Resend
      email + Teams remain available, just unconfigured.
- [ ] **Synology: `0 devices`** — integration works, just no devices
      registered yet. Add devices when ready (not a bug).
- [ ] **Domains: `0 checked`** — likewise, no domains populated. Ops data,
      not code.

---

## 🟡 P2 — claude.md roadmap remaining

Two items on DocHub's in-repo roadmap never got picked up.

- [x] ~~**RBAC middleware** — restrict TECH users from reading sensitive
      credential fields~~ → **DONE 2026-05-29 (commit `3935c98`).** Audited all
      ~22 `decrypt()` sites. The per-credential `allowTechReveal` gate was sound
      on the direct reveal routes but bypassable via: the client **report**
      (bulk plaintext to any TECH), **share-link creation** (mint a public link
      to an un-revealable cred), and **license-key reveal** (any TECH). Fixed all
      three + gated check-breach + blocked CLIENT explicitly. License keys are
      now ADMIN-only. Full write-up: `project_dochub_rbac_audit_2026_05_29.md`
      in Claude memory.
- [x] ~~**Add Michael Frye StaffUser record**~~ → **ALREADY DONE** (verified
      2026-05-29: `mfrye@pcc2k.com`, role ADMIN, created 2026-03-24). The audit
      doc was just stale.

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
