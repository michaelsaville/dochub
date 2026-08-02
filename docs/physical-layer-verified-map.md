# DocHub Physical Layer — VERIFIED implementation map

> Generated 2026-08-02 by a 7-agent verification pass (6 parallel verifiers + synthesis)
> run against live code and the live `dochub-db-1` database.
>
> **This file supersedes `physical-layer-plan.md` wherever they disagree.** The plan doc
> is the decision record (what Michael chose and why); this is the build document
> (what is actually true). Verdict tally: 66 CONFIRMED, 18 WRONG, 24 PARTIALLY_WRONG,
> 1 UNVERIFIED across the six claim clusters.

Verified the plan doc, re-ran `safe-db-push.sh --check`, and cross-checked every contradiction between the six reports against live files and `dochub-db-1`. Output below.

---

# DocHub Physical Layer — Verified Implementation Map

**Source plan:** `/home/msaville/dochub/docs/physical-layer-plan.md` (312 lines, untracked, branch `feat/physical-layer`)
**Verification date:** 2026-08-02. All path:line citations below are absolute-real and were re-checked.

---

## 1. CORRECTIONS

These are ordered by how much damage the wrong statement would do. Everything here should be edited into the plan doc before a builder touches it.

### 1.1 — GLOBAL: every file path in the plan is missing the `app/` prefix

**Plan says** `app/assets/[id]/page.tsx`, `prisma/schema.prisma`, `components/RackDiagram.tsx`, `lib/unifi.ts`, `next.config.ts`, `app/globals.css`.
**Truth:** the Next.js app root is `/home/msaville/dochub/app`, not the repo root. Every one of those resolves one directory up from where the file actually is. Correct forms:

| Plan writes | Actually |
|---|---|
| `app/assets/[id]/page.tsx` | `/home/msaville/dochub/app/app/assets/[id]/page.tsx` |
| `app/api/search/route.ts` | `/home/msaville/dochub/app/app/api/search/route.ts` |
| `prisma/schema.prisma` | `/home/msaville/dochub/app/prisma/schema.prisma` |
| `components/RackDiagram.tsx` | `/home/msaville/dochub/app/components/RackDiagram.tsx` |
| `lib/unifi.ts` | `/home/msaville/dochub/app/lib/unifi.ts` |
| `next.config.ts` | `/home/msaville/dochub/app/next.config.ts` |
| `app/globals.css` | `/home/msaville/dochub/app/app/globals.css` |

**Exceptions that really are at repo root:** `safe-db-push.sh`, `pcc-theme-reference.md`, and the plan doc itself (`docs/physical-layer-plan.md`). Line numbers *within* files are accurate except where noted below.

Evidence: `find` returns `./app/components/RackDiagram.tsx`, `./app/app/globals.css`; `Read /home/msaville/dochub/app/assets/[id]/page.tsx` → file does not exist.

### 1.2 — The NetworkDevice landmine is already closed. Delete it.

**Plan says** (line 268-270): "Legacy `NetworkDevice` (`schema.prisma:1303`) still owns `switchPorts` and `rackSlots`. `DevicePort.assetId` must be Asset-only — finish `admin/migrate-network-devices` before Phase 2 or you get two port universes."

**Truth:** `SELECT count(*) FROM "NetworkDevice"` → **0**. `SELECT count(*) FROM "SwitchPort" WHERE "networkDeviceId" IS NOT NULL` → **0**. `RackSlot` → **0**. The migration is *complete*; the table is empty. `/home/msaville/dochub/app/app/api/admin/migrate-network-devices/route.ts` still exists and reads correct (GET dry-run :18-40, POST admin-gated :43-121) but now queries `where: { assetId: null }` against zero rows — it is a no-op.

What remains is **code debt, not data debt**: the `NetworkDevice` model at `prisma/schema.prisma:1303-1334` still owns `switchPorts` (:1331) and `rackSlots` (:1330), and ~15 call sites still read it. Do not budget Phase 2 time for a migration. Budget it for *deleting reads*.

### 1.3 — The Phase 0.1 crash is worse than described, and needs 4 edits not 2

**Plan says** (line 46-52): "`app/assets/[id]/page.tsx:933` dereferences `iface.switchPort.networkDevice.name` unguarded… fires on the first port-linked interface anyone creates. Guard the deref and include the asset relation."

**Truth — all confirmed, plus three things the plan doesn't say:**

1. `NetworkDevice` has **zero rows**, so `switchPort.networkDevice` is *unconditionally* null, not merely usually. Prisma returns the key as `null`; `null.name` throws a TypeError during render.
2. There is **no error boundary anywhere in the app** — verified `ls app/error.tsx app/global-error.tsx` → both missing; grep for `ErrorBoundary`/`componentDidCatch` → nothing. The throw escapes to Next's built-in fallback and blanks the entire `/assets/[id]` page.
3. The defective include appears at **three** places, not one, and each feeds a different code path into the same `interfaces` state array:
   - `app/app/api/assets/[id]/interfaces/route.ts:14` (GET) → consumed at `page.tsx:343` (mount)
   - `app/app/api/assets/[id]/interfaces/route.ts:64` (POST) → consumed at `page.tsx:391` (create)
   - `app/app/api/assets/[id]/interfaces/[interfaceId]/route.ts:41` (PATCH) → consumed at `page.tsx:414` (edit)

   Fix any two and the crash survives on the third.
4. The type at `page.tsx:40-46` declares `networkDevice: { id: string; name: string }` **non-nullable**, while `prisma/schema.prisma:1366` is `networkDevice NetworkDevice?`. TypeScript never caught it because the value arrives via `await res.json()` (typed `any`).
5. **Root-cause framing correction.** This is not "guard a null." The port's owner moved from `NetworkDevice` to `Asset` and one render site never followed. A bare `networkDevice?.name` would compile, stop the crash, and render an empty string next to every port forever — the failure mode you would not notice. The fix must **include and prefer the `asset` relation**.

   The correct include shape already exists in-repo at `app/app/api/clients/[id]/racks/route.ts:21-22` (includes *both* `networkDevice` and `asset`; consumer `components/RackDiagram.tsx:63-78` types both nullable and falls back). Copy that.

**Also correct:** it is *latent*, not currently firing — `AssetInterface` with non-null `switchPortId` = 0 of 32. But the write path is live and one click away: `components/SwitchPanel.tsx:174` (PATCH) and `:218` (POST) set `switchPortId`, reached from `app/app/clients/[id]/page.tsx:2783-2784` → `:4154`.

### 1.4 — Phase 0.2 materially understates existing search coverage, and gets three facts wrong

**Plan says** (line 54-58): "`app/api/search/route.ts:25-160` covers asset name/serial/IP, credentials and documents — never `Asset.room`, `SwitchPort.label`, or racks."

**Truth:**

- **Line range is wrong.** The file is 284 lines. The `Promise.all` query block is `:17-258`; the short-query early return is `:12`; RBAC post-filter + response is `:263-282`.
- **Coverage is 16 entity groups, not 3.** `route.ts:17` destructures `clients, assets, credentials, runbooks, documents, files, people, vendors, licenses, locations, netdevices, circuits, flexAssets, subnets, ipAssignments, racks` — 50+ columns. This changes the work from "wire up search" to "add 2 groups to an existing 16-group route."
- **"never … racks" is WRONG.** Racks *are* searched today at `route.ts:250-257` (`prisma.rack.findMany` on `name`), RBAC-filtered at `:281`, rendered as a `RACK` chip at `components/SearchModal.tsx:176-184` with `CATEGORY_META.rack` at `:31`. What's missing is `Rack.notes` and the owning `Location.name`/`city`. Nobody noticed because `Rack` has 0 rows.
- **`Asset.room` and `SwitchPort.label` uncovered: CONFIRMED.** `route.ts:28-35` asset OR-list is name/friendlyName/serial/ipAddress/make/model; `room` is absent from both the OR and the select at `:38-47`. `prisma.switchPort` is never called anywhere in the route.
- **`Rack` has no `location` STRING column.** `prisma/schema.prisma:1405-1416` — `location` is a *relation* to `Location`. Don't add a string column.

**Additional correction the plan should carry:** adding new result kinds is **not optional UI work**. `SearchModal.tsx:358` does `const meta = CATEGORY_META[r.category]` then `:381` `meta.label.toUpperCase()` — an unregistered category **throws on render**. Five touchpoints per new kind: `route.ts:12` early-return key, `route.ts:265` response key, `SearchModal.tsx:15-32` CATEGORY_META, `SearchModal.tsx:34-51` param type (all 16 keys are *required*), and a push loop.

### 1.5 — Phase 0.3's premise is false: UniFi port data is not "free," it is unreachable

**Plan says** (line 60-65): "Stop discarding the free UniFi data… `sync-local/route.ts:235-241` persists only `isPoe` and `isUplink`. Wiring `port.name → SwitchPort.label`… documents every UniFi client's patching with zero typing."

**Truth — the data is not being discarded, it is never being fetched:**

- `SELECT key,status,message FROM "IntegrationSyncStatus"` → `unifiLocal | UNCONFIGURED | 'UniFi credentials not configured'`. `sync-local/route.ts:38-40` bails before doing anything. **It has never run successfully, on any night, since it was written.**
- All 280 `SwitchPort` rows have `updatedAt == createdAt`. Zero rows have *ever* been written to after creation, by sync or by hand.
- **Only the UI.com cloud path is configured.** `SELECT key FROM "AppSetting" WHERE key LIKE 'integration:unifi%'` returns exactly 3 rows: `:apiKey`, `:controllerType = 'ui_cloud'`, `:siteMap`. There is no `:username`, no `:password`, no `:url`. And `app/app/settings/page.tsx:1154` **hides** the username/password inputs whenever `controllerType` is `ui_cloud` — so those credentials cannot even be entered through the UI in the current configuration.
- **The cloud endpoint returns no port data.** `app/lib/unifi.ts:148-158` hits `https://api.ui.com/v1/devices`; the sync route at `:246-276` reads only id/mac/model/ip/serial/version/productLine/shortname. Port tables exist only on the local controller endpoint `/api/s/{site}/stat/device` (`app/lib/unifi.ts:203`), reachable only via `localGetPortTables`, whose sole caller is `sync-local:218`.
- **0 of 182 Locations have `tailscaleIp`, and NO code path writes it.** `prisma/schema.prisma:181` declares the field; `app/app/api/locations/[id]/route.ts:94` destructures only `name,address,city,state,zip,ispName,wanIp,notes`; `app/app/api/clients/[id]/locations/route.ts:26-38` creates without it; `app/app/locations/[id]/page.tsx:267` renders it read-only as "not set". `sync-local/route.ts:43-53` selects `where: { tailscaleIp: { not: null } }` and hard-422s on empty.

**Revised estimate:** the code portion is ~1 day. The *prerequisite* portion is per-site infrastructure for 7 client sites (13 switches) — Tailscale reachability, local admin creds, a settings-UI unblock, and one live controller response to validate shapes. **Phase 0.3 is not a ≈1-day no-gate item.**

**Sub-corrections inside 0.3:**

