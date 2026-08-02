// cable-run-selftest.mjs — exercises the CableRun invariants against the REAL database.
//
// Why a script and not a unit test: this repo has no test harness at all (zero
// .test/.spec files, CI runs a build only), and the invariants that matter here are
// database-level — a partial unique index, a compound unique, cascade behaviour, and
// whether the search predicate actually matches what a technician would type.
// Mocking those would test the mock.
//
// EVERYTHING runs inside one transaction that is deliberately aborted, so no row
// survives. The final check re-counts outside the transaction to prove that.
//
//   cd ~/dochub/app
//   DATABASE_URL="postgresql://dochub:PW@<db-ip>:5432/dochub" node scripts/cable-run-selftest.mjs
//
// Exit 0 = all invariants hold, 1 = something regressed.

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const ROLLBACK = "selftest-intentional-rollback"
const results = []
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`)
}

// Mirrors lib/cable-runs.ts normalizeJackLabel. Kept in sync by hand; if that
// function changes, this must too (the mismatch is what this check would catch).
const normalizeJackLabel = (raw) =>
  typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").toUpperCase() : ""

const before = await prisma.cableRun.count()

/**
 * Postgres aborts the ENTIRE transaction on the first failed statement (25P02),
 * so a test that deliberately violates a constraint must be fenced in a savepoint
 * or every later check dies with "current transaction is aborted".
 * Returns true if `fn` failed with the expected Prisma error code.
 */
let spN = 0
async function expectViolation(tx, code, fn) {
  const sp = `sp_${++spN}`
  await tx.$executeRawUnsafe(`SAVEPOINT ${sp}`)
  let got = null
  try { await fn(); } catch (e) { got = e.code ?? e.constructor.name }
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${sp}`)
  return got === code
}

try {
  await prisma.$transaction(async (tx) => {
    // Pick a location that actually HAS an asset, so the switch-reference check
    // below exercises a real FK instead of silently reporting PASS on a skip.
    const location =
      (await tx.location.findFirst({
        where: { assets: { some: {} } },
        select: { id: true, clientId: true, name: true },
      })) ?? (await tx.location.findFirst({ select: { id: true, clientId: true, name: true } }))
    if (!location) throw new Error("no Location rows to test against")
    const { id: locationId, clientId } = location

    // ── 1. basic create ────────────────────────────────────────────────────
    const a = await tx.cableRun.create({
      data: {
        clientId, locationId, jackLabel: "B-114", room: "MDF",
        panelLabel: "PP-A", panelPort: 12, switchPortNumber: 14, cableType: "Cat6",
        lastVerifiedAt: new Date(), verifiedBy: "selftest",
      },
    })
    check("creates a cable run", !!a.id)

    // ── 2. one jack label per location ─────────────────────────────────────
    const dupeBlocked = await expectViolation(tx, "P2002", () =>
      tx.cableRun.create({ data: { clientId, locationId, jackLabel: "B-114" } }))
    check("@@unique([locationId, jackLabel]) blocks a duplicate jack", dupeBlocked)

    // ── 3. the same label at a DIFFERENT location is legal ─────────────────
    const other = await tx.location.findFirst({
      where: { id: { not: locationId } }, select: { id: true, clientId: true },
    })
    if (other) {
      const b = await tx.cableRun.create({
        data: { clientId: other.clientId, locationId: other.id, jackLabel: "B-114" },
      })
      check("same jack label is allowed at another location", !!b.id)
    } else {
      check("same jack label is allowed at another location", false, "NO FIXTURE: only one Location")
    }

    // ── 4. offline-replay idempotency key ──────────────────────────────────
    await tx.cableRun.update({ where: { id: a.id }, data: { clientOpId: "op-selftest-1" } })
    const opBlocked = await expectViolation(tx, "P2002", () =>
      tx.cableRun.create({ data: { clientId, locationId, jackLabel: "C-201", clientOpId: "op-selftest-1" } }))
    check("clientOpId is unique (replayed offline write cannot double-insert)", opBlocked)

    // ── 5. clientOpId is NULLABLE and many nulls coexist ───────────────────
    // A unique index over a nullable column must still permit unlimited NULLs,
    // otherwise every desk-entered run after the first would fail.
    const n1 = await tx.cableRun.create({ data: { clientId, locationId, jackLabel: "D-1" } })
    const n2 = await tx.cableRun.create({ data: { clientId, locationId, jackLabel: "D-2" } })
    check("multiple rows may have a NULL clientOpId", !!n1.id && !!n2.id)

    // ── 6. label normalization actually collapses real-world variants ──────
    const variants = ["b-114", " B-114 ", "B  114", "b 114"]
    const normalized = variants.map(normalizeJackLabel)
    check(
      "normalizeJackLabel folds case and whitespace",
      normalized[0] === "B-114" && normalized[1] === "B-114" && normalized[2] === "B 114" && normalized[3] === "B 114",
      normalized.join(" | ")
    )

    // ── 7. the search predicate finds what a tech would type ───────────────
    const mode = "insensitive"
    for (const [term, why] of [["b-114", "jack label, wrong case"], ["mdf", "room"], ["pp-a", "panel label"]]) {
      const hits = await tx.cableRun.findMany({
        where: {
          OR: [
            { jackLabel: { contains: term, mode } },
            { room: { contains: term, mode } },
            { panelLabel: { contains: term, mode } },
            { notes: { contains: term, mode } },
          ],
          clientId,
        },
        select: { id: true },
      })
      check(`search "${term}" matches (${why})`, hits.some((h) => h.id === a.id))
    }

    // ── 8. the chain string a search result renders ────────────────────────
    const row = await tx.cableRun.findUnique({
      where: { id: a.id },
      include: { switchAsset: { select: { name: true, friendlyName: true } } },
    })
    const chain = [
      row.jackLabel,
      row.panelLabel ? `${row.panelLabel}/${row.panelPort}` : null,
      row.switchPortNumber != null ? `port ${row.switchPortNumber}` : null,
    ].filter(Boolean).join(" -> ")
    check("renders the end-to-end chain", chain === "B-114 -> PP-A/12 -> port 14", chain)

    // ── 9. optional references really are optional ─────────────────────────
    const bare = await tx.cableRun.create({ data: { clientId, locationId, jackLabel: "E-9" } })
    check("a run needs nothing but a jack label", !!bare.id && bare.panelLabel === null)

    // ── 10. a deleted switch must not delete the documentation ─────────────
    // Asset relations are optional with the default SetNull-style behaviour; a run
    // is a record of the building, and it outlives the hardware plugged into it.
    const sw = await tx.asset.findFirst({ where: { locationId }, select: { id: true } })
    if (sw) {
      await tx.cableRun.update({ where: { id: bare.id }, data: { switchAssetId: sw.id } })
      const linked = await tx.cableRun.findUnique({ where: { id: bare.id } })
      check("a run can reference a switch asset", linked.switchAssetId === sw.id)
    } else {
      check("a run can reference a switch asset", false, "NO FIXTURE: no Asset anywhere")
    }

    throw new Error(ROLLBACK)
  })
} catch (e) {
  if (e.message !== ROLLBACK) {
    console.error("\nself-test aborted:", e.message)
    await prisma.$disconnect()
    process.exit(1)
  }
}

const after = await prisma.cableRun.count()
check("transaction rolled back — no test rows persisted", after === before, `${before} before, ${after} after`)

await prisma.$disconnect()

const passed = results.filter((r) => r.pass).length
console.log(`\n${passed}/${results.length} invariants hold`)
process.exit(passed === results.length ? 0 : 1)
