import { z } from "zod"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { prisma } from "@/lib/prisma"
import { getAnthropic, INTAKE_MODEL } from "./anthropic"
import type { ExtractedContent } from "./extract"

const MAX_CANDIDATES = 3

const ASSET_CATEGORIES = [
  "NETWORK_GEAR",
  "WIRELESS",
  "SERVER",
  "NAS",
  "COMPUTER",
  "LAPTOP",
  "TABLET",
  "PRINTER",
  "PHONE_SYSTEM",
  "PHONE_ENDPOINT",
  "WEBSITE",
  "VPN",
  "OTHER",
] as const

const CAMERA_TYPES = ["IP_POE", "ANALOG", "WIRELESS", "FISHEYE", "PTZ"] as const
const PHONE_EXTENSION_TYPES = ["USER", "RING_GROUP", "IVR", "VOICEMAIL_ONLY", "FAX", "PAGING", "CONFERENCE"] as const

const MAX_BULK_ROWS = 50

const CandidateSchema = z.object({
  assetId: z
    .string()
    .nullable()
    .describe(
      "ID of the matching asset from the provided inventory, or null if the document is client-wide or unrelated to any asset.",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("0 to 1. How confident this is the right asset, given the file contents."),
  reasoning: z
    .string()
    .describe(
      "One or two sentences explaining why this asset matches (or why no asset matched), citing specific evidence from the file.",
    ),
  suggestedTitle: z.string().describe("Short human-readable document title, e.g. 'Firewall config export 2026-04'."),
  suggestedCategory: z
    .string()
    .describe(
      "Document category bucket — one of: config, diagram, invoice, contract, photo, camera-view, screenshot, manual, report, log, other.",
    ),
  summary: z.string().describe("2-4 sentence summary of what the file contains and why it's useful."),
})

const ProposedNewAssetSchema = z.object({
  category: z
    .enum(ASSET_CATEGORIES)
    .describe("Closest matching AssetCategory enum value for the device."),
  typeName: z
    .string()
    .describe("Human-readable type label, e.g. 'NVR', 'PoE Switch', 'Firewall', 'Workstation'."),
  suggestedName: z
    .string()
    .describe("A short unique-ish name for the asset, e.g. 'Dahua DVR - Warehouse' or 'Sonicwall TZ470'."),
  make: z.string().nullable().describe("Manufacturer if identifiable, else null."),
  model: z.string().nullable().describe("Model number/name if identifiable, else null."),
  serial: z.string().nullable().describe("Serial number if visible in the file, else null."),
  ipAddress: z.string().nullable().describe("IPv4/IPv6 address if visible, else null."),
  macAddress: z.string().nullable().describe("MAC address if visible, else null."),
  room: z.string().nullable().describe("Physical room/placement if mentioned, else null."),
  reasoning: z
    .string()
    .describe(
      "One sentence explaining why this looks like a device not yet tracked — cite what in the file points to it.",
    ),
})

const CameraActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setPhoto"),
    cameraId: z.string().describe("ID of an existing Camera from the inventory."),
    reasoning: z.string().describe("Why this file is the right reference/thumbnail photo for that camera."),
  }),
  z.object({
    type: z.literal("updateCamera"),
    cameraId: z.string().describe("ID of an existing Camera from the inventory."),
    fields: z
      .object({
        name: z.string().nullable(),
        location: z.string().nullable().describe("Physical description of what the camera covers."),
        coverageNotes: z.string().nullable(),
        resolution: z.string().nullable(),
        make: z.string().nullable(),
        model: z.string().nullable(),
        ipAddress: z.string().nullable(),
        macAddress: z.string().nullable(),
      })
      .describe(
        "Only include fields the file clearly evidences. Use null for everything else — the commit side only writes non-null keys.",
      ),
    reasoning: z.string(),
  }),
  z.object({
    type: z.literal("createCamera"),
    systemId: z.string().describe("ID of the parent CameraSystem from inventory this new camera attaches to."),
    fields: z.object({
      name: z.string().describe("Required. Short label, e.g. 'Parking Lot NE'."),
      cameraType: z.enum(CAMERA_TYPES).describe("Camera connection/form factor."),
      location: z.string().nullable(),
      coverageNotes: z.string().nullable(),
      resolution: z.string().nullable(),
      make: z.string().nullable(),
      model: z.string().nullable(),
      ipAddress: z.string().nullable(),
      macAddress: z.string().nullable(),
    }),
    reasoning: z.string(),
  }),
])

