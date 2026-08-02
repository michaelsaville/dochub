// physical-layer-coverage.mjs — how much of the physical layer is actually documented.
//
// Why this exists: DocHub shipped a physical-layer substrate (Rack, RackSlot,
// SwitchPort, AssetInterface) long before anyone populated it. The failure mode of
// every cable-documentation tool is an empty schema, so the metric that matters is
// COVERAGE, not capability. This script is the measurement — run it before building
// to capture a baseline, and after to prove the work moved a number.
//
// Deliberately raw SQL guarded by to_regclass: it runs unchanged before AND after
// the Phase 1-4 tables (CableRun, DevicePort, PortLink, Floor, Room) exist, so the
// same script produces comparable output across the whole build.
//
// Needs DATABASE_URL. Run from the app root:
//   cd ~/dochub/app
//   DATABASE_URL="postgresql://dochub:PW@172.18.0.7:5432/dochub" node scripts/physical-layer-coverage.mjs
// (the db container publishes no host port; 172.18.0.7 is its docker-network IP —
//  `docker inspect dochub-db-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'`)
//
// Flags:
//   --json        emit machine-readable output instead of the table
//   --min=<pct>   exit 1 if coverage is below this percentage — THIS IS THE GATE.
//                 Baseline when the feature shipped was 3.3% (6 of 182 locations,
//                 all pre-existing Asset.room values, zero cable runs). The plan
//                 says Phase 2+ is justified only if capture actually happens in
//                 normal field use, so the number to beat is stated here rather
//                 than left as a judgement call nobody makes:
//
//                     GATE: >= 10% coverage AND >= 25 CableRun rows by 2026-10-01
//
//                 Run from cron and append the series:
//                     0 6 * * *  cd ~/dochub/app && DATABASE_URL=... \
//                       node scripts/physical-layer-coverage.mjs --json \
//                       >> ~/backups/dochub/physlayer-coverage.jsonl
//   --strict      alias for --min=0.01 (any coverage at all)
//
// Read-only. Never writes.

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const AS_JSON = process.argv.includes("--json")
const MIN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--min="))
  if (arg) return Number(arg.slice(6))
  return process.argv.includes("--strict") ? 0.01 : null
})()

/** Does a table exist yet? Lets one script span the whole build. */
async function tableExists(name) {
  const r = await prisma.$queryRawUnsafe(`SELECT to_regclass('public."${name}"') IS NOT NULL AS ok`)
  return Boolean(r[0]?.ok)
}

/** Single scalar, coerced from BigInt (pg count() comes back as BigInt). */
async function scalar(sql) {
  const r = await prisma.$queryRawUnsafe(sql)
  const v = Object.values(r[0] ?? {})[0]
  return v === null || v === undefined ? 0 : Number(v)
}

/** Runs `sql` only if every table in `deps` exists; otherwise returns null (= "not built yet"). */
async function scalarIf(deps, sql) {
  for (const t of deps) if (!(await tableExists(t))) return null
  return scalar(sql)
}

const metrics = []
const add = (section, label, value, denom) => metrics.push({ section, label, value, denom })

// ---- scale: what there is to document -------------------------------------
const clients = await scalar(`SELECT count(*) FROM "Client"`)
const locations = await scalar(`SELECT count(*) FROM "Location"`)
const assets = await scalar(`SELECT count(*) FROM "Asset"`)
add("Scale", "Clients", clients)
add("Scale", "Locations", locations)
add("Scale", "Assets", assets)

