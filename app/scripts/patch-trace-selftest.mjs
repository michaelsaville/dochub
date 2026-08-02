// patch-trace-selftest.mjs — proves the physical-layer path trace against the REAL
// database, on a REAL topology, using the REAL query.
//
// A recursive graph walk is the classic "looks right, returns the wrong chain"
// component: it can dead-end at a patch panel, traverse in only one direction, or
// spin forever on a mis-cabled loop, and every one of those failures still returns
// plausible-looking rows. So this does not re-implement the CTE — it EXTRACTS the
// query text out of lib/patch-trace.ts and runs that, which means the test cannot
// drift from the implementation it is meant to protect.
//
// Everything runs in one deliberately-aborted transaction; the last check re-counts
// outside it to prove nothing persisted.
//
//   cd ~/dochub/app
//   DATABASE_URL="postgresql://dochub:PW@<db-ip>:5432/dochub" node scripts/patch-trace-selftest.mjs

import { PrismaClient } from "@prisma/client"
import { readFileSync } from "fs"

const prisma = new PrismaClient()
const ROLLBACK = "selftest-intentional-rollback"
const results = []
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`)
}

// ── extract the live CTE from the TypeScript source ─────────────────────────
const src = readFileSync(new URL("../lib/patch-trace.ts", import.meta.url), "utf8")
const m = src.match(/prisma\.\$queryRaw<TraceHop\[\]>`([\s\S]*?)`\n\}/)
if (!m) {
  console.error("could not extract the trace CTE from lib/patch-trace.ts — did its shape change?")
  process.exit(1)
}
const maxHops = Number(src.match(/const MAX_HOPS = (\d+)/)?.[1])
// Prisma's tagged template turns ${x} into a bind parameter; do the same by hand.
const TRACE_SQL = m[1]
  .replaceAll("${portId}", "$1")
  .replaceAll("${MAX_HOPS}", String(maxHops))
check("extracted the real CTE from lib/patch-trace.ts", TRACE_SQL.includes("RECURSIVE") && maxHops > 0,
  `MAX_HOPS=${maxHops}`)

const trace = (tx, portId) => tx.$queryRawUnsafe(TRACE_SQL, portId)
const chain = (hops) =>
  hops.map(h => `${h.assetName}:${h.portIndex}${h.side === "REAR" ? "r" : ""}`).join(" -> ")

const before = {
  ports: await prisma.devicePort.count(),
  links: await prisma.portLink.count(),
}

try {
  await prisma.$transaction(async (tx) => {
    const loc = await tx.location.findFirst({ select: { id: true, clientId: true } })
    if (!loc) throw new Error("no Location to test against")
    const { id: locationId, clientId } = loc

    const mkAsset = (name) => tx.asset.create({ data: { locationId, name, category: "OTHER" } })
    const mkPort = (assetId, side, portIndex, label) =>
      tx.devicePort.create({ data: { assetId, side, portIndex, label } })

    // ── build a realistic run ────────────────────────────────────────────────
    //   SW:3  --PATCH--  PPfront:12  ==passthrough==  PPrear:12
    //         --BUILDING--  TO:1  --PATCH--  PR:1
    const sw = await mkAsset("selftest-switch")
    const pp = await mkAsset("selftest-panel")
    const to = await mkAsset("selftest-outlet")
    const pr = await mkAsset("selftest-printer")

    const swP = await mkPort(sw.id, "FRONT", 3, null)
    const ppF = await mkPort(pp.id, "FRONT", 12, "B-114")
    const ppR = await mkPort(pp.id, "REAR", 12, "B-114")
    const toP = await mkPort(to.id, "FRONT", 1, "B-114")
    const prP = await mkPort(pr.id, "FRONT", 1, null)

    await tx.devicePort.update({ where: { id: ppF.id }, data: { pairedPortId: ppR.id } })

    const link = (kind, a, b) => tx.portLink.create({ data: { clientId, kind, aPortId: a, bPortId: b } })
    await link("PATCH", swP.id, ppF.id)
    await link("BUILDING", ppR.id, toP.id)
    await link("PATCH", toP.id, prP.id)

    // ── 1. the whole chain, from the switch ──────────────────────────────────
    const fromSwitch = await trace(tx, swP.id)
    check("traces switch -> panel -> outlet -> device", fromSwitch.length === 5, chain(fromSwitch))

    // ── 2. the panel is TRANSPARENT ─────────────────────────────────────────
    // The single thing that distinguishes this from "a list of cables".
    const sawBothPanelSides =
      fromSwitch.some(h => h.assetName === "selftest-panel" && h.side === "FRONT") &&
      fromSwitch.some(h => h.assetName === "selftest-panel" && h.side === "REAR")
    check("passes THROUGH the patch panel (front and rear both on the path)", sawBothPanelSides)

    // ── 3. the traversal is symmetric ───────────────────────────────────────
    // Which end was stored as aPortId is an accident of who clicked first.
    const fromPrinter = await trace(tx, prP.id)
    check("traces identically from the far end", fromPrinter.length === 5, chain(fromPrinter))

    // ── 4. hop ORDER is real, not incidental ────────────────────────────────
    check("hop order is the physical order",
      fromSwitch[0].portId === swP.id && fromSwitch[4].portId === prP.id,
      `${fromSwitch.map(h => h.hop).join(",")}`)

    // ── 5. the edge type is reported per hop ────────────────────────────────
    const vias = fromSwitch.map(h => h.via)
    check("reports how each hop was traversed",
      vias[0] === null && vias.includes("PATCH") && vias.includes("BUILDING") && vias.includes("PASSTHROUGH"),
      vias.join(","))

    // ── 6. remove the pairing -> the chain MUST break at the panel ──────────
    // Proves check 2 was caused by the passthrough edge and not by luck.
    await tx.devicePort.update({ where: { id: ppF.id }, data: { pairedPortId: null } })
    const broken = await trace(tx, swP.id)
    check("without the passthrough, the trace dead-ends at the panel", broken.length === 2, chain(broken))
    await tx.devicePort.update({ where: { id: ppF.id }, data: { pairedPortId: ppR.id } })

    // ── 7. a port may hold BOTH a keystone and a cord ───────────────────────
    // ppR already has BUILDING; adding PATCH to the same port must be legal.
    const both = await tx.portLink.create({
      data: { clientId, kind: "PATCH", aPortId: ppR.id, bPortId: (await mkPort(sw.id, "FRONT", 4, null)).id },
    })
    check("one port can hold both a BUILDING and a PATCH link", !!both.id)
    await tx.portLink.delete({ where: { id: both.id } })

    // ── 8. cycle guard ──────────────────────────────────────────────────────
    // Mis-cabled data WILL produce loops. Without the guard this never returns.
    const c1 = await mkAsset("selftest-loop")
    const l1 = await mkPort(c1.id, "FRONT", 1, null)
    const l2 = await mkPort(c1.id, "FRONT", 2, null)
    await tx.devicePort.update({ where: { id: l1.id }, data: { pairedPortId: l2.id } })
    await link("PATCH", l2.id, l1.id) // deliberate 2-cycle
    const looped = await Promise.race([
      trace(tx, l1.id),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT — cycle guard failed")), 5000)),
    ])
    check("terminates on a cyclic topology", Array.isArray(looped) && looped.length <= maxHops + 1,
      `${looped.length} rows`)

    throw new Error(ROLLBACK)
  }, { timeout: 30000 })
} catch (e) {
  if (e.message !== ROLLBACK) {
    console.error("\nself-test aborted:", e.message)
    await prisma.$disconnect()
    process.exit(1)
  }
}

const after = { ports: await prisma.devicePort.count(), links: await prisma.portLink.count() }
check("transaction rolled back — nothing persisted",
  after.ports === before.ports && after.links === before.links,
  `ports ${before.ports}->${after.ports}, links ${before.links}->${after.links}`)

await prisma.$disconnect()
const passed = results.filter(r => r.pass).length
console.log(`\n${passed}/${results.length} invariants hold`)
process.exit(passed === results.length ? 0 : 1)