const BulkNewAssetSchema = z.object({
  category: z.enum(ASSET_CATEGORIES),
  name: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  ipAddress: z.string().nullable(),
  macAddress: z.string().nullable(),
  room: z.string().nullable(),
})

const BulkUpdateAssetSchema = z.object({
  assetId: z.string().describe("ID of an existing asset from the inventory."),
  fields: z.object({
    name: z.string().nullable(),
    friendlyName: z.string().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    serial: z.string().nullable(),
    assetTag: z.string().nullable(),
    ipAddress: z.string().nullable(),
    macAddress: z.string().nullable(),
    room: z.string().nullable(),
    notes: z.string().nullable(),
    firmwareVersion: z.string().nullable(),
    os: z.string().nullable(),
    ram: z.string().nullable(),
    cpu: z.string().nullable(),
    storageCapacity: z.string().nullable(),
  }),
})

const BulkNewCameraSchema = z.object({
  name: z.string(),
  cameraType: z.enum(CAMERA_TYPES),
  location: z.string().nullable(),
  coverageNotes: z.string().nullable(),
  resolution: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  ipAddress: z.string().nullable(),
  macAddress: z.string().nullable(),
})

const BulkNewExtensionSchema = z.object({
  extension: z.string().describe("Extension number like '101' or '2501'."),
  displayName: z.string(),
  extensionType: z.enum(PHONE_EXTENSION_TYPES),
  did: z.string().nullable().describe("Direct-inward-dial number if mapped."),
  voicemailEnabled: z.boolean(),
})

const BulkNewSwitchPortSchema = z.object({
  portNumber: z.number().int().describe("1-based physical port number."),
  label: z.string().nullable().describe("What's plugged into this port / destination description."),
  isUplink: z.boolean(),
  isPoe: z.boolean(),
  vlanNumber: z.number().int().nullable().describe("VLAN ID number (e.g. 10, 100) — we'll resolve it to the Vlan record."),
  notes: z.string().nullable(),
})

const BulkProposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("createAssets"),
    rationale: z.string().describe("Why you read this file as a list of assets to create."),
    items: z.array(BulkNewAssetSchema).max(MAX_BULK_ROWS),
  }),
  z.object({
    kind: z.literal("updateAssets"),
    rationale: z.string().describe("Why you read this file as updates to existing assets."),
    items: z.array(BulkUpdateAssetSchema).max(MAX_BULK_ROWS),
  }),
  z.object({
    kind: z.literal("createCameras"),
    rationale: z.string(),
    systemId: z.string().describe("ID of an existing CameraSystem from the inventory to attach all new cameras to."),
    items: z.array(BulkNewCameraSchema).max(MAX_BULK_ROWS),
  }),
  z.object({
    kind: z.literal("createPhoneExtensions"),
    rationale: z.string(),
    systemId: z.string().describe("ID of an existing PhoneSystem from the inventory."),
    items: z.array(BulkNewExtensionSchema).max(MAX_BULK_ROWS),
  }),
  z.object({
    kind: z.literal("createSwitchPorts"),
    rationale: z.string(),
    assetId: z.string().describe("ID of an existing switch Asset to attach ports to."),
    items: z.array(BulkNewSwitchPortSchema).max(MAX_BULK_ROWS),
  }),
])

