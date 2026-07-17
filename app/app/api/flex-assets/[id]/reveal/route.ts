import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { logReveal } from "@/lib/reveal-log"
import { isSecretField, type FlexFieldDef } from "@/lib/flex-fields"

/**
 * POST /api/flex-assets/[id]/reveal  { fieldKey } → decrypt one password-typed
 * field. RBAC-gated exactly like /api/credentials/[id]/reveal: scope-gated on
 * the owning client, then ADMIN-only (Flexible Asset password fields carry no
 * per-field allowTechReveal flag, so TECH cannot reveal). Every reveal is
 * audited via logReveal with entityType "flex-asset".
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const fieldKey: string | undefined = body?.fieldKey?.toString().trim()
    if (!fieldKey) return NextResponse.json({ error: "fieldKey is required" }, { status: 400 })

    const asset = await prisma.flexAsset.findUnique({
      where: { id },
      include: { layout: { include: { fields: true } } },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // RBAC: a scoped tech cannot reveal a secret for a client outside their set.
    if (!scopeAllows(await getClientScope(), asset.clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    const field = (asset.layout.fields as unknown as FlexFieldDef[]).find((f) => f.key === fieldKey)
    if (!field) return NextResponse.json({ error: "Unknown field" }, { status: 404 })
    if (!isSecretField(field)) {
      return NextResponse.json({ error: "Field is not a password field" }, { status: 400 })
    }

    // RBAC: ADMIN only (no allowTechReveal-equivalent flag on flex fields).
    if (session?.user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin role required to reveal this field" }, { status: 403 })
    }

    const raw = (asset.values as Record<string, unknown>)?.[fieldKey]
    let value = ""
    if (raw != null && raw !== "") {
      try { value = decrypt(String(raw)) } catch { value = "" }
    }

    await logReveal({
      entityType: "flex-asset",
      entityId: id,
      actor: session?.user?.name,
      actorId: (session?.user as { id?: string })?.id,
      source: "staff",
      clientId: asset.clientId,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({ fieldKey, value })
  } catch {
    return NextResponse.json({ error: "Failed to reveal" }, { status: 500 })
  }
}
