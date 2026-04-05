import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

// Attempt to map ITFlow asset type strings to DocHub AssetCategory enum
function mapAssetCategory(type: string | undefined): string {
  if (!type) return "OTHER"
  const t = type.toLowerCase()
  if (t.includes("server")) return "SERVER"
  if (t.includes("nas") || t.includes("storage")) return "NAS"
  if (t.includes("laptop") || t.includes("notebook")) return "LAPTOP"
  if (t.includes("desktop") || t.includes("computer") || t.includes("workstation")) return "COMPUTER"
  if (t.includes("tablet") || t.includes("ipad")) return "TABLET"
  if (t.includes("switch")) return "NETWORK_GEAR"
  if (t.includes("firewall") || t.includes("router") || t.includes("network")) return "NETWORK_GEAR"
  if (t.includes("access point") || t.includes("ap") || t.includes("wifi") || t.includes("wireless")) return "WIRELESS"
  if (t.includes("printer") || t.includes("mfp")) return "PRINTER"
  if (t.includes("phone") || t.includes("pbx") || t.includes("voip")) return "PHONE_SYSTEM"
  if (t.includes("vpn")) return "VPN"
  return "OTHER"
}

function parseDate(val: string | undefined): Date | null {
  if (!val?.trim()) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const body = await req.json()
    const { type, rows } = body as {
      type: "clients" | "contacts" | "assets" | "credentials" | "licenses"
      rows: any[]
    }

    let created = 0
    let skipped = 0
    const errors: string[] = []

    if (type === "clients") {
      for (const row of rows) {
        if (row.action === "skip") { skipped++; continue }
        try {
          if (row.action === "match") {
            // User matched this row to an existing client — nothing to create
            skipped++
            continue
          }
          // action === "create"
          const { name, notes, address, city, state, zip } = row.data
          if (!name?.trim()) { errors.push(`Skipped row: missing name`); skipped++; continue }
          const client = await prisma.client.create({
            data: { name: name.trim(), notes: notes?.trim() || null },
          })
          // If address data present, create a primary location
          if (address?.trim() || city?.trim()) {
            await prisma.location.create({
              data: {
                clientId: client.id,
                name: "Main Office",
                address: address?.trim() || null,
                city: city?.trim() || null,
                state: state?.trim() || null,
                zip: zip?.trim() || null,
              },
            })
          }
          created++
        } catch (e: any) {
          errors.push(`Row "${row.data?.name}": ${e.message}`)
          skipped++
        }
      }
    }

    else if (type === "contacts") {
      for (const row of rows) {
        if (row.action === "skip" || !row.clientId) { skipped++; continue }
        try {
          const { name, role, email, phone, mobile, notes } = row.data
          if (!name?.trim()) { skipped++; continue }
          await prisma.contact.create({
            data: {
              clientId: row.clientId,
              name: name.trim(),
              role: role?.trim() || null,
              email: email?.trim() || null,
              phone: phone?.trim() || null,
              mobile: mobile?.trim() || null,
              notes: notes?.trim() || null,
            },
          })
          created++
        } catch (e: any) {
          errors.push(`Contact "${row.data?.name}": ${e.message}`)
          skipped++
        }
      }
    }

    else if (type === "assets") {
      for (const row of rows) {
        if (row.action === "skip" || !row.clientId) { skipped++; continue }
        try {
          const { name, assetType, make, model, serial, ipAddress, macAddress, notes } = row.data
          if (!name?.trim()) { skipped++; continue }
          // Use first active location for the client
          let location = await prisma.location.findFirst({
            where: { clientId: row.clientId, isActive: true },
            orderBy: { createdAt: "asc" },
          })
          // Create a default location if none exist
          if (!location) {
            location = await prisma.location.create({
              data: { clientId: row.clientId, name: "Main Office" },
            })
          }
          await prisma.asset.create({
            data: {
              locationId: location.id,
              name: name.trim(),
              category: mapAssetCategory(assetType) as any,
              make: make?.trim() || null,
              model: model?.trim() || null,
              serial: serial?.trim() || null,
              ipAddress: ipAddress?.trim() || null,
              macAddress: macAddress?.trim() || null,
              notes: notes?.trim() || null,
            },
          })
          created++
        } catch (e: any) {
          errors.push(`Asset "${row.data?.name}": ${e.message}`)
          skipped++
        }
      }
    }

    else if (type === "credentials") {
      for (const row of rows) {
        if (row.action === "skip" || !row.clientId) { skipped++; continue }
        try {
          const { label, username, password, url, notes } = row.data
          if (!label?.trim()) { skipped++; continue }
          const encryptedPassword = encrypt(password?.trim() || "")
          await prisma.credential.create({
            data: {
              clientId: row.clientId,
              label: label.trim(),
              username: username?.trim() || null,
              encryptedPassword,
              url: url?.trim() || null,
              notes: notes?.trim() || null,
            },
          })
          created++
        } catch (e: any) {
          errors.push(`Credential "${row.data?.label}": ${e.message}`)
          skipped++
        }
      }
    }

    else if (type === "licenses") {
      for (const row of rows) {
        if (row.action === "skip" || !row.clientId) { skipped++; continue }
        try {
          const { name, licenseKey, seats, renewalDate, notes } = row.data
          if (!name?.trim()) { skipped++; continue }
          await prisma.license.create({
            data: {
              clientId: row.clientId,
              name: name.trim(),
              licenseKey: licenseKey?.trim() || null,
              seats: seats ? parseInt(seats) || null : null,
              renewalDate: parseDate(renewalDate),
              notes: notes?.trim() || null,
            },
          })
          created++
        } catch (e: any) {
          errors.push(`License "${row.data?.name}": ${e.message}`)
          skipped++
        }
      }
    }

    return NextResponse.json({ created, skipped, errors })
  } catch (e: any) {
    console.error("Import execute error:", e)
    return NextResponse.json({ error: "Import failed: " + e.message }, { status: 500 })
  }
}
