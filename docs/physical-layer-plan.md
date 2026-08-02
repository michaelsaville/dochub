# DocHub Physical Layer — "Patchdocs-in-DocHub" plan

Decided 2026-08-02 after an A-team pass (UI / UX / Workflow / Deep Seek / Feature-gap).
Source of the idea: [patchdocs.io](https://patchdocs.io) (PATCHBOX GmbH, launched ~2026-05-04).

> ⚠ **This is the decision record, not the build document.** A 7-agent verification pass
> on 2026-08-02 checked every claim below against live code and the live database:
> **66 confirmed, 18 wrong, 24 partially wrong.** Build from
> [`physical-layer-verified-map.md`](physical-layer-verified-map.md), which supersedes
> this file wherever they disagree. Three corrections are large enough to note inline:
>
> 1. **Every file path below is missing the `app/` prefix.** The Next app root is
>    `~/dochub/app`, so `components/RackDiagram.tsx` is really
>    `app/components/RackDiagram.tsx` and `app/globals.css` is `app/app/globals.css`.
>    Line numbers within files are accurate. Exceptions genuinely at repo root:
>    `safe-db-push.sh`, `pcc-theme-reference.md`, and this doc.
> 2. **Phase 0.3's premise is false** — see the rewritten section below.
> 3. **The NetworkDevice landmine is already closed** — see the rewritten section below.

## Decisions taken

1. **Both, sequenced** — ship a flat capture-first model now; build the full
   `DevicePort`/`PortLink` graph only after the flat table demonstrably accumulates rows.
2. **Full visual treatment is the destination** — SVG rack editor *and* floor plans,
   built after the gate, not before it.
3. **As-built documentation is billable** — a $250–500 line item on cabling estimates,
   not a retainer.

## The constraint this plan is designed around

DocHub already shipped a Patchdocs-lite substrate years ago and it is empty. Verified
against `dochub-db-1` on 2026-08-02:

| | |
|---|---|
| `Rack` / `RackSlot` | 0 / 0 |
| `SwitchPort` | 280 rows — 0 labeled, 0 VLAN-tagged, 0 uplinks |
| `AssetInterface` with `switchPortId` | 0 of 32 |
| `Asset.room` / `Asset.switchPort` | 11 / 0 of 1,298 |
| `Vlan` | 0 |
| `ClientAttachment` | 0 |

Meanwhile 497 assets are `dataSource = MANUAL` — data *does* get hand-entered here.
Identity gets typed; physical placement gets skipped. **The binding constraint is
capture cost, not model expressiveness.** Every phase below is judged on whether it
lowers capture cost.

Corollary from the research: no discovery tool can ever auto-populate the passive
layer — a patch panel has no IP, no MAC and no power draw, which is why Auvik,
Domotz, Network Glue and Liongard all stop at the switch port. Whatever gets
captured, a human captures. PCC2K's advantage over every SaaS competitor is that we
own the iPad PWA and TicketHub's offline write queue.

---

## Phase 0 — Unblock (≈1 day, no gate, do first)

These are prerequisites, not features. Each was found by a lens reading live code.

1. **Fix the latent crash sitting directly in this feature's path.**
   `app/assets/[id]/page.tsx:933` dereferences `iface.switchPort.networkDevice.name`
   unguarded and types it non-nullable at `:40-45`, while
   `app/api/assets/[id]/interfaces/route.ts:14` includes only
   `switchPort.networkDevice`. All 280 `SwitchPort` rows are `assetId`-linked and none
   are `networkDeviceId`-linked — so this fires on the **first** port-linked interface
   anyone creates. Guard the deref and include the asset relation.

2. **Index physical data in global search.**
   `app/api/search/route.ts:25-160` covers asset name/serial/IP, credentials and
   documents — never `Asset.room`, `SwitchPort.label`, or racks. Typing a jack label
   returns nothing today. The 2am lookup is the entire payoff of this project and it
   is currently not wired to anything.

3. ~~**Stop discarding the free UniFi data.**~~ **CORRECTED — the premise was false.**
   The data is not being discarded; it has **never been fetched, once**.
   `IntegrationSyncStatus` shows `unifiLocal | UNCONFIGURED`; `sync-local/route.ts:38-40`
   bails before doing anything. All 280 `SwitchPort` rows have `updatedAt == createdAt` —
   nothing has ever written to them after creation, by sync or by hand. Only the **UI.com
   cloud** path is configured (`integration:unifi:controllerType = 'ui_cloud'`), and the
   cloud endpoint returns no port tables at all — port data exists only on the *local*
   controller endpoint. Worse, the settings UI **hides** the local username/password
   inputs whenever `controllerType` is `ui_cloud`, and **0 of 182 Locations have
   `tailscaleIp` with no code path anywhere that writes it**, while `sync-local` hard-422s
   without it.

   **Revised scope (Phase 0.3 → provenance only, ~1 day):** add the provenance columns
   that make a future sync *safe* — `SwitchPort.lockedFields`,
   `AssetInterface.switchPortSource` + `switchPortSeenAt`, normalized-MAC columns and a
   `lib/mac.ts` `normalizeMac()` — plus the writer that stamps `lockedFields` on every
   human port edit. This is cheap, unconditionally correct, and a hard prerequisite for
   Phase 2 regardless. **Ordering is not optional: `lockedFields` must exist before any
   sync ever writes `label`,** or the first successful sync silently destroys hand-entered
   data. (UniFi defaults unconfigured ports to the literal string `Port N`, so an
   unfiltered sync would also fill all 280 labels with junk and permanently destroy the
   "unlabeled" signal Phase 1 depends on.)

   **Actual UniFi sync moves to its own gated track**, because it is blocked on physical
   infrastructure, not code: Tailscale reachability to 7 client sites (13 switches), local
   admin credentials per controller, a settings-UI unblock, and one captured live
   controller response to validate the `lldp_table` field names (currently passed through
   raw and unmapped — **unverified**, no local controller has ever been reachable).

   Two further traps for whoever builds that track: `Asset.macAddress` has **four
   coexisting formats** (468 DASH-UPPER, 80 bare-lower-12, 18 colon, 1 other) and
   `lib/network-asset.ts:62-67` only lowercases without stripping separators; and **two of
   the 13 switch Assets share the same MAC** (`ac8ba9b14839`), so any `findFirst` on MAC
   is non-deterministic.

4. **Token-ize the rack components so they print.**
   `RackDiagram.tsx` and `SwitchPanel.tsx` are the theme's remaining hex offenders
   (17× `#334155`, 13× `#0f172a`, etc.). The print block at `app/globals.css:317-350`
   only remaps *tokens*, so racks currently print as black slabs — which breaks the
   billable deliverable before it exists.

---

## Phase 1 — Capture-first slice (≈3–4 days)

One flat table, optimised for being filled in while standing in a closet.

```
CableRun
  id, clientId, locationId
  jackLabel        // "B-114" — @@unique([locationId, jackLabel]),
                   //   mirrors InternetCircuit's @@unique([locationId, label])
  room             // free text, autocompleted from existing values
  panelId, panelPort
  switchAssetId, switchPortId
  photoAttachmentId, notes
  lastVerifiedAt, verifiedById
```

- Deliberately **no** Building/User connection split, no floor plans, no rack canvas
  at this stage. Those are Phase 2+.
- **Index `jackLabel` and `room` in `/api/search`** so `B-114` resolves to
  `jack → panel port → switch:port` as text, in two taps.
- **Add `/api/cable-runs` to `MUTATION_PATTERN`** (`next.config.ts:6-8`) and surface
  the site's runs in TicketHub's `/api/offline/bundle`. DocHub's own PWA sends every
  GET `/api/*` to `NetworkOnly` (`next.config.ts:64-67`) and its mutation whitelist
  excludes `/api/racks` — DocHub is the system of record, TicketHub is the field
  surface. Cross-schema reads follow the existing `tickethub/app/lib/dochub-bridge.ts`
  pattern; no new BFF is needed.
- **Bulk capture via the note-import pipeline.** `NoteSuggestion.sourceType` already
  accepts `handwritten`/`screenshot` and `lib/ai/extract.ts:5,68-88` already sends
  base64 images to Claude vision. Photograph a labeled patch panel → 24 draft runs →
  review → commit. ⚠ Temper expectations: that pipeline currently sits at 97 PENDING
  vs 11 COMMITTED. AI capture reliably generates review debt.
- **Never present an empty canvas.** Where a location has a switch asset with a
  `portCount`, pre-draft the rows from UniFi and render them as a *guess* with a
  confirm affordance and a `lastVerifiedAt` stamp. Correcting a wrong label takes 30
  seconds and itches; authoring truth takes 20 minutes and is infinitely deferrable.
  This is the single decision the UX lens said determines whether the whole thing gets
  adopted.

### The gate

Revisit ~60 days after Phase 1 ships. **Does `CableRun` accumulate rows in normal
field use, without a documentation project being scheduled?** If it does not, Phases
2–4 will not fix that — floor plans do not make people document. Re-scope instead.

---

## Phase 2 — The real graph (≈6 days, gated)

Adopt the one genuinely good idea in Patchdocs: separate the **permanent building
cabling** from the **movable patch cord**. That split is what makes end-to-end tracing
work, and no MSP-category tool has it.

```
DevicePort   assetId, side PortSide(FRONT|REAR), index Int,
             name, mediaType @default("RJ45"), label?, templatePortId?, notes
             @@unique([assetId, side, index])

PortLink     clientId, kind LinkKind(BUILDING|PATCH), aPortId, bPortId,
             color?, cableType?, lengthCm?, installedAt?, testedAt?, notes
             @@unique([aPortId, kind])   @@unique([bPortId, kind])
```

- **New `DevicePort`, not an extended `SwitchPort`.** `SwitchPort`
  (`prisma/schema.prisma:1354`) carries L2 semantics (`vlanId`, `isPoe`, `isUplink`)
  that are meaningless on a patch-panel port or a keystone; it still carries the
  legacy `networkDeviceId` FK; and it has **no unique constraint on
  `(assetId, portNumber)`**, so a cable graph cannot be anchored on it. Keep
  `SwitchPort` as an L2 facet owned by UniFi sync, joined 1:1 via a nullable
  `devicePortId`. Backfill once; never dual-write.
- **One table with a `kind` enum, not two.** The two concepts differ in lifecycle, not
  shape, and the trace is one uniform walk. The two unique indexes give the Patchdocs
  semantic for free: a port holds at most one BUILDING link (the keystone) and one
  PATCH link (the cord). Postgres can't prevent the same port appearing as `aPortId`
  on one row and `bPortId` on another with the same kind — enforce that in a
  `lib/patch/link.ts` guard.
- **Path resolution: one recursive CTE via `prisma.$queryRaw`.** Edges = `PortLink` in
  both directions `UNION ALL` internal device edges (front port *n* ↔ rear port *n* on
  the same asset — this is what makes a patch panel transparent). Cycle guard is
  `NOT to_port = ANY(path)`, bounded at 12 hops; real chains are 4–6. Sub-5ms at PCC2K
  scale. Do not walk in app code — you'd pay N round trips and lose reuse in the
  portal BFF and the PDF export.
- Migrate Phase 1 `CableRun` rows into `DevicePort`/`PortLink` with a one-off script.

---

## Phase 3 — SVG rack editor (≈5 days, gated)

New route `/clients/[id]/racks/[rackId]`, one `RackEditor.tsx`, **one SVG in one
coordinate system**. Do not retrofit into `app/clients/[id]/page.tsx` — it is already
4,357 lines and mounts `RackDiagram` at `:4082`.

- **SVG, not canvas, not DOM.** Free hit-testing, text, focus and — critically —
  print, which is the billable deliverable. DOM can't draw cables that cross device
  boundaries.
- Layers: `#chassis` → `#devices` (`<g transform="translate(0, u*UH)">`) → `#ports`
  (`<rect data-port-id>`) → `#cables` (`<path>`, `pointer-events:stroke`).
- **Pan/zoom: hand-rolled**, one `viewBox` state + pointer events + `touch-action:none`
  (~60 lines). Write the hook once; Phase 4 reuses it.
- **Pointer Events only — never HTML5 drag-and-drop.** `RackDiagram.tsx:281-285` uses
  `draggable`/`onDragStart`, which does not fire on iPadOS Safari. DocHub's only drag
  interaction today is desktop-only.
- **Tap port A → tap port B to connect.** Faster than drag on an iPad and about a
  third of the code. Each port needs an invisible **44px hit rect** over its ~12px
  visual — a 24-port switch at 1:1 on an iPad Mini is ~8px/port.
- Promote `portColor()` (`SwitchPanel.tsx:335-342`) into `lib/port-state.ts`. Encode
  **fill = state, ring = VLAN, glyph = PoE**. Today fill carries both, which is exactly
  why it can never render "cabled but not patched" — the state the keystone metaphor
  depends on. Add a hatch `<pattern>` for "empty slot" so state survives greyscale
  print and colour-blindness.
- BUILDING = dashed stroke, PATCH = solid; per-link colour carries across every hop.
  Selecting a port drops everything outside the chain to `opacity:.25` — one class flip.
- Front/back = one toggle swapping which port group renders, X mirrored. Not a second
  canvas.

---

## Phase 4 — Floor plans (≈6 days, gated)

`<div position:relative>` → `<img>` → absolutely-positioned `<svg viewBox="0 0 imgW imgH">`
sharing Phase 3's pan/zoom hook.

```
Floor   locationId, name, ordinal, planAttachmentId?, pxPerMetre Float?
        @@unique([locationId, ordinal])
Room    floorId, name, shortId?, geometry Json, color?, responsiblePersonId?
Asset  += floorId? roomId? planX Float? planY Float?
```

- Plan image stored via the existing polymorphic `ClientAttachment`; use **sharp**
  (already a dep) at upload to emit a ≤2000px render and capture natural dimensions.
- Scale: two taps to place endpoints + one numeric input → `pxPerMetre`, render a live
  scale bar (~80 lines).
- Rooms: tap to add vertices, tap first to close; `<polygon fill-opacity:.12>`, label
  at centroid, 44px vertex handles.
- Pins: `<g transform>` + 2-letter mono badge (AP/TO/CAM) — matches the theme's
  mono-for-data rule and beats icon-hunting.
- Dashed-orange = building connection, solid-blue = user connection, as Patchdocs does.
- **iPad rules**: `touch-action:none`, `-webkit-user-select:none`, and gate all
  mutation behind an explicit **Edit mode** — view mode must never move a pin on a
  stray finger. Detail goes in `components/Sheet.tsx` (the one touch-aware overlay
  primitive), not a fixed z-1000 modal.
- Rejected: Konva/Fabric (canvas, no print, +150KB), react-flow (node-graph semantics
  fight your pan/zoom), Leaflet CRS.Simple (right for tiled plans, overkill for single
  JPEGs, DOM markers don't print).
- **Keep `Asset.room` as free text alongside `roomId`.** Typing free text auto-creates
  or fuzzy-matches the Room; never block on "create the room first" — that friction is
  what produced the 0.85% fill rate. The 11 existing values (`MDF`, `Computer Room`,
  `Upstairs Rack` vs `Upstairs rack tire and auto`) are already drifting at n=11, which
  is itself the argument for the entity.

---

## Phase 5 — The billable deliverable (≈3 days, gated)

- Add a **cabling module** to the existing runbook report
  (`app/clients/[id]/runbook/page.tsx:13,30`) rendering the port map + traces.
- ⚠ **DocHub has no PDF generator today** — `package.json` has `pdf-parse` (reading
  only); the sole export path is `window.print()` via `components/ReportShell.tsx:47`.
  React is 19.2.4, so `@react-pdf/renderer` is viable if print CSS proves insufficient
  — but note its Helvetica build is ASCII-safe only (no arrows or smart quotes).
- Also stale and worth fixing here: the report's network module still queries the
  **legacy `NetworkDevice`** (`app/api/clients/[id]/report/route.ts:93-107`) rather
  than `Asset` + `SwitchPort`.
- Sell as a **$250–500 line item on the cabling estimate**. TicketHub already supports
  this with zero schema change: `TH_EstimateItem` is generic qty/unitPrice, parts→charge
  auto-fires on `INSTALLED` (`lib/actions/parts.ts:261-275`), and a "Cabling" board is a
  `TH_Board` config row, not code. Do **not** attempt a documentation retainer — a
  2-tech shop can't defend one.

---

## Explicitly not building

- **Custom rack-device template editor** (Patchdocs' drag-drop builder). Its own docs
  warn that editing a deployed template destroys every connection, VLAN and SFP
  assignment on every instance. That's a warning, not a spec. Ship versioned JSON port
  layouts + a "clone & edit" flow instead; make templates immutable once deployed.
- The 12-icon floor-device palette (3D Printer, Screen, Access Control Panel).
- Free-form hex per connection — offer 8 presets.
- SFP modules as a separate entity; cable-certification / Fluke import.
- Tenant management (that's `Client`) and 2FA (passkeys already exist).
- Orthogonal cable auto-routing, minimap, undo stack, marquee select, snap guides, 3D.
- Any further investment in `NetworkDiagramPanel` (draw.io iframe) — once the physical
  layer is modelled it becomes a second source of truth.
- Anything in PhotoHub or FleetHub for this. PhotoHub's auto-organize is dead code (it
  signs calls to `/api/bff/photohub/*` routes that do not exist in TicketHub, and
  swallows the failure), and FleetHub has no topology discovery (`network-probe.ts:65`
  walks one OID; `Fl_NetworkDevice` has no MAC/port/neighbor fields).

## Known landmines

- ~~**Legacy `NetworkDevice`** migration must be finished before Phase 2.~~
  **CORRECTED — already done.** `NetworkDevice` has **0 rows**, 0 SwitchPorts reference
  it, and `admin/migrate-network-devices` is now a no-op querying an empty table. What
  remains is **code debt, not data debt**: the model still owns `switchPorts`/`rackSlots`
  and ~15 call sites still read it. Budget Phase 2 for *deleting reads*, not migrating.
  Two of those reads are **silently wrong in the UI today** and worse than the crash
  because nobody notices: `api/clients/[id]/completeness/route.ts:28` counts
  `networkDevice where assetId:null` → always 0 → the weight-5 "Has network devices
  documented" check is permanently unmet, **capping every one of the 182 clients below
  100%**; and `api/clients/[id]/tab-counts/route.ts:33,60` pins the client Network tab
  badge to **0** forever. Fixing these changes visible scores for every client — do it
  deliberately, not as a drive-by.
- **UniFi collision.** Once `DevicePort` is truth, UniFi sync must upsert on
  `(assetId, FRONT, index)` and be write-restricted to `isPoe`/`isUplink`/speed —
  never create, never delete, never touch `PortLink`.
- **Migration safety.** `safe-db-push.sh:34` aborts on
  `DROP TABLE|DROP COLUMN|SET NOT NULL|RENAME`. Everything above is additive (new
  tables, new nullable columns, `CREATE TYPE` enums). Never drop `Asset.room` (:283) or
  `Asset.switchPort` (:274) — leave them read-only and backfill.
- **`/api/racks/**` writes no `AuditLog` and no `ActivityEvent`.** Patchdocs sells its
  Activity Log as a headline feature; DocHub's rack routes have none. Add on Phase 2.
- **`TH_Ticket.dochubAssetId` exists and is used on 4 of 863 tickets**; the
  `TH_Site.dochubLocationId` ↔ `Location.thSiteId` join is declared on both sides with
  **no writer** on either, so all matching falls back to case-insensitive client name
  (`dochub-bridge.ts:84`) and breaks silently on drift.

## Why not just buy Patchdocs

182 locations × one wall cabinet ≈ **€109 base + 181 × €10 = ~€1,919/mo** (~$2,320);
annual billing only reaches ~€1,590/mo. (The "178" figure used earlier — and the stale
comment at `app/prisma/schema.prisma:199` — is wrong; the live count is 182.) Rack-based pricing with tenant management
gated behind the System Integrator tier is priced for someone who documents **once**,
at handoff, with the drawing billable — not for an MSP who must keep it true for years
with no billable hour attached. It's also SaaS-only, no self-host, no public API, no
import story, and three months old with zero third-party validation.

## Competitive landscape (2026-08-02)

| Tool | Price | Self-host | Floor plans | Ports + path trace |
|---|---|---|---|---|
| NetBox / Nautobot | free | yes | community plugin, version-pinned | yes |
| PATCH MANAGER (NL, 2002) | €283/mo ≤30 racks | both | yes | yes — the real incumbent |
| netTerrain | ~$2,944/yr per 500 objects | yes | yes — closest twin | yes + OSP fiber |
| Device42 | $1,449–9,999 | yes | yes | yes |
| Sunbird dcTrack / Nlyte | up to $80k perpetual | yes | yes | yes |
| RackTables / openDCIM | free | yes | no | workaround only |
| Ralph / Snipe-IT | free | yes | no | no connectivity model |
| Hudu / ITFlow / IT Glue | — | — | no | **U-slots only** |

Sentiment: the same question recurs on r/networking and r/msp from 2014 to 2023
unresolved; every NetBox complaint is about data-entry cost rather than capability
(288 fiber strands "takes a few hours"); the trade consensus is that documentation
"competes with billable work, and billable work always wins." This is a category
people admire and never populate — which is precisely why Phase 1 is capture-first and
why the gate exists.
