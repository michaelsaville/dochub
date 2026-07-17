import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { prisma } from "@/lib/prisma"
import { checkWebsite } from "@/lib/website-check"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  const websites = await prisma.website.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(websites)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  const body = await req.json()
  const rawDomain: string = body.domain ?? ""
  if (!rawDomain.trim()) return NextResponse.json({ error: "Domain required" }, { status: 400 })
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase()
  const website = await prisma.website.create({
    data: {
      clientId: id,
      domain,
      label: body.label?.trim() || null,
      registrar: body.registrar?.trim() || null,
      registrarVendorId: body.registrarVendorId || null,
      registrarUrl: body.registrarUrl?.trim() || null,
      accountNumber: body.accountNumber?.trim() || null,
      credentialId: body.credentialId || null,
      autoRenew: body.autoRenew === true,
      uptimeEnabled: body.uptimeEnabled === true,
      notes: body.notes?.trim() || null,
    },
  })

  // Resolve registrar/expiry/SSL/DNS immediately so a new domain isn't blank
  // for ~24h until the daily cron. Best-effort — return the bare row on failure.
  let enriched: typeof website = website
  try {
    const checked = await checkWebsite(id, website.id)
    if (checked) enriched = checked
  } catch { /* keep the bare row */ }

  return NextResponse.json(enriched)
}