const ResponseSchema = z.object({
  candidates: z
    .array(CandidateSchema)
    .max(MAX_CANDIDATES)
    .describe(
      "Up to 3 candidate matches against EXISTING assets, ordered by confidence descending. Include plausible low-confidence options (down to ~0.3). Empty array ONLY if nothing coherent.",
    ),
  proposedNewAsset: ProposedNewAssetSchema.nullable().describe(
    "When the file clearly refers to a device NOT in the inventory and the user should probably create it: fill this in. Otherwise null. This is additive to candidates — the reviewer can still pick one of them if they prefer.",
  ),
  cameraAction: CameraActionSchema.nullable().describe(
    "Optional camera-specific write: when the file is a camera view/photo or contains camera metadata, propose what to write to the Camera record (set thumbnail, update fields, or create a new Camera under a known CameraSystem). Null when no camera action applies.",
  ),
  bulkProposal: BulkProposalSchema.nullable().describe(
    "When the file is a LIST of many items (CSV asset export, switch config dump, phone extension list, camera list) — propose a bulk operation with per-row data. Cap 50 rows. Do NOT fabricate rows: only include what's actually evidenced in the file. Set null when there's only one subject (single device, single camera) — use proposedNewAsset or cameraAction for those.",
  ),
  extractedData: z
    .object({
      serials: z.array(z.string()).describe("Serial numbers/tags spotted."),
      ipAddresses: z.array(z.string()),
      macAddresses: z.array(z.string()),
      hostnames: z.array(z.string()).describe("Device names/hostnames/on-screen labels."),
      notableStrings: z.array(z.string()).describe("Anything else salient for identification."),
    })
    .describe("Structured metadata pulled out of the file. Every field present, possibly empty."),
})

export type ClassifyResult = z.infer<typeof ResponseSchema>
export type Candidate = z.infer<typeof CandidateSchema>
export type ProposedNewAsset = z.infer<typeof ProposedNewAssetSchema>
export type CameraAction = z.infer<typeof CameraActionSchema>
export type BulkProposal = z.infer<typeof BulkProposalSchema>

export interface ClassifyInput {
  clientId: string
  filename: string
  mimeType: string
  extracted: ExtractedContent
  userContext?: string
}

export interface ClassifyOutput {
  result: ClassifyResult
  usage: { inputTokens: number; outputTokens: number }
  modelId: string
}