- **Line range.** `lib/unifi.ts:210-223` → the mapper is `app/lib/unifi.ts:210-224`, function `localGetPortTables` spans `:201-226`. Device filter is `d.type === 'usw' && d.port_table` (`:206`) — switches only.
- **"the MAC match at `sync-local:230` (a `findFirst` on a non-unique key)"** — conflates two different weaknesses. `:231-233` is `findFirst({ assetId, portNumber })`, a *port* lookup. The *MAC* match is an in-memory array find at `:223` against `loc.assets`, which is pre-filtered to `dataSource: 'UNIFI'` at `:47` — it can never match a hand-entered switch. Both weaknesses are real; they are separate.
- **`SwitchPort` has no `speed` column.** `grep -n "speed" prisma/schema.prisma` → zero matches. The landmine at plan line 271-273 ("write-restricted to `isPoe`/`isUplink`/speed") names a column that must be *added*. Same for link state and PoE draw.
- **`isPoe` and `isUplink` are BOTH human-writable.** `app/app/api/assets/[id]/ports/[portId]/route.ts:15,28-32` lets a technician set `label, isUplink, isPoe, vlanId, notes`. There is **no provenance column anywhere** on `SwitchPort` or `AssetInterface` (`grep -n 'dataSource' prisma/schema.prisma` hits only `Asset:301,462,504` and `NetworkDevice:1322`). "Write-restricted to isPoe/isUplink" therefore does not protect anything.
- **`macTable → Asset.macAddress` will not join cleanly.** MAC format census over 567 Assets with a MAC: `DASH-UPPER` 468, bare-lower-12 80, colon 18, other 1. `app/lib/network-asset.ts:62-67` only `.toLowerCase()`s — never strips separators. And 10 MAC values are duplicated across Assets (`48-4D-7E-9F-93-DB` ×3); **two of the 13 switch Assets share `ac8ba9b14839`**.
- **`lldp_table` inner field names are UNVERIFIED.** `app/lib/unifi.ts:222` passes `p.lldp_table ?? []` through raw and unmapped. No local controller has ever been reachable to observe a real response.

### 1.6 — Phase 0.4 as written does not achieve its stated goal

**Plan says** (line 69-73): "Token-ize the rack components so they print… The print block at `app/globals.css:317-350` only remaps *tokens*, so racks currently print as black slabs."

**The premise (print block only remaps tokens) is CONFIRMED.** `app/app/globals.css:319-340` is 19 custom-property redefinitions on `:root`; the only literal rules are `:342-350` (body, aside/.no-print, main, @page, tr, h2/h3). Nothing targets inline `style` attributes. Block bounds are **:317-351** (closing brace on 351), plus a second one-liner at `:354`.

**But the conclusion is WRONG — tokenizing is not sufficient. Three defects:**

1. **`ThemeProvider` clobbers the print overrides.** `components/ThemeProvider.tsx:95` does `root.style.setProperty(key, val)` for 13 palette vars on `<html>`, from a mount effect (`:112-118`). An inline style declaration outranks a normal author-stylesheet declaration, so `@media print :root` **loses** for `--bg --surface --card --border --accent --accent2 --danger --warn --text --muted --color-text-muted` (11 of 19). It wins only for the 8 aliases ThemeProvider does not set. Tokenizing RackDiagram to `var(--card)`/`var(--text)`/`var(--border)` targets precisely the clobbered tokens — **the rack would still print dark.** `globals.css:319-340` needs `!important` on every declaration *first*, or Phase 0.4 delivers nothing.
2. **No `print-color-adjust` anywhere in the repo** (grep → 0 hits). Browsers default to `economy` and drop background colours. A correctly-tokenized rack prints as **white voids with pale slate text on white** — invisible. It only becomes literal black slabs if the operator ticks "Background graphics." A billable deliverable cannot depend on a print-dialog checkbox.
3. **`slotColor()` cannot return a CSS variable.** `RackDiagram.tsx:65` is consumed via string concatenation — `${color}22` (`:290`), `${color}33` (`:488`), `${color}88` (`:491`); same for `SwitchPanel.tsx:340` `p.vlan.color + "44"`. `var(--muted)22` is not a colour and silently renders nothing. Needs `color-mix()` or a custom-property-on-element approach.

**Also wrong: the two files are not equal offenders.**

- `RackDiagram.tsx` — **97** raw-hex occurrences, 22 distinct. Uses `var(--…)` 19 times.
- `SwitchPanel.tsx` — **31** occurrences, 17 distinct, of which **15 are not styling at all**: `PRESET_COLORS` at `:57-58` and form defaults at `:83,:86,:264` are the VLAN colour **data palette** feeding `Vlan.color` (`prisma/schema.prisma:1341`), and `:478,:714` are harmless `var(--color-text-danger, #ef4444)` fallbacks. **SwitchPanel's real styling debt is ~14 occurrences.** Uses `var(--…)` 37 times. Tokenizing `PRESET_COLORS` would write CSS-variable strings into the database.
- `17× #334155` and `13× #0f172a` are CONFIRMED — but **both counts are entirely from RackDiagram**. SwitchPanel has zero of either.

**And "racks currently print as black slabs" is not observable today.** `Rack` = 0 rows, `RackSlot` = 0 rows — `RackDiagram` renders nothing. The only physical-layer visual that can reach a printer today is `SwitchPanel`'s `#1a1a1a` chassis (`:546`) and `#111827` port fills (`:337,:341`), across 280 `SwitchPort` rows. Neither component is mounted in any report route: both appear only in `app/app/clients/[id]/page.tsx:4082` (RackDiagram) and `:4154`/`:4167` (SwitchPanel). **"Printing a rack" today means Ctrl+P on the 4,357-line client detail page.**

### 1.7 — Phase 1 tells you to edit the wrong `next.config.ts`

**Plan says** (line 97-99): "Add `/api/cable-runs` to `MUTATION_PATTERN` (`next.config.ts:6-8`). DocHub's own PWA sends every GET `/api/*` to `NetworkOnly` (`next.config.ts:64-67`)."

**Truth:**

- Line numbers: DocHub's `MUTATION_PATTERN` is at `/home/msaville/dochub/app/next.config.ts:7-8`; the catch-all NetworkOnly block is `:63-66` (comment :63, urlPattern :64-65, handler :66). Both citations are off.
- **The substance is wrong.** Editing DocHub's `MUTATION_PATTERN` accomplishes nothing — DocHub's PWA has **no offline read path**: no `/offline` route (`ls app/offline` → does not exist), no `fallbacks.document`, no navigation runtimeCaching entry, zero read caching. `dexie ^4.4.2` sits at `package.json:20` and `grep -rn 'Dexie|dexie'` across all `.ts/.tsx` returns **nothing** — a dead dependency. Nothing would ever be queued.
- **The whitelist that matters is TicketHub's** at `/home/msaville/tickethub/next.config.ts:9-10` — `/(tickets|attachments|signatures|timer|appointments)(\/|$)/i`.
- **The READ half needs no config edit in either repo.** `/api/offline/bundle` is already NetworkFirst-cached at `/home/msaville/tickethub/next.config.ts:61-71` (networkTimeout 5s, maxEntries 2, 24h), and `app/offline/page.tsx:108` already mirrors the whole payload to `localStorage`.

### 1.8 — "no new BFF is needed": right conclusion, wrong evidence, and one hidden blocker

**Plan says** (line 100-102): "Cross-schema reads follow the existing `tickethub/app/lib/dochub-bridge.ts` pattern; no new BFF is needed."

**Conclusion CONFIRMED and stronger than stated** — but `dochub-bridge.ts` never *reads* `public."Asset"`, it only INSERTs (`:176`). The cross-schema read surface is 10 TH files: `app/api/dochub-assets/route.ts:58-61`, `app/api/dochub-alerts/route.ts:41-94`, `app/lib/actions/contacts.ts:105-118` and `:364-380` (SELECT + INSERT + UPDATE `public."Person"`), `app/lib/subscription-compliance.ts:49-58`, `app/lib/portal-impersonate.ts:35`, plus three page-level reads. TicketHub's *only* HTTP call to DocHub is fire-and-forget aux-display (`app/lib/aux-display-emit.ts:50`). The HMAC BFF runs the *other* direction (DocHub → TH at `app/api/bff/dh/identity/**`). Safety is structural: TH's datasource declares `schemas = ["tickethub"]` (`prisma/schema.prisma:16`), so a TH migration can never touch `public`.

**The hidden blocker:** the *write* half cannot use this pattern. TicketHub's Dexie queue replays by re-POSTing the stored `url` (`app/lib/sync-queue.ts:180`) — it can only replay **same-origin TicketHub URLs**. A queued POST to `dochub.pcc2k.com` replays into an Entra login redirect. The write must land on a TicketHub route (`/api/cable-runs`) that then does the cross-schema INSERT.

### 1.9 — `CableRun` as specced cannot participate in the offline queue

**Plan says** the CableRun sketch at lines 82-91. It has no `clientOpId`.

**Truth:** TicketHub's idempotency is **not generic** — each server route stores `clientOpId` on the target row and short-circuits (canonical pattern at `/home/msaville/tickethub/app/api/tickets/[id]/comments/route.ts:41-53`). Without a `clientOpId` column, a replayed `SAVE_CABLE_RUN` either double-inserts or hard-fails against `@@unique([locationId, jackLabel])` — and the tech sees an error for **his own successful write**.

Also: the Dexie type unions are **closed**. `SyncOperationType` (`app/lib/offline-db.ts:10-28`) and `SyncOperation.entityType` (`:39`, `'TICKET'|'CHARGE'|'SKETCH'|'ESTIMATE'|'APPOINTMENT'`) both need new members or `enqueueRequest` won't typecheck. Minor citation fix: `clientOpId` is minted at `sync-queue.ts:140` and attached at `:180`, not `:137,203`; `enqueueRequest` spans `:137-193`, `flushQueue` starts `:202`.

### 1.10 — The `TH_Site` ↔ `Location` join is not merely unwritten, it is structurally dead

**Plan says** (line 280-283): "the `TH_Site.dochubLocationId` ↔ `Location.thSiteId` join is declared on both sides with **no writer** on either."

**Truth:** DocHub *does* have two writers — `app/app/api/locations/[id]/route.ts:69` (lazy cache after an ILIKE name match) and `app/app/api/wireless-intake/route.ts:50` (on create). They can never fire. The match predicate at `:61` is `c.name ILIKE $1 AND s.name ILIKE $2`. **Measured: joining all 150 `th_sites` to `public."Location"` on (client name ILIKE, site name ILIKE) yields exactly 0 matches.** The vocabularies are disjoint by construction:

- DocHub Location names: Primary (79), Primary location (69), Main Office (29)
- TH site names: Main (84), Office (12), Residence (11), HQ (6)

DB state: 9 of 150 `th_sites` have `dochubLocationId` (set out-of-band); **0 of 182** Locations have `thSiteId`.

**The correct resolver** (and this is load-bearing for Phase 1): client name → the client's single Location. 130 of 150 TH clients have a case-insensitive `public."Client"` name match (87%), and **180 of 181 DocHub clients have exactly one Location**. Normalized-address is the tiebreak for the one multi-location client. **Never match on site name.**

`TH_Ticket.dochubAssetId` on 4 of 863: **CONFIRMED** (`SELECT count(*), count("dochubAssetId") FROM tickethub.th_tickets` → 863 | 4; note the physical table is snake-cased `tickethub.th_tickets`).

### 1.11 — Phase 5 anchors on the wrong print surface, and misses that TicketHub already has the PDF machine

**Plan says** (line 233-234): "DocHub has no PDF generator today… the sole export path is `window.print()` via `components/ReportShell.tsx:47`."

- **"no PDF generator": CONFIRMED.** `pdf-parse ^2.4.5` (`package.json:28`) is read-only; `sharp ^0.34.5` (`:33`) is raster. React is 19.2.4 (`:31-32`).
- **"the sole export path": WRONG.** There are three, and ReportShell is not the one Phase 5 targets. (1) `components/ReportShell.tsx:47`, used only by the five `app/app/reports/*` pages. (2) `app/app/clients/[id]/runbook/page.tsx:66` `function printReport(){ window.print() }` — **the runbook does not use ReportShell, it has its own button.** (3) `app/app/assets/[id]/page.tsx:266`, an inline popup print script. Phase 5 targets the runbook, so build against `:66`.
- **TicketHub already has the PDF machine.** `@react-pdf/renderer ^4.4.1`, 28 files: `app/lib/pdf/{InvoicePdf,EstimatePdf,QbrPdf,TicketPdf,StatementPdf,EnvelopePdf,AiReportPdf,CreditMemoPdf,ProductLabelPdf}.tsx`, `app/lib/print/render.ts`, `app/api/reports/client-qbr/pdf/route.tsx`. Adding `@react-pdf` to DocHub means owning two divergent PDF stacks for one document.
- Minor: the runbook module list is `ALL_MODULES` at `app/app/clients/[id]/runbook/page.tsx:8-19` (plan cites `:13,30`; `:30` is the default `selected` Set, correct).
- `app/app/api/clients/[id]/report/route.ts:93-107` still querying legacy `prisma.networkDevice`: **CONFIRMED exactly.** And with 0 rows, the report's network module is permanently empty.

