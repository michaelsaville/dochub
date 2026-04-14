import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Standard field keys available on Asset model
// These map directly to Asset columns (plus typed extension fields)
const STANDARD_FIELDS = [
  "friendlyName", "make", "model", "serial", "assetTag",
  "ipAddress", "macAddress", "vlan", "switchPort",
  "managementUrl", "splashtopUrl", "driverUrl",
  "rdpEnabled", "vncEnabled",
  "firmwareVersion", "portCount",
  "os", "ram", "cpu", "storageCapacity",
  "purchaseDate", "warrantyExpiry",
  "room", "notes",
  "personId", "personId",
]

type TemplateDefinition = {
  standardFields: string[]
  customFieldDefs: { key: string; label: string; type: string; required: boolean }[]
  showSwitchPanel?: boolean
  showCameraPhoto?: boolean
}

const DEFAULT_TYPES: { name: string; sortOrder: number; template: TemplateDefinition }[] = [
  {
    name: "Switch",
    sortOrder: 10,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "portCount", "vlan", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
      showSwitchPanel: true,
    },
  },
  {
    name: "Router",
    sortOrder: 20,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Firewall",
    sortOrder: 30,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Access Point",
    sortOrder: 40,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "vlan", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "NAS",
    sortOrder: 50,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "storageCapacity", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Server",
    sortOrder: 60,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "os", "cpu", "ram", "storageCapacity", "rdpEnabled", "vncEnabled", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Virtual Host",
    sortOrder: 65,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "os", "cpu", "ram", "storageCapacity", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Desktop",
    sortOrder: 70,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "splashtopUrl", "driverUrl", "os", "cpu", "ram", "storageCapacity", "rdpEnabled", "vncEnabled", "personId", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Laptop",
    sortOrder: 80,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "splashtopUrl", "driverUrl", "os", "cpu", "ram", "storageCapacity", "rdpEnabled", "vncEnabled", "personId", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Tablet",
    sortOrder: 90,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "managementUrl", "splashtopUrl", "os", "ram", "storageCapacity", "personId", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Printer",
    sortOrder: 100,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [
        { key: "tonerModel", label: "Toner Model", type: "text", required: false },
        { key: "printSpeed", label: "Print Speed (ppm)", type: "text", required: false },
      ],
    },
  },
  {
    name: "Scanner",
    sortOrder: 110,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Phone System",
    sortOrder: 120,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
  {
    name: "Phone / Endpoint",
    sortOrder: 130,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "firmwareVersion", "personId", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [
        { key: "extension", label: "Extension", type: "text", required: false },
        { key: "did", label: "DID Number", type: "text", required: false },
      ],
    },
  },
  {
    name: "Camera",
    sortOrder: 140,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [
        { key: "recordingSchedule", label: "Recording Schedule", type: "text", required: false },
        { key: "coverageNotes", label: "Coverage Notes", type: "text", required: false },
      ],
      showCameraPhoto: true,
    },
  },
  {
    name: "NVR / DVR",
    sortOrder: 150,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "storageCapacity", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [
        { key: "retentionDays", label: "Retention (days)", type: "number", required: false },
        { key: "channelCount", label: "Channel Count", type: "number", required: false },
      ],
    },
  },
  {
    name: "UPS",
    sortOrder: 160,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "firmwareVersion", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [
        { key: "vaRating", label: "VA Rating", type: "number", required: false },
        { key: "wattRating", label: "Watt Rating", type: "number", required: false },
        { key: "runtimeMinutes", label: "Est. Runtime (min)", type: "number", required: false },
        { key: "batteryType", label: "Battery Type / Model", type: "text", required: false },
        { key: "numBatteryPacks", label: "Battery Packs", type: "number", required: false },
        { key: "batteryInstallDate", label: "Battery Install Date", type: "date", required: false },
        { key: "batteryExpiry", label: "Battery Replace By", type: "date", required: false },
        { key: "inputVoltage", label: "Input Voltage", type: "text", required: false },
        { key: "outputVoltage", label: "Output Voltage", type: "text", required: false },
        { key: "transferVoltage", label: "Transfer Voltage", type: "text", required: false },
        { key: "outlets", label: "Outlet Count", type: "number", required: false },
        { key: "connectedDevices", label: "Connected Devices", type: "text", required: false },
        { key: "managementCard", label: "Management Card Model", type: "text", required: false },
        { key: "snmpCommunity", label: "SNMP Community", type: "text", required: false },
      ],
    },
  },
  {
    name: "Other",
    sortOrder: 999,
    template: {
      standardFields: ["friendlyName", "make", "model", "serial", "assetTag", "ipAddress", "macAddress", "managementUrl", "room", "notes", "purchaseDate", "warrantyExpiry"],
      customFieldDefs: [],
    },
  },
]

export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  }

  const results: { name: string; action: "created" | "skipped" }[] = []

  for (const def of DEFAULT_TYPES) {
    const existing = await prisma.assetType.findFirst({ where: { name: def.name } })
    if (existing) {
      // Upsert the template even if type exists (allows re-seeding templates)
      await prisma.assetTypeTemplate.upsert({
        where: { assetTypeId: existing.id },
        create: {
          assetTypeId: existing.id,
          standardFields: def.template.standardFields,
          customFieldDefs: def.template.customFieldDefs,
          showSwitchPanel: def.template.showSwitchPanel ?? false,
          showCameraPhoto: def.template.showCameraPhoto ?? false,
        },
        update: {
          standardFields: def.template.standardFields,
          customFieldDefs: def.template.customFieldDefs,
          showSwitchPanel: def.template.showSwitchPanel ?? false,
          showCameraPhoto: def.template.showCameraPhoto ?? false,
        },
      })
      results.push({ name: def.name, action: "skipped" })
      continue
    }

    const assetType = await prisma.assetType.create({
      data: {
        name: def.name,
        sortOrder: def.sortOrder,
        template: {
          create: {
            standardFields: def.template.standardFields,
            customFieldDefs: def.template.customFieldDefs,
            showSwitchPanel: def.template.showSwitchPanel ?? false,
            showCameraPhoto: def.template.showCameraPhoto ?? false,
          },
        },
      },
    })
    results.push({ name: def.name, action: "created" })
  }

  return NextResponse.json({ ok: true, results })
}

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const types = await prisma.assetType.findMany({
    where: { isActive: true },
    include: { template: true },
    orderBy: { sortOrder: "asc" },
  })
  return NextResponse.json(types)
}
