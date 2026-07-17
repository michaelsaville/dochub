# DocHub A+ Build Plan — A-team design (2026-07-17)

> Authoritative blueprint for the 6-phase feature build. Additive-only schema; every migration via ./safe-db-push.sh. Mobile-first. IT Glue/Hudu parity.


## Architect: Build Phases


### Phase 1 — Foundation: Mobile Design System + Audit Write-Spine + shared plumbing
**Features:** Mobile design system: components/Sheet.tsx (bottom-sheet for every modal/picker/confirm/inline-form ≤640px, sticky safe-area footer action bar), components/DataCards.tsx (table→stacked-cards ≤767px), globals.css @media(max-width:767px) touch contract (.btn 44px, inputs 44px/16px anti-zoom, ≥44px rows), Offline feedback: online/offline 'queued (N)' pill + BackgroundSync sync-toast over the EXISTING Workbox dochub-mutations queue; add StaleWhileRevalidate read-cache for NON-secret list GETs (reveal stays NetworkOnly, secrets kept out of list payloads server-side), Tamper-evident AuditLog spine: AuditLog + AuditActorType schema, lib/audit-log.ts writeAudit() (advisory-lock + HMAC hash-chain generalizing lib/reveal-log.ts), instrument existing reveal/login/apikey call sites, Shared settings accessor lib/settings.ts getSetting(key, default) for AppSetting ?? default reads; extend app/api/attachments/route.ts OWNER map/null-guard as the polymorphic-owner extension point

**Rationale:** This is the build-once layer every later phase consumes, so it must land first. The mobile primitives deliver an immediate app-wide UX win with zero schema risk on the heaviest surfaces (the 4,102-line client page hand-rolls cramped inline forms today). The audit WRITE path must exist before any feature is built so sensitive mutations instrument natively instead of being retrofitted — the viewer/evidence UI trails to Phase 6 once events have accrued. The compute-on-read 'kind' discriminator and the AppSetting ?? default accessor are shared by rotation, flex-expiry and backup, so formalizing them once prevents three divergent copies. The two internal tracks (mobile-DS vs audit-spine) are file-disjoint and parallelizable.


**Deliverable:** Sheet + DataCards live app-wide; touch CSS + offline pill/toast shipped; SW read-cache tuned via next-pwa runtimeCaching then rebuilt; AuditLog+AuditActorType pushed (safe-db-push.sh); writeAudit instrumented on reveal/login/apikey; lib/settings.ts + attachment owner-key hook in place.


### Phase 2 — Password Rotation Reminders (M)
**Features:** Credential rotation policy fields (rotationIntervalDays?, rotationExempt, rotationSnoozedUntil) + reuse existing lastRotated as baseline (null→createdAt fallback), lib/rotation.ts computeRotation/getRotationSettings; rotation items in app/api/alerts/unified/route.ts tagged kind:'rotation'; 'Password rotation' category folded into app/api/cron/alerts digest (one bell, one cron, one email/Teams/push), POST /api/credentials/[id]/mark-rotated + PATCH quick-branches (exempt/interval/snooze); rotation status badge + Mark-rotated/Snooze on the credential card, Mobile: 44px Mark-rotated gesture → two-button confirm Sheet, offline-queued (/credentials already in SW regex), optimistic toast; ADMIN bulk 'mark all rotated today' to zero the day-one baseline

**Rationale:** Smallest schema footprint (3 nullable columns on one model) and the highest daily-tech value, making it the ideal first feature to prove the Phase-1 rails end-to-end: it exercises the compute-on-read+digest extension, the mobile confirm Sheet, the offline write-queue, and audit instrumentation on a tiny, low-risk surface. Ships in parallel with Phase 3 (disjoint files).


**Deliverable:** Rotation fields pushed; unified-alerts + nightly digest emit rotation; mark-rotated/snooze/exempt routes + card UI; bulk-acknowledge; mobile gesture verified offline.