// ---- placement: is anything tied to physical space? ------------------------
add("Placement", "Assets with a room (free text)", await scalar(`SELECT count(*) FROM "Asset" WHERE "room" IS NOT NULL AND "room" <> ''`), assets)
add("Placement", "Distinct room strings in use", await scalar(`SELECT count(DISTINCT "room") FROM "Asset" WHERE "room" IS NOT NULL AND "room" <> ''`))
add("Placement", "Assets with legacy switchPort text", await scalar(`SELECT count(*) FROM "Asset" WHERE "switchPort" IS NOT NULL AND "switchPort" <> ''`), assets)
add("Placement", "Assets linked to a Room entity", await scalarIf(["Room"], `SELECT count(*) FROM "Asset" WHERE "roomId" IS NOT NULL`), assets)
add("Placement", "Assets pinned on a floor plan", await scalarIf(["Floor"], `SELECT count(*) FROM "Asset" WHERE "planX" IS NOT NULL`), assets)

// ---- racks ------------------------------------------------------------------
add("Racks", "Racks", await scalar(`SELECT count(*) FROM "Rack"`))
add("Racks", "Rack slots filled", await scalar(`SELECT count(*) FROM "RackSlot"`))
add("Racks", "Locations with >=1 rack", await scalar(`SELECT count(DISTINCT "locationId") FROM "Rack"`), locations)

// ---- ports: the substrate that has never been filled in --------------------
const ports = await scalar(`SELECT count(*) FROM "SwitchPort"`)
add("Ports", "SwitchPort rows", ports)
add("Ports", "  ...labeled", await scalar(`SELECT count(*) FROM "SwitchPort" WHERE "label" IS NOT NULL AND "label" <> ''`), ports)
add("Ports", "  ...VLAN-tagged", await scalar(`SELECT count(*) FROM "SwitchPort" WHERE "vlanId" IS NOT NULL`), ports)
add("Ports", "  ...marked uplink", await scalar(`SELECT count(*) FROM "SwitchPort" WHERE "isUplink" = true`), ports)
add("Ports", "  ...marked PoE", await scalar(`SELECT count(*) FROM "SwitchPort" WHERE "isPoe" = true`), ports)
add("Ports", "  ...on legacy NetworkDevice", await scalar(`SELECT count(*) FROM "SwitchPort" WHERE "networkDeviceId" IS NOT NULL`), ports)
const ifaces = await scalar(`SELECT count(*) FROM "AssetInterface"`)
add("Ports", "AssetInterface rows", ifaces)
add("Ports", "  ...patched to a switch port", await scalar(`SELECT count(*) FROM "AssetInterface" WHERE "switchPortId" IS NOT NULL`), ifaces)

// ---- logical network (for contrast — these are populated or not) -----------
add("Logical", "VLANs", await scalar(`SELECT count(*) FROM "Vlan"`))
add("Logical", "Subnets", await scalar(`SELECT count(*) FROM "Subnet"`))
add("Logical", "IP assignments", await scalar(`SELECT count(*) FROM "IpAssignment"`))

// ---- the new physical layer (null until each phase lands) ------------------
const runs = await scalarIf(["CableRun"], `SELECT count(*) FROM "CableRun"`)
add("Cable runs", "CableRun rows", runs)
// NB: photoStorageName, not photoAttachmentId — the house convention for images on
// physical entities is a bare storage name with no FK (cf. Rack, Camera). This script
// predates the model and originally guessed the FK name, which made it crash the
// moment the table actually existed.
add("Cable runs", "  ...with a photo", await scalarIf(["CableRun"], `SELECT count(*) FROM "CableRun" WHERE "photoStorageName" IS NOT NULL`), runs)
add("Cable runs", "  ...verified in last 90d", await scalarIf(["CableRun"], `SELECT count(*) FROM "CableRun" WHERE "lastVerifiedAt" > now() - interval '90 days'`), runs)
add("Cable runs", "  ...terminating on a known switch port", await scalarIf(["CableRun"], `SELECT count(*) FROM "CableRun" WHERE "switchPortId" IS NOT NULL`), runs)
add("Cable runs", "Locations with >=1 cable run", await scalarIf(["CableRun"], `SELECT count(DISTINCT "locationId") FROM "CableRun"`), locations)