async function buildClientInventoryBlock(clientId: string): Promise<string> {
  const [client, assets, cameraSystems, phoneSystems, vlans, switchPorts, existingDocs] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, type: true, notes: true },
    }),
    prisma.asset.findMany({
      where: { location: { clientId } },
      select: {
        id: true,
        name: true,
        friendlyName: true,
        make: true,
        model: true,
        serial: true,
        assetTag: true,
        ipAddress: true,
        macAddress: true,
        room: true,
        category: true,
        notes: true,
        location: { select: { name: true } },
        assetType: { select: { name: true } },
        cameraSystems: { select: { type: true } },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 500,
    }),
    prisma.cameraSystem.findMany({
      where: { clientId },
      select: {
        id: true,
        name: true,
        type: true,
        assetId: true,
        cameras: {
          select: {
            id: true,
            name: true,
            type: true,
            make: true,
            model: true,
            ipAddress: true,
            macAddress: true,
            resolution: true,
            location: true,
            coverageNotes: true,
            photoStorageName: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.phoneSystem.findMany({
      where: { clientId, isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        assetId: true,
        _count: { select: { extensions: true } },
      },
    }),
    prisma.vlan.findMany({
      where: { clientId },
      select: { id: true, vlanNumber: true, name: true, description: true },
      orderBy: { vlanNumber: "asc" },
    }),
    prisma.switchPort.findMany({
      where: { asset: { location: { clientId } } },
      select: {
        id: true,
        assetId: true,
        portNumber: true,
        label: true,
        isUplink: true,
        vlanId: true,
      },
      orderBy: [{ assetId: "asc" }, { portNumber: "asc" }],
      take: 2000,
    }),
    prisma.clientDocument.findMany({
      where: { clientId },
      select: { id: true, title: true, category: true, assetId: true },
      take: 50,
      orderBy: { updatedAt: "desc" },
    }),
  ])

  if (!client) throw new Error(`Client ${clientId} not found`)

  const lines: string[] = []
  lines.push(`<client>`)
  lines.push(`  <id>${client.id}</id>`)
  lines.push(`  <name>${client.name}</name>`)
  lines.push(`  <type>${client.type}</type>`)
  if (client.notes) lines.push(`  <notes>${client.notes}</notes>`)
  lines.push(`</client>`)

  lines.push(`<assets count="${assets.length}">`)
  for (const a of assets) {
    const parts: string[] = [`id="${a.id}"`, `name="${escapeAttr(a.name)}"`]
    if (a.friendlyName) parts.push(`friendly="${escapeAttr(a.friendlyName)}"`)
    parts.push(`category="${a.category}"`)
    if (a.assetType?.name) parts.push(`type="${escapeAttr(a.assetType.name)}"`)
    if (a.cameraSystems.length > 0) parts.push(`cameraType="${a.cameraSystems[0].type}"`)
    if (a.make) parts.push(`make="${escapeAttr(a.make)}"`)
    if (a.model) parts.push(`model="${escapeAttr(a.model)}"`)
    if (a.serial) parts.push(`serial="${escapeAttr(a.serial)}"`)
    if (a.assetTag) parts.push(`tag="${escapeAttr(a.assetTag)}"`)
    if (a.ipAddress) parts.push(`ip="${escapeAttr(a.ipAddress)}"`)
    if (a.macAddress) parts.push(`mac="${escapeAttr(a.macAddress)}"`)
    if (a.location?.name) parts.push(`location="${escapeAttr(a.location.name)}"`)
    if (a.room) parts.push(`room="${escapeAttr(a.room)}"`)
    lines.push(`  <asset ${parts.join(" ")} />`)
  }
  lines.push(`</assets>`)

  if (phoneSystems.length > 0) {
    lines.push(`<phone_systems count="${phoneSystems.length}">`)
    for (const sys of phoneSystems) {
      const parts = [
        `id="${sys.id}"`,
        `name="${escapeAttr(sys.name)}"`,
        `type="${sys.type}"`,
        `extensionsCount="${sys._count.extensions}"`,
      ]
      if (sys.assetId) parts.push(`assetId="${sys.assetId}"`)
      lines.push(`  <phoneSystem ${parts.join(" ")} />`)
    }
    lines.push(`</phone_systems>`)
  }

  if (vlans.length > 0) {
    lines.push(`<vlans count="${vlans.length}">`)
    for (const v of vlans) {
      const parts = [`id="${v.id}"`, `number="${v.vlanNumber}"`, `name="${escapeAttr(v.name)}"`]
      if (v.description) parts.push(`desc="${escapeAttr(v.description)}"`)
      lines.push(`  <vlan ${parts.join(" ")} />`)
    }
    lines.push(`</vlans>`)
  }

  if (switchPorts.length > 0) {
    // Group by assetId so the model sees which switch the ports belong to.
    const byAsset = new Map<string, typeof switchPorts>()
    for (const p of switchPorts) {
      if (!p.assetId) continue
      const arr = byAsset.get(p.assetId) ?? []
      arr.push(p)
      byAsset.set(p.assetId, arr)
    }
    lines.push(`<switch_ports byAsset="${byAsset.size}">`)
    for (const [assetId, ports] of byAsset) {
      lines.push(`  <switch assetId="${assetId}" portCount="${ports.length}">`)
      for (const p of ports) {
        const pParts = [`id="${p.id}"`, `port="${p.portNumber}"`]
        if (p.label) pParts.push(`label="${escapeAttr(p.label)}"`)
        if (p.isUplink) pParts.push(`uplink="1"`)
        if (p.vlanId) pParts.push(`vlanId="${p.vlanId}"`)
        lines.push(`    <port ${pParts.join(" ")} />`)
      }
      lines.push(`  </switch>`)
    }
    lines.push(`</switch_ports>`)
  }

  if (cameraSystems.length > 0) {
    lines.push(`<camera_systems count="${cameraSystems.length}">`)
    for (const sys of cameraSystems) {
      const sysParts = [`id="${sys.id}"`, `name="${escapeAttr(sys.name)}"`, `type="${sys.type}"`]
      if (sys.assetId) sysParts.push(`assetId="${sys.assetId}"`)
      lines.push(`  <system ${sysParts.join(" ")}>`)
      for (const c of sys.cameras) {
        const cParts = [`id="${c.id}"`, `name="${escapeAttr(c.name)}"`, `type="${c.type}"`]
        if (c.make) cParts.push(`make="${escapeAttr(c.make)}"`)
        if (c.model) cParts.push(`model="${escapeAttr(c.model)}"`)
        if (c.ipAddress) cParts.push(`ip="${escapeAttr(c.ipAddress)}"`)
        if (c.macAddress) cParts.push(`mac="${escapeAttr(c.macAddress)}"`)
        if (c.resolution) cParts.push(`resolution="${escapeAttr(c.resolution)}"`)
        if (c.location) cParts.push(`location="${escapeAttr(c.location)}"`)
        if (c.photoStorageName) cParts.push(`hasPhoto="true"`)
        lines.push(`    <camera ${cParts.join(" ")} />`)
      }
      lines.push(`  </system>`)
    }
    lines.push(`</camera_systems>`)
  }

  if (existingDocs.length > 0) {
    lines.push(`<recent_documents count="${existingDocs.length}">`)
    for (const d of existingDocs) {
      const parts = [`id="${d.id}"`, `title="${escapeAttr(d.title)}"`]
      if (d.category) parts.push(`category="${escapeAttr(d.category)}"`)
      if (d.assetId) parts.push(`assetId="${d.assetId}"`)
      lines.push(`  <doc ${parts.join(" ")} />`)
    }
    lines.push(`</recent_documents>`)
  }

  return lines.join("\n")
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function systemPrompt(): string {
  return `You are a documentation routing assistant for an MSP (managed service provider). Analyze the file the technician just uploaded and decide how to file it.

You will be given:
  1. The client's inventory: <assets>, <phone_systems>, <vlans>, <switch_ports> grouped by switch, <camera_systems> with nested <camera> records, and recent <documents>.
  2. A file — either extracted text (PDF/CSV/log), an image (camera view, device photo, UI screenshot), or a free-form technician note.

You must return JSON with these fields:

CANDIDATES — up to 3 matches against EXISTING assets in the inventory.
  - Ground every match in CONCRETE evidence: serial, MAC, IP, hostname, visible label, screen text.
  - If the file is a camera view/screenshot, the usual matching asset is the DVR/NVR recording it (find the CameraSystem, use its assetId).
  - If the file is plainly client-wide (master list, diagram, policy, invoice covering the whole site) → one candidate with assetId=null.
  - If multiple plausible existing matches, list them all (up to 3).
  - Empty array is acceptable if nothing matches AND no new-asset proposal fits.
  - suggestedCategory: one of config, diagram, invoice, contract, photo, camera-view, screenshot, manual, report, log, other.

PROPOSED_NEW_ASSET — optional.
  - Set this ONLY when the file clearly identifies a device that is NOT in the inventory (serial not present, hostname unknown, visible label like 'Dahua XVR5108 ... S/N ABC123' and no asset has that serial).
  - Do NOT propose a new asset just because confidence on matches is low — only when the evidence is strong that it's a different device.
  - Be conservative: null is the correct answer for most files.

CAMERA_ACTION — optional. Only set when the file is a camera view or contains camera metadata and there is a clear target CameraSystem in <camera_systems>.
  - setPhoto: when the file is a reference/field-of-view image for an existing camera — ground it in matching <camera> name/location/resolution.
  - updateCamera: when the file reveals new metadata for an existing camera (e.g., label text "Entry East 4MP PTZ" lets you fill in name/resolution/type). Only include fields the file clearly evidences; null everything else.
  - createCamera: when the file shows a camera that's clearly part of an existing CameraSystem but not yet tracked.
  - Tie-break conservatively: if multiple cameras look possible, prefer updateCamera over createCamera; if the photo already exists on the target camera, prefer updateCamera with any new fields.

BULK_PROPOSAL — set when the file is a LIST of many items (CSV asset export, switch port configs, phone extension roster, camera list). Pick ONE of these shapes:
  - createAssets: many new devices (network gear, phones, workstations, servers…). Include category, name (required), and whatever fields are evidenced per row.
  - updateAssets: each row references an existing asset (match by serial/IP/MAC/name from the inventory) and updates its fields. Only populate fields with NEW info — use null where the CSV doesn't say anything new.
  - createCameras: many cameras under ONE existing CameraSystem (systemId from inventory).
  - createPhoneExtensions: many extensions under ONE existing PhoneSystem (systemId from inventory). Skip if no PhoneSystem matches.
  - createSwitchPorts: port configs for ONE existing switch Asset (assetId). Use the numeric vlanNumber from the CSV; the server resolves it to the Vlan record by (clientId, vlanNumber).
  - Cap at 50 rows. Never fabricate rows. If the CSV has >50 relevant rows, take the first 50 and note that in rationale.
  - Set bulkProposal to null when the file has a SINGLE subject — use proposedNewAsset/cameraAction instead.
  - When setting bulkProposal, you can also still set candidates (for the document-level matching) and/or proposedNewAsset, but usually bulkProposal alone is enough.

Overall style: terse, evidence-driven. No flattery, no hedging beyond confidence. Never invent a serial/IP/MAC/extension/port that isn't visible.`
}

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  const { clientId, filename, mimeType, extracted, userContext } = input
  const anthropic = getAnthropic()

  const inventory = await buildClientInventoryBlock(clientId)

  const userContent: Anthropic.ContentBlockParam[] = []
  userContent.push({
    type: "text",
    text: `Client inventory (stable — cache this):\n\n${inventory}`,
    cache_control: { type: "ephemeral" },
  })

  const contextLine = userContext?.trim()
    ? `\n\n<technician_note>\n${userContext.trim()}\n</technician_note>\nTreat the technician's note as strong additional signal — it may name the asset or site directly.`
    : ""
  const fileHeader = `File uploaded by technician:\n  filename: ${filename}\n  mimeType: ${mimeType}\n  preprocessing: ${extracted.summary}${contextLine}`

  if (extracted.kind === "text") {
    userContent.push({
      type: "text",
      text: `${fileHeader}\n\n<file_contents>\n${extracted.text}\n</file_contents>\n\nReturn structured JSON per the schema.`,
    })
  } else if (extracted.kind === "image") {
    userContent.push({ type: "text", text: fileHeader })
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: extracted.mediaType, data: extracted.base64 },
    })
    userContent.push({ type: "text", text: "Return structured JSON per the schema." })
  } else {
    userContent.push({
      type: "text",
      text: `${fileHeader}\n\nThe file contents could not be extracted automatically. Reason from the filename alone; if insufficient, return empty candidates and null proposals.`,
    })
  }

  const response = await anthropic.messages.parse({
    model: INTAKE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt(),
    messages: [{ role: "user", content: userContent }],
    output_config: {
      format: zodOutputFormat(ResponseSchema),
    },
  })

  const result = response.parsed_output as ClassifyResult | null
  if (!result) throw new Error("AI did not return parseable JSON")

  return {
    result,
    usage: {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    },
    modelId: INTAKE_MODEL,
  }
}