### 1.12 — "TicketHub already supports this with zero schema change" is true about schema and false about setup

**Plan says** (line 240-243): "`TH_EstimateItem` is generic qty/unitPrice… and a 'Cabling' board is a `TH_Board` config row, not code."

**Truth:** `TH_EstimateItem` is generic (`quantity Float`, `unitPrice Int` cents, `totalPrice Int` cents, `description String?`) — CONFIRMED. **But `itemId String` + `item TH_Item` is NON-NULLABLE.** Every estimate line requires a `TH_Item` catalog row.

- `tickethub.th_items` has **11 rows total** (LABOR 5, LICENSE 3, EXPENSE 1, PART 1, CONTRACT_FEE 1) and **zero** matching doc/cabling/as-built/wiring.
- `TH_ItemType` has **no SERVICE member** (LABOR|PART|EXPENSE|LICENSE|CONTRACT_FEE|BUNDLE) — the as-built item must be type `LABOR`.
- `tickethub.th_boards` has **5 rows** (In Shop, On-Site, Remote Support, Workstation For Sale, ops) — no Cabling board, and every existing board carries 8-9 `th_board_statuses` rows. **Seeding a board is ~9 rows, not 1.**
- `parts→charge` auto-fire on `INSTALLED`: **CONFIRMED** at `/home/msaville/tickethub/app/lib/actions/parts.ts:261-274` (plan writes `lib/actions/parts.ts`; real path has the `app/` prefix). But it only helps `PART`-type lines — a documentation SERVICE line is added directly as a charge or estimate item and does not ride that path.

Schema change: zero. Seed rows required: **~10.**

### 1.13 — `safe-db-push.sh` guard list is longer than stated, and has blind spots

**Plan says** (line 274-275): "`safe-db-push.sh:34` aborts on `DROP TABLE|DROP COLUMN|SET NOT NULL|RENAME`."

**Truth** — verified at `/home/msaville/dochub/safe-db-push.sh:34`, the full regex is:

```
DROP TABLE|DROP COLUMN|SET DATA TYPE|ALTER COLUMN[^;]*TYPE|SET NOT NULL|RENAME (TABLE|COLUMN|CONSTRAINT|TO)|(^|[^_])DELETE +FROM|TRUNCATE
```