### Phase 3 — Document + SOP Template Library (L)
**Features:** Template + TemplateCategory models + TemplateKind enum; additive sourceTemplateId soft-pointer on ClientDocument and Runbook (Hudu parent→child provenance, no FK so archiving a template never cascades), /api/templates/* including instantiate (allowlisted {{client.name}}/{{date}}/{{tech.name}} resolution, scopeAllows on target clientId for DOCUMENT), from-existing 'designate as template', and reseed, <TemplatePicker> (mounts as a Sheet on mobile) wired into runbook/new and the per-client documents panel; /templates gallery + admin /settings/templates manager, scripts/seed-templates.mjs — idempotent-by-seedKey ~16 starter MSP SOPs/docs (onboarding, offboarding, backup-verify, incident response, network doc, M365 tenant, etc.)

**Rationale:** Fully self-contained and touches the runbook/document create flows — disjoint from the credential/alert files Phase 2 edits — so P2 and P3 run in parallel after P1. It is the first real consumer of the Phase-1 Sheet picker, carries high client-onboarding leverage, and has no cross-feature risk. The existing /api/runbooks/draft (Claude SOP generator) stays as the third 'AI draft' entry path.


**Deliverable:** Template models pushed; /api/templates/* live; TemplatePicker in both create flows; gallery + admin manager; seeded starter library via seed-templates.mjs.


### Phase 4 — Flexible Assets (XL, flagship)
**Features:** FlexLayout → FlexLayoutField → FlexAsset → FlexAssetRelation (parallel to, NEVER extending, the hard-coded Asset/Configurations model); Client/Location back-relations; ClientAttachment.flexAssetId/flexFieldKey via the Phase-1 owner-key hook, lib/flex-fields.ts typed field registry (render/validate/coerce/list-cell/search-flatten/encrypt) for text|textarea|number|date|select|multiselect|checkbox|tags|password|upload|relation|header|website — the biggest reusable engine, Layout designer in Settings (immutable field-key rule), /api/flex-layouts/* + /api/flex-assets/* incl. audited password reveal (lib/crypto + /reveal RBAC pattern); relation/Tag fields reuse RelationLinker.tsx; uploads reuse AttachmentsPanel, Date-expiry alerts reuse Phase-2 compute-on-read + digest; search route gains a flexAssets key; /flex/[slug] index + client tab + /flex/asset/[id] detail; mobile single-column dynamic form in a Sheet with camera-capture uploads; seed SSL/LOB/Email-DNS/Warranty/SSID layouts

**Rationale:** The feature the owner misses most (IT Glue Flexible Assets) and the program centerpiece — it earns a focused solo slot. Placed after the mobile primitives and field-thinking mature because its dynamic form is the single heaviest mobile surface, and after Phase 2 so its expiry alerts reuse the compute-on-read feed and its password reveals reuse the audit spine rather than reinventing them. Additive-only and architecturally isolated: the ~15 hard-coded Asset types stay untouched.


**Deliverable:** 4 models + back-relations + attachment columns pushed; flex-fields engine; designer + instance CRUD + audited reveal; search + expiry integration; /flex surfaces + mobile form; seeded starter layouts.


### Phase 5 — Client-Hub Restructure (M)
**Features:** Module-scope SECTIONS constant (6 groups: Overview / Organization / Assets & Licensing / Network & Telecom / Credentials & Vault / Docs & Client Portal) + sectionOf() partitioning all 20 existing tab strings exactly, Extracted module-scope <ClientTabNav> (NOT inline — React focus gotcha) replacing the flat .pcc-tab-bar scroll strip; two rows: section chips (aggregate count badge + live-tab dot) + child tabs; auto-expand the active tab's section, Deep-link fidelity: all ~30 ?tab= callers unchanged; assert flatten(SECTIONS)===tabs; keep the URLSearchParams decode + Network sub-tab path intact, Mobile: two scroll-snap rows (6 section chips ≈ one viewport, ≤5 child chips) so worst-case reach drops from ~19 swipes to 1 tap + ≤4 chips; localStorage last-open section (or optional StaffUser.clientNavPref if server-persist is chosen)

**Rationale:** Pure nav chrome (no required schema) but it heavily edits the SAME 4,102-line app/clients/[id]/page.tsx that Phase 4 touches — so it runs AFTER Flexible Assets to avoid double-touching/merge-conflicting that file and so the grouping reflects the final tab set (flex surfaces land under Assets & Licensing). Low-risk, high information-architecture payoff on both desktop and phone.


**Deliverable:** SECTIONS + sectionOf + ClientTabNav shipped; .pcc-section-tab CSS; deep-link parity verified for every ?tab= caller; two-row mobile nav; section persistence.


### Phase 6 — DR & Compliance: Platform Backup + Full Export + Audit Viewer/Evidence (L)
**Features:** PlatformBackupSchedule + PlatformBackupRun (namespaced Platform* + routed under /api/admin/backups to avoid colliding with the EXISTING client-facing BackupConfig/SynologyBackupJob and /api/backups that document clients' backups), Streaming AES-256-GCM engine (lib/backup/{serialize,engine,crypto-stream}.ts) under a dedicated BACKUP_ENCRYPTION_KEY; scheduled self-backup cron with retention; /admin/backups health-hero page; verify endpoint; scripts/restore-backup.sh (CLI-only, into empty DB), Full JSON/ZIP export /api/export/full/* (per-client + whole-tenant, relational NDJSON preserving FK cuids, secrets ciphertext-by-default with audited decrypt opt-in, 48h expiring links) — extends the existing redacted CSV export, Audit Secure-Log viewer: third tab on /admin/audit with a ✓/✗ verify banner, card-list rows + hash detail sheet, NDJSON/CSV SOC2 evidence export with a signed manifest, scripts/verify-audit-chain.ts + optional nightly anchor email

**Rationale:** The owner/auditor-facing phase, scheduled last because it is the heaviest ops/infra work (new backups: compose volume, new BACKUP_ENCRYPTION_KEY, host cron, restore runbook) and least daily-tech-facing, so it benefits from a stable base. The audit VIEWER belongs here because by now events have accrued from Phase 1–5 instrumentation, completing the same compliance story as the encrypted export. Independent infra — could start right after the Phase-1 audit spine; the full-export slice can be pulled forward if a departing client forces it.


**Deliverable:** Platform backup models pushed; encrypted streaming engine + scheduled cron + retention; /admin/backups health page + verify; full JSON export with expiring links; restore CLI + compose volume + env key; audit Secure-Log tab + verify + evidence export + verify-chain script.


## Sequencing
ORDER: shared-infra first → low-risk/high-daily-value early → flagship mid → ops/compliance last. The seven input specs collapse to SIX shippable phases plus mobile as a cross-cutting layer: mobile-architecture is NOT a phase (its primitives are Phase-1 shared infra that every phase consumes), and the audit feature is SPLIT — its write-spine is in Phase 1 (so it captures events from day one) while its viewer/evidence UI trails to Phase 6 (when data has accrued and it belongs with the compliance/DR story).

GATING CHAIN: Phase 1 gates everything (mobile primitives + audit write path + settings accessor). Within Phase 1 the mobile-DS track and the audit-spine track are file-disjoint → two people in parallel. Phase 2 (Rotation) and Phase 3 (Templates) depend only on Phase 1 and touch DISJOINT files (P2: credential card + alerts/cron; P3: runbook/doc create + new /templates) → they run in PARALLEL after P1. Phase 4 (Flexible Assets) gets a focused solo slot after P1+P2 — not a hard dependency but so its heaviest-on-mobile dynamic form reuses the matured Sheet/DataCards and its expiry alerts + audited reveals reuse P2's compute-on-read feed and P1's audit spine rather than reinventing them. Phase 5 (Hub Restructure) MUST follow P4, never parallel: both heavily edit the same 4,102-line app/clients/[id]/page.tsx, so sequencing avoids a brutal merge and lets the grouping reflect the final tab set. Phase 6 (DR & Compliance) is independent infra (own volume/key/cron) and could start right after the P1 audit spine, but is scheduled LAST because it is operator-facing not tech-facing and its risk profile (crown-jewel bundle, streaming, restore) is best absorbed on a stable base — the full-JSON-export slice can jump earlier if a departing client forces it.

DECISION→PHASE gating (settle before the phase starts): mobile read-cache (D5) → P1 service-worker; audit anchor/instrumentation contract (D4) → P1 writeAudit shape; rotation first-run + interval (D2) → P2; flex scope model (D1) → P4 schema (clientId nullability); backup posture (D3) → P6 deps/infra. Therefore D4 and D5 must be resolved before ANY build starts.

CRITICAL-PATH: P1 → P2 → P4 → P5 is the longest chain (mobile+audit foundation → prove-the-rails → flagship → nav over the final tab set). P3 and P6 hang off P1 in parallel and are schedule-flexible. Every phase ends with a safe-db-push (if it has DDL) + CI build + ./deploy.sh + on-device mobile verification.


## Schema Migration Plan
Every change is ADDITIVE-ONLY (new tables, new nullable/defaulted columns, new enums, native text[]) — zero drops/renames/NOT-NULL-adds/type-changes across the entire program — so all six pushes clear the destructive-op gate in ./safe-db-push.sh. TOOLING (one recipe, six pushes): run `./safe-db-push.sh --check` then `./safe-db-push.sh` per phase; the script backs up (pg_dump) → drift-diffs → refuses destructive SQL → pushes via prisma@6 in node:20-alpine on the dochub_default network against compose-internal db:5432 → verifies Client/Asset/Credential/ClientDocument/Person/Location/License row counts are unchanged. Run `prisma generate` in the image build after each (script uses --skip-generate). No cross-push blocking: every push is independently applicable, so ORDER FOLLOWS PRODUCT PHASES, not migration constraints.

PUSH 1 (Phase 1, Audit): enum AuditActorType {STAFF,API_KEY,PORTAL,SYSTEM}; model AuditLog — seq BigInt @id @default(autoincrement()) (creates ONE new Postgres sequence — additive), id String @unique @default(cuid()), at, actorType, actorId?, actorLabel, action, entityType?, entityId?, clientId?, summary, metadata Json @default("{}"), ip?, userAgent?, prevHash, hash @unique, + 5 indexes (at, action, [entityType,entityId], clientId, actorId). NO FKs to StaffUser/Client (actor/client are snapshotted so a later rename/delete cannot mutate history) → zero coupling. Chain head + daily anchors live in the EXISTING AppSetting key/value model (audit:head_seq/head_hash/anchor:YYYY-MM-DD) — no DDL.

PUSH 2 (Phase 2, Rotation): Credential += rotationIntervalDays Int?, rotationExempt Boolean @default(false), rotationSnoozedUntil DateTime?, + optional @@index([isRetired, lastRotated]). Reuses the ALREADY-PRESENT Credential.lastRotated as the baseline (null→createdAt fallback so existing creds get due dates immediately). All nullable/defaulted. AppSetting rotation:enabled/policy:defaultDays/threshold:warnDays read via getSetting ?? "true"/"90"/"14" — no seed.

PUSH 3 (Phase 3, Templates): enum TemplateKind {DOCUMENT,RUNBOOK}; model TemplateCategory (name @unique, color, order); model Template (kind, name, description?, categoryId? → TemplateCategory onDelete SetNull, titleTemplate?, summary?, content?, stepsJson Json?, tagNames String[] [native text[]], defaultCategoryName?, isSeed, seedKey? @unique, isArchived, isPublished, usageCount, timestamps, @@index([kind,isArchived,isPublished])); additive ClientDocument.sourceTemplateId String? +@@index and Runbook.sourceTemplateId String? +@@index (SOFT pointers, no FK, so archiving/deleting a template never cascades into real client records). Intra-push FK order (Category before Template) is handled by Prisma.

PUSH 4 (Phase 4, Flexible Assets): models in FK order FlexLayout → FlexLayoutField (layoutId → FlexLayout Cascade; @@unique([layoutId,key])) → FlexAsset (layoutId → FlexLayout; clientId → Client Cascade [REQUIRED — see decision 1]; locationId? → Location) → FlexAssetRelation (flexAssetId → FlexAsset Cascade; polymorphic targetType+targetId with NO FK, @@index([targetType,targetId]) for reverse lookup). Back-relations Client.flexAssets and Location.flexAssets. ClientAttachment += flexAssetId String? + flexFieldKey String? + relation + @@index([flexAssetId]) — mirrors the existing assetId/vendorId/locationId polymorphic-owner pattern and is wired through the Phase-1 attachment OWNER map. slug @unique on FlexLayout. Password values are encrypted inside FlexAsset.values Json via the existing ENCRYPTION_KEY (lib/crypto) — no schema field.

PUSH 5 (Phase 6, Platform Backup): PlatformBackupSchedule (id String @id @default("default") singleton; enabled, frequency, hourUtc, weekday?, retentionCount, includeUploads, secretsMode, target, s3Bucket?/s3Prefix?/s3Endpoint?/s3AccessKey?/s3SecretKeyEnc? [encrypted], lastRunAt?, nextRunAt?, updatedAt) and PlatformBackupRun (id cuid; kind, status, scope, clientId?, startedAt, finishedAt?, storagePath?, sizeBytes BigInt?, sha256?, itemCounts Json?, secretsMode, includeUploads, encrypted, verifiedAt?, verifyStatus?, error?, triggeredBy?; @@index startedAt/status/kind). No FK to existing rows. CRITICAL naming: Platform* + /api/admin/backups namespace deliberately avoids the EXISTING client-facing BackupConfig/SynologyBackupJob/BackupProtectedAsset and /api/backups routes (those document CLIENTS' backups and back the mobile mark-verified gesture) — two distinct backup domains, do not merge.

PUSH 6 (Phase 5, OPTIONAL): StaffUser.clientNavPref Json? — ONLY if server-side per-tech section persistence is chosen; otherwise NO DDL (localStorage). The nav restructure is otherwise schema-free.

SHARED-DB SAFETY: the stack reaches Postgres at compose-internal db:5432 on dochub_default; whether that instance is DocHub-dedicated or the shared multi-app 'dochub' instance, additive-only + safe-db-push.sh's backup→destructive-gate→count-verify keeps every consumer safe (never --accept-data-loss). Only new sequence is AuditLog.seq (cuid PKs need none); tagNames/options text[] need no extra migration. Deploy after each push = CI builds the ghcr image → ./deploy.sh (no watchtower).


## Shared Infra
Ten build-once building blocks; the first three are the highest-leverage:

1) MOBILE DESIGN SYSTEM (greenfield, Phase 1) — components/Sheet.tsx (one bottom-sheet primitive that turns every desktop modal/inline-form/picker/confirm into a thumb-reachable sheet with a sticky safe-area footer action bar ≤640px), components/DataCards.tsx (collapses every .data-table to stacked cards ≤767px; wide content like hashes/tables goes in overflow-x:auto wrappers), and the globals.css @media(max-width:767px) touch contract (.btn 44px, .field/.filter-input 44px + 16px anti-zoom, ≥44px rows). Consumed by the rotation card, template picker, flex dynamic form, backup list, audit viewer and the nav — every feature's mobile surface rides these instead of reinventing. THIS is the single most important build-once.

2) TYPED DYNAMIC-FIELD ENGINE lib/flex-fields.ts (Phase 4, designed as a registry) — one definition per field type of {render input, validate, coerce, encrypt-if-password, list-cell, search-flatten} across designer/create/edit/detail/list/search. Conceptual sibling of AssetTypeTemplate.customFieldDefs; keep the models separate but the renderer is the reusable core.

3) AUDIT WRITE CHOKE POINT lib/audit-log.ts writeAudit() (Phase 1) — generalizes the existing lib/reveal-log.ts pattern with an advisory-lock + HMAC hash-chain; called by every sensitive mutation across all features (flex reveal, backup decrypt-download, export, mark-rotated, apikey, login). Built first so instrumentation is native, not retrofit.

4) COMPUTE-ON-READ ALERT + NIGHTLY-DIGEST EXTENSION (exists; formalize in Phase 1/2) — app/api/alerts/unified/route.ts gains a kind discriminator (expiry|rotation|...) and app/api/cron/alerts gains a category fold-in gated by alerts:categories:*. Rotation, flex date-expiry and backup-verify all emit through this ONE feed + ONE digest (email/Teams/push) — no new bell or cron per feature.

5) APPSETTING TYPED ACCESSOR lib/settings.ts getSetting(key, default)/setSetting — rotation:*, backup schedule mirror, audit anchors, mobile SLA knobs and alert categories all read ?? default, so no seed migrations; one helper replaces scattered findUnique+fallback.

6) ATTACHMENT POLYMORPHIC-OWNER EXTENSION — the OWNER map + null-guard in app/api/attachments/route.ts (asset/vendor/location → add flexAsset). One switch; the same enumerated-owner discipline is what the backup serializer and scope logic must honor. Existing AttachmentsPanel.tsx/AttachmentPreview.tsx are reused by flex uploads.

7) RelationLinker.tsx (EXISTS) — flex relation/Tag fields reuse its full-screen searchable picker (searchEndpoint + q=); no new relation UI.

8) SCOPING DISCIPLINE lib/client-scope.ts (EXISTS) — getClientScope/scopeAllows/scopeWhere; every new client-scoped route (flex, template-instantiate, per-client export) loads clientId first then gates. Codify as a code-review checklist item since the clientId is one hop away on new flex/export routes.

9) MIGRATION + DEPLOY RECIPE (EXISTS) — ./safe-db-push.sh (backup→drift-gate→push→count-verify in node:20-alpine on dochub_default) for every phase's push; deploy via CI→./deploy.sh (no watchtower). One recipe, six pushes.

10) CRON-SECRET + SCRIPT SCAFFOLDING (EXISTS) — lib/cron-auth.ts requireCronSecret reused by self-backup + audit-verify + the folded rotation digest; scripts/*.mjs seedKey-idempotent pattern for seed-templates / seed-flex-layouts / verify-audit-chain / restore-backup.


## Mobile Strategy
One coherent system, not per-feature afterthoughts (this absorbs the standalone mobile-architecture spec — mobile is a cross-cutting layer, never its own phase; every phase's definition-of-done includes its mobile surface built on the Phase-1 primitives).

NAV MODEL — three fixed layers, never mixed, enforced in review: (a) .dochub-bottombar = exactly 5 DESTINATIONS (Home/Clients/Scan/Search/Vault) — NO feature may add a 6th; Flexible Assets, Templates and Backups all reach via Clients→section, global Search, and the More sheet. (b) .pcc-fab = creation only. (c) top-right = Alerts bell + a 'More' overflow that opens a bottom-sheet grid for everything that doesn't fit (Runbooks/Templates/Licenses/Vendors/Reports/Intake/Backups/Settings).

THE ONE NEW PRIMITIVE — <Sheet> (Phase 1, build once): every desktop modal / inline form / picker / confirm becomes a bottom sheet ≤640px with a sticky safe-area footer action bar, internal scroll, drag handle and backdrop dismiss. It fixes in a single component: the flex dynamic form (today a cramped inline 2-col grid with sub-44px inputs), the template picker, the mark-rotated/mark-verified confirms, and the More menu. <DataCards> collapses every .data-table to stacked cards ≤767px (asset/credential/license/backup/flex-instance/audit lists) so the page body never side-scrolls.

TOUCH/CSS CONTRACT (globals.css @media max-width:767px): .btn min-height 44px; .field/.filter-input min-height 44px + font-size 16px (the iOS no-zoom threshold — current 13-14px inputs zoom-on-focus); rows ≥44px with ≥8px gaps; keep native <select>/<input type=date|file capture> (best mobile pickers — never custom dropdowns); use tokens (--accent/--danger/--warn/.badge-*) so light/dark PWA theming is automatic.

OFFLINE — rides the EXISTING Workbox BackgroundSync 'dochub-mutations' queue (24h) that already covers /api/(clients|credentials|documents|assets|backups|applications|notes|share) POST/PATCH/PUT/DELETE. Phase 1 adds (1) a 'queued (N)' pill + sync toast so techs get feedback (today it is silent → double-submits), and (2) a StaleWhileRevalidate READ cache for NON-secret list/metadata GETs only (clients/assets/backups/dashboard/search lists), with reveal endpoints staying NetworkOnly and secret values kept out of list payloads server-side — a lost phone still cannot read vault contents from cache. When Flexible Assets lands, extend the SW mutation regex to include flex-assets (via next-pwa runtimeCaching config, then rebuild — sw.js is Workbox-generated, never hand-edited).

PER-FEATURE PAYOFFS (all on the above): rotation Mark-rotated = 44px card button → two-button confirm Sheet, offline-queued, optimistic toast; backup Mark-verified = same gesture on client BackupConfig cards; flex form = single-column Sheet, type-picker first, camera-capture upload for serials/certs, sticky Create foot; template picker = bottom-sheet gallery; hub nav = two scroll-snap rows landing deep-links on the right pre-opened section; Platform-backup health = a full-width green/amber/red hero tile the owner sees on opening the Admin tab; audit = a big ✓/✗ verify banner + card rows + share-sheet evidence export. BIOMETRIC UNLOCK (decision-gated): wire the existing StaffUserPasskey/PersonalVaultSession//api/passkey stack to the Vault entry so mobile matches IT Glue's Face-ID flow. MANIFEST POLISH: align theme_color/background_color to --accent #3d6fff/--bg #0a0c12; honor the known iOS raw-PDF force-quit trap (in-app pdf.js, never target=_blank) for flex/backup/template attachments; keep display:standalone + portrait.


## Risks



## Decisions (owner) — taking A-team recommended per /goal

- **Q:** Flexible Assets scope model — required-client + staff-only, or IT Glue-style global/portal parity in v1? (gates Phase 4 schema: FlexAsset.clientId nullability and whether a whole portal scope surface exists)
  - options: (A) clientId REQUIRED, staff-only, no portal — matches every other DocHub record, one simple scope story via getClientScope/scopeAllows. (B) Allow clientId-null 'global/internal' flex assets + portalVisible publishing like IT Glue — adds a scope surface plus portal plumbing on a brand-new entity.
  - **REC (adopting): A for v1. Ship the feature the owner misses with the smallest scope surface; add global (nullable clientId) and portal publishing in v2 — both are additive-nullable changes, so there is zero rework cost to defer. This keeps the flagship's FK and scope story trivial while it is the highest-risk XL build.**

- **Q:** Password-rotation first-run behavior and default interval — how do we avoid a day-one alert flood from the many creds with null lastRotated, and 90 vs 180 days? (gates Phase 2 adoption; a flood mutes the feature)
  - options: (A) Default 90d, baseline = lastRotated ?? createdAt, and ship an ADMIN 'mark all rotated today' bulk-acknowledge to zero the baseline once. (B) Treat never-rotated creds as 'dueSoon/unknown' until an explicit baseline — no flood but a weaker signal. (C) Default 180d to soften the first pass.
  - **REC (adopting): A. 90 days is the MSP-contract norm and is fully overridable + exemptable per the NIST-vs-contract tension, and the one-time bulk-acknowledge turns an unavoidable createdAt-baselined flood into a single deliberate admin action — the difference between the reminder being adopted vs silenced on day one.**

- **Q:** Backup security posture, offsite target, and the one new dependency — separate key? ciphertext-default export? S3 now or local+rsync? (gates Phase 6 deps, infra and crown-jewel security)
  - options: (A) Dedicated BACKUP_ENCRYPTION_KEY (separate from ENCRYPTION_KEY) + ciphertext-by-default export with audited decrypt opt-in + local backups: volume now, S3/MinIO behind the same target enum as a later config flip (adds @aws-sdk/client-s3 only when used). (B) Reuse ENCRYPTION_KEY + decrypted-on-export default + wire S3 immediately.
  - **REC (adopting): A. A dedicated key isolates blast radius (a decrypted bundle is still encrypted at rest under a key separate from the app's), ciphertext-default is the safest export, and deferring S3 avoids the only new dependency while documenting rsync/MinIO offsite as the real-DR follow-up — local /backups beside the DB volume is a single point of failure and must be called out, not silently accepted.**

- **Q:** Audit anchoring + reveal-instrumentation contract — external anchor channel, retention, and dual-write during transition? (gates the Phase 1 writeAudit shape and the contract every later feature follows)
  - options: (A) Email the nightly head-hash anchor via the existing OutboundMessage/Resend path, keep the log forever, and dual-write reveals to BOTH FieldHistory (keeps the per-credential history drawer working) and AuditLog during transition. (B) WORM-file anchor + a retention window with a signed closing hash + cut reveals over to AuditLog only.
  - **REC (adopting): A. Email is the cheapest external anchor DocHub already supports and it defeats the DB-admin-recompute threat; keep-forever is fine for a write-mostly log; dual-write avoids regressing the existing reveal drawer while the new viewer matures. Be honest to auditors that this is tamper-EVIDENT (HMAC chain + out-of-band anchor), not tamper-proof.**

- **Q:** Mobile offline read-cache — cache non-secret list/metadata for offline read, or stay fully online-only? (gates the Phase 1 service-worker design that every feature rides)
  - options: (A) StaleWhileRevalidate cache for non-secret client/asset/backup/dashboard/search LIST payloads only, with reveal NetworkOnly + secrets kept out of list responses server-side + vault-locked — a lost phone still cannot reveal a secret from cache. (B) Keep all /api GET NetworkOnly (no offline read) — simplest, but a tech in a basement sees blank screens.
  - **REC (adopting): A. Offline read of already-opened records is the genuine field differentiator vs IT Glue/Hudu, and the risk is bounded by ENFORCING 'no secret values in list payloads' server-side (not by trusting the URL regex) and keeping reveal + the vault strictly network-only. This must be settled before Phase 1 because it shapes the shared SW that all features inherit.**



---
# Per-Feature Specs


## Flexible Assets — UI-defined documentation/asset types with custom field schemas (IT Glue "Flexible Assets" / Hudu "Asset Layouts" parity). Users create a Layout (name, emoji/icon, accent color, description) with an ordered list of typed fields (text, textarea/rich, number, date, select, multi-select, checkbox, tags, password/secret, upload, and RELATION to a Contact/Asset/Vendor/Client/other-FlexAsset), each with required/optional, help text, show-in-list, and use-for-title flags. DocHub then dynamically renders create/edit/detail/list/search for instances. CRITICAL ARCHITECTURE DECISION: Flexible Assets are a NEW, PARALLEL concept — they do NOT extend the existing Asset model. DocHub's Asset (with its ~15 hard-coded typed models: NetworkDevice, PhoneSystem, CameraSystem, WifiController, Rack, etc. and dozens of relations) is the equivalent of IT Glue "Configurations" and must stay untouched. Flexible Assets mirror IT Glue exactly, where Flexible Assets are a separate top-level entity from Configurations. This avoids overloading Asset.customFields (a flat string map that cannot express relations, uploads, or multi-select) and keeps the hard-coded asset UI stable. New models: FlexLayout, FlexLayoutField, FlexAsset, FlexAssetRelation, with uploads reusing ClientAttachment via an additive FK. Flexible Assets attach to a Client (required) and optionally a Location, matching how every other client-scoped record works, and are fully governed by getClientScope()/scopeAllows().

**Effort:** XL


### benchmark
IT Glue Flexible Assets (the exact feature the owner misses) is the gold standard. Field types (from help.itglue.kaseya.com/flexible-asset-field-definitions): Text, Textbox (rich, 65KB), Number, Percent, Date, Checkbox, Select (dropdown), Upload (files ≤50MB), Password (embedded, with generator), Tag (relation), and Header (visual section grouping — not a data field). Per-field attributes: Required, Show in list (becomes a list-view column), Use for title (feeds the record name + search + related-item labels), and Expiration on Date fields (drives colored alerts + workflow notifications). The Tag field is the signature: it creates real relations to Organizations, Contacts, Configurations, Passwords, Documents, or other Flexible Assets, and those relations render bidirectionally (the linked Contact shows "referenced by" this flex asset). Each layout has a name + icon. EMULATE: the relation/Tag field with a selectable target type, use-for-title, show-in-list, Date-expiration alerts, and Header sections. AVOID IT Glue's friction: no per-field decimal toggles buried in modals, no 50MB hard wall surprises. Hudu Asset Layouts (support.hudu.com/Asset-Layouts) adds: layout-level icon + color, field types Text, Rich Text, Heading, CopyableText (one-tap copy — great on mobile), Website (auto-link), AssetTag/AssetLink (relation, scopable to specific layouts or "any"), Password, Date, Number, Checkbox, ListSelect, Embed (iframe), plus per-field position/column and hint text. EMULATE from Hudu: layout color+icon, CopyableText behavior, relation scoping to a target type, and column/position ordering. Net design: adopt IT Glue's field-type set + Tag relations + expiration, layer Hudu's color/icon + copyable + hint text, render with DocHub's existing .btn/.data-table/.field/.badge-* system and RelationLinker component so it feels native, not bolted on.


### dataModel
Additive-only; no change to Asset/AssetType/AssetTypeTemplate (they keep serving hardware "Configurations"). Add to app/prisma/schema.prisma:

model FlexLayout {
  id           String            @id @default(cuid())
  name         String            // "SSL Certificate", "LOB Application"
  slug         String            @unique // url-safe, derived from name; enables /flex/[slug]
  icon         String            @default("📄") // emoji, same convention as nav QUICK_LINKS
  color        String            @default("#3d6fff") // accent for badges/cards
  description  String?
  sortOrder    Int               @default(0)
  isActive     Boolean           @default(true)
  showInNav    Boolean           @default(true) // surface as a sidebar/bottom-bar entry
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  fields       FlexLayoutField[]
  assets       FlexAsset[]
  @@index([isActive, sortOrder])
}

model FlexLayoutField {
  id          String     @id @default(cuid())
  layoutId    String
  key         String     // stable machine key, immutable after first save (values keyed by it)
  label       String
  type        String     // text|textarea|number|date|select|multiselect|checkbox|tags|password|upload|relation|header|website
  required    Boolean    @default(false)
  showInList  Boolean    @default(false) // becomes a column in the list view
  useForTitle Boolean    @default(false) // concatenated (in position order) to form FlexAsset.title
  hint        String?    // help text under the input
  position    Int        @default(0)
  // type-specific config, all optional:
  options     String[]   // select/multiselect choices
  relationTarget String? // "Person"|"Asset"|"Vendor"|"Client"|"FlexLayout:<layoutId>" for relation type
  expires     Boolean    @default(false) // date fields: drive expiry alerts
  layout      FlexLayout @relation(fields: [layoutId], references: [id], onDelete: Cascade)
  @@unique([layoutId, key])
  @@index([layoutId, position])
}

model FlexAsset {
  id         String   @id @default(cuid())
  layoutId   String
  clientId   String   // REQUIRED — client-scoped like every other record
  locationId String?  // optional site pinning
  title      String   // derived from useForTitle fields (fallback: layout name + short id)
  values     Json     @default("{}") // { [fieldKey]: scalar|string[]|bool } for non-relation/non-upload types; passwords stored ENCRYPTED via existing crypto (lib/crypto) never plaintext
  searchText String?  // denormalized flattened text of values, rebuilt on write, for /api/search
  archivedAt DateTime? // soft-delete/retire, mirrors Asset status pattern
  createdBy  String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  layout     FlexLayout @relation(fields: [layoutId], references: [id])
  client     Client     @relation(fields: [clientId], references: [id], onDelete: Cascade)
  location   Location?  @relation(fields: [locationId], references: [id])
  relations  FlexAssetRelation[]
  @@index([clientId])
  @@index([layoutId])
  @@index([clientId, layoutId])
}

model FlexAssetRelation { // relation-type field values, kept relational for bidirectional lookup
  id         String @id @default(cuid())
  flexAssetId String
  fieldKey   String // which relation field on the layout
  targetType String // "Person"|"Asset"|"Vendor"|"Client"|"FlexAsset"
  targetId   String
  flexAsset  FlexAsset @relation(fields: [flexAssetId], references: [id], onDelete: Cascade)
  @@index([flexAssetId])
  @@index([targetType, targetId]) // reverse: "what flex assets reference this Contact?"
}

Add back-relations: on Client add `flexAssets FlexAsset[]`; on Location add `flexAssets FlexAsset[]`. Upload fields reuse ClientAttachment: add nullable `flexAssetId String?` + `flexFieldKey String?` + `flexAsset FlexAsset? @relation(...)` + `@@index([flexAssetId])` (mirrors the existing assetId/vendorId polymorphic-owner pattern already on that model). Passwords stored in values Json but ENCRYPTED with the same helper credentials use (never plaintext), and gated on reveal like Credential.allowTechReveal.


### apiRoutes
Layout designer (admin/builder), under app/app/api/flex-layouts/ mirroring the existing app/api/asset-types shape:
- GET /api/flex-layouts → active layouts (+ field count) for nav/list. requireAuth.
- POST /api/flex-layouts → {name,icon,color,description}; derive unique slug. requireAuth (admin-gate via staff role check like other builder routes).
- GET /api/flex-layouts/[id] → layout + ordered fields (for the designer).
- PATCH /api/flex-layouts/[id] → name/icon/color/sortOrder/showInNav/isActive.
- DELETE /api/flex-layouts/[id] → soft (isActive=false); block hard-delete if FlexAsset count>0.
- PUT /api/flex-layouts/[id]/fields → replace ordered field set in one transaction (upsert by key, delete removed); reject changing an existing field's `key` when instances exist (immutable key rule). Mirrors asset-types/[id]/template PUT.

Instances, under app/app/api/flex-assets/ and nested on clients:
- GET /api/clients/[id]/flex-assets?layoutId= → instances for a client, scoped. Apply scopeAllows(scope, id) — 403 if not allowed. Sits beside existing app/api/clients/[id]/assets/route.ts.
- POST /api/clients/[id]/flex-assets → {layoutId, locationId?, values, relations[]}. Server: validate required fields present, coerce/validate each value against field.type, ENCRYPT password-typed values, write FlexAsset + FlexAssetRelation rows in a txn, compute title from useForTitle fields, rebuild searchText, log ActivityEvent.
- GET /api/flex-assets/[id] → one instance with resolved relation targets (fan-out fetch of Person/Asset/Vendor names) + attachments (ClientAttachment where flexAssetId). Enforce scope via its clientId.
- PATCH /api/flex-assets/[id] → partial value/relation update; re-derive title + searchText; ActivityEvent.
- DELETE /api/flex-assets/[id] → set archivedAt (soft).
- POST /api/flex-assets/[id]/reveal → decrypt a password-typed field, RBAC-gated like /api/credentials/[id]/reveal (admin, or an allowTechReveal-style flag on the field).
- Upload: reuse existing attachment upload flow — POST to /api/attachments with flexAssetId+flexFieldKey (add these to the accepted owner keys, same switch that already handles assetId/vendorId/locationId).
Search: extend app/app/api/search/route.ts — add a prisma.flexAsset.findMany to the Promise.all, matching title/searchText, filtered by scopeClientId when present and by getClientScope() otherwise (reuse the existing scope import already in that file); return under a new `flexAssets` key + include it in the empty-result default object. A cross-layout index page GET /api/flex-assets?layoutId= backs /flex/[slug].


### webUI
See webUI (settings designer + /flex/[slug] index + client tab + /flex/asset/[id] detail; all on .btn/.data-table/.field/.badge-*/--color-* primitives, reusing RelationLinker.tsx and AttachmentsPanel).


