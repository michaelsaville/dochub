import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Starter Flexible Asset layouts a former IT Glue user expects. Idempotent:
// upsert-by-slug for the layout, then sync each field by (layoutId, key) and
// prune any field whose key is no longer in the definition. Field keys are
// STABLE (immutable once instances exist) so re-seeding is safe.

type SeedField = {
  key: string
  label: string
  type: string
  required?: boolean
  showInList?: boolean
  useForTitle?: boolean
  hint?: string | null
  options?: string[]
  relationTarget?: string | null
  expires?: boolean
}

type SeedLayout = {
  slug: string
  name: string
  icon: string
  color: string
  description: string
  fields: SeedField[]
}

const LAYOUTS: SeedLayout[] = [
  {
    slug: "ssl-certificate",
    name: "SSL Certificate",
    icon: "🔒",
    color: "#16a34a",
    description: "TLS/SSL certificates with issuer and expiry tracking.",
    fields: [
      { key: "domain", label: "Domain", type: "text", required: true, showInList: true, useForTitle: true },
      { key: "issuer", label: "Issuer", type: "text", showInList: true },
      { key: "expiry", label: "Expiry Date", type: "date", showInList: true, expires: true },
      { key: "certificate", label: "Certificate File", type: "upload" },
    ],
  },
  {
    slug: "lob-application",
    name: "LOB Application",
    icon: "💼",
    color: "#3d6fff",
    description: "Line-of-business applications, their vendor, URL and support contact.",
    fields: [
      { key: "name", label: "Application Name", type: "text", required: true, showInList: true, useForTitle: true },
      { key: "vendor", label: "Vendor", type: "relation", relationTarget: "Vendor", showInList: true },
      { key: "url", label: "URL", type: "website", showInList: true },
      { key: "supportContact", label: "Support Contact", type: "relation", relationTarget: "Person" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    slug: "email-dns",
    name: "Email / DNS",
    icon: "📧",
    color: "#7c3aed",
    description: "Email provider and DNS/MX record documentation.",
    fields: [
      { key: "provider", label: "Provider", type: "select", options: ["M365", "Google", "Other"], required: true, showInList: true, useForTitle: true },
      { key: "mxRecords", label: "MX Records", type: "textarea" },
      { key: "dnsRecords", label: "DNS Records", type: "textarea" },
    ],
  },
  {
    slug: "warranty-contract",
    name: "Warranty / Contract",
    icon: "📑",
    color: "#d97706",
    description: "Vendor warranties and service contracts with expiry alerts.",
    fields: [
      { key: "vendor", label: "Vendor", type: "relation", relationTarget: "Vendor", showInList: true },
      { key: "expiry", label: "Expiry Date", type: "date", showInList: true, expires: true },
      { key: "document", label: "Document", type: "upload" },
    ],
  },
  {
    slug: "wireless-ssid",
    name: "Wireless / SSID",
    icon: "📶",
    color: "#0891b2",
    description: "Wireless networks: SSID, passphrase and VLAN.",
    fields: [
      { key: "ssid", label: "SSID", type: "text", required: true, showInList: true, useForTitle: true },
      { key: "passphrase", label: "Passphrase", type: "password" },
      { key: "vlan", label: "VLAN", type: "number", showInList: true },
    ],
  },
]

export async function POST() {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const results: { slug: string; action: "created" | "updated"; fields: number }[] = []

    for (const [i, def] of LAYOUTS.entries()) {
      const existing = await prisma.flexLayout.findUnique({ where: { slug: def.slug }, select: { id: true } })
      const layout = await prisma.flexLayout.upsert({
        where: { slug: def.slug },
        create: {
          slug: def.slug,
          name: def.name,
          icon: def.icon,
          color: def.color,
          description: def.description,
          sortOrder: (i + 1) * 10,
        },
        update: {
          name: def.name,
          icon: def.icon,
          color: def.color,
          description: def.description,
          isActive: true,
        },
      })

      const keys = def.fields.map((f) => f.key)
      await prisma.flexLayoutField.deleteMany({
        where: { layoutId: layout.id, key: { notIn: keys } },
      })
      for (const [pos, f] of def.fields.entries()) {
        await prisma.flexLayoutField.upsert({
          where: { layoutId_key: { layoutId: layout.id, key: f.key } },
          create: {
            layoutId: layout.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required ?? false,
            showInList: f.showInList ?? false,
            useForTitle: f.useForTitle ?? false,
            hint: f.hint ?? null,
            position: pos,
            options: f.options ?? [],
            relationTarget: f.relationTarget ?? null,
            expires: f.expires ?? false,
          },
          update: {
            label: f.label,
            type: f.type,
            required: f.required ?? false,
            showInList: f.showInList ?? false,
            useForTitle: f.useForTitle ?? false,
            hint: f.hint ?? null,
            position: pos,
            options: f.options ?? [],
            relationTarget: f.relationTarget ?? null,
            expires: f.expires ?? false,
          },
        })
      }

      results.push({ slug: def.slug, action: existing ? "updated" : "created", fields: def.fields.length })
    }

    return NextResponse.json({ ok: true, results })
  } catch (e) {
    console.error("[seed-flex-layouts] failed", e)
    return NextResponse.json({ error: "Failed to seed flex layouts" }, { status: 500 })
  }
}
