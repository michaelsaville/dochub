import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * Admin-only PATCH for a single StaffUser. Currently scoped to
 * ipAllowlist updates (Tier C / IP allowlist feature). Extend body
 * keys as more admin-editable fields land.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { id } = await params
  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (Array.isArray(body.ipAllowlist)) {
    // Trim + drop empties so the UI's textarea-split inputs stay clean.
    data.ipAllowlist = (body.ipAllowlist as string[])
      .map(s => s.trim())
      .filter(Boolean)
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 })
  }

  const updated = await prisma.staffUser.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, ipAllowlist: true },
  })
  return NextResponse.json(updated)
}