### mobileUX
First-class, not an afterthought — every surface is single-column and touch-first:
- NAV: showInNav layouts appear in the mobile experience via the existing sidebar drawer (QUICK_LINKS render there too). The 5-slot .dochub-bottombar (components/MobileBottomBar.tsx) stays as-is (Home/Clients/Scan/Search/Vault) — Flexible Assets are reached through Clients→tab and global Search, which is the primary mobile path anyway. Optionally swap "Vault" is NOT done; instead the drawer lists layouts.
- LIST VIEW: on phones the .data-table collapses to stacked cards (one card per instance: title bold, showInList fields as label/value rows, client+location muted) — reuse the responsive card pattern the Assets tab already uses; horizontal column tables are wrapped in an overflow-x:auto container so the body never side-scrolls.
- DYNAMIC FORM: single-column .field stack, full-width inputs, all controls ≥44px tall. Field-type touch specifics: select/multiselect use native <select multiple> chips (native picker = best mobile UX); date uses <input type=date> (native wheel); tags is a chip input with a big add button; relation opens RelationLinker's full-screen picker (already mobile-friendly, searchEndpoint + q=) rather than a cramped dropdown; upload uses <input type=file accept capture> so the phone camera can shoot a photo of a serial/cert directly into an upload field; password field shows a 44px reveal/copy pair.
- DETAIL: CopyableText and password reveal expose one-tap 44px copy buttons (huge for reading a value aloud or pasting on-site) with navigator.clipboard. Relation chips are ≥44px tap targets linking straight to the Contact/Asset. Expiry badges (.badge-danger/.badge-warning) are visible above the fold. Sticky bottom "Edit" action bar so the primary action is thumb-reachable, matching DocHub's mobile action-bar convention. The Search result group "Flexible Assets" is tappable from the bottom-bar Search sheet, giving a fast on-site lookup ("what's the SSL expiry for Acme?").


### migration
Additive schema only — safe for the shared dochub Postgres. Steps run ON the box (never SSH): 1) Edit app/prisma/schema.prisma adding the 4 new models (FlexLayout, FlexLayoutField, FlexAsset, FlexAssetRelation), the two back-relations on Client/Location, and the two nullable columns + relation + index on ClientAttachment (flexAssetId, flexFieldKey). 2) Apply with the pinned recipe from memory (feedback_prisma_version_pin): `npx --yes prisma@6 db push` (additive, no data loss — all new tables + nullable columns, no drops/renames), then `prisma generate`. Run the repo's drift check after. 3) No backfill required — existing Asset rows are untouched and Flexible Assets start empty. 4) Optional seed: add app/app/api/admin/seed-flex-layouts/route.ts (mirroring app/api/admin/seed-asset-types/route.ts) that upserts 4-5 starter layouts a former IT Glue user expects — SSL Certificate (domain text, issuer, expiry date+alert, upload), LOB Application (name, vendor relation, url website, support contact relation, notes textarea), Email/DNS (provider select, MX/records textarea), Warranty/Contract (vendor relation, expiry date+alert, doc upload), Wireless/SSID (name, password, VLAN). Idempotent upsert by slug so re-running is safe. Rebuild+redeploy is the standard DocHub Docker flow (watch the watchtower-vs-local-build gotcha in memory — push then let CI, or stop watchtower for a local build).


### risks
1) FIELD-KEY IMMUTABILITY: values are keyed by FlexLayoutField.key; renaming a key after instances exist orphans data. Mitigation: key is derived once from label, editable only while instance count=0; the PUT /fields route rejects key changes otherwise (surface "label editable, key locked" in the designer). 2) PASSWORD SECRECY: password-typed values must use the same encryption helper as Credential (lib/crypto) and never land in searchText or the values Json plaintext; reveal must be RBAC-gated (reuse the /api/credentials/[id]/reveal pattern) or the flexible-asset builder becomes a plaintext-secret leak. 3) RELATION INTEGRITY: FlexAssetRelation is polymorphic (targetType+targetId) so a deleted Contact/Asset leaves a dangling row — resolve targets defensively (skip missing) and add a cleanup on target delete or a nightly reconcile in an existing cron (app/api/cron). 4) SCOPE ENFORCEMENT: every flex-asset route must call getClientScope()/scopeAllows on the owning clientId — easy to forget on the new /api/flex-assets/[id] routes since the client id is one hop away (via FlexAsset.clientId); load clientId first, then gate. 5) SEARCH COST: searchText must be rebuilt on every write and indexed; don't LIKE-scan values Json. 6) CONFUSION WITH CONFIGURATIONS: users may not know when to use a hard-coded Asset type vs a Flexible Asset — the designer copy should say "for hardware/network gear use Asset Types; for everything else (SSL, apps, vendors-of-record, procedures) use Flexible Assets." 7) UPLOAD OWNER SWITCH: adding flexAssetId to ClientAttachment means the upload handler and any attachment-cleanup/scope logic must include the new owner key or files become unreachable/unscoped.