(One report cited `:33` — that's wrong; it is `:34`.)

**Blind spots that matter more than the omissions:**
- It does **not** catch `ADD COLUMN "x" TEXT NOT NULL` without a default. That slips the gate and then **fails at Postgres apply time** on any non-empty table (1,298 Assets, 280 SwitchPorts).
- It does not catch `DROP INDEX` or `DROP CONSTRAINT`.
- `CREATE INDEX` and `CREATE EXTENSION` are **not** blocked — index work passes cleanly.

### 1.14 — Location count is 182, not 178

**Plan says** (line 287): "178 locations × one wall cabinet ≈ €109 base + 177 × €10 = ~€1,879/mo."

**Truth:** `SELECT count(*) FROM "Location"` → **182** (all `isActive`). `SELECT count(*) FROM "Client"` → 182; 181 have ≥1 Location. Corrected math: **€109 + 181 × €10 = €1,919/mo** (~$2,320). The schema doc comment at `prisma/schema.prisma:199` also says 178 and is likewise stale. Conclusion unchanged.

### 1.15 — Schema line-number citations: all correct

For the record, every schema anchor in the plan checks out: `Rack` :1405, `RackSlot` :1418 (with `@@unique([rackId, startU, shelfPos])` at :1434), `SwitchPort` :1354 (no `@@unique`, no `@@index` — `pg_indexes` confirms `SwitchPort_pkey` is the *only* index), `AssetInterface` :1372 (`switchPortId` :1380), `Vlan` :1336, `Subnet` :1437, `IpAssignment` :1459, `Location` :171, `Asset.switchPort` :274, `Asset.room` :283, `NetworkDevice` :1303, `ClientAttachment` :1127, `AuditLog` :840, `ActivityEvent` :597, `AssetTypeTemplate` :248, `InternetCircuit @@unique([locationId, label])` :2274.

Every row count in the plan's constraint table (lines 20-27) is **confirmed exactly**: Rack 0/RackSlot 0, SwitchPort 280 with 0 labeled / 0 VLAN / 0 uplink, AssetInterface 0 of 32, Asset.room 11 / Asset.switchPort 0 of 1,298, Vlan 0, ClientAttachment 0, 497 assets `dataSource=MANUAL`.

### 1.16 — Smaller corrections worth folding in

- **`RackDiagram.tsx` has TWO HTML5 DnD sites, not one.** Plan cites `:281-285`. There is a structurally identical block for the top-of-rack shelf at `:482-486` sharing the same handlers (verified: `grep -n "draggable=" components/RackDiagram.tsx` → 281, 482). A third HTML5 reorder DnD lives at `app/app/settings/flex/page.tsx:738-788`.
- **"DocHub's only drag interaction today is desktop-only"** (line 176-177) — two desktop-only reorder DnDs, plus `components/Sheet.tsx:227-230` which *is* touch-native (`onTouchStart/Move/End/Cancel`, `touchAction:'none'` at `:238`).
- **"HTML5 drag-and-drop does not fire on iPadOS Safari"** — **UNVERIFIED**, cannot be tested here (no device). Circumstantial in-repo support: `app/app/settings/flex/page.tsx:782` wraps `dataTransfer.setData` in `catch { /* Safari */ }`. The rewrite is justified regardless: `canDrag` (`RackDiagram.tsx:276,:478`) gates only on `rowSlots.length>1 && !isEditing` — there is no touch fallback either way.
- **`components/Sheet.tsx` is not a pan/zoom primitive.** Plan (line 173-174, 216-217) implies reuse. It is 297 lines of single-axis, single-touch, downward-only drag-to-dismiss (threshold 110px at `:41`), mobile-gated at ≤640px (`:19-35`), with `touchAction:'none'` scoped to a 28px handle. It supplies the overlay shell only. **Nothing exists for pan/zoom**: only 5 files contain `<svg`/`viewBox` and all are decorative icons; zero `onWheel` handlers app-wide. Phase 3's ~60-line hook is genuinely greenfield.
- **`SwitchPanel.tsx` already violates the Phase 4 Sheet rule** it sits next to — `:383-392` hand-rolls a `position:fixed; inset:0; zIndex:1000` backdrop.
- **`portColor()` at `SwitchPanel.tsx:335-343`: CONFIRMED**, returns `#111827` (no port) / `#166534` (in use) / `#374151` (uplink) / `p.vlan.color+"44"` / `#111827` fallback.
- **`Vlan.color` is real persisted data** (`prisma/schema.prisma:1341`, `@default("#6366f1")`), 0 rows today. Do not tokenize.
- **`sharp` is a dep: CONFIRMED** `package.json:33` `^0.34.5`. `ClientAttachment.width/height` already exist at `prisma/schema.prisma:1147-1148` for natural-dimension capture.
- **PhotoHub BFF dead code: CONFIRMED.** TicketHub's BFF surface is exactly `app/api/bff/{dashboard,dh,fleet,jotter,portal}`; `grep -rn 'bff/photohub'` → zero hits.
- **Rejected-library list is free.** `package.json:11-46` contains no d3, konva, fabric, react-flow, dnd-kit, react-dnd, react-zoom-pan-pinch, recharts, mermaid, svg-pan-zoom. Nothing to remove.
- **Build note:** `package.json:7` is `"build": "next build --webpack"` — not Turbopack. `/home/msaville/dochub/app/AGENTS.md` warns this Next version has breaking changes vs training data; read `node_modules/next/dist/docs/` before writing code.

---

## 2. BLOCKERS

Ordered most-critical first. Items 1-3 must be settled before any code is written.

### B1 — RESOLVED: the uncommitted schema drift is safe. `db push` is clear to run.

**The question:** the working tree has `app/prisma/schema.prisma` modified (+12 lines, the `NoteSuggestion` `parentSuggestionId`/`segmentIndex`/`segmentLabel` self-relation at `:2383-2387`). Would a `db push` for the physical layer carry someone else's in-flight change into production?

**Answer: no. The drift is already applied to the live database.** I re-verified this directly:

```
$ cd /home/msaville/dochub && ./safe-db-push.sh --check
== 1/5 Pre-migration backup -> ~/backups/dochub/dochub-premigrate-20260802-130352.sql
   ok (78M, 339 tables)
== 2/5 Drift diff (SQL db push would run)
   | -- This is an empty migration.
== 3/5 Safety gate (refuse destructive ops)
   no changes to apply.
```

`information_schema.columns` on `public."NoteSuggestion"` confirms `parentSuggestionId(text,YES)`, `segmentIndex(integer,YES)`, `segmentLabel(text,YES)`, and `pg_constraint` shows `NoteSuggestion_parentSuggestionId_fkey ... ON DELETE SET NULL`.

**The live DB and the working-tree schema are byte-for-byte in sync right now.** This is the cleanest possible baseline. A push for the physical layer will push **only** the physical layer.

**Safe path:**
1. Run `./safe-db-push.sh --check` immediately before every push and read the printed SQL.
2. The SQL must contain **nothing but** `CREATE TABLE` / `CREATE INDEX` / `CREATE UNIQUE INDEX` / `ALTER TABLE … ADD COLUMN` (nullable, or with a default) / `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` / `CREATE TYPE`. Anything else means a model was transcribed wrong.
3. Push Phase 1's block alone. Hold Phase 2/4 models until their gates pass — every block is independently additive, so there is no reason to push tables you have not gated.

**Caveat, unrelated to the DB:** the working tree is dirty beyond the schema — `app/scripts/notes-ingest.mjs` and `cron.log` modified; `app/lib/ai/notes-segment.ts`, `app/lib/notes-segment.mjs`, `app/scripts/physical-layer-coverage.mjs`, `app/scripts/reaper-cron.sh`, `docs/memories/`, `docs/physical-layer-plan.md`, `reaper.log` untracked. Branch is `feat/physical-layer`. **Stage selectively** or a commit sweeps all of it in. That is a git hygiene problem, not a DB risk.

### B2 — HARD SCHEMA BLOCKER: `Asset.room` collides with the Phase 4 `Room` relation

`Asset` already has a scalar field `room String?` at `prisma/schema.prisma:283` (verified). The Phase 4 line `Asset += floorId? roomId?` (plan line 202) is silent on this. **You cannot write `room Room?` — `prisma validate` will fail.**

Use `roomId String?` + `roomRef Room? @relation("AssetRoom", ...)`. This is exactly the in-file precedent at `Subnet` `prisma/schema.prisma:1445-1446` (`vlan String?` free text alongside `vlanRefId String?` + `vlanRef Vlan?`). Decide the name now so Phase 1 docs and Phase 4 code agree.

### B3 — Phase 0.3 (UniFi) has two hard infrastructure prerequisites that are not code

Neither can be worked around:

1. **Local credentials cannot be entered.** `integration:unifi:controllerType = 'ui_cloud'`, and `app/app/settings/page.tsx:1154` hides the username/password inputs in that branch. `sync-local/route.ts:31-40` requires `integration:unifi:username` + `:password`, which do not exist as `AppSetting` rows.
2. **0 of 182 Locations have `tailscaleIp`, and no code writes it.** `sync-local/route.ts:43-53` hard-422s.

Plus: `integration:unifi:controllerType` is a **single global AppSetting** consumed by both routes. You cannot run cloud device-inventory and local port-table sync concurrently without splitting it — `sync-local` already hardcodes `'unifi_os'` at `route.ts:62`, so it is half-split already, in an undocumented way.

**Decision required before Phase 0 starts:** either (a) descope 0.3 to the provenance columns only (cheap, unconditionally useful, required by the Phase 2 landmine anyway) and move the sync work to its own gated track, or (b) accept that Phase 0 is not ≈1 day. See §5 D3 for my recommendation.

### B4 — Phase 0.2 (search) has no destination page for a `SwitchPort` result

Making `SwitchPort.label` searchable produces results whose `href` can only be `/assets/<switchId>` — a page that does not show the port you searched for.

- `components/SwitchPanel.tsx` is mounted **only as a modal** from the client page Assets tab (`app/app/clients/[id]/page.tsx:4154`, `:4167`), opened by a button at `:2783-2784` gated on `asset.assetType?.template?.showSwitchPanel`. It has no URL and no query-param entry point.
- The only other switch-port UI is `app/app/assets/[id]/page.tsx:1406` ("Switch Ports" card), guarded by `{asset.networkDevice && ...}` at `:1405` — and `NetworkDevice` has 0 rows, so **that card renders for zero assets** and cannot display any of the 280 asset-linked ports.

**Restrict Phase 0.2 to `Asset.room` + `Rack` widening. Defer `SwitchPort` search until a destination exists.**

### B5 — Today's rack search result href is already a dead end, and the client page cannot deep-link sub-tabs

Two existing bugs that any new physical-layer result will inherit and be blamed for:

1. `components/SearchModal.tsx:182` sends rack results to `/clients/${clientId}?tab=Network`, which lands on `networkSubTab` default `"ipam"` (`app/app/clients/[id]/page.tsx:565`). Rack Diagrams is a separate sub-tab at `:4077`. There is **no `?sub=` param** — `grep searchParams.get` in that 4,357-line file returns exactly one hit, `get("tab")` at `:461`. Unnoticed because Rack count = 0.
2. **Same-client navigation from the scoped `/` search is a no-op.** `app/app/clients/[id]/page.tsx:459-464` seeds `activeTab` from `window.location.search` in a `useState` **initializer**, which runs once per mount. The `/` handler at `:640-652` opens SearchModal scoped to the current client (`:4347-4353`), so every result href is `/clients/<same id>?tab=...`. In the App Router, `router.push` to the same dynamic route with different search params **reconciles rather than remounts** — the initializer does not re-run, the tab does not change, and the modal closes onto an unchanged page. The file has no `useSearchParams` import.

Fix both before adding result kinds, or the 2am lookup lands nowhere.

### B6 — Phase 0.4 must be sequenced: `!important` before tokenization

`globals.css:319-340` needs `!important` on all 19 declarations **first**. Tokenizing RackDiagram to `var(--card)`/`var(--text)`/`var(--border)` without it targets precisely the 11 tokens `ThemeProvider` clobbers via inline style (`components/ThemeProvider.tsx:95`) — the work would be invisible. And `print-color-adjust: exact` must land in the same change or the result is white voids instead of black slabs.

### B7 — `CableRun` needs `clientOpId` before Phase 1 ships

See §1.9. Add `clientOpId String? @unique` to the model in the *first* push. Retrofitting it later means a second migration plus a window where the queue silently corrupts.

### B8 — Phase 5's billable deliverable is hard-gated on Phase 0.4

`app/app/globals.css:317-351` remaps CSS variables only. Any literal hex in the rack/cable SVG prints exactly as authored. **You would be invoicing $250-500 for an unreadable page.** Do not sell the deliverable before 0.4 lands *and someone has physically looked at a printed sheet*.

### B9 — Decide photo storage before writing any model

DocHub's actual convention for photos on physical entities is a bare `photoStorageName String?` with **no FK** — `Rack:1411`, `Camera:1886`. Not a `ClientAttachment` FK. The plan's `photoAttachmentId` (line 89) and `planAttachmentId` (line 199) diverge from house style. If you go with the FK anyway it **must** be `onDelete: SetNull` — the Prisma default `Restrict` makes attachment deletion start failing once any cable run or floor references a file. `ClientAttachment` has 0 rows, so either choice is free *today*.

### B10 — Rename `DevicePort.index` to `portIndex` now

`index` is a Postgres non-reserved keyword that Prisma will quote correctly — Prisma itself is fine. But Phase 2's design rests entirely on a hand-written recursive CTE via `prisma.$queryRaw`, where `"index"` must be double-quoted on **every** reference. One unquoted occurrence is a runtime syntax error in the path-trace query, which is the single most load-bearing query in the feature. Decide before any doc or code says `index`.

---

## 3. BUILD ORDER — Phase 0 and Phase 1

File-by-file. All paths absolute. Anchors are current line numbers; re-grep before editing since earlier steps shift them within a file.

### PHASE 0 — Unblock

#### Step 0.0 — Baseline capture (before any edit)

**Run** `/home/msaville/dochub/app/scripts/physical-layer-coverage.mjs` (currently untracked) with `--json` and save the output. It is read-only, guards every query with `to_regclass` so it runs unchanged before and after the new tables exist, and already anticipates the five table names in this plan. Expected baseline: Rack 0, RackSlot 0, SwitchPort 280 / 0 labeled, AssetInterface 0 of 32, Asset.room 11 / 1298, Asset.switchPort 0 / 1298, Vlan 0, ClientAttachment 0, NetworkDevice 0.

⚠ Its header comment hardcodes `172.18.0.7` as the db container IP. Re-derive with `docker inspect dochub-db-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`.

**Also run** `cd /home/msaville/dochub && ./safe-db-push.sh --check` and confirm it still prints `-- This is an empty migration.` If it does not, stop and find out what changed.

---

#### Step 0.1 — Fix the latent crash (4 edits, one logical change, ship together)

**0.1a** — `/home/msaville/dochub/app/app/api/assets/[id]/interfaces/route.ts`, **lines 14 AND 64** (identical text, two occurrences):

```
OLD:  switchPort: { include: { networkDevice: { select: { id: true, name: true } } } },
NEW:  switchPort: { include: { networkDevice: { select: { id: true, name: true } }, asset: { select: { id: true, name: true, friendlyName: true } } } },
```

Both must change: `page.tsx:343` consumes the GET body, `page.tsx:391` pushes the POST body straight into `interfaces` state.

**0.1b** — `/home/msaville/dochub/app/app/api/assets/[id]/interfaces/[interfaceId]/route.ts`, **line 41**: same edit. `page.tsx:414` writes the PATCH response body into state via `setInterfaces(prev => prev.map(...))`.

**0.1c** — `/home/msaville/dochub/app/app/assets/[id]/page.tsx`, **lines 40-46** (the `AssetInterface` type's `switchPort` member):

```ts
  switchPort: {
    id: string
    portNumber: number
    label: string | null
    networkDevice: { id: string; name: string } | null
    asset: { id: string; name: string; friendlyName: string | null } | null
  } | null
```

The declared type lies about the DB (`prisma/schema.prisma:1366` is `networkDevice NetworkDevice?`). After this edit `tsc` will flag line 933 until 0.1d lands — apply both together.

**0.1d** — same file, **line 933** (inside the `{iface.switchPort && (` block opened at `:931`):

```
OLD:  {iface.switchPort.networkDevice.name} · Port {iface.switchPort.portNumber}{iface.switchPort.label ? ` (${iface.switchPort.label})` : ""}
NEW:  {iface.switchPort.asset?.friendlyName || iface.switchPort.asset?.name || iface.switchPort.networkDevice?.name || "Switch"} · Port {iface.switchPort.portNumber}{iface.switchPort.label ? ` (${iface.switchPort.label})` : ""}
```

Asset-first (matches 100% of live data), legacy `NetworkDevice` as fallback, literal string last so the row degrades to `Switch · Port 7` instead of blanking the page. `friendlyName`-then-`name` matches how the rest of the app labels assets (`app/app/clients/[id]/page.tsx:2784`). **Preserve the backticks in the template literal exactly.**

**Verify:** manually set one `AssetInterface.switchPortId` in a scratch transaction, load `/assets/<id>`, confirm the row renders and the page does not blank. Roll back.

---

#### Step 0.2 — Add an error boundary (new, not in the plan, do it here)

Create `/home/msaville/dochub/app/app/error.tsx` — a minimal client error boundary with a reset button. There is **none anywhere in the app** (verified). Phases 1-4 add a lot of new client-rendered relation data with exactly the shape of risk that just took down `/assets/[id]`. This is ~20 lines and permanently caps the blast radius of every future null deref.

---

#### Step 0.3 — Print pipeline (do BEFORE tokenizing, or the tokenizing is invisible)

**0.3a** — `/home/msaville/dochub/app/app/globals.css`, **lines 319-340**: append ` !important` to all 19 custom-property declarations inside `@media print :root`.

Rationale: `components/ThemeProvider.tsx:95` sets 13 palette vars as inline style on `<html>`, outranking the normal author-stylesheet declaration for `--bg --surface --card --border --text --muted --accent --accent2 --danger --warn --color-text-muted`. Without `!important` the print remap is dead for exactly the tokens Phase 0.4 targets.

**0.3b** — same file, inside `@media print`, after `:340`:

```css
  .print-graphics, .print-graphics * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
```

Scoped, not global — avoids ink-bombing every other page. Put the class on the rack/switch wrapper only.

**Verify:** switch to the Ocean theme (`ThemeProvider.tsx:63-69` sets `--bg:#051020` inline), open print preview on any tokenized page, confirm it goes light. **Actually look at it.**

---

#### Step 0.4 — Tokenize the rack components

**0.4a** — `/home/msaville/dochub/app/components/RackDiagram.tsx`. Replace the 8 structural slate hexes. Net: 97 raw-hex occurrences → 12.

| hex | role / lines | → token |
|---|---|---|
| `#0f172a` | background: 310,314,318,325,511,512,516,555,578,600,602 | `var(--color-background-primary)` |
| `#0f172a` | **text** on inverted Save button: 332,521 | `var(--bg)` (matches `.btn-primary`, globals.css:369) |
| `#e2e8f0` | text: 310,314,318,325,339,440,495,511,512,516 | `var(--color-text-primary)` (exact — `#e2e8f0` *is* `--text`) |
| `#e2e8f0` | **background** of Save button: 332,521 | `var(--text)` |
| `#1e293b` | raised surface: 290,351,466,533,557,601 | `var(--card)` / `var(--color-background-hover)` |
| `#1e293b` | border: 296,563 | `var(--color-border-secondary)` |
| `#334155` | border: 310,314,318,325,333,437,453,548,555(×2),557 | `var(--color-border-secondary)` |
| `#334155` | **text**: 470 ("top shelf empty"), 605 ("+ add") | `var(--color-text-muted)` |
| `#334155` | `slotColor()` fill: 65 | ⚠ see 0.4b |
| `#475569` | border: 351,440,466,522,533 | `var(--color-border-primary)` |
| `#475569` | ⠿ handle / `+` glyph: 340,528,589 | `var(--color-text-secondary)` |
| `#64748b` | muted text: 452,468,548,562 | `var(--color-text-secondary)` — note globals.css:15 documents `#64748b` as the *retired* `--muted` (~4.1:1, sub-AA), so leaving it is also a contrast regression |
| `#64748b` | `DEVICE_COLORS.OTHER`: 52,63,64 | ⚠ palette data, leave |
| `#94a3b8` | label text: 309,313,317,324,333,344,351,522,533 | `var(--color-text-secondary)` |
| `#facc15` | drop indicator: 292,295,490,501,503 | `var(--warn)` / `var(--color-text-warning)` |
| `#7f1d1d` | destructive bg: 334,444,523 | `var(--color-background-danger)` |
| `#fca5a5` | destructive text: 334,444,523 | `var(--color-text-danger)` |
| `#1a2332` | row divider: 600 | `var(--border)` |
| `rgba(0,0,0,0.7)` | photo scrim: 440,444 | leave — scrim over a photo, theme-independent |

**Three hexes carry two roles and must not be blind-replaced:** `#0f172a` (bg vs. Save-button fg), `#e2e8f0` (fg vs. Save-button bg), `#334155` (border vs. text vs. fill).

**0.4b** — same file, `slotColor()` at **:65** plus its alpha-concat consumers at **:290** `${color}22`, **:293**, **:488** `${color}33`, **:491** `${color}88`. Do **not** return a `var()`. Either keep 6-digit hex and switch to `color-mix(in srgb, ${color} 13%, transparent)`, or emit a custom property on the slot element (`style={{'--slot': color}}`) and use `color-mix(in srgb, var(--slot) 13%, transparent)`. `color-mix()` needs Safari 16.2+/Chrome 111+ — within the iPad PWA target. Re-check the 0.4 drag opacity at `:299`/`:497` still reads.

**0.4c** — same file, `DEVICE_COLORS` at **:44-56**. **Leave the 12 hexes raw** — categorical palette, and the theme ships only 4 semantic colours. Move the map into `lib/port-state.ts` (alongside the promoted `portColor()`, Phase 3) and add a parallel print-safe encoding (SVG `<pattern>` hatch or 2-letter mono glyph) so category survives monochrome print and colour-blindness. "Token-ize the rack components" must **not** be read as including these.

**0.4d** — `/home/msaville/dochub/app/components/SwitchPanel.tsx`, ~14 styling hexes at **337,338,339,341,346,348,350,531,546,558,560,579,581,667**:

| hex / value | line(s) | → token |
|---|---|---|
| `#1a1a1a` chassis bg | 546 | `var(--color-background-secondary)` |
| `#374151` chassis border | 546 | `var(--color-border-primary)` |
| `#374151` uplink fill / legend swatch | 339, 531 | ⚠ **no clean token** — nearest `var(--card)` makes uplink read as empty. Better encoded as a glyph under the Phase 3 `fill=state, ring=VLAN, glyph=PoE` scheme. Flag, don't guess. |
| `#111827` empty-port fill | 337, 341 | `var(--color-background-secondary)` |
| `#166534` in-use fill | 338 | ⚠ **no clean solid** — `var(--color-background-success)` is `rgba(0,212,170,0.12)`, far too faint for a 36px chip. Add a `--color-fill-success` solid, or `color-mix(in srgb, var(--accent2) 35%, var(--bg))` |
| `#4b5563` port border | 348,350,558,579 | `var(--color-border-primary)` |
| `#9ca3af` port label | 560, 581 | `var(--color-text-secondary)` |
| `#bbf7d0` in-use label | 560, 581 | `var(--color-text-success)` |
| `"white"` ring / on-VLAN text | 346, 560, 581 | ring → `var(--accent)`; text → `var(--color-text-primary)` |
| `#f59e0b` warning text | 667 | `var(--color-text-warning)` |
| `rgba(0,0,0,0.6)` backdrop | 384 | leave (or delete via 0.4f) |

**DO NOT TOUCH:** `:57-58` `PRESET_COLORS`, `:83`, `:86`, `:264` form defaults — these are **DB data** feeding `Vlan.color` (`prisma/schema.prisma:1341`). And `:478`, `:714` are `var(--color-text-danger, #ef4444)` fallbacks — harmless.

`portColor()` at `:340` does `p.vlan.color + "44"` and must keep receiving hex from the DB. Only the four literal returns get tokenized.

**0.4d is the highest realizable value in Phase 0.4** — `SwitchPanel`'s chassis is the only physical-layer visual that can reach a printer today (280 SwitchPort rows vs 0 Rack rows).

**0.4e** — add `className="print-graphics"` to the RackDiagram and SwitchPanel root wrappers.

**0.4f (optional, recommended)** — `/home/msaville/dochub/app/components/SwitchPanel.tsx:383-392`: re-mount the panel body inside `components/Sheet.tsx` instead of the hand-rolled `fixed inset-0 zIndex:1000` backdrop. Pass `maxWidth={960}` (Sheet's default is 640 at `Sheet.tsx:49`). This validates Sheet as the overlay primitive before Phase 3/4 depend on it, inherits Escape/focus-trap/scroll-lock/safe-area, and stops the codebase from contradicting its own Phase 4 rule.

**Verify 0.3 + 0.4 together: print a client page with a switch panel open, on paper or to PDF, and look at it.** This is the acceptance test, not `tsc`.

---

#### Step 0.5 — Search: `Asset.room` + rack widening (SwitchPort deferred, see B4)

**0.5a** — `/home/msaville/dochub/app/app/api/search/route.ts`, **line 34** (inside the asset OR array, after `{ model: contains("model") }`): add `{ room: contains("room") },`. Then add `room: true,` to the select block after `model: true,` at **:44**. No new query, no new category, no new Prisma call — folds entirely into `prisma.asset.findMany` at `:25-48`.

Measured cost: `EXPLAIN ANALYZE` with `room` in the OR chain = **2.243 ms**, seq scan over all 1,298 rows, 67 shared buffers. **Do not add trigram indexes** (see D5).

**0.5b** — `/home/msaville/dochub/app/components/SearchModal.tsx`, **line 36**: add `room: string | null` to the assets member of the `flattenResults` param type. **Line 67**: change the sublabel to `[a.room ? \`Room ${a.room}\` : null, a.make, a.model, clientName].filter(Boolean).join(" · ")`. Room-first so a room match visibly explains itself.

**0.5c** — `/home/msaville/dochub/app/app/api/search/route.ts`, **line 252** — widen the rack `where`:

```ts
where: {
  OR: [
    { name: contains("name") },
    { notes: contains("notes") },
    { location: { name: contains("name") } },
    { location: { city: contains("city") } },
  ],
  ...(scopeClientId ? { location: { clientId: scopeClientId } } : {}),
},
```

and extend the select at `:255` to `{ id: true, name: true, location: { select: { id: true, name: true, city: true, client: { select: { id: true, name: true } } } } }`. The top-level `location` key and the nested `location` inside the OR array are separate objects — they AND together, valid Prisma. **`Rack` has no `location` string column; do not add one.**

**0.5d** — `/home/msaville/dochub/app/components/SearchModal.tsx`, **line 50** racks type → `{ id, name, location: { id, name, city: string|null, client: { id, name } } | null }[]`. **Line 181** sublabel → `[rk.location?.name, rk.location?.city, rk.location?.client?.name].filter(Boolean).join(" · ")`. **Line 182** href → `` `/clients/${clientId}?tab=Network&sub=racks` ``.

**0.5e** — `/home/msaville/dochub/app/app/clients/[id]/page.tsx`, **line 565**: seed `networkSubTab` from the URL the way `activeTab` does at `:459-464`:

```ts
const [networkSubTab, setNetworkSubTab] = useState<"ipam"|"circuits"|"racks"|"shares"|"wireless"|"ptp"|"diagram">(() => {
  if (typeof window !== "undefined") {
    const s = new URLSearchParams(window.location.search).get("sub")
    if (s && ["ipam","circuits","racks","shares","wireless","ptp","diagram"].includes(s)) return s as any
  }
  return "ipam"
})
```

Sub-tabs are declared at `:4034`; the racks branch is at `:4077-4091`.

**0.5f (fixes B5.2, required)** — same file: replace the mount-time `window.location.search` read at `:461` with a `useSearchParams()`-driven `useEffect` for **both** `activeTab` and `networkSubTab`, so same-client navigation from the scoped `/` search actually changes the tab. The file currently has no `useSearchParams` import.

---

### PHASE 1 — Capture-first slice

#### Step 1.1 — Schema: `CableRun` (one gated push)

`/home/msaville/dochub/app/prisma/schema.prisma` — insert after **line 1474** (end of `model IpAssignment`), **before** `enum ClientType` at `:1476`. Open with a banner comment in the file's existing style (cf. `:2044`, `:2318`).

```prisma
// ─── Physical layer / cable documentation ────────────────────────────────────

/// One horizontal cable run: wall jack -> patch-panel port -> switch port.
/// Deliberately flat: the binding constraint is capture cost, not model
/// expressiveness. Phase 2 migrates these rows into DevicePort/PortLink.
model CableRun {
  id               String    @id @default(cuid())
  clientId         String
  locationId       String
  jackLabel        String    // "B-114" as printed on the faceplate
  room             String?   // free text, autocompleted from existing values
  panelAssetId     String?   // patch panel, when it is an Asset
  panelLabel       String?   // free text when the panel is not an Asset yet
  panelPort        Int?
  switchAssetId    String?
  switchPortNumber Int?
  switchPortId     String?   // optional link to the L2 SwitchPort row
  cableType        String?   // Cat5e | Cat6 | Cat6a | OM4 | OS2
  photoStorageName String?   // house convention: Rack:1411, Camera:1886
  notes            String?
  lastVerifiedAt   DateTime?
  verifiedBy       String?   // staff name — matches BackupConfig:394-395
  clientOpId       String?   @unique  // offline-queue idempotency (see B7)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  client      Client      @relation(fields: [clientId],      references: [id], onDelete: Cascade)
  location    Location    @relation(fields: [locationId],    references: [id], onDelete: Cascade)
  panelAsset  Asset?      @relation("CableRunPanelAsset",  fields: [panelAssetId],  references: [id])
  switchAsset Asset?      @relation("CableRunSwitchAsset", fields: [switchAssetId], references: [id])
  switchPort  SwitchPort? @relation(fields: [switchPortId], references: [id])

  @@unique([locationId, jackLabel])
  @@index([clientId])
  @@index([locationId])
  @@index([switchAssetId])
  @@index([room])
}
```

Note: `@@index([clientId])` is **load-bearing**, not decorative — Prisma does not auto-index FK columns (verified: `Asset.locationId` has no index at all; `pg_indexes` on `public."Asset"` returns only `Asset_pkey`, `Asset_successorId_key`, `Asset_syncroAssetId_key`), and the client-scoped `/` search filters `CableRun` by `clientId` on every keystroke.

**Required back-relations (emit zero SQL):**

- `model Client`, after **line 168** (`internetCircuits InternetCircuit[]`): add `cableRuns CableRun[]`
- `model Location`, after **line 195** (`flexAssets FlexAsset[]`): add `cableRuns CableRun[]`
- `model Asset`, in the relation block after **:345**: add `cableRunsAsPanel CableRun[] @relation("CableRunPanelAsset")` and `cableRunsAsSwitch CableRun[] @relation("CableRunSwitchAsset")`
- `model SwitchPort`, after `vlan` at **:1368**: add `cableRuns CableRun[]`

**Push:** `cd /home/msaville/dochub && ./safe-db-push.sh --check`, read the SQL (must be only CREATE TABLE / CREATE INDEX / CREATE UNIQUE INDEX / ADD CONSTRAINT FOREIGN KEY), then `./safe-db-push.sh`.

⚠ **`jackLabel` is required** (needed for the unique). If capture UX ever needs a draft row with no label, that's a NOT NULL violation. Decide now — relaxing it later means an ALTER.

#### Step 1.2 — DocHub API routes

New: `/home/msaville/dochub/app/app/api/clients/[id]/cable-runs/route.ts` (GET list scoped by client, POST create) and `.../cable-runs/[runId]/route.ts` (PATCH, DELETE). Follow the shape of `app/app/api/assets/[id]/ports/route.ts` for auth and scoping.

**Write `AuditLog` rows on every mutation.** `AuditLog` (`prisma/schema.prisma:840-863`) has no FKs — `entityType`/`entityId` are free strings, so this needs no schema change. The plan's landmine at line 278-279 notes `/api/racks/**` writes none; do not repeat that mistake on a brand-new route.

#### Step 1.3 — DocHub capture UI

New sub-tab `cabling` under the client page Network tab (declared at `app/app/clients/[id]/page.tsx:4034`, sub-tab state at `:565` — already URL-seeded by 0.5e). Extract the panel into its own component file; **do not add rows to the 4,357-line page**.

Capture rules from the plan that must survive into the build:
- **Never present an empty canvas.** Where a location has a switch asset with a `portCount`, pre-draft rows and render them as a *guess* with a confirm affordance + `lastVerifiedAt` stamp. ⚠ Key on **asset id, never name** — four separate Assets share the name "USW Lite 16 PoE" (`cmnxcrz0x000no601…`, `cmnxcrzie001zo601…`, `cmnxcs0dw008vo601…`, `cmnxcs15f00afo601…`). And only **17 of 1,298** assets have `portCount` set, so this path covers ~1.3% of assets today — the empty-canvas problem is mostly still there.
- `room` autocomplete sourced from `SELECT DISTINCT room FROM "CableRun"` UNION `SELECT DISTINCT room FROM "Asset"` — the 11 existing `Asset.room` values are already drifting (`Upstairs Rack` vs `Upstairs rack tire and auto`).

#### Step 1.4 — Search: add the `cableRun` group

**1.4a** — `/home/msaville/dochub/app/app/api/search/route.ts`, new element in the `Promise.all` array **immediately after the assets query (after :48)** — position is rank (see D4):

```ts
prisma.cableRun.findMany({
  where: {
    OR: [
      { jackLabel: contains("jackLabel") },
      { room: contains("room") },
      { panelPort: undefined },        // Int — omit from OR, filter client-side if needed
      { notes: contains("notes") },
    ],
    ...(scopeClientId ? { clientId: scopeClientId } : {}),
  },
  select: {
    id: true, jackLabel: true, room: true, panelLabel: true, panelPort: true,
    clientId: true, switchPortNumber: true,
    location: { select: { id: true, name: true } },
    switchAsset: { select: { id: true, name: true, friendlyName: true } },
    client: { select: { id: true, name: true } },
  },
  orderBy: [{ room: "asc" }, { jackLabel: "asc" }],
  take: 6,
})
```

RBAC filter in the response object: `cableRuns: cableRuns.filter((r: any) => ok(r.clientId))` — `CableRun` carries `clientId` directly, so this is the simplest group in the whole route. **`orderBy` matters**: there is zero `orderBy` anywhere else in this route (grep count = 0), so every other group returns unstable heap order. A field-edited table would visibly reshuffle.

**1.4b** — same file, **line 12** (early return) and **line 265** (response object): add `cableRuns: []` / `cableRuns: <filtered>`. **Treat these two as a single invariant** — `flattenResults` iterates all arrays unguarded (`SearchModal.tsx:54` `for (const c of data.clients)`), so a mismatch is a runtime `for...of undefined` throw. Consider extracting a shared `EMPTY_RESULTS` const rather than duplicating the literal.

**1.4c** — `/home/msaville/dochub/app/components/SearchModal.tsx`: (i) `CATEGORY_META` at `:15-32` gains `cableRun: { label: "Cable Run", color: "#f59e0b" }` — an unregistered category **throws** at `:381` `meta.label.toUpperCase()`; (ii) add `cableRuns` to the param type at `:34-51`; (iii) push loop **immediately after the assets loop (ends :70)**:

```ts
for (const r of data.cableRuns) results.push({
  id: r.id, category: "cableRun", categoryColor: CATEGORY_META.cableRun.color,
  label: r.jackLabel,
  sublabel: [r.room,
             r.panelLabel && `panel ${r.panelLabel}${r.panelPort ? `/${r.panelPort}` : ""}`,
             r.switchAsset && `${r.switchAsset.friendlyName || r.switchAsset.name}:${r.switchPortNumber ?? "?"}`,
             r.client?.name].filter(Boolean).join(" · "),
  href: `/clients/${r.clientId}?tab=Network&sub=cabling&run=${r.id}`,
})
```

**The sublabel IS the deliverable** — it renders `jack → panel port → switch:port` as one line, satisfying the plan's "two taps" requirement in **zero** taps. Note the chip column is `minWidth: 68px` at `:378`; "CABLE RUN" at 10px mono fits, longer labels wrap.

**1.4d** — `/home/msaville/dochub/app/app/scan/page.tsx`, **:27-32** inside `goSearch`, before the assets fallback:

```ts
if (d.cableRuns?.[0]) { router.push(`/clients/${d.cableRuns[0].clientId}?tab=Network&sub=cabling&run=${d.cableRuns[0].id}`); return }
```

This is the QR/barcode field path (`BarcodeDetector` at `:45`, formats `qr_code`/`code_128`/`code_39`/`ean_13`). Printed jack labels are exactly what code_39/code_128 encode. **Scanning a jack sticker and landing on the run is a stronger 2am story than typing it, and it is 2 lines.** The plan does not mention this route at all. The route already fails soft to `setNoMatch(value)`.

#### Step 1.5 — TicketHub cross-schema read

**1.5a** — new `/home/msaville/tickethub/app/lib/dochub-cable-runs.ts`, in the `dochub-bridge.ts` idiom (`prisma.$queryRaw`, explicit `public."…"` prefixes, soft-failure returns, non-fatal catch).

Export `resolveDochubLocationIds(sites)` implementing the ladder (**never match on site name**, see §1.10):
1. use `dochubLocationId` when non-null (9 of 150);
2. else `lower(Client.name) = lower(clientName)` → that client's Locations `ORDER BY "createdAt" ASC LIMIT 1` (identical semantics to `dochub-bridge.ts:136-142`; valid because 180 of 181 DocHub clients have exactly one Location);
3. only when >1 location, disambiguate on `lower(regexp_replace(address,'[^a-z0-9]','','gi'))`.

Export `listCableRunsForLocations(locationIds)` as ONE query joining `public."CableRun"` LEFT JOIN `public."Asset"` (switch name) LEFT JOIN `public."SwitchPort"`, `WHERE cr."locationId" = ANY($1) ORDER BY cr.room NULLS LAST, cr."jackLabel"`.

⚠ **Wrap everything in try/catch returning `[]`.** If `public."CableRun"` does not exist yet, the catch must return empty rather than 500 the bundle and take offline mode down for every tech. Mirror the non-fatal precedent at DocHub `app/app/api/locations/[id]/route.ts:73-76`. The coupling warning at `dochub-bridge.ts:7-9` applies verbatim.

**1.5b** — `/home/msaville/tickethub/app/api/offline/bundle/route.ts`: add `id` + `dochubLocationId` to the appointment's `ticket.site` select (**:50-52**) and `id` to `ticket.client` (**:49**); same on the ticket select (**:76-79**). After the `Promise.all` at **:100**, build the distinct site list **from `appts` ONLY** (not the 50 assigned tickets — those span many clients and would blow up the cached response; today's appointments bound it to 1-4 sites the tech will actually stand in), then add a third top-level key at **:102-106**:

```
{ generatedAt, appointments[], tickets[],
  cableRuns: [{ locationId, locationName, clientName, runs: [{ id, jackLabel, room, panelLabel, panelPort, switchName, switchPortNumber, notes, lastVerifiedAt }] }] }
```

Cap runs per location (~500) and drop `notes` if payload grows — the SW cache entry at `next.config.ts:61-71` has `maxEntries: 2` but **no byte cap**.

**No `next.config.ts` change is needed for the read path** — `/api/offline/bundle` is already NetworkFirst-cached.

**1.5c** — `/home/msaville/tickethub/app/offline/page.tsx`: add `cableRuns: CableRunGroup[]` to the `Bundle` interface at **:62-66** and render a third `<section>` after "My open tickets" (**:171-309**), grouped by location, each run as `jackLabel → panel:port → switch:port` in the mono/data style with the `lastVerifiedAt` stamp. The `localStorage` backstop at **:108** serialises whatever is in `data`, so the durable copy comes free.

#### Step 1.6 — TicketHub write path (only if verify-from-the-closet ships in Phase 1)

**1.6a** — new `/home/msaville/tickethub/app/api/cable-runs/route.ts`. `requireAuth()` first (as `bundle/route.ts:20`), then the `clientOpId` dedupe guard (`SELECT id FROM public."CableRun" WHERE "clientOpId" = $1` → return `{deduplicated:true}`), then `INSERT ... ON CONFLICT ("locationId","jackLabel") DO UPDATE` via `prisma.$queryRaw`. Set a provenance marker on the row so DocHub can distinguish field-captured from desk-entered runs.

**1.6b** — `/home/msaville/tickethub/app/lib/offline-db.ts`: add `'SAVE_CABLE_RUN'` to `SyncOperationType` (**:10-28**) and `'CABLE_RUN'` to `entityType` (**:39**). No Dexie version bump — `syncQueue`'s indexes are unchanged, `version(4)` at `:112` stays.

**1.6c** — `/home/msaville/tickethub/next.config.ts`, **lines 9-10**: `/(tickets|attachments|signatures|timer|appointments|cable-runs)(\/|$)/i`. ⚠ **Only after 1.6a's idempotency guard exists** — Workbox BackgroundSync replays outside any tab.

#### Step 1.7 — Bulk capture via note-import (optional, last)

`NoteSuggestion.sourceType` already accepts `handwritten`/`screenshot`; `lib/ai/extract.ts:5,68-88` already sends base64 images to Claude vision. Photograph a labeled patch panel → draft runs → review → commit. ⚠ The plan's own warning stands: that pipeline sits at **97 PENDING vs 11 COMMITTED**. AI capture reliably generates review debt. Ship this last, or not at all in Phase 1.

---

## 4. PHASE 2-5 PREREQUISITES

### Phase 2 — `DevicePort` / `PortLink`

Must be true before starting:

1. **The gate passed.** `CableRun` accumulated rows in normal field use, ~60 days after Phase 1, without a documentation project being scheduled. This is the whole point; do not start Phase 2 on a hunch.
2. **`DevicePort.index` renamed to `portIndex`** in every doc and sketch (B10).
3. **The `NetworkDevice` migration item is deleted from the plan** — it's already done (§1.2). What Phase 2 actually needs is a decision to **stop reading `NetworkDevice`**, at these sites:
   - `app/app/api/clients/[id]/network/[deviceId]/ports/[portId]/route.ts:20,37` — an **orphan-row factory**: `create({networkDeviceId, ...})` with no `assetId`. Rows it writes are invisible to `app/app/api/assets/[id]/ports/route.ts:17` (`where:{assetId}`) and to `lib/ai/classify.ts:342`, and would be invisible to any Phase-2 backfill. Unreachable today only because `NetworkDevice` has 0 rows.
   - `app/app/api/clients/[id]/network/[deviceId]/ports/route.ts:19` — reads `where:{networkDeviceId}`, always empty.
   - `app/app/api/clients/[id]/report/route.ts:94` — Phase 5 covers this.
   - **NOT IN THE PLAN, and silently wrong in the UI today:** `app/app/api/clients/[id]/completeness/route.ts:28` counts `networkDevice where assetId:null`, feeding the weight-5 check at `:51` "Has network devices documented" — **permanently false for every client, capping every completeness score below 100.** Same at `app/app/api/clients/completeness/route.ts:20,55`. And `app/app/api/clients/[id]/tab-counts/route.ts:33,60` makes the client "Network" tab badge **permanently 0**. Fix these; they are the same wrong assumption and worse than a crash because nobody notices.
4. **Provenance columns landed** (from Phase 0.3 descope, see D3): `SwitchPort.lockedFields String?`, `AssetInterface.switchPortSource String?` + `switchPortSeenAt DateTime?`, plus `app/app/api/assets/[id]/ports/[portId]/route.ts:24-40` populating `lockedFields` on every human PATCH. The plan's own landmine ("UniFi sync must be write-restricted") is unenforceable without these.
5. **`@@unique([assetId, portNumber])` decision on `SwitchPort`.** Verified safe today (0 duplicate groups across 280 rows, 13 distinct assets) — but see D6; my recommendation is *not* to add it.
6. **`lib/patch/link.ts` guard designed and transaction-scoped.** The two `@@unique` indexes genuinely do not prevent port X being `aPortId` on link 1 and `bPortId` on link 2 with the same `kind`. The guard must run **inside the same transaction as the insert**, or an iPad double-tap (offline replay is a live path here) creates exactly the duplicate the constraints were meant to stop.
7. **`ActivityEvent` enum decision.** The landmine at plan line 278-279 says "Add `AuditLog` and `ActivityEvent` on Phase 2." `AuditLog.action` is a free `String` — no schema change. **`ActivityEvent.eventType` is a hard enum** (`prisma/schema.prisma:1522`) — a physical-layer event type requires an additive `ALTER TYPE ... ADD VALUE`, which the gate at `safe-db-push.sh:34` permits. Decide whether you need the ActivityEvent half at all.
8. **Migration script written and dry-run** for `CableRun` → `DevicePort`/`PortLink`.

### Phase 3 — SVG rack editor

1. Phase 2 landed (the editor draws `PortLink` edges).
2. **Accept that the pan/zoom hook is greenfield.** Nothing exists to reuse (§1.16). `Sheet.tsx` is the overlay shell only. The ~60-line estimate is correct *as new code*.
3. **Both** DnD sites rewritten to Pointer Events: `RackDiagram.tsx:281-285` **and** `:482-486` (plus `app/app/settings/flex/page.tsx:738-788` if you want the iPad gap fully closed). Reuse the existing left/right hit test at `:218-224` and `:226-244` — that logic is event-source-agnostic and sound; only the event source changes. Drop `cursor:'grab'` (`:298`,`:496`) and the ⠿ affordance (`:340`,`:528`) if the new path doesn't work on iPad, rather than leaving them promising a drag that never starts.
4. **`portColor()` promoted** from `SwitchPanel.tsx:335-343` into `lib/port-state.ts`, along with `DEVICE_COLORS` (`RackDiagram.tsx:44-56`) and its print-safe pattern/glyph encoding.
5. Phase 0.3a/0.3b (print `!important` + `print-color-adjust`) landed and **visually verified on paper** — the whole SVG-not-canvas argument is "critically, print."
6. An iPad Mini available for testing. 44px hit rects over ~8px/port visuals is the design constraint; it cannot be validated on a desktop.

### Phase 4 — Floor plans

1. Phase 3's pan/zoom hook exists and is extracted, not inlined.
2. **`Asset.roomRef` naming settled** (B2). `roomId String?` + `roomRef Room? @relation("AssetRoom")`, never `room`.
3. **`Room.geometry` must be `Json?`, not `Json`.** The plan's own rule ("typing free text auto-creates the Room; never block on create-the-room-first") is incompatible with a required polygon. If it stays required it needs a `@default` following `AuditLog:852` (`Json @default("{}")`).
4. **Photo/plan storage convention settled** (B9). If `planAttachmentId` FK is chosen, `onDelete: SetNull` is mandatory.
5. Back-relations planned: `Location.floors Floor[]`, `Person.roomsResponsible Room[] @relation("RoomResponsiblePerson")` (after `prisma/schema.prisma:231`), `Asset.floor`/`Asset.roomRef`.
6. `sharp` upload pipeline for ≤2000px render + natural dimensions. `ClientAttachment.width/height` already exist at `:1147-1148` if you go the attachment route.
7. **`components/SwitchPanel.tsx:383-392` converted to `Sheet`** (step 0.4f) — otherwise the codebase contradicts the Phase 4 rule at plan line 216-217 on the very screen next door.

### Phase 5 — Billable deliverable

1. **Phase 0.4 landed AND a printed sheet physically inspected** (B8). Non-negotiable — this is what is being invoiced.
2. **Anchor corrected to the runbook's own print path**, `app/app/clients/[id]/runbook/page.tsx:66`, not `components/ReportShell.tsx:47` (§1.11). Module list is `ALL_MODULES` at `:8-19`, default `selected` Set at `:30`.
3. **The `NetworkDevice` → `Asset`+`SwitchPort` swap at `app/app/api/clients/[id]/report/route.ts:94` done as a deliberate, separate step** — it changes the shape of `data.network` and will break the runbook's existing render if done silently.
4. **~10 TicketHub seed rows exist** (§1.12): one `TH_Item` (`type: LABOR` — there is no SERVICE), optionally one `TH_Board` "Cabling" + ~8 `TH_BoardStatus` rows.
5. **PDF decision made** (D7). If PDF: it renders in TicketHub against `@react-pdf/renderer ^4.4.1`. Budget honestly for two constraints: `@react-pdf` cannot consume DOM SVG (own `<Svg>`/`<Path>` primitives — a rack elevation must be re-authored or rasterized via `sharp`), and its Helvetica build is **ASCII-safe only** — no `→` arrows, no smart quotes, so `B-114 -> P1:14 -> sw-mdf:14`.

---

## 5. DESIGN DECISIONS STILL OPEN

### D1 — Where does the cross-app write land, and does Phase 1 include a write path at all?

**Options:** (a) Phase 1 is read-only in the field — the tech sees runs on `/offline`, edits happen in DocHub at a desk. (b) Phase 1 includes `POST /api/cable-runs` on TicketHub with `clientOpId` + Dexie queue.

**Recommend (a) for Phase 1, (b) as Phase 1.5 immediately after.** Rationale: the read path is genuinely nearly free (`/api/offline/bundle` is already cached, `localStorage` mirroring is already there, no `next.config` change needed). The write path drags in a new TicketHub route, a `clientOpId` guard, two closed type unions, a `MUTATION_PATTERN` change, and makes TicketHub a **writer of DocHub's physical layer** — a coupling decision that deserves its own moment. Ship the read, watch the gate metric, then add the write. But **land `clientOpId` in the Phase 1 schema push regardless** (B7) so (b) is a pure code change later.

### D2 — Which entity is authoritative for "the switch that owns this port"?

The plan is ambiguous: `CableRun` carries both `switchAssetId`+`switchPortNumber` (denormalised) and `switchPortId` (FK).

**Recommend: keep both, `switchAssetId`+`switchPortNumber` as the source of truth, `switchPortId` as an optional convenience join.** Reason: `SwitchPort` has 280 rows that were scaffolded by `scaffoldSwitchPorts` (`app/app/api/integrations/unifi/sync/route.ts:59-69`) and have **never been touched since**; a tech in a closet knows "port 14 on the switch," not a cuid. Requiring `switchPortId` makes capture fail whenever the switch wasn't scaffolded (only 17 of 1,298 assets have `portCount`). The denormalised pair always works; the FK upgrades the row when the port row happens to exist.

### D3 — Phase 0.3 (UniFi): descope, or accept the infrastructure cost?

**Options:**
- (a) **Descope to provenance only.** Add `SwitchPort.lockedFields`, `AssetInterface.switchPortSource`/`switchPortSeenAt`, `Asset.macNormalized`/`AssetInterface.macNormalized` + indexes, a `lib/mac.ts` `normalizeMac()`, and the `lockedFields` writer at `app/app/api/assets/[id]/ports/[portId]/route.ts:24-40`. Move the actual sync work to its own gated track.
- (b) Do the whole thing: unblock the settings UI (`app/app/settings/page.tsx:1154`), add a `tailscaleIp` writer (`app/app/api/locations/[id]/route.ts:94`, `app/app/api/clients/[id]/locations/route.ts:26-38`, `app/app/locations/[id]/page.tsx:267`), stand up Tailscale reachability to 7 client sites, capture one live controller response to validate `lldp_table` field names, then write the sync.

**Recommend (a), strongly.** The plan's framing ("stop discarding data we already have") is false — the data has never been fetched once. (b) is infrastructure work of unknown duration across 7 client sites, and it does not belong in a "≈1 day, no gate, do first" bucket. Meanwhile (a) is cheap, unconditionally correct, and is a hard prerequisite for Phase 2 anyway.

**And whatever you do, ordering is not optional: `lockedFields` must be written before any sync writes `label`.** Otherwise the first successful sync silently destroys hand-entered data — and `port.name` on UniFi defaults to `Port N` for unconfigured ports, so without a `/^Port \d+$/` filter you would fill 280 labels with useless strings and **permanently destroy the "unlabeled" signal Phase 1 depends on**.

### D4 — Search result ranking

There is **no ranking**. Zero `orderBy` in the entire search route (grep count = 0), so within a group Postgres returns heap order — unstable across updates. Across groups, rank == the order of the push loops in `flattenResults`, fixed as: clients, assets, credentials, runbooks, documents, files, people, vendors, licenses, locations, netdevices, circuits, flexAssets, subnets, ipAssignments, racks. Current hard cap is 83 results in a 420px scroller (`SearchModal.tsx:356`).

**Options:** (a) write a relevance scorer; (b) insert the `cableRuns` push loop at **position 2**, right after assets.

**Recommend (b).** To make `B-114` appear at the top you do not write a scorer — you move a loop. Appending at the end puts it below up to 77 other rows. **Separately: add `orderBy` to the new group** (`[{ room: 'asc' }, { jackLabel: 'asc' }]`) for determinism, since heap order on a table edited in the field will visibly reshuffle.

### D5 — Trigram indexes for search?

**Options:** (a) add `pg_trgm` + GIN indexes; (b) don't.

**Recommend (b), don't.** Measured, not assumed: `EXPLAIN ANALYZE` of the asset OR-chain *with* `room` added is a **2.243 ms** seq scan over 1,298 rows. The total searchable corpus is **under 2,600 rows across 17 tables** (Credential 650, Person 268, Vendor 74, License 3, Subnet 3, InternetCircuit 3, ClientDocument 1, IpAssignment 1, Runbook 0, NetworkDevice 0, FlexAsset 0, Rack 0, ClientAttachment 0). And the cost is real: `pg_trgm` is **not installed** (`pg_extension` returns `plpgsql` only), the generator block at `prisma/schema.prisma:1-4` declares no `previewFeatures` and the datasource at `:6-9` no `extensions`, so `postgresqlExtensions` is off and `@@index(type: Gin)` is unavailable. You'd need a manual `CREATE EXTENSION` + raw GIN index **outside** `safe-db-push.sh`, which then shows as permanent drift noise in its step-2 diff. Revisit at ~50k rows in any one table. **Spend the Phase-0 budget on the missing destination page instead.**

### D6 — Add `@@unique([assetId, portNumber])` to `SwitchPort`?

**Options:** (a) add it (enables a real upsert, kills the `findFirst` at `sync-local:231`); (b) don't.

**Recommend (b), don't — with a caveat.** It would succeed today (0 duplicate groups across 280 rows), and `CREATE UNIQUE INDEX` passes the gate. But `assetId` is **nullable**, so it enforces nothing for any future legacy-shaped row, and it re-anchors the graph on the model Phase 2 deliberately decided *not* to anchor on ("`SwitchPort` … has no unique constraint on `(assetId, portNumber)`, so a cable graph cannot be anchored on it" — plan line 141-144). Adding the constraint quietly undermines the argument for `DevicePort`.

**Caveat:** if D3 goes route (b) and real UniFi sync ships, you need the upsert, and then the unique becomes necessary. Decide D3 first.

### D7 — Where does the billable PDF render?

**Options:** (a) print CSS only, from the DocHub runbook; (b) `@react-pdf/renderer` added to DocHub; (c) render in TicketHub against its existing pipeline.

**Recommend (a) first, (c) if (a) proves insufficient. Never (b).** (a) is nearly free once Phase 0.3a/0.3b land and the runbook has one more module. If a real PDF is needed: DocHub has no generator, TicketHub has a mature one — `@react-pdf/renderer ^4.4.1`, 28 files, 9 document types, a print agent, and `app/api/reports/client-qbr/pdf/route.tsx` as a direct analogue — and the estimate, the invoice and the print agent all already live in TicketHub, which is where the artifact gets delivered from anyway. Adding `@react-pdf` to DocHub creates two divergent PDF stacks for one document.

**Also worth stealing regardless:** `app/app/clients/[id]/runbook/page.tsx:74-95` is an inline `<style> @media print` block using **class-scoped literal light hex** (`.report-table th{background:#1e293b;color:white}`). It is the one print path in the repo that demonstrably works, and it works *precisely because* it bypasses the token system and is therefore immune to the ThemeProvider inline-style problem. Mirror that pattern for the cabling module even after the `!important` fix lands.

### D8 — Should search be RBAC-scoped in the `where`, or left as a post-filter?

Enforcement is **correct** (no leak) but **lossy**: `take: N` (`route.ts:23,47,…,256`) runs in Postgres **before** the JS RBAC filter at `:266-281`. A scoped tech searching a term matching 5 other clients' racks first gets **zero racks back, not their own**.

Dormant today: `SELECT count(*) FROM "StaffClientAssignment"` = **0**, and `lib/client-scope.ts:30` returns `{all:true}` when a TECH has no assignments, so every user currently gets `scope.all`.

**Options:** (a) push scope into each `where` now (touches all 16 groups); (b) do it only for the new `cableRuns` group and leave a comment; (c) defer entirely.

**Recommend (b).** The new group gets `...(scopeClientId ? { clientId: scopeClientId } : {})` in its `where` *and* the `ok()` post-filter (belt and braces, trivially cheap because `CableRun` carries `clientId` directly). Leave a `// TODO: scope is post-filtered after take:N — lossy once StaffClientAssignment rows exist` comment above the `Promise.all`. Rewriting all 16 groups is a separate piece of work, and the physical layer is precisely the data where a partial answer ("no jack B-114 here") is worse than no feature — so at minimum the new group must be correct.

### D9 — Where does the Phase 1 capture UI live?

**Options:** (a) a new `cabling` sub-tab under the client page Network tab; (b) a new standalone route `/clients/[id]/cabling`.

**Recommend (a) for Phase 1** (sub-tab machinery + URL seeding already exist after step 0.5e; deep-linking from search works immediately), **but extract the panel into its own component file** — do not add rows to the 4,357-line `app/app/clients/[id]/page.tsx`. Phase 3 already commits to a standalone route for the rack editor (`/clients/[id]/racks/[rackId]`); cabling can follow it there if the gate passes.

---

## 6. A+ RISK REGISTER

Ordered by likelihood × damage. Each has a concrete acceptance test.

### R1 — `CableRun` accumulates zero rows and the gate quietly never gets evaluated (HIGH / FATAL)

This is the risk the plan itself is built around, and it is the one most likely to be forgotten. Every comparable substrate in this codebase is empty: `Rack` 0, `RackSlot` 0, `Vlan` 0, `ClientAttachment` 0, `SwitchPort` 280 rows with **0 labeled and 0 ever updated after creation**, `AssetInterface.switchPortId` 0 of 32, `Asset.room` 11 of 1,298 (**0.85%**). And the "never present an empty canvas" mitigation covers ~1.3% of assets, because only 17 of 1,298 have `portCount` set.

**Mitigation:** run `app/scripts/physical-layer-coverage.mjs --json` on a schedule from day one, store the series, and put a calendar entry at Phase-1-ship + 60 days. **Write down the number that constitutes "passed" before shipping**, not after.

### R2 — Print output is never actually looked at (HIGH / FATAL to the billable claim)

Three independent defects each produce an unusable page, and none is visible from `tsc` or a browser at screen: the `ThemeProvider` inline-style clobber (`components/ThemeProvider.tsx:95` vs `globals.css:319-340`), the missing `print-color-adjust` (0 grep hits repo-wide), and raw hex in inline styles (97 in `RackDiagram.tsx`). **You would be invoicing $250-500 for a black slab or a white void.**

**Acceptance test:** print to paper (not just PDF preview) from at least two themes (`pcc-dark` and `ocean`, since `ThemeProvider.tsx:63-69` sets `--bg:#051020` inline), with and without "Background graphics." All four must be readable.

### R3 — iPad behaviour is never tested (HIGH / severe)

The entire strategic argument is "PCC2K's advantage is that we own the iPad PWA." Yet: the HTML5-DnD-fails-on-iPadOS claim is **UNVERIFIED and unverifiable from this environment**; `canDrag` (`RackDiagram.tsx:276,:478`) has no touch fallback either way; `cursor:'grab'` (`:298,:496`) and the ⠿ handle (`:340,:528`) promise a drag that may never start; and Phase 3's 44px-hit-rect-over-8px-port constraint cannot be validated on a desktop.

**Acceptance test:** an iPad Mini in hand for every phase that touches the rack or floor canvas. If no device is available, say so in the plan and drop the "we own the iPad PWA" argument rather than shipping on it.

### R4 — UniFi sync silently clobbers hand-entered documentation (MEDIUM today, CERTAIN if D3 goes route (b))

There is **no provenance column anywhere** on `SwitchPort` or `AssetInterface`. `isPoe` and `isUplink` are **both** human-writable (`app/app/api/assets/[id]/ports/[portId]/route.ts:15,28-32`) and sync-writable (`sync-local/route.ts:235-241`). The plan's own write-restriction rule names a `speed` column that **does not exist**. The moment sync starts running, a technician's uplink flag gets overwritten on the next nightly run and nobody knows why.

Three more clobber vectors specific to the MAC-table path: (i) a trunk/uplink port's `mac_table` lists every downstream MAC — without `isUplink` + `length<=2` + no-LLDP guards you attribute the whole building to one port; (ii) 10 MAC values are duplicated across Assets and **two of the 13 switch Assets share `ac8ba9b14839`**, so any `findFirst` on MAC is non-deterministic; (iii) four coexisting MAC formats (468 DASH-UPPER / 80 bare-lower-12 / 18 colon / 1 other) with `lib/network-asset.ts:62` only lowercasing.

**Mitigation:** `lockedFields`/`switchPortSource` land **before** any sync write. Sync must never delete a `SwitchPort` row and never null `label`/`vlanId`/`notes` — a port absent from `port_table` is a controller hiccup, not a decommission. Never null an existing `switchPortId` — absence from `mac_table` means the device is powered off; let `switchPortSeenAt` age instead. **Skip on ambiguity, always.**

### R5 — RBAC regressions are undetectable by manual testing (MEDIUM / severe if it lands)

`SELECT count(*) FROM "StaffClientAssignment"` = **0**, and `lib/client-scope.ts:30` returns `{all:true}` for an unassigned TECH. **Every user today is effectively unrestricted.** Any RBAC bug you introduce in a new search group or a new API route will pass every manual test and only surface the day the first assignment row is written.

**Mitigation:** unit-test the scope predicate against a fixture with an assignment row. Do not rely on clicking around. For `CableRun` specifically the check is trivial (`ok(r.clientId)`); for `SwitchPort` it is `ok(p.asset?.location?.client?.id ?? p.networkDevice?.clientId ?? null)` and an orphaned port (neither FK set) must be **dropped explicitly**, not left to `scope.all` short-circuiting.

Verified today: all 280 `SwitchPort` rows resolve via the asset branch to exactly 8 clients (Queen City Motors 136 ports / 4 switches, Precision Computers 24, Western Maryland Dermatology 24, Braddock Electric 40 / 3, VFW Post 764 16, Livvys Soft Serve 16, Smittys Tire & Truck 16). Zero use the `networkDevice` branch.

### R6 — Audit gaps carry forward into the new tables (MEDIUM / reviewable)

The plan's own landmine (line 278-279) records that `/api/racks/**` writes **no `AuditLog` and no `ActivityEvent`** — Patchdocs sells its Activity Log as a headline feature. If the new `/api/clients/[id]/cable-runs` routes ship without audit rows, Phase 1 repeats the exact defect it identified. `AuditLog` (`prisma/schema.prisma:840-863`) is hash-chained with free-string `entityType`/`entityId` — **no schema change needed**. There is no excuse.

**Acceptance test:** create, edit and delete a cable run; confirm three `AuditLog` rows with correct `entityType`/`entityId` and an intact hash chain.

### R7 — The search feature lands with nowhere to go (MEDIUM / embarrassing)

Three existing dead ends: rack results href to the wrong sub-tab (`SearchModal.tsx:182` → `?tab=Network` → lands on `ipam`, `page.tsx:565`); same-client scoped-search navigation is a **no-op** because `activeTab` is seeded in a `useState` initializer (`page.tsx:459-464`) that doesn't re-run on App Router param-only navigation; and `SwitchPort` results have no destination at all (B4).

**Acceptance test:** from a client page, press `/`, search a jack label, press Enter — the page must visibly change to the cabling sub-tab with the run highlighted. Then repeat from Cmd+K on a different page.

### R8 — The offline bundle silently returns nothing because of the location-resolution ladder (MEDIUM / severe)

If anyone implements the resolver against `TH_Site.dochubLocationId` ↔ `Location.thSiteId` or against site *name*, the tech gets an empty cable-run section and no error. **Measured: 0 of 150 site-name joins match.** 9 of 150 `th_sites` have `dochubLocationId`; 0 of 182 Locations have `thSiteId`.

**Acceptance test:** for a tech with appointments at 3 sites, assert that `resolveDochubLocationIds` returns 3 non-null ids, and log a warning (not silence) for every site it fails to resolve.

### R9 — The offline queue corrupts on replay (MEDIUM if the write path ships)

Without `clientOpId` on `CableRun`, a replay collides with `@@unique([locationId, jackLabel])` and the tech sees a hard error for his own successful write. Workbox BackgroundSync replays **outside any tab** once `cable-runs` is in `MUTATION_PATTERN`, so the in-tab Dexie dedupe does not cover it.

**Acceptance test:** enqueue a `SAVE_CABLE_RUN`, force a double replay (both queues), assert exactly one row and a `{deduplicated:true}` second response.

### R10 — A future null deref blanks a page again (LOW likelihood, HIGH damage, trivially preventable)

There is no `app/error.tsx`, no `global-error.tsx`, no `ErrorBoundary` anywhere in the app (verified). Phases 1-4 add a great deal of new client-rendered relation data — nullable `asset`, nullable `switchPort`, nullable `location`, nullable `panel` — with exactly the shape that just took down `/assets/[id]`. Step 0.2 fixes this for ~20 lines.

### R11 — Completeness scores and tab badges stay silently wrong (LOW / erodes trust)

`app/app/api/clients/[id]/completeness/route.ts:28` counts `networkDevice where assetId:null` → always 0 → the weight-5 check at `:51` "Has network devices documented" is **permanently unmet, capping every client below 100**. Same at `app/app/api/clients/completeness/route.ts:20,55`. `app/app/api/clients/[id]/tab-counts/route.ts:33,60` makes the Network tab badge **permanently 0**.

This is not in the plan. It is the same wrong assumption as the crash and it is **silently wrong in the UI today**, which is worse. Fixing it changes visible scores for all 182 clients — worth a heads-up to Michael, not a silent edit.

### R12 — Plan-doc path drift wastes a builder's first hour (CERTAIN / minor but avoidable)

Every path in `docs/physical-layer-plan.md` is missing the `app/` prefix. An agent following it literally gets "file does not exist" on the *first read*. Fix the doc (§1.1) before handing it to anyone.

---

**Files that will be touched in Phase 0 + Phase 1 (13 in DocHub, 5 in TicketHub, 1 shared):**

DocHub — `app/app/api/assets/[id]/interfaces/route.ts`, `app/app/api/assets/[id]/interfaces/[interfaceId]/route.ts`, `app/app/assets/[id]/page.tsx`, `app/app/error.tsx` (new), `app/app/globals.css`, `app/components/RackDiagram.tsx`, `app/components/SwitchPanel.tsx`, `app/app/api/search/route.ts`, `app/components/SearchModal.tsx`, `app/app/clients/[id]/page.tsx`, `app/app/scan/page.tsx`, `app/prisma/schema.prisma`, `app/app/api/clients/[id]/cable-runs/**` (new).

TicketHub — `app/lib/dochub-cable-runs.ts` (new), `app/api/offline/bundle/route.ts`, `app/offline/page.tsx`, `app/lib/offline-db.ts`, `next.config.ts` (only with the write path), `app/api/cable-runs/route.ts` (new, only with the write path).

Shared — `docs/physical-layer-plan.md` (corrections from §1).