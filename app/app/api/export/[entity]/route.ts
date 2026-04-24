import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * Admin-only CSV export. Entity query:
 *   /api/export/assets?clientId=X
 *   /api/export/credentials?clientId=X
 *   /api/export/licenses?clientId=X
 *   /api/export/contacts?clientId=X
 * Passwords/secrets never appear — credential rows show hasPassword flags
 * only. License keys redacted to "REDACTED" since ADMIN already has
 * access via the app.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const { entity } = await params
  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId") || undefined

  let rows: Record<string, unknown>[] = []
  let filename = "export.csv"

  if (entity === "assets") {
    const data = await prisma.asset.findMany({
      where: {
        status: { not: "RETIRED" },
        ...(clientId ? { location: { clientId } } : {}),
      },
      include: {
        location: { select: { name: true, client: { select: { name: true } } } },
        assetType: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
    })
    rows = data.map(a => ({
      name: a.friendlyName ?? a.name,
      type: a.assetType?.name ?? a.category,
      make: a.make,
      model: a.model,
      serial: a.serial,
      assetTag: a.assetTag,
      ipAddress: a.ipAddress,
      macAddress: a.macAddress,
      status: a.status,
      client: a.location?.client?.name ?? "",
      location: a.location?.name ?? "",
      warrantyExpiry: a.warrantyExpiry?.toISOString().split("T")[0] ?? "",
    }))
    filename = "assets.csv"
  } else if (entity === "credentials") {
    const data = await prisma.credential.findMany({
      where: { isRetired: false, ...(clientId ? { clientId } : {}) },
      include: {
        client: { select: { name: true } },
        person: { select: { name: true } },
      },
      orderBy: [{ label: "asc" }],
    })
    rows = data.map(c => ({
      label: c.label,
      client: c.client?.name ?? "",
      username: c.username,
      url: c.url,
      assignedPerson: c.person?.name ?? "",
      hasPassword: !!c.encryptedPassword ? "yes" : "no",
      hasTotp: !!c.encryptedTotp ? "yes" : "no",
      hasSecureNotes: !!c.encryptedNotes ? "yes" : "no",
      allowTechReveal: c.allowTechReveal ? "yes" : "no",
      expiryDate: c.expiryDate?.toISOString().split("T")[0] ?? "",
      lastRotated: c.lastRotated?.toISOString().split("T")[0] ?? "",
      notes: c.notes,
    }))
    filename = "credentials.csv"
  } else if (entity === "licenses") {
    const data = await prisma.license.findMany({
      where: clientId ? { clientId } : {},
      include: {
        client: { select: { name: true } },
        vendorRef: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
    })
    rows = data.map(l => ({
      name: l.name,
      client: l.client?.name ?? "",
      vendor: l.vendorRef?.name ?? l.vendor ?? "",
      seats: l.seats,
      assignedSeats: l.assignedSeats,
      cost: l.cost != null ? (l.cost / 100).toFixed(2) : "",
      purchaseDate: l.purchaseDate?.toISOString().split("T")[0] ?? "",
      expiryDate: l.expiryDate?.toISOString().split("T")[0] ?? "",
      renewalDate: l.renewalDate?.toISOString().split("T")[0] ?? "",
      licenseKey: "REDACTED",
      notes: l.notes,
    }))
    filename = "licenses.csv"
  } else if (entity === "contacts") {
    const data = await prisma.person.findMany({
      where: { isActive: true, ...(clientId ? { clientId } : {}) },
      include: {
        client: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
    })
    rows = data.map(p => ({
      name: p.name,
      client: p.client?.name ?? "",
      role: p.role,
      email: p.email,
      phone: p.phone,
      mobile: p.mobile,
      isPrimary: p.isPrimary ? "yes" : "no",
      isBilling: p.isBilling ? "yes" : "no",
      isEscalation: p.isEscalation ? "yes" : "no",
    }))
    filename = "contacts.csv"
  } else {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 })
  }

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  })
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const cols = Object.keys(rows[0])
  const escape = (v: unknown) => {
    if (v == null) return ""
    const s = String(v)
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [cols.join(",")]
  for (const row of rows) {
    lines.push(cols.map(c => escape(row[c])).join(","))
  }
  return lines.join("\n")
}