### openQuestions
- Should Flexible Assets be searchable/visible in the Client Portal (portalVisible), or staff-only for v1? IT Glue lets you publish flex assets to the portal — but that adds a scoping surface.
- Do we want layout-level RBAC (restrict a whole layout to admins, e.g. a 'Bank/Finance' layout), or is per-password-field reveal-gating enough for v1?
- Relation targets: include cross-schema records (TicketHub tickets, DocHub Runbooks/Documents/Credentials) or limit v1 to Person/Asset/Vendor/Client/other-FlexAsset?
- Versioning/audit: IT Glue keeps revision history on flex assets — do we want a FlexAssetVersion table now (like RunbookVersion/DocumentVersion) or defer?
- Should flex layouts be importable/exportable as JSON templates (share the 'SSL Cert' schema between shops), matching IT Glue's template gallery?
- Global (client-agnostic) flex assets — IT Glue supports org-level AND global flex assets; do we allow clientId-null 'internal' flex assets, or force every instance onto a client?


## Password rotation reminders — age-based rotation policy (global default + per-credential override/exempt), read-time surfacing in the unified alerts/Alarm feed, a nightly notification digest, a one-click "Mark rotated" action, and rotation status on every credential card.

**Effort:** M


### benchmark
Two reference points, and DocHub can beat both. HUDU (support.hudu.com Password Management + the open "Password Expiration" Canny request): Hudu's "Expiring Soon" is purely date-based (a manually-entered expiration date on an asset/password, plus auto-tracked domain/SSL), with a per-user "expiration notifications trigger days" lead time on the dashboard. Hudu has NO native password-AGE / rotation-staleness computation — users have literally filed a feature request for it. So DocHub computing "overdue for rotation" from lastRotated is genuinely ahead of Hudu. Emulate Hudu's configurable trigger-days lead time (a "due soon" warning window) and its single unified "expiring soon" surface. IT GLUE (itglue.com/features/password-rotation, help.itglue.kaseya.com Password Rotation Scheduler): rotation frequency configurable per schedule in DAYS 1–365, a per-password toggle to EXCLUDE a password from the schedule (then rotate manually), complexity criteria, and it ingests AD/Entra "last password reset" + "password expiries" into the record. Emulate: interval expressed in days 1–365, a per-credential exempt/exclude toggle, and reuse DocHub's EXISTING Graph rotate (app/api/credentials/[id]/rotate) as the "1-click rotate" for creds with a linked Person m365Upn. Avoid IT Glue's mistakes: their rotation is an add-on (Network Glue/Quickpass) limited to AD/Entra/M365 — DocHub should track rotation AGE for ALL credential types including MANUAL ones, and pair it with a lightweight "Mark rotated" for out-of-band changes so the reminder works even when no automation exists. Do not adopt forced-rotation dogma silently: default the interval but make it fully overridable and exemptable (see openQuestions re NIST).


### dataModel
Additive, Credential model only (prisma/schema.prisma line 439). lastRotated (DateTime?) already exists and is already stamped by the password PATCH branch (app/api/credentials/[id]/route.ts) and by the Graph rotate route — reuse it as the rotation baseline; where null, fall back to createdAt so every existing cred gets an immediate sensible due date. Add:
  rotationIntervalDays Int?      // per-credential override in days (1–365); null = use global default
  rotationExempt       Boolean  @default(false)  // IT-Glue-style exclude: never flag (service/vendor-managed/break-glass creds)
  rotationSnoozedUntil DateTime?  // "dismiss for a while" — suppresses the reminder until this date
Optional but recommended for the cron/feed scan: @@index([isRetired, lastRotated]).
NO changes to Alarm — rotation items are computed-on-read in the unified feed exactly like every other expiry category already is (ssl/domain/warranty/etc. in alerts/unified/route.ts are all compute-on-read), so no persistent rows and no dedupe/idempotency machinery are needed; snooze/exempt/mark-rotated are the lifecycle instead.
Global defaults live in the existing AppSetting key/value table (schema line 818) — same mechanism as the current alerts:threshold:* / alerts:categories:* keys, read with a `?? default` fallback so no seed migration is required:
  rotation:enabled            default "true"
  rotation:policy:defaultDays default "90"   (1–365)
  rotation:threshold:warnDays default "14"   ("due soon" lead time, mirrors Hudu trigger-days)


### apiRoutes
New shared helper lib/rotation.ts (pure, import-safe on client): getRotationSettings() reads the three AppSetting keys with defaults; computeRotation(cred, settings) -> { policyDays, baseline (lastRotated ?? createdAt), dueAt, status: 'exempt'|'snoozed'|'ok'|'dueSoon'|'overdue', daysUntilDue, daysOverdue }; rotationUrgency(daysOverdue) -> AlertUrgency ('expired' when >0 overdue mapped to 'critical'/'warning' by magnitude).

1. POST /api/credentials/[id]/mark-rotated (NEW) — requireAuth() + scopeAllows(getClientScope(), cred.clientId). The clear "mark rotated" action for out-of-band changes: sets lastRotated=now, clears rotationSnoozedUntil, writes a FieldHistory row (entityType "credential", field "rotation", changedBy session.user.name) exactly like the Graph rotate route does. Returns the lite cred (encrypted* stripped, hasPassword flags) so the card can update in place. (The existing Graph rotate route and the password-change PATCH already stamp lastRotated, so real rotations auto-satisfy the policy — mark-rotated covers the manual case.)

2. PATCH /api/credentials/[id] (EXTEND, app/api/credentials/[id]/route.ts) — add quick-update branches following the existing single-key isFavorite / allowTechReveal pattern: { rotationExempt } (ADMIN-gated, like allowTechReveal), { rotationIntervalDays } (null clears override; clamp 1–365), { rotationSnoozedUntil }. Each returns the lite cred.

3. GET /api/alerts/unified/route.ts (EXTEND) — in the credentials Promise.all branch also select lastRotated, createdAt, rotationIntervalDays, rotationExempt, rotationSnoozedUntil. After the existing expiryDate credential items, gated by rotation:enabled, compute rotation status per cred and emit UnifiedAlert for status 'overdue' (and optionally 'dueSoon'): category "credential", new optional field kind:"rotation" (tag existing expiry items kind:"expiry"), label=cred.label, sublabel=`Rotation overdue · ${daysOverdue}d` , expiresAt=dueAt.toISOString(), urgency=rotationUrgency(...), linkPath=`/clients/${clientId}?tab=Credentials`. Respects the same clientId filter and requireAuth already there; client-scope filtering is inherited. This is what puts it "in the Alarm feed / bell / /expirations page" instantly.

4. GET /api/cron/credential-rotation (NEW, or fold into existing /api/cron/alerts) — requireCronSecret(req). No-op if rotation:enabled=="false". Scan credential.findMany({ isRetired:false, rotationExempt:false }), computeRotation, keep 'overdue' and 'dueSoon' not snoozed, then REUSE the existing digest pipeline from /api/cron/alerts — build ExpirationDigestItem-style rows (category "Password rotation", expiresAt=dueAt) and fan out through sendPush / postExpirationDigestToTeams / sendMessage("expiration_digest"). Recommended: add "Password rotation" as a new category in the existing nightly /api/cron/alerts digest (gated by alerts:categories:credentialrotation !== "false") so it's one notification through the already-wired email/Teams/push channels, rather than a second cron.

5. GET /api/clients/[id]/credentials (already returns lastRotated via `...c` spread) — the three new fields flow through automatically; just confirm they're not stripped.

6. Global settings write route (EXTEND the existing AppSetting settings handler that already upserts alerts:threshold:*) — add upserts for the three rotation:* keys.


### webUI
All in app/app/clients/[id]/page.tsx credential card (renders ~line 2705). (a) Header badge cluster (~2711–2749, next to the ADMIN/TEAM badge): add a rotation status badge computed from cred via a small in-file helper mirroring lib/rotation — overdue = red badge (.badge-danger / token --danger) "Rotate · 34d overdue"; dueSoon = amber (.badge-warning / --warn) "Rotate in 6d"; ok = muted "Rotated 12d ago"; exempt = muted "No rotation". (b) Action row (~2750–2774, alongside Rotate ↻ / Retire): add a "Mark rotated" button (.btn .btn-sm) -> POST mark-rotated then update cred.lastRotated in state; on overdue creds also a "Snooze 30d" link -> PATCH { rotationSnoozedUntil }. (c) Edit form (~2777–2826): add "Rotation interval (days, blank = default 90)" number input bound to rotationIntervalDays and, ADMIN-only, an "Exempt from rotation" checkbox bound to rotationExempt (reuse the toggleCredAllowTechReveal pattern). (d) Free wins: the /expirations page and the Alarm bell both consume alerts/unified, so rotation items appear there once (3) lands; add a "credential · rotation" filter affordance and a one-click "Mark rotated" on the alert row. (e) Global Settings page: a "Password rotation" block (default interval, warn lead days, enable toggle) using .field inputs next to the existing alert-threshold settings. Bonus: on the client Dashboard favorited-credentials list, show the same badge.


### mobileUX
Credential cards already stack single-column and the whole client page uses the .dochub-bottombar shell, so the surface is native-friendly — the work is touch sizing and wrapping. (1) The card header flex (currently justifyContent:space-between) must get flexWrap:"wrap" on the left badge cluster so the rotation badge drops onto its own line on narrow screens instead of squeezing the label. (2) Action-row buttons are currently tiny text buttons — on mobile "Mark rotated" and "Snooze" must be >=44px tap targets; render them as full-width .btn stacked below the card body under a 640px media query (or move the low-frequency actions into a kebab/overflow sheet, keeping "Mark rotated" primary and always visible). (3) The Alarm bell and /expirations feed are already mobile lists; rotation items appear as standard rows — give each row a one-tap "Mark rotated" (44px) that calls the mark-rotated route directly so a tech can clear a reminder from the phone without opening the client. (4) Snooze uses a native confirm / simple bottom action rather than a date picker to stay thumb-friendly. (5) Badges use existing token colors so they render correctly in the PWA's light/dark themes. No offline write path needed (rotation is low-frequency and requires the secret store); reads work from the normal cached feed.


### migration
Fully additive: `cd /home/msaville/dochub/app && npx prisma db push` on the shared dochub DB — rotationIntervalDays (nullable), rotationExempt (Boolean default false), rotationSnoozedUntil (nullable) add with no table rewrite risk and pass the drift check; optional @@index builds online. No data backfill: computeRotation falls back to createdAt when lastRotated is null, so existing creds get due dates immediately. AppSetting defaults are read with `?? "90"/"14"/"true"` fallbacks, so nothing needs seeding — the Settings UI upserts them on first save. IMPORTANT first-run mitigation (see openQuestions): because many old creds have null lastRotated, they may all light up overdue-from-createdAt on the first cron/feed load; ship an ADMIN bulk "Acknowledge / mark all rotated today" action (updateMany lastRotated=now over a client's or all non-exempt creds) so the team can zero the baseline once instead of drowning in alerts.


### risks
First-run alert flood from null-lastRotated creds baselined at createdAt (mitigated by the bulk-acknowledge action + optionally treating never-rotated as dueSoon not overdue). Double-notification if BOTH a new dedicated cron and the existing /api/cron/alerts digest emit rotation items — pick one writer (recommend folding into /api/cron/alerts). Semantic overlap: expiryDate (a hard expiry the vendor sets) vs rotation-age (a policy) are different — keep them as distinct kind tags in the feed so the card and /expirations don't show a cred twice with confusing copy. Policy debate: NIST 800-63B discourages forced periodic rotation, but MSP client contracts often mandate it — hence default-on-but-overridable-and-exemptable, never silent. Graph rotate only covers creds with a linked Person m365Upn; the reminder must not imply auto-rotation exists for manual creds (that's exactly why Mark rotated exists).


### openQuestions
- Default interval: 90 vs 180 days? (NIST discourages forced rotation; client compliance often mandates ~90 — I defaulted 90, fully overridable.)
- First run: treat never-rotated creds (lastRotated null) as overdue-from-createdAt, or as 'dueSoon/unknown' until an explicit baseline is set, to avoid an alert flood? (I propose baseline=createdAt + a one-time bulk-acknowledge action.)
- Do you want persistent, dismissible Alarm ROWS (operational category, add Alarm.dedupeKey @unique) instead of compute-on-read? Compute-on-read + snooze field is simpler and matches every other expiry category — chosen unless you want per-alarm dismissal history.
- Per-CLIENT policy tier (e.g. a client contractually needs 60/30 days) via Client.rotationDefaultDays, or is global-default + per-credential override enough for v1?
- Should DocHub add IT-Glue-style SCHEDULED auto-rotation (fire the existing Graph rotate on a cadence for m365Upn creds) rather than reminder-only? Reminder-only for v1?


## Full-fidelity structured export (JSON/ZIP) + in-app scheduled encrypted self-backup with retention, admin UI, verify & restore

**Effort:** L


### benchmark
IT Glue (help.itglue.kaseya.com "Exporting and backing up account data"): export ONE org or the WHOLE account; CSV-per-asset-type; optional password-encryption of the archive; passwords + OTP secret keys and activity logs are EXCLUDED by default and opt-in; automated recurring account exports as backups; download link expires after 48h. Hudu (support.hudu.com "Self-Hosted Backups and Restores" + Security whitepaper): self-hoster owns backups via a pg_dump script in docker-compose shipping to an S3 bucket; export limited to super-admin; AES-256-GCM + PBKDF2; managed tier keeps daily backups 7 days with PITR; restore = drop the .sql dump in the app dir, `docker compose down`, `psql` restore, bring up.

EMULATE: (a) per-client AND whole-tenant scope like IT Glue org/account; (b) secrets excluded/kept-encrypted by DEFAULT, decrypt explicit + audited; (c) scheduled recurring encrypted backups with retention; (d) restore documented as an offline CLI step, never a live-DB UI button (Hudu model). AVOID: IT Glue's opaque CSV-only export that loses relations (we ship relational JSON with FK cuids so it rehydrates); avoid Hudu's assumption that pg_dump exists in-container — DocHub's node image has no pg_dump, so we do an APPLICATION-LEVEL logical dump via Prisma (reusing the export serializer), which also lets us apply the per-field secrets policy a raw pg_dump can't. Time-box download links like IT Glue's 48h expiry.


### dataModel
Additive-only. Two new models; no changes to existing rows. Do NOT reuse `BackupConfig`/`SynologyBackupJob` (those document CLIENTS' backups, keyed to `Client`/`nextVerifyBy`) — name ours `Platform*` to avoid semantic collision.

model PlatformBackupSchedule {
  id             String    @id @default("default") // singleton, upserted on first read
  enabled        Boolean   @default(false)
  frequency      String    @default("daily")     // daily|weekly
  hourUtc        Int       @default(7)            // 0-23; server is UTC
  weekday        Int?                             // 0-6 when weekly
  retentionCount Int       @default(14)           // keep N newest scheduled runs
  includeUploads Boolean   @default(true)         // bundle /uploads bytes into the .enc
  secretsMode    String    @default("encrypted")  // encrypted|decrypted|omit
  target         String    @default("local")      // local|s3 (s3 covers MinIO via endpoint)
  s3Bucket       String?
  s3Prefix       String?
  s3Endpoint     String?                          // MinIO-compatible
  s3AccessKey    String?
  s3SecretKeyEnc String?                          // encrypted via lib/crypto.ts
  lastRunAt      DateTime?
  nextRunAt      DateTime?
  updatedAt      DateTime  @updatedAt
}

model PlatformBackupRun {
  id             String    @id @default(cuid())
  kind           String    @default("scheduled")  // scheduled|manual|export
  status         String    @default("running")    // running|success|failed
  scope          String    @default("tenant")     // tenant|client (export rows)
  clientId       String?                           // set for kind=export scope=client
  startedAt      DateTime  @default(now())
  finishedAt     DateTime?
  storagePath    String?                           // /backups/dochub_20260717_0700.enc or s3 key
  sizeBytes      BigInt?
  sha256         String?                           // checksum of the ciphertext file
  itemCounts     Json?                             // {clients,assets,credentials,attachments,...}
  secretsMode    String    @default("encrypted")
  includeUploads Boolean   @default(true)
  encrypted      Boolean   @default(true)
  verifiedAt     DateTime?
  verifyStatus   String?                           // ok|checksum_mismatch|missing|undecryptable
  error          String?
  triggeredBy    String?                           // StaffUser.id or "cron"
  @@index([startedAt])
  @@index([status])
  @@index([kind])
}

Config could alternatively live in `AppSetting` key/value, but a typed singleton is cleaner and run history needs a real table anyway. No new enums (string unions kept as String to stay migration-cheap and drift-safe). Secrets inventory the serializer must honor: `Credential.encrypted{Password,Totp,Notes}` (client creds — crown jewels), `PersonalCredential.*`, `PersonalSecureNote.encryptedBody`, `PortalCredential.*`, `SynologyConfig.encryptedPassword`, `EphemeralNote.encryptedContent`.


### apiRoutes
Keep the existing redacted CSV route `app/app/api/export/[entity]/route.ts` untouched. Add:

FULL EXPORT (migration-out)
- POST `app/app/api/export/full/route.ts` — `requireAuth("ADMIN")` for scope=tenant; for scope=client allow ADMIN or a TECH whose `getClientScope()`/`scopeAllows(scope, clientId)` covers it. Body {scope:"tenant"|"client", clientId?, secrets:"encrypted"|"decrypt"|"omit", includeAttachments}. `secrets:"decrypt"` requires fresh vault re-auth (same gate as credential reveal) + logs an `ActivityEvent`. Creates `PlatformBackupRun{kind:"export"}`, kicks engine (fire-and-forget), returns {jobId}.
- GET `app/app/api/export/full/[jobId]/route.ts` — poll; on success stream the ZIP (`Content-Disposition: attachment`, `Cache-Control: private, no-store`). Link auto-expires after 48h (IT Glue parity); GET past expiry 410s and file is pruned.
  ZIP layout: `manifest.json` (schemaVersion, git sha, exportedAt, scope, secretsMode, counts), one NDJSON per model (`clients.ndjson`, `assets.ndjson`, `credentials.ndjson`, …) with FK cuids preserved so relations rehydrate, and `attachments/<storageName>` bytes from `/uploads` when includeAttachments.

SCHEDULED SELF-BACKUP
- GET/PUT `app/app/api/admin/backups/schedule/route.ts` — `requireAuth("ADMIN")`; upsert/read the singleton (encrypt `s3SecretKey` via `lib/crypto.ts`, never return it).
- POST `app/app/api/admin/backups/run/route.ts` — ADMIN; enqueue manual run (`kind:"manual"`), return {runId}.
- GET `app/app/api/admin/backups/runs/route.ts` — ADMIN; list runs newest-first.
- GET `app/app/api/admin/backups/[id]/download/route.ts` — ADMIN; default streams the encrypted `.enc`; `?decrypt=1` requires vault re-auth and decrypts on the fly (audited).
- POST `app/app/api/admin/backups/[id]/verify/route.ts` — ADMIN; re-stat file/s3 object, recompute sha256 vs stored, decrypt-probe header + gunzip magic; write `verifiedAt`/`verifyStatus`.
- GET `app/app/api/cron/self-backup/route.ts` — `requireCronSecret(req)` (fails closed like other crons); if `enabled && nextRunAt<=now`, create run, execute engine, recompute `nextRunAt`, prune to `retentionCount` (delete oldest files + rows). A full backup can exceed the request window, so the route marks the run `running`, launches the engine detached, returns immediately; the run row is progress state.

Shared engine (new): `lib/backup/serialize.ts` (Prisma → per-model records honoring secretsMode + scope, reusing `getClientScope`/`scopeWhere`), `lib/backup/engine.ts` (archiver-stream ZIP or gzip → AES-256-GCM encrypt-stream → write local `/backups` or S3/MinIO → sha256 → retention prune), `lib/backup/crypto-stream.ts` (`createCipheriv("aes-256-gcm")` keyed by new `BACKUP_ENCRYPTION_KEY`, envelope `DHB1` magic + version + 12-byte IV + ciphertext + 16-byte GCM tag). Backups use a SEPARATE key from `ENCRYPTION_KEY` so a bundle carrying decrypted secrets is still encrypted-at-rest.


### webUI
New page `app/app/admin/backups/page.tsx` (beside `app/admin/{access,audit,messages}`), ADMIN-gated. Three blocks on the existing component library:

1) Health hero — a `.state-box` showing last successful backup age, colored by freshness (accent/green < interval, amber 1 interval late, red/`badge-critical` >2 late or last run failed), size, item counts. The single glance that answers "is my documentation safe?".
2) Schedule form — `.field` inputs: enabled toggle, frequency + hourUtc + weekday, retentionCount, includeUploads checkbox, secretsMode select (with inline warning that "decrypted" writes plaintext client passwords into the bundle — encrypted-at-rest only), target local/S3-MinIO with conditional bucket/prefix/endpoint/keys. Save = `.btn-primary`.
3) Run history — `.data-table` (started, kind badge, status `.badge-success`/`.badge-critical`, size, verify status) with per-row `.btn` Download / Verify. Top actions: `.btn-primary` "Run backup now" + link to Full JSON Export.

Full-export UI: extend the admin export surface with a "Full Export (JSON)" panel — scope picker (This client / Whole tenant), secrets radio (Keep encrypted [default] / Decrypt [reveal-gated] / Omit), include-attachments checkbox, `.btn-primary` "Generate export" → progress → download; a `.state-box` restates the 48h link expiry. Restore is intentionally NOT a UI button — a collapsible "How to restore" panel documents the CLI (`scripts/restore-backup.sh`), matching Hudu's offline-restore posture.


### mobileUX
First-class, not an afterthought. Reach: add a Backups entry under Admin so it surfaces in the `.dochub-bottombar` Admin/Settings tab.

- Single column throughout; the health hero is a full-width card at top — the owner opens the Admin tab and instantly sees a green/amber/red "Last backup 6h ago, 4.2 MB, verified" tile without scrolling. This is the primary mobile job.
- Run history: below 640px the `.data-table` collapses to stacked cards (one run/card: status badge + timestamp headline, size/verify as sub-rows), never a horizontally-scrolling table; if kept as a table it lives in an `overflow-x:auto` wrapper.
- Every action is a full-width >=44px `.btn`: "Run backup now" (`.btn-primary`), Download, Verify stack vertically with `--space-*` gaps; no hover-only affordances.
- Schedule fields stack single-column, native `<select>`/`<input type=number>`; the secretsMode "decrypted" warning renders inline as a `.state-box` so it can't be missed on a small screen.
- Download on mobile: the encrypted `.enc` triggers a normal browser download; where available use `navigator.share({files})` so the bundle can go to Files/AirDrop from the PWA (consistent with DocHub's existing iOS share pattern) rather than trapping in a standalone webview.
- Decrypt-gated actions reuse the existing mobile vault re-auth sheet.
- Offline: page is read-mostly; if offline the SW serves the last-cached health tile with a stale badge — never a blank screen.


### migration
`prisma db push` (additive: 2 new models, no column changes to existing tables) — zero drift risk; DocHub runs its OWN `db:5432/dochub` Postgres per docker-compose.yml, so no cross-app blast radius. Seed: upsert a disabled `PlatformBackupSchedule{id:"default"}` on first GET (no data backfill). No migration of existing `BackupConfig` data.

Env + infra (all additive):
- New `BACKUP_ENCRYPTION_KEY` = `openssl rand -hex 32`, added to the app service env in docker-compose.yml and `.env`; documented in the project Credentials.md as unrecoverable-if-lost.
- Compose: add named volume `backups:` mounted `backups:/backups` on the app service (mirrors `uploads:/uploads`); add to the `volumes:` block. Optional `BACKUP_S3_*`/MinIO envs only if target=s3 (adds `@aws-sdk/client-s3` — the only new dep, and only when S3 is used; local target adds only `archiver`).
- Host crontab (same box/pattern as existing DocHub sync/camera crons): `*/15 * * * * curl -fsS -H "Authorization: Bearer $(grep ^CRON_SECRET /home/msaville/dochub/.env | cut -d= -f2-)" https://dochub.pcc2k.com/api/cron/self-backup >> /home/msaville/dochub/cron.log 2>&1`. The route self-gates on nextRunAt so a 15-min poll ≠ 15-min backups.
- Existing `backup-uploads.sh` stays as a belt-and-suspenders offsite copy; if includeUploads=true the app-level bundle is self-contained so it becomes optional but harmless.
- Restore is a new `scripts/restore-backup.sh` (decrypt with BACKUP_ENCRYPTION_KEY → gunzip → `prisma migrate deploy` on empty DB → load NDJSON), documented, never run automatically.
- Offsite caveat for deploy notes: `/backups` on the same host/disk as the Postgres volume is a single point of failure — recommend target=s3/MinIO or rsync `/backups` offsite for real DR.


### risks
CROWN-JEWEL FILE: a secretsMode=decrypted bundle contains every client password in plaintext-after-decrypt; mitigated by always AES-256-GCM encrypting the file at rest with BACKUP_ENCRYPTION_KEY (separate from ENCRYPTION_KEY) + vault re-auth + audit on decrypt-download. KEY LOSS = TOTAL LOSS: losing BACKUP_ENCRYPTION_KEY makes every backup unrecoverable — document in Credentials.md, store offsite; no key-rotation for old bundles (rotation affects future runs only). LONG-RUN TIMEOUT: a full tenant backup with /uploads can exceed the Next route window — engine runs detached, run row is progress state; memory must stay bounded by STREAMING (archiver + streaming cipher), never buffering the whole ZIP (mind BigInt sizeBytes, large attachment sets). SINGLE-DISK DR: local `/backups` beside the DB volume is not real DR — push to S3/MinIO or rsync offsite. DESTRUCTIVE RESTORE: no UI restore button; CLI-only into an empty DB to avoid clobbering live data. LOGICAL-DUMP GAP: app-level Prisma dump captures Prisma-modeled rows, not raw DB objects/sequences — acceptable since restore recreates schema via `prisma migrate deploy`, but it is not a byte-identical pg_dump. 48H expiry + retention pruning must delete FILES, not just rows, or the disk fills.


### openQuestions
- Migration-out default: ship secrets as kept-ciphertext (portable only with ENCRYPTION_KEY, safest) or offer decrypted-on-export as the norm since a departing client legitimately needs their own passwords? Recommend ciphertext default + audited decrypt opt-in.
- Offsite target for v1: wire S3/MinIO now (adds @aws-sdk/client-s3) or ship local-/backups-volume only and rely on rsync/backup-uploads.sh-style offsite first?
- Bundle /uploads bytes INTO the encrypted backup (self-contained restore, much larger) or keep DB dump and uploads as separate artifacts (smaller, restore must pair them)?
- Retention by count only, or also a max-age / GFS daily-weekly-monthly policy like enterprise DR?
- Should per-client full export be available to a scoped TECH for their own clients, or ADMIN-only like the current CSV export?
- Reuse ENCRYPTION_KEY for backups (one key to guard) vs a dedicated BACKUP_ENCRYPTION_KEY (recommended — isolates blast radius, two keys to manage)?


## Document + SOP Template Library — a unified Template model backing both ClientDocument and Runbook(SOP), a "start from template" picker wired into both create flows, an ADMIN template manager with categories, and a seeded starter library of ~16 common MSP SOPs/docs.

**Effort:** L


### benchmark
Hudu "KB Templates": any global- or client-level article can be flagged as a template; new articles are created as an exact copy ("child article") of the template; children edit freely without mutating the parent, and the parent lists its children in a sidebar. Emulate: (1) copy-on-instantiate semantics — a template seeds a real, independently-editable ClientDocument/Runbook, never a live-linked reference; (2) promote-an-existing-record-to-template ("designate as template"); (3) track parent to children via sourceTemplateId. IT Glue "Template Library": ships best-practice, structured starting points and separates procedural docs (SOPs/KB, edited as documents) from checklists that support execution — which maps cleanly onto DocHub's existing split of Runbook.content (markdown narrative) + RunbookStep (tick-off checklist) + RunbookRun. IT Glue's "Smart SOP Generator" is already mirrored by DocHub's /api/runbooks/draft (Claude); keep it as a third entry path. AVOID: IT Glue's rigid typed flexible-asset schema (over-engineered for a small shop; DocHub docs are free markdown, keep it that way) and Hudu's lack of variable substitution (we add {{client.name}}/{{date}}/{{tech.name}} resolved at instantiate). Sources: hudu.com/tips_and_tricks_kb_templates, itglue.com/features/library/.


### dataModel
All additive. Add to prisma/schema.prisma:

enum TemplateKind { DOCUMENT RUNBOOK }

model TemplateCategory {
  id String @id @default(cuid())
  name String @unique
  color String @default("#6366f1")
  order Int @default(0)
  createdAt DateTime @default(now())
  templates Template[]
}

model Template {
  id String @id @default(cuid())
  kind TemplateKind
  name String                 // label in the picker/gallery
  description String?          // one-line "what/why" on the picker card
  categoryId String?
  titleTemplate String?       // default title of created record; supports {{client.name}} etc. Falls back to `name`.
  summary String?             // seeds Runbook.summary (RUNBOOK only)
  content String?             // markdown body seed — copied to ClientDocument.content or Runbook.content
  stepsJson Json?             // RUNBOOK checklist seed: [{title, notes}] -> RunbookStep rows
  tagNames String[]           // RUNBOOK: tag names ensured/attached on instantiate (native PG text[])
  defaultCategoryName String? // applied to created record: ClientDocument.category (free string) OR RunbookCategory.name (upserted)
  isSeed Boolean @default(false)
  seedKey String? @unique     // stable idempotency key for re-seed/upgrade (e.g. "sop.client-onboarding")
  isArchived Boolean @default(false)
  isPublished Boolean @default(true)
  usageCount Int @default(0)
  createdBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  category TemplateCategory? @relation(fields: [categoryId], references: [id])
  @@index([kind, isArchived, isPublished])
}

Provenance (Hudu parent to child), additive nullable columns:
  ClientDocument: add `sourceTemplateId String?` + @@index([sourceTemplateId]).
  Runbook:        add `sourceTemplateId String?` + @@index([sourceTemplateId]).
Keep it a soft pointer (no FK) so archiving/deleting a template never cascades into real client records; if a relation is wanted use Template? with onDelete: SetNull.

Rationale for ONE polymorphic Template (vs two): the doc and SOP editors diverge only by summary/steps/tags; a single table gives one picker query, one admin manager, one seed script, one usageCount analytic. kind + nullable RUNBOOK-only fields keep it clean.


### apiRoutes
New folder app/api/templates (mirrors app/api/runbooks: requireAuth, prisma, NextResponse):

- GET /api/templates?kind=&categoryId=&search=&includeArchived= — picker/gallery list. requireAuth(). where {isPublished:true,isArchived:false,kind?,categoryId?,name/description contains search}; include category; order [usageCount desc, name asc].
- POST /api/templates — create. requireAuth("ADMIN"). Body {kind,name,description,categoryId,titleTemplate,summary,content,stepsJson,tagNames,defaultCategoryName}; zod-validate stepsJson shape [{title,notes}].
- app/api/templates/[id]/route.ts GET/PATCH/DELETE — PATCH+DELETE requireAuth("ADMIN"). DELETE on isSeed=true soft-archives (isArchived=true) so re-seed can restore; non-seed hard-deletes.
- app/api/templates/[id]/instantiate/route.ts — the workhorse. requireAuth(). Body {clientId?,folderId?,overrides?:{title?}}. RUNBOOK: clientId optional (null = global SOP, matches current Runbook.clientId nullable). DOCUMENT: clientId REQUIRED and enforce scopeAllows(await getClientScope(), clientId) (403 otherwise). Resolve placeholders via a fixed allowlist ({{client.name}} from prisma.client.findUnique, {{date}}, {{tech.name}} from session). Then DOCUMENT -> clientDocument.create({clientId,folderId,title,content,category:defaultCategoryName,sourceTemplateId}); RUNBOOK -> upsert RunbookCategory by defaultCategoryName, ensure RunbookTag rows for tagNames, runbook.create({title,summary,content,categoryId,clientId,sourceTemplateId,steps:{create:stepsJson},tags:{create}}). Increment usageCount. Return {redirect: RUNBOOK? `/runbooks/${id}/edit` : `/clients/${clientId}/documents/${id}`}.
- app/api/templates/from-existing/route.ts — "designate as template" (Hudu). requireAuth("ADMIN"). Body {kind,sourceId}; copies an existing Runbook/ClientDocument's title/content/summary/steps/tags into a new Template (isSeed=false).
- app/api/template-categories/route.ts + [id] — CRUD cloned from app/api/runbook-categories/route.ts; writes requireAuth("ADMIN").
- app/api/templates/reseed/route.ts — requireAuth("ADMIN"); runs the idempotent upsert-by-seedKey logic (same as seed script) to restore/upgrade the starter library.

Existing /api/runbooks/draft (Claude SOP generator) stays; picker offers Blank / From template / AI draft.


### webUI
Reuse the component library (.btn/.btn-primary, .filter-input, .data-table, .badge-*, .field, .state-box) + tokens.

1. Gallery — new app/templates/page.tsx: kind segmented toggle (Documents | SOPs), category filter chips (colored .badge from TemplateCategory.color), .filter-input search, responsive card grid minmax(280px,1fr). Each card: name, description, category badge, kind icon, usageCount ("used 12x"), primary "Use template" button that opens the target step then calls /instantiate. Add a nav entry near Runbooks in components/AppShell.tsx.
2. Shared <TemplatePicker kind clientId? onPicked> — modal (desktop) fetching /api/templates?kind=, card list, on select calls /instantiate then router.push(redirect). Reusable piece for both flows.
3. Wire into create flows: app/runbooks/new/page.tsx gets a chooser "Start blank / From template / AI draft" ahead of RunbookEditor ("From template" mounts <TemplatePicker kind="RUNBOOK">). The per-client documents UI (components/MergedDocumentsPanel.tsx + app/api/clients/[id]/documents) gets a "New from template" button beside "New document" mounting <TemplatePicker kind="DOCUMENT" clientId={id}>.
4. Admin manager — new app/settings/templates/page.tsx (requireAuth("ADMIN") guard): .data-table of all templates (name, kind badge, category, usageCount, published/archived) with edit/archive/delete row actions; a "Manage categories" panel reusing RunbookEditor's PRESET_COLORS swatch pattern; a "Re-seed starter library" button hitting /api/templates/reseed; and a TemplateEditor (fork of RunbookEditor.tsx) with name/description/category/titleTemplate/content markdown write+preview via marked, plus steps+tags editors shown only when kind=RUNBOOK, and a placeholder hint listing the supported {{...}} tokens.


### mobileUX
First-class, not bolted on:
- TemplatePicker renders as a bottom-sheet (not centered modal) on <=640px: slides up from bottom, full width, rounded top, max-height 85vh, internal overflow-y scroll, sticky search bar at top and sticky "Use this template" action bar (>=44px) at bottom; sits above .dochub-bottombar (higher z-index or hide the bottombar while open).
- Gallery app/templates: single-column card stack; kind toggle and category chips are a horizontal scroll-snap row (matches existing tab scroll-snap); each card is a full-width tap target, "Use template" button full-width and 44px tall.
- Instantiate target step (choosing client/folder for a DOCUMENT): stacked large-row select list using .field, not a cramped dropdown. For SOPs the client picker is optional (default "Global SOP") so a tech can one-tap a template into a global runbook from the phone.
- After instantiate, router.push straight into the responsive RunbookEditor/doc editor: tap template -> land in editable copy, no desktop-only intermediate.
- Admin /settings/templates collapses the .data-table into stacked cards on mobile (existing responsive treatment) with an overflow "..." menu so edit/archive stay >=44px and nothing scrolls horizontally.
- Chips and toggle use tokens so they theme correctly on the phone.


### migration
1. Add the enum, TemplateCategory, Template models + the two nullable sourceTemplateId columns to prisma/schema.prisma. All additive (new tables + nullable columns + nullable array column) -> zero risk on the shared 'dochub' Postgres. 2. Apply with the repo standard `npx prisma db push` (drift-checked); regenerate client. String[] maps to native Postgres text[] — no extra migration. 3. Seed via a new idempotent scripts/seed-templates.mjs (pattern of scripts/backfill-*.mjs already in repo): upsert TemplateCategory rows first, then for each seed def prisma.template.upsert({ where:{ seedKey }, create:{...,isSeed:true}, update:{ /* gate content re-push behind a --force flag so admin edits survive */ } }). Run once after db push (`node scripts/seed-templates.mjs`); same logic exposed at POST /api/templates/reseed for re-runs/upgrades. seedKey guarantees no duplicates and lets later releases ship new starter templates. No backfill of existing ClientDocument/Runbook rows (sourceTemplateId stays null for pre-existing records).

Seed set (~16 proposed): DOCUMENT — Client/Site Overview & Network Doc, Client Contacts & Escalation, Backup & DR Overview, Wireless/SSID Doc, Firewall/Network Config, Email/M365 Tenant Doc, Line-of-Business App Doc, Vendor & Warranty Register, Password/Access Policy. RUNBOOK/SOP — New Client Onboarding Checklist, Employee Onboarding (new user), Employee Offboarding (deprovision), Backup Verification/Restore Test, Incident Response (security), Server/Workstation Patch & Reboot, Workstation Setup/Imaging, Domain Join/Rename. Ship each with content markdown + (for SOPs) a stepsJson checklist and tagNames, using {{client.name}}/<PLACEHOLDER> markers per the existing draft-route style.

Risks: DOCUMENT instantiate MUST enforce scopeAllows()/getClientScope() on the target clientId (ClientDocument is client-scoped) — Template rows themselves stay global, not scoped. Placeholder resolution must be a fixed allowlist, not eval. Re-seed must not clobber admin edits (gate update fields or hash-compare). Polymorphic kind means RUNBOOK-only fields are null for DOCUMENT — instantiate/UI must branch on kind. Validate stepsJson shape with zod on write. Category delete uses onDelete SetNull (categoryId nullable). sourceTemplateId is a soft pointer so it can dangle after a hard-delete (acceptable, provenance only). Open questions: (1) Should DOCUMENT templates be instantiable only into a client, or also as global/internal KB docs (ClientDocument currently requires clientId)? (2) Re-seed behavior on admin-edited templates: skip / restore-to-default / force-overwrite? (3) Ship Hudu-style "promote existing record to template" (/api/templates/from-existing) in v1 or defer? (4) Should the AI draft path also save its output AS a reusable template? (5) Nav: own top-level item or a tab under Runbooks/Docs?


## Tamper-evident (append-only, hash-chained) AuditLog for DocHub — an immutable secure audit trail alongside the existing mutable FieldHistory/ActivityEvent views, with a single write helper, HMAC hash-chain integrity, a verify endpoint + CLI, an admin viewer with a "chain verified ✓/✗" banner, and a SOC2 evidence export.

**Effort:** L


### benchmark
The recurring industry lesson (Kilter, Tracehold, VeritasChain/DEV, Konfirmity SOC2 guides) is blunt: "append-only is a convention, not a security property" — a DB-only append table is trivially rewritten by anyone with write access, who can then recompute every hash. So best-in-class designs layer three things: (1) a per-row SHA-256/HMAC hash chain where each entry hashes its own canonical payload + the previous row's hash + a monotonic sequence number (detects edit/delete/reorder); (2) an HMAC key held OUTSIDE the database (Tracehold's "immutable audit log with HMAC hash chaining") so an attacker with DB access alone cannot forge a valid chain; (3) an out-of-band anchor — periodically publishing the latest hash somewhere the attacker can't retroactively change (email, WORM file) — so wholesale recomputation is caught. Compliance-tool presentation (IT Glue/Kaseya SOC2, Konfirmity): auditors want (a) a "logs are immutable + verifiable" claim backed by a verify step that re-walks the chain, (b) RBAC-restricted evidence access, and (c) export of a full event listing for a period plus fast retrieval of individual samples. EMULATE: hash chain + external HMAC key + monotonic seq + a real verification pass + period export with a signed manifest. AVOID: (a) trusting "the app never issues UPDATEs" as if it were tamper-proof; (b) joining actor/client at read time (IT Glue-style logs snapshot the actor label so a later rename/delete can't alter history); (c) putting secrets/reveal values in the log body; (d) a hash chain nobody ever verifies. DocHub already has the right choke-point instinct — lib/reveal-log.ts funnels every credential reveal through one helper; we generalize that pattern and make the write cryptographically chained.


### dataModel
New models in prisma/schema.prisma (additive only). BigInt PK gives a monotonic sequence so a deleted tail row leaves a detectable gap; no FKs to StaffUser/Client so a later rename/delete cannot mutate history (actor/client are snapshotted).

model AuditLog {
  seq        BigInt          @id @default(autoincrement()) // monotonic; gaps = deleted rows
  id         String          @unique @default(cuid())      // stable ref for row-detail deep links
  at         DateTime        @default(now())
  actorType  AuditActorType  @default(SYSTEM)
  actorId    String?         // StaffUser.id / ApiKey.id / PortalUser.id (NO FK — immutable)
  actorLabel String          // denormalized name/email at write time
  action     String          // dotted verb, e.g. "credential.reveal", "staffUser.login"
  entityType String?         // "credential","asset","staffUser","apiKey"...
  entityId   String?
  clientId   String?         // for filter/scope; NO FK (survives client delete)
  summary    String          // human one-liner
  metadata   Json    @default("{}") // redacted context; NEVER secrets/plaintext
  ip         String?
  userAgent  String?
  prevHash   String          // hex; genesis row uses 64 zeros
  hash       String  @unique // HMAC-SHA256(canonicalPayload + prevHash), key from env
  @@index([at])
  @@index([action])
  @@index([entityType, entityId])
  @@index([clientId])
  @@index([actorId])
}
enum AuditActorType { STAFF API_KEY PORTAL SYSTEM }

Chain head pointer + anchors reuse the existing AppSetting key/value model (no new table): keys `audit:head_seq`, `audit:head_hash` (fast start point for verify + accidental-truncation check), and daily `audit:anchor:YYYY-MM-DD` = {seq,hash} snapshot. Canonical payload = deterministic join of seq|at.toISOString()|actorType|actorId|action|entityType|entityId|clientId|summary|stableStringify(metadata). Note: hash/verify must be keyed by env `AUDIT_CHAIN_SECRET` (NOT stored in DB); if unset, fall back to HMAC over a warn-logged default so dev still works, and surface "unkeyed" in the verify banner.


### apiRoutes
New lib/audit-log.ts (the single choke point, mirrors lib/reveal-log.ts):
- writeAudit(entry): opens a Prisma $transaction, takes a Postgres advisory xact lock `SELECT pg_advisory_xact_lock(hashtext('dochub_audit_chain'))` to serialize appends (so prevHash never races), reads current head (max seq row or AppSetting `audit:head_hash`), computes hash = HMAC-SHA256(canonical + prevHash, AUDIT_CHAIN_SECRET), inserts the row, updates AppSetting head pointer. Best-effort at the call site (try/catch + console.error like logReveal) — a failed append is a coverage gap, NOT a chain break, since nothing was inserted. Never let it throw into the user action.
- Helper actions map so call sites stay one-liners: writeAudit({action:"credential.reveal", actorType, actorId, actorLabel, entityType:"credential", entityId, clientId, summary, metadata, ip, userAgent}).

Routes (all requireAuth("ADMIN"); BigInt serialized via .toString()):
- GET /app/api/admin/audit-log/route.ts — paged list (PAGE_SIZE 50) mirroring the existing audit route: filters action, actorId/actorLabel(q), entityType, clientId, from/to; groupBy facets for action + actorType; returns rows incl. seq, hash(short), prevHash. Read-only; no POST/PUT/DELETE handlers exist on this table anywhere (enforced by convention + a schema comment).
- GET /app/api/admin/audit-log/verify/route.ts — re-walks the chain in batches of ~1000 ordered by seq, recomputing each HMAC and checking prevHash linkage + seq contiguity; cross-checks head against AppSetting head pointer and the most recent daily anchor. Returns {ok, latestSeq, latestHash, checked, firstBreakSeq|null, breakKind:'hash'|'link'|'gap'|'anchor'|null, keyed:boolean, anchorMatches:boolean}.
- GET /app/api/admin/audit-log/export/route.ts — streams NDJSON (?format=csv for CSV) of a seq/date range PLUS a manifest header: {generatedAt, generatedBy(actorLabel), seqRange, headHash, verify result}. Manifest line is itself HMAC-signed so the export is self-verifying evidence.
- scripts/verify-audit-chain.ts — standalone `npx tsx scripts/verify-audit-chain.ts` (same recompute logic, importable core) for out-of-band/cron verification that doesn't touch the web tier; exit code 0/1 for CI/cron alerting.

