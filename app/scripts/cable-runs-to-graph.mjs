// cable-runs-to-graph.mjs — promote flat CableRun rows into the DevicePort/PortLink graph.
//
// Phase 1 captured runs as one flat row each, because capture cost is what kills
// physical-layer documentation. Phase 2 models the same facts as a graph so a trace
// can answer "what is on this port" from ANY end. This script bridges the two.
//
// For each CableRun it materialises the devices it implies:
//
//     [wall outlet TO/1] --BUILDING-- [panel REAR/n] ==paired== [panel FRONT/n]
//         --PATCH-- [switch FRONT/m]
//
// The outlet is synthesised as an Asset when the run names a jack but no outlet
// device exists — a jack IS a device, it just never got inventoried. Panels named
// only by free text (panelLabel) likewise become Assets, once each.
//
// DRY RUN BY DEFAULT. Pass --apply to write.
//
//   cd ~/dochub/app
//   DATABASE_URL="..." node scripts/cable-runs-to-graph.mjs           # report only
//   DATABASE_URL="..." node scripts/cable-runs-to-graph.mjs --apply
//
// Idempotent: re-running skips runs already represented. Never deletes anything and
// never edits the CableRun rows — the flat table stays the capture surface.

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const stats = { runs: 0, skipped: 0, assetsCreated: 0, portsCreated: 0, linksCreated: 0, problems: [] }

const runs = await prisma.cableRun.findMany({
  include: {
    location: { select: { id: true, name: true } },
    panelAsset: { select: { id: true, name: true } },
    switchAsset: { select: { id: true, name: true, portCount: true } },
  },
  orderBy: [{ locationId: "asc" }, { jackLabel: "asc" }],
})

console.log(`${runs.length} cable run(s) to consider · ${APPLY ? "APPLY" : "DRY RUN"}\n`)

/** Find-or-create an Asset by exact name at a location. Keyed by id thereafter. */
async function ensureAsset(tx, locationId, name, category) {
  const found = await tx.asset.findFirst({ where: { locationId, name }, select: { id: true } })
  if (found) return { id: found.id, created: false }
  if (!APPLY) return { id: `<new:${name}>`, created: true }
  const a = await tx.asset.create({
    data: { locationId, name, category, dataSource: "CABLE_RUN_MIGRATION" },
    select: { id: true },
  })
  return { id: a.id, created: true }
}

async function ensurePort(tx, assetId, side, portIndex, label) {
  if (!APPLY) return { id: `<port:${assetId}/${side}/${portIndex}>`, created: true }
  const found = await tx.devicePort.findUnique({
    where: { assetId_side_portIndex: { assetId, side, portIndex } },
    select: { id: true },
  })
  if (found) return { id: found.id, created: false }
  const p = await tx.devicePort.create({ data: { assetId, side, portIndex, label }, select: { id: true } })
  return { id: p.id, created: true }
}

async function ensureLink(tx, clientId, kind, aPortId, bPortId) {
  if (!APPLY) return { created: true }
  // A port may hold at most one link of each kind; treat an existing one as done.
  const existing = await tx.portLink.findFirst({
    where: { kind, OR: [{ aPortId }, { bPortId: aPortId }, { aPortId: bPortId }, { bPortId }] },
    select: { id: true, aPortId: true, bPortId: true },
  })
  if (existing) {
    const same =
      (existing.aPortId === aPortId && existing.bPortId === bPortId) ||
      (existing.aPortId === bPortId && existing.bPortId === aPortId)
    // Already migrated is fine; a DIFFERENT cable on this port is a real conflict
    // and must not be reported as a successful no-op.
    if (same) return { created: false }
    throw new Error(`port already carries a different ${kind} link`)
  }
  await tx.portLink.create({ data: { clientId, kind, aPortId, bPortId } })
  return { created: true }
}

for (const run of runs) {
  const where = `${run.location?.name ?? "?"} / ${run.jackLabel}`

  // A run with no panel AND no switch has nothing to connect — it is a jack label
  // and nothing more. Leave it flat rather than inventing a topology for it.
  if (!run.panelAssetId && !run.panelLabel && !run.switchAssetId && run.switchPortNumber == null) {
    stats.skipped++
    continue
  }

  try {
    await prisma.$transaction(async (tx) => {
      // ── the wall outlet ────────────────────────────────────────────────────
      const outlet = await ensureAsset(tx, run.locationId, `Outlet ${run.jackLabel}`, "OTHER")
      if (outlet.created) stats.assetsCreated++
      const outletPort = await ensurePort(tx, outlet.id, "FRONT", 1, run.jackLabel)
      if (outletPort.created) stats.portsCreated++

      // ── the patch panel ───────────────────────────────────────────────────
      let panelFront = null
      if (run.panelAssetId || run.panelLabel) {
        // A named panel with no port number cannot be migrated: `?? 1` collapsed
        // every run in a closet onto FRONT/1 + REAR/1, ensureLink then reported
        // {created:false} for runs 2..N, and the script printed "links created: 1"
        // and exited 0. That is the DESIGNED capture shape (CablingPanel carries
        // panelLabel forward so a tech can bang out a closet), so it must be a
        // refusal, not a silent merge.
        if (run.panelPort == null) {
          throw new Error("panel named but panelPort is empty — set the port number, or clear the panel")
        }
        const panelId = run.panelAssetId
          ? { id: run.panelAssetId, created: false }
          : await ensureAsset(tx, run.locationId, run.panelLabel, "OTHER")
        if (panelId.created) stats.assetsCreated++

        const idx = run.panelPort
        const front = await ensurePort(tx, panelId.id, "FRONT", idx, run.jackLabel)
        const rear = await ensurePort(tx, panelId.id, "REAR", idx, run.jackLabel)
        if (front.created) stats.portsCreated++
        if (rear.created) stats.portsCreated++

        // The pairing is what makes the panel transparent to a trace.
        if (APPLY) await tx.devicePort.update({ where: { id: front.id }, data: { pairedPortId: rear.id } })

        // Permanent in-wall run: panel REAR to the outlet.
        if ((await ensureLink(tx, run.clientId, "BUILDING", rear.id, outletPort.id)).created) stats.linksCreated++
        panelFront = front
      }

      // ── the switch ────────────────────────────────────────────────────────
      if (run.switchAssetId && run.switchPortNumber != null) {
        const swPort = await ensurePort(tx, run.switchAssetId, "FRONT", run.switchPortNumber, null)
        if (swPort.created) stats.portsCreated++
        // The movable cord: switch to panel front when there is a panel, else
        // straight to the outlet (a home run with no panel is a real topology).
        const other = panelFront ?? outletPort
        if ((await ensureLink(tx, run.clientId, "PATCH", swPort.id, other.id)).created) stats.linksCreated++
      }
    })
    stats.runs++
  } catch (e) {
    stats.problems.push(`${where}: ${e.message}`)
  }
}

console.log(`  runs migrated     : ${stats.runs}`)
console.log(`  runs skipped      : ${stats.skipped}  (jack label only — nothing to connect)`)
console.log(`  assets created    : ${stats.assetsCreated}`)
console.log(`  ports created     : ${stats.portsCreated}`)
console.log(`  links created     : ${stats.linksCreated}`)
if (stats.problems.length) {
  console.log(`\n  ${stats.problems.length} problem(s):`)
  for (const p of stats.problems) console.log(`    - ${p}`)
}
if (!APPLY) console.log(`\n  DRY RUN — nothing was written. Re-run with --apply.`)

await prisma.$disconnect()
process.exit(stats.problems.length ? 1 : 0)