add("Port graph", "DevicePort rows", await scalarIf(["DevicePort"], `SELECT count(*) FROM "DevicePort"`))
add("Port graph", "  ...rear-side", await scalarIf(["DevicePort"], `SELECT count(*) FROM "DevicePort" WHERE "side" = 'REAR'`))
add("Port graph", "PortLink BUILDING (permanent cabling)", await scalarIf(["PortLink"], `SELECT count(*) FROM "PortLink" WHERE "kind" = 'BUILDING'`))
add("Port graph", "PortLink PATCH (movable cords)", await scalarIf(["PortLink"], `SELECT count(*) FROM "PortLink" WHERE "kind" = 'PATCH'`))

add("Floor plans", "Floors", await scalarIf(["Floor"], `SELECT count(*) FROM "Floor"`))
add("Floor plans", "  ...with a scaled plan image", await scalarIf(["Floor"], `SELECT count(*) FROM "Floor" WHERE "pxPerMetre" IS NOT NULL`))
add("Floor plans", "Rooms drawn", await scalarIf(["Room"], `SELECT count(*) FROM "Room"`))

// ---- headline: locations with ANY physical documentation -------------------
const hasCableRun = await tableExists("CableRun")
const hasFloor = await tableExists("Floor")
const hasPortLink = await tableExists("PortLink")
const documented = await scalar(`
  SELECT count(*) FROM "Location" l WHERE
       EXISTS (SELECT 1 FROM "Rack" r WHERE r."locationId" = l.id)
    OR EXISTS (SELECT 1 FROM "Asset" a WHERE a."locationId" = l.id AND a."room" IS NOT NULL AND a."room" <> '')
    OR EXISTS (SELECT 1 FROM "Asset" a JOIN "SwitchPort" sp ON sp."assetId" = a.id
               WHERE a."locationId" = l.id AND sp."label" IS NOT NULL AND sp."label" <> '')
    ${hasCableRun ? `OR EXISTS (SELECT 1 FROM "CableRun" c WHERE c."locationId" = l.id)` : ""}
    ${hasFloor ? `OR EXISTS (SELECT 1 FROM "Floor" f WHERE f."locationId" = l.id AND f."planStorageName" IS NOT NULL)` : ""}
    ${hasPortLink ? `OR EXISTS (SELECT 1 FROM "PortLink" pl
                                JOIN "DevicePort" dp ON dp.id = pl."aPortId"
                                JOIN "Asset" a2 ON a2.id = dp."assetId"
                                WHERE a2."locationId" = l.id)` : ""}
`)
const coverage = locations ? (documented / locations) * 100 : 0

await prisma.$disconnect()

if (AS_JSON) {
  // ONE line, with a timestamp. Pretty-printed multi-line JSON with no date cannot
  // form a series when appended by cron, which is the only way the gate ever fires.
  console.log(JSON.stringify({ at: new Date().toISOString(), coverage, documented, locations, metrics }))
} else {
  const pct = (v, d) => (d ? ` (${((v / d) * 100).toFixed(1)}%)` : "")
  let section = null
  console.log("")
  for (const m of metrics) {
    if (m.section !== section) {
      section = m.section
      console.log(`\n${section}`)
      console.log("-".repeat(58))
    }
    const val = m.value === null ? "— not built yet" : m.value.toLocaleString() + pct(m.value, m.denom)
    console.log(`  ${m.label.padEnd(42)} ${val}`)
  }
  console.log("\n" + "=".repeat(58))
  console.log(`  COVERAGE: ${documented} of ${locations} locations have any physical`)
  console.log(`  documentation at all — ${coverage.toFixed(1)}%`)
  console.log("=".repeat(58) + "\n")
}

if (MIN !== null && coverage < MIN) {
  console.error(`GATE FAILED: coverage ${coverage.toFixed(1)}% is below the ${MIN}% threshold.`)
  process.exit(1)
}