Client-scope note: this log is ADMIN-only (like the current audit route), so getClientScope() filtering is not required, but clientId is stored so a future scoped read is a one-line scopeWhere() add.


### webUI
Extend the existing app/admin/audit/page.tsx (client component, AppShell) — add a third tab "Secure Log" beside the current Field/Activity toggle, so admins have one audit home. At the top of the Secure Log view, a sticky verification banner using existing components: on mount it calls /verify and renders either a .badge-success "Chain verified ✓ — N entries, seq 1…M" or a .badge-danger "Chain BROKEN ✗ at seq X" inside a .state-box, plus a "Re-verify" .btn and an "Export evidence" .btn-primary. The listing reuses the .data-table with the existing thStyle/tdStyle: columns seq, at, actorLabel, action (as a .badge-neutral), entity (entityType/entityId link), summary. Filter row reuses .filter-input for action/actor/entity + from/to date inputs and facet chips (action, actorType) exactly like the current field view. Clicking a row opens a right-side detail drawer showing full metadata (pretty JSON), ip/userAgent, and the crypto fields seq / hash / prevHash in a monospace block with a "copy" affordance — this is what makes the tamper-evidence tangible. Tokens/classes only (--surface/--border/--accent, .btn, .badge-*, .field); no new design primitives. The legacy Field/Activity tabs stay unchanged (mutable, historical); a small helper caption explains "Secure Log is append-only and cryptographically verified; Field/Activity are the legacy live views."


### mobileUX
First-class phone/PWA (bottom-bar nav, single column, ≥44px targets):
- Tabs collapse into the standard tab scroll-snap strip; "Secure Log" is one snap target. Reachable from the existing admin section of .dochub-bottombar (no new bottom-bar slot needed — it lives under the audit entry).
- The verify banner becomes a full-width sticky card pinned under the header: big ✓/✗ glyph + one-line status, tap to expand details. Green/red carries at a glance on a phone.
- The wide .data-table is replaced below a breakpoint by a single-column card list (same pattern DocHub uses elsewhere): each card shows action badge + relative time on the top row, actorLabel + entity on the second, summary truncated — the whole card is a ≥44px tap target.
- Tapping a card opens a full-screen bottom sheet (not a side drawer) with the metadata JSON and the seq/hash/prevHash monospace block; hashes wrap in an overflow-x:auto container so the page body never scrolls sideways. A "Copy hash" button is a full-width 48px .btn.
- Filters collapse behind a "Filter" .btn that opens a bottom sheet (action / actor / date range) with 44px controls; active filters show as removable chips.
- "Export evidence" triggers the export endpoint and hands the file to navigator.share({files}) on mobile (matches DocHub's iOS-PWA share pattern) instead of a raw download, and Re-verify is a big touch button in the banner. All actions work one-thumb.


### migration
Additive: add AuditLog + AuditActorType enum to prisma/schema.prisma, run `prisma db push` (schema `dochub`). BigInt @default(autoincrement()) creates a Postgres sequence — additive, no lock risk, safe on the shared DB; no changes to FieldHistory/ActivityEvent/reveal-log so the existing audit route keeps working untouched. No backfill of history is needed or wanted (starting fresh keeps the chain clean); the genesis row is created lazily on the first writeAudit (prevHash = 64 zeros). One-time ops step: set `AUDIT_CHAIN_SECRET` in the app env (document in the project Credentials.md as a new cross-app-independent secret) and, optionally, a nightly cron running scripts/verify-audit-chain.ts + emailing the daily anchor via the existing OutboundMessage/Resend path. Drift check stays green since the change is purely additive. Rollback = drop table (no other model references it). Watch-outs: serialize JSON with BigInt→string; keep the advisory-lock transaction short so appends stay cheap; the log is write-mostly so the five indexes are fine.


### risks
(1) DB-admin recompute: an attacker who ALSO has the app env can regenerate the whole chain — mitigated by keeping AUDIT_CHAIN_SECRET out of the DB and by the out-of-band daily anchor (emailed), which verify cross-checks; document this threat honestly for the auditor rather than overclaiming "tamper-proof" (it is tamper-EVIDENT). (2) Coverage gaps: tamper-evidence only covers what actually calls writeAudit — a missed instrumentation point is invisible, so ship with a concrete call-site checklist (below) and treat writeAudit as mandatory in code review for sensitive mutations. (3) Best-effort write means a transient DB error drops an event (gap in coverage, not a chain break) — acceptable, but log the failure loudly. (4) Concurrency: without the advisory lock, parallel appends would fork prevHash — the lock is load-bearing, don't remove it. (5) Secret leakage into metadata — enforce a redaction allowlist in writeAudit (never pass plaintext credentials/reveal values). Initial call sites to instrument: lib/reveal-log.ts (add writeAudit alongside the FieldHistory write), credential create/update/delete + reveal routes, StaffUser login/logout (auth-options callbacks), ApiKey create/revoke, StaffClientAssignment changes, IP-allowlist + security AppSetting changes, PortalUser/vendor-portal grants, VpnAccessor changes, and personal-vault unlocks.


### openQuestions
- Retention: keep the secure log forever (best for SOC2), or add a documented retention window with a signed 'summary + closing hash' before pruning old ranges so the chain stays verifiable?
- Should the anchor be emailed nightly via Resend/OutboundMessage, written to a WORM/append-only file on the box, or both? (Email is the cheapest external anchor DocHub already supports.)
- Do you want a lightweight background 'auto-verify' (nightly cron + alert on ✗), or is on-demand admin/CLI verification enough for now?
- Should reveals continue writing BOTH FieldHistory (for the existing per-credential history drawer) and AuditLog during a transition, or cut the drawer over to AuditLog to avoid double-writes?
- Scope: ADMIN-only viewer (matches today), or also expose a client-scoped, read-only secure-log slice to TECHs via getClientScope() using the stored clientId?


## Client-Hub Restructure (Option A) — two-tier grouped nav for /clients/[id], replacing the flat 20-tab horizontal scroll strip while preserving ?tab= deep-links, tabCounts, active state, and the switch(activeTab) content renderer verbatim.

**Effort:** M


### benchmark
Both best-in-class MSP tools abandon a flat tab strip in favor of a GROUPED, sectioned nav inside the org context. IT Glue's Organizations sidebar groups shortcuts under named, reorderable sections — the default starter layout is "Core Assets" (configurations, contacts, documents, domains, SSL, locations, passwords), "Apps & Services" (where imported Flexible Asset templates auto-land), and "Administration" (non-technical flexible assets: sales/finance, licensing, operations) — and Flexible Assets surface as their own first-class sidebar items under Apps & Services, never buried in a generic "Assets" list (https://support.itglue.com/hc/en-us/articles/360004939738-Organizations-sidebar, https://support.itglue.com/hc/en-us/articles/360004938838-Add-assets-to-the-Organization-Sidebar). Hudu puts every company feature in a left rail with grouped Core sections (passwords, processes, networks, racks, websites) and pushes custom Asset Layouts to a bottom "Other/Custom" section (https://support.hudu.com/hc/en-us/articles/9666039939223-Your-Hudu-Environment, https://support.hudu.com/hc/en-us/articles/7905521347991-Asset-Layouts); its mobile app collapses that rail into a section list you drill into rather than a 20-wide swipe strip (https://support.hudu.com/hc/en-us/articles/11416141363735-Hudu-Mobile-App-Navigation). EMULATE: fixed ~6 named sections, the active tab's section auto-expanded, aggregate per-section count badges, drill-down on mobile. AVOID (deliberately, for scope): IT Glue's fully drag-customizable per-group sidebar — that is a schema+settings project; Option A ships fixed grouping. The one thing to NOT copy is Hudu/IT Glue's persistent LEFT rail — DocHub already owns the left edge with .dochub-sidebar (global app nav), so the client sections must render as a horizontal two-row header where .pcc-tab-bar-wrap lives today, not a competing second left rail.


### dataModel
NONE REQUIRED. Option A is nav chrome only: activeTab stays a single string with the exact same 20 values, tabCounts keys are unchanged, and the switch(activeTab) renderer at lines 1701-4030 is untouched, so no Prisma model, field, or relation changes and no db push. The section->tabs grouping is a client-side constant. OPTIONAL A+ polish (only if "remember my last-open section per tech" is wanted server-side rather than in localStorage): additive-only field on StaffUser (schema.prisma line 11) — `clientNavPref Json?` (shape {expandedSection?: string}); nullable, no default backfill, zero drift risk on the shared dochub DB. Flexible Assets note: DocHub has no FlexibleAsset model — its extensibility is AssetType + AssetTypeTemplate.customFieldDefs (schema lines 234-256) rendered INSIDE the existing "Assets" tab, so "Flexible Assets" is not a new nav node; it surfaces as Assets (filtered by AssetType) within the "Assets & Licensing" section. If a dedicated flexible-asset tab is ever added, it slots into "Assets & Licensing" with no nav-shell change.


### apiRoutes
NONE REQUIRED. The existing GET /app/api/clients/[id]/tab-counts/route.ts stays exactly as-is (returns the same keyed map: Locations/People/Assets/Credentials/Licenses/Applications/Vendors/Domains/Network/"Remote Access"/"Phone System"/Cameras/Documents/SOPs/Portal/"Portal Vault"); the nav derives per-section aggregate counts client-side by summing child-tab counts. RBAC is unchanged: requireAuth() + getClientScope()/scopeAllows() already gate the page and every data fetch; the nav shell renders no data of its own so it needs no new scope checks. All ~30 external deep-link callers that build `/clients/${id}?tab=Credentials|Licenses|Domains|Network|Remote Access|Phone System|Cameras|Documents|Applications|Audit Trail` (in app/api/alerts/unified, app/api/expirations, vendors/[id], assets/[id], locations/[id], dashboard, docs/review) require ZERO changes — they keep passing the same tab string. OPTIONAL (only if the StaffUser.clientNavPref fork is chosen): PATCH /app/api/me/nav-pref persisting {expandedSection}, guarded by requireAuth().


### webUI
One file, one extracted component, plus the grouping constant. (1) Add module-scope constants above the ClientDetailPage component in app/app/clients/[id]/page.tsx (alongside the existing `const tabs = [...]` at ~line 131): `const SECTIONS: {label:string; tabs:string[]}[] = [{label:"Overview", tabs:["Dashboard","Audit Trail"]}, {label:"Organization", tabs:["Locations","People","Vendors"]}, {label:"Assets & Licensing", tabs:["Assets","Licenses","Subscriptions","Applications"]}, {label:"Network & Telecom", tabs:["Network","Domains","Remote Access","Phone System","Cameras"]}, {label:"Credentials & Vault", tabs:["Credentials","Portal Vault"]}, {label:"Docs & Client Portal", tabs:["Documents","SOPs","Portal","Vendor Portal"]}]` (2+3+4+5+2+4 = all 20). Keep the flat `tabs` array too (some code maps it). Add `const sectionOf = (t:string) => SECTIONS.find(s => s.tabs.includes(t))?.label ?? "Overview"`. (2) New state: `const [expandedSection, setExpandedSection] = useState(() => sectionOf(activeTab))`. Add an effect `useEffect(() => setExpandedSection(sectionOf(activeTab)), [activeTab])` so every programmatic setActiveTab (cross-tab jumps at lines 461/2119/2128/2137/2146/2548/2716, the ?tab= mount read at line 291, and the ?edit= handler) auto-opens the right section — deep-links need no other change. (3) Extract a module-scope component `function ClientTabNav({activeTab, expandedSection, setExpandedSection, setActiveTab, tabCounts})` (module scope, NOT inline — per the React-inline-subcomponent-focus gotcha) and render it in place of the current .pcc-tab-bar-wrap block (lines 1680-1699). Structure: reuse the sticky `.pcc-tab-bar-wrap` shell but stack two rows. Row 1 = six section buttons, new class `.pcc-section-tab` (styled from tokens like .pcc-tab: uppercase 11px mono, --muted; active = --accent text + 2px --accent bottom-border) where "active" = `expandedSection === s.label`; each shows an aggregate badge `Σ child tabCounts` and a small `•` dot when `sectionOf(activeTab) === s.label` so the user never loses where the live tab is. Row 2 = the child tabs of `expandedSection` rendered with the EXISTING `.pcc-tab` markup + `active` class (`activeTab === tab`) + the same `(count)` span from tabCounts — literally the current inner map, just filtered to `SECTIONS.find(s=>s.label===expandedSection).tabs`. Clicking a section calls setExpandedSection only (browse without navigating); clicking a child tab calls setActiveTab (unchanged behavior). Drop the ‹ › `.pcc-tab-scroll-btn` buttons — 6 sections + a short child row fit without horizontal scroll on desktop. Everything below (the switch renderer) is untouched.


### mobileUX
The global .dochub-bottombar (app-level Clients/Dashboard nav) is unchanged — this restructures only the in-page client tab nav, which today is the single 20-wide .pcc-tab-bar scroll-snap strip (the real pain point: thumb-swiping through 20 tabs to reach Cameras). New mobile pattern = two stacked scroll-snap rows inside the same sticky .pcc-tab-bar-wrap: (Row 1) the SIX section chips as a horizontal scroll-snap row — 6 chips nearly fit the viewport so it is a glance not a marathon; each chip >=44px tall (reuse the existing @media(max-width:767px) `.pcc-tab{padding:14px 18px}` rule, extend it to `.pcc-section-tab`), scroll-snap-align:start, with its aggregate count and active-dot. (Row 2) the child tabs of expandedSection as a second short scroll-snap row (max 5 chips, so no long swipe), same 44px targets, active child highlighted. Tapping a section chip swaps Row 2 instantly (setExpandedSection, no navigation, no fetch) so a tech triages sections with one thumb; tapping a child chip navigates (setActiveTab). Because expandedSection is derived from activeTab, arriving via a phone push/deep-link like ?tab=Cameras lands with "Network & Telecom" pre-selected in Row 1 and Cameras active+centered in Row 2 — no orientation loss. Keep the existing mobile affordances: hide the ‹ › scroll buttons (already `display:none` in the 767px block), keep scroll-snap-type:x mandatory on both rows, keep the FAB lift (.pcc-fab bottom offset) and the `main` bottom padding for the bottombar. Net: worst-case reach drops from up to 19 swipes to 1 section tap + at most 4 child chips. Optional richer variant (fork): tapping a section chip opens a bottom-sheet list of its tabs (thumb-reachable, larger hit area) instead of Row 2 — heavier to build, only if the two-row strip tests as cramped on a 375px screen.


### migration
No migration — nav chrome only, no schema touch, so nothing to db push and no drift check to satisfy. Ship is a single source edit to app/app/clients/[id]/page.tsx plus a small CSS addition to app/app/globals.css (a `.pcc-section-tab` rule mirroring `.pcc-tab`, and a two-row tweak to `.pcc-tab-bar-wrap`), then the standard DocHub deploy. If the optional StaffUser.clientNavPref fork is taken: additive nullable `clientNavPref Json?` applied via `prisma db push` (additive, no backfill, safe on the live shared dochub DB), no data migration; otherwise persist last-open section in localStorage keyed by client id (zero migration).


### risks
(1) Deep-link fidelity is the #1 risk: any of the ~30 `?tab=X` callers whose X is not spelled exactly as a tab string, or a tab moved to a wrong section, would land on a blank/mis-highlighted nav. Mitigation: SECTIONS is a strict partition of the existing `tabs` array (assert at dev time that flatten(SECTIONS) equals tabs, 20 items, no dupes) and the `sectionOf` fallback is "Overview"; grep-verified live callers use Credentials/Licenses/Domains/Network/Remote Access/Phone System/Cameras/Documents/Applications/Audit Trail — all mapped. (2) `Phone System` deep-links arrive URL-encoded as `Phone+System`/`Phone%20System` (assets/[id] line 1127) and `Audit%20Trail` (dashboard line 360); the current mount read at line 291 already decodes via URLSearchParams.get, so this keeps working — do NOT change that parse. (3) Network sub-tab links (`?tab=Network&sub=circuits`) — the `sub` param path is orthogonal to the section shell (networkSubTab state, lines 397/532-548) and unaffected, but verify the Network child tab still activates so the sub-row renders. (4) React focus gotcha: ClientTabNav MUST be module-scope, not defined inside ClientDetailPage, or the section/tab buttons remount and lose focus. (5) Aggregate section badge could imply a section is empty when a child has data but tabCounts omits that key (Subscriptions, Vendor Portal, and Audit Trail are not in the tab-counts route) — treat missing keys as 0 in the sum and never hide a section for a 0 count (sections are always shown; only the numeric badge is conditional, matching today's per-tab `count>0` guard).


### openQuestions
- Section order + exact labels: confirm the 6 proposed (Overview / Organization / Assets & Licensing / Network & Telecom / Credentials & Vault / Docs & Client Portal) and the tab-to-section assignments — notably Domains under Network & Telecom (vs Organization), Vendors under Organization (vs Assets & Licensing), and Audit Trail under Overview (vs its own section).
- Should the open section persist across visits per tech (StaffUser.clientNavPref additive field / localStorage), or always auto-derive from activeTab and default the section-less landing to Overview?
- Mobile: ship the lightweight two-stacked-scroll-snap-rows now, or invest in the bottom-sheet drill-down variant (larger touch targets, heavier build) — recommend two-rows first, revisit after on-device test.
- Do you want the fully drag-customizable per-tech section layout (IT Glue-style) on the roadmap, which WOULD require schema + a settings UI, or is fixed grouping the intended end state for A+?


## mobile-architecture

**Effort:** L


### benchmark
The MSP-docs mobile bar is set by IT Glue's native iOS/Android app: biometric unlock, then a lookup-and-copy tool — search a client, tap an asset/password, one-tap reveal + copy, offline read of recently viewed records. Its weakness (and DocHub's opening) is that WRITE flows on phone are painful, so techs defer them to the desk. Hudu is responsive web (no true native app), leaning on a clean single-column layout + relationship links; reviewers praise it as usable on a tablet in the field. EMULATE: (1) biometric/passkey unlock for the vault on phone — DocHub already has StaffUserPasskey + PersonalVaultSession + /api/passkey, so wire WebAuthn to a mobile unlock; (2) one-tap reveal+copy of a secret as the single most-used field gesture; (3) offline read of records a tech already opened. AVOID the incumbents' mistakes: IT Glue's read-mostly mobile (make create/edit genuinely first-class via bottom sheets) and burying copy behind menus. DocHub's differentiator vs both: it already ships a Workbox BackgroundSync write-queue, so mark-rotated / mark-verified / edit-asset can succeed offline in a basement and sync later — something neither incumbent does. Sources: hudu.com/comparison/itglue, scopable.io/blog/hudu-vs-it-glue-comparison, rallied.ai/blog/it-glue-vs-hudu-which-documentation-tool-fits-your-msp.


### dataModel
Mobile architecture is an overwhelmingly CLIENT-side + CSS system: it needs ZERO required schema change, which is the point — every one of the 5 features already has its columns. CONFIRMED PRESENT: Credential.lastRotated + allowTechReveal (mark-rotated needs no migration); AssetTypeTemplate.standardFields[] + customFieldDefs Json + showSwitchPanel (flexible-asset form + template picker are data-complete); Asset.customFields Json; BackupConfig.lastVerifiedAt / nextVerifyBy / verifiedBy / status + BackupProtectedAsset + SynologyBackupJob.lastResult (backup admin is data-complete). The offline outbox is Workbox IndexedDB (client-side), not Postgres. ONE optional additive field, only if the team wants per-tech rotation/verify SLAs to drive the mobile red-badge: add `AppSetting` rows (key/value already exists — no model change) for `rotation.max_age_days` and `backup.verify_interval_days`; the badge math reads those + lastRotated/lastVerifiedAt. If per-device offline-unlock trust is wanted, the only real addition would be `StaffUserPasskey` already covers it (no change). Net: additive-only, and in practice NO new columns are required — do not touch the shared DB for this workstream unless the SLA-settings knobs are approved (those are AppSetting rows, not DDL).


### apiRoutes
Mobile reuses existing routes; the architecture rule is that any NEW write route MUST live under a path the service worker already queues. sw.js registers BackgroundSync ("dochub-mutations", 24h) for POST/PATCH/PUT/DELETE matching /api/(clients|credentials|documents|assets|backups|applications|notes|share)(/|$). ACTIONS: (1) Mark-rotated — there is currently only POST /api/credentials/[id]/rotate, which is Graph-backed + ADMIN-only + requires a linked Person with m365Upn; it is NOT the field gesture. Add the field action as PATCH /api/credentials/[id] { lastRotated:ISO, encryptedPassword?:optional } (already under the queued /credentials prefix → offline-safe); requireAuth() + scopeAllows(clientId); writes FieldHistory. (2) Mark-verified (backup) — add PATCH /api/backups/[id] { lastVerifiedAt:now, verifiedBy, nextVerifyBy? } under the queued /backups prefix; requireAuth + scope check. (3) Reveal-secret stays POST/GET NetworkOnly and must NEVER be background-synced or cached (security) — its regex is already GET-NetworkOnly; keep reveal on a dedicated /reveal path excluded from any read cache. (4) Read cache: today ALL /api GET is NetworkOnly (no offline read). Add a Workbox StaleWhileRevalidate runtime route for NON-SECRET list/metadata GETs only: /api/(clients|assets|backups|dashboard|search) list payloads — explicitly exclude any route whose response contains encryptedPassword/encryptedTotp/encryptedNotes. Server must keep secret values out of list endpoints (reveal-on-demand only) so the read cache can be enabled safely.


### webUI
MOBILE DESIGN SYSTEM (the pattern guide all 5 features + the hub restructure follow). NAV MODEL (3 fixed layers, never mix roles): (a) Bottom bar = DESTINATIONS ONLY, exactly 5, never more — Home / Clients / Scan / Search / Vault (current .dochub-bottombar). (b) FAB (.pcc-fab) = CREATION only. (c) Top-right = Alerts bell + a "More" overflow. Everything that doesn't fit the 5 (Alerts, Runbooks, Licenses, Vendors, Reports, AI Intake, Settings) routes through the More sheet — the hub restructure must NOT add bottom-bar tabs. THE ONE NEW PRIMITIVE: a reusable <Sheet> bottom-sheet. Every thing that is a modal or an inline expand-in-place form on desktop becomes a bottom sheet on phone: slides up from bottom, 16px rounded top corners, 40px drag-handle, max-height 92dvh, internal scroll, backdrop tap-to-dismiss, and a STICKY footer action bar (primary btn full-width + ghost Cancel) padded with env(safe-area-inset-bottom). This single component fixes forms, pickers, confirms, and the QuickAdd/More menus. TABLES→CARDS: .data-table currently only horizontal-scrolls under 767px (bad). Add a .data-cards mode — below 767px each row renders as a card: bold primary line (name), muted secondary line, 2-3 key:value chips, right-edge chevron/overflow. Apply to asset list, credential list, backup list, license list. TOKENS/COMPONENTS (add to the @media max-width:767px block in globals.css): bump .btn to min-height 44px / font-size 14px→15px / padding 10px 16px; bump .field input/select/textarea and .filter-input to min-height 44px and font-size 16px (16px is the iOS no-zoom threshold — current 13-14px inputs zoom the viewport on focus); row tap targets ≥44px with ≥8px gaps. Keep native <select> (best mobile picker) — do not build custom dropdowns. Reuse existing .btn/.badge-*/.state-box/.field verbatim; the system is additive CSS + one <Sheet> + one <DataCards> renderer, no redesign.


### mobileUX
PER-FEATURE MOBILE NOTES. (1) FLEXIBLE-ASSET DYNAMIC FORM — biggest current defect: the New-asset grid is inline gridTemplateColumns:"1fr 1fr" with NO .pcc-collapse-mobile, so fields sit cramped 2-up, and inputs are 14px/~34px tall (iOS-zoom + sub-44px). Fix: render the whole form inside a <Sheet>, force single column, apply the 44px/16px input rule, keep the asset-type picker as the FIRST field (it drives standardFields + customFieldDefs). Section subheaders ("Identity / Network / Lifecycle / Custom"); customFields stack full-width; sticky "Create asset" bar at the sheet foot. If an org has many asset types, the type picker itself becomes a searchable full-screen sub-sheet. (2) TEMPLATE PICKER (AssetTypeTemplate editor) — admin task, must survive on phone: standardFields as a vertical checklist of 44px toggle rows; customFieldDefs as an add/edit list where each def opens its own mini-sheet (key/label/type/required); reordering via up/down buttons (touch drag-reorder is unreliable), not drag handles. showSwitchPanel/showCameraPhoto as plain toggle rows. (3) ROTATION "MARK ROTATED" — the killer field gesture: on each credential card a 44px "Mark rotated" button → confirm sheet with two big buttons (Just stamp now / Paste new password). Fires PATCH /api/credentials/[id] (offline-queued), stamps lastRotated=now, optimistic UI + toast "Saved — syncs when online." Card shows relative "rotated 3mo ago" and a badge-danger when past rotation.max_age_days. (4) BACKUP ADMIN — health-first card list, not a table: each BackupConfig is a card with a status badge (success/warn/danger from SynologyBackupJob.lastResult / nextVerifyBy), last-verified relative date, and a one-tap "Mark verified" (mirrors mark-rotated, PATCH /api/backups/[id], offline-queued). Protected assets + Synology job results as read-only cards. A client "Backups" tab card list + a global backup-health roll-up reachable from More. (5) HUB RESTRUCTURE / IA — bottom bar stays exactly the 5 destinations; the current top-right hamburger becomes a bottom-sheet grid of the secondary hubs (Alerts/Runbooks/Licenses/Vendors/Reports/Intake/Settings) with 44px targets; the client-detail horizontal scroll-snap tab bar stays (good pattern) but gets an overflow "..." that opens a tab-jump sheet when there are 8+ tabs. OFFLINE/PWA UX: writes already queue silently — add an online/offline listener + a small "queued (N)" pill and the sync toast so the tech gets feedback; enable the non-secret read cache so opened records survive going offline in a basement; add a WebAuthn/passkey biometric unlock on the Vault entry (reuse /api/passkey + PersonalVaultSession) so mobile matches IT Glue's Face-ID flow. Manifest polish: theme_color #3b82f6 and background_color #0f172a don't match the app's --accent #3d6fff / --bg #0a0c12 — align them so the PWA splash/status-bar match; keep display:standalone + portrait; and honor the known iOS raw-PDF-force-quit trap for backup/document attachments (in-app pdf.js, never target=_blank raw PDF).


### migration
No DDL required for the mobile workstream — it is CSS (globals.css @media block additions), one <Sheet> component, one <DataCards> renderer, two reused/added API routes (PATCH credentials + PATCH backups, both already covered by the existing service-worker queue), and sw.js runtime-cache edits. The only optional data touch is AppSetting rows (rotation.max_age_days, backup.verify_interval_days) which use the EXISTING key/value AppSetting model — seed via an idempotent upsert, no `prisma db push` needed. If those knobs are approved they ship as a seed script, not a schema change, so there is zero drift risk on the shared dochub DB. Service-worker change (adding the StaleWhileRevalidate read cache + excluding reveal endpoints) ships as a normal build; bump the SW precache so clients pick up the new caching rules on next load.


### risks
Caching secrets is the sharp edge: the new read cache MUST exclude any endpoint returning encryptedPassword/encryptedTotp/encryptedNotes and reveal must stay NetworkOnly — otherwise a lost/stolen phone leaks vault contents from the SW cache. Enforce by keeping secret values out of list payloads server-side, not by trusting the regex. Offline write-queue already exists but is silent; without the queued-pill + toast, techs will double-submit or assume saves failed. iOS 16px-input rule is load-bearing — leaving inputs at 13-14px keeps the zoom-on-focus jank. Reworking the huge 4,100-line client-detail page (which hand-rolls every form inline) into <Sheet> is the bulk of the effort and the main regression risk; do it form-by-form behind the same state, not as a big-bang rewrite. Drag-reorder on touch is a known failure mode — ship up/down buttons for the template editor. Bottom-bar discipline must be enforced in review: any PR that adds a 6th destination or overloads the FAB breaks the model.


### openQuestions
- Read cache: acceptable to cache non-secret client/asset/backup LIST metadata for offline read, given a lost phone still can't reveal secrets (those stay NetworkOnly + vault-locked)? Or keep mobile fully online-only for now?
- Biometric unlock: wire the existing passkey stack (StaffUserPasskey/PersonalVaultSession) to a mobile Vault unlock this pass, or defer to a follow-up?
- Rotation/verify SLA knobs: seed AppSetting defaults (e.g. 90-day rotation, 90-day backup verify) to drive the red badges, or leave badges off until the owner sets policy?
- Should the client-detail tab bar get the overflow tab-jump sheet now (8+ tabs) or is horizontal scroll-snap acceptable as-is on phone?
- Convert the top-right hamburger More menu to a bottom sheet on mobile only, or keep the current top-anchored dropdown?
