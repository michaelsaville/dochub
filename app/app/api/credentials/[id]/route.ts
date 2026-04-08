import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()

    // Quick-update: favourite toggle only
    if (body.isFavorite !== undefined && Object.keys(body).length === 1) {
      const updated = await prisma.credential.update({
        where: { id },
        data: { isFavorite: body.isFavorite },
      })
      return NextResponse.json({ ...updated, encryptedPassword: undefined, encryptedTotp: undefined, hasPassword: !!updated.encryptedPassword, hasTotp: !!updated.encryptedTotp })
    }

    // Full edit — fetch current values for history
    const current = await prisma.credential.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const { label, username, password, totp, url, notes, userId, contactId, expiryDate } = body
    const changedBy = session?.user?.name ?? "unknown"

    const historyEntries: {
      entityType: string; entityId: string; field: string
      oldValue: string | null; newValue: string | null; changedBy: string
    }[] = []

    const tracked: { field: string; oldVal: string | null | undefined; newVal: string | null | undefined }[] = [
      { field: "label",      oldVal: current.label,    newVal: label?.trim() !== undefined ? label.trim() : undefined },
      { field: "username",   oldVal: current.username, newVal: username !== undefined ? (username?.trim() || null) : undefined },
      { field: "url",        oldVal: current.url,      newVal: url       !== undefined ? (url?.trim()      || null) : undefined },
      { field: "expiryDate", oldVal: current.expiryDate ? current.expiryDate.toISOString().split("T")[0] : null, newVal: expiryDate !== undefined ? (expiryDate || null) : undefined },
    ]

    for (const t of tracked) {
      if (t.newVal !== undefined && t.newVal !== t.oldVal) {
        historyEntries.push({ entityType: "credential", entityId: id, field: t.field, oldValue: t.oldVal ?? null, newValue: t.newVal ?? null, changedBy })
      }
    }

    if (password?.trim()) {
      historyEntries.push({ entityType: "credential", entityId: id, field: "password", oldValue: null, newValue: null, changedBy })
    }

    const updated = await prisma.credential.update({
      where: { id },
      data: {
        ...(label?.trim()       && { label: label.trim() }),
        ...(username !== undefined && { username: username?.trim() || null }),
        ...(password?.trim()    && { encryptedPassword: encrypt(password), lastRotated: new Date() }),
        ...(totp     !== undefined && { encryptedTotp: totp?.trim() ? encrypt(totp.trim()) : null }),
        ...(url      !== undefined && { url:   url?.trim()   || null }),
        ...(notes    !== undefined && { notes: notes?.trim() || null }),
        ...(userId   !== undefined && { userId:    userId    || null }),
        ...(contactId !== undefined && { contactId: contactId || null }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      },
      include: {
        user:    { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    })

    if (historyEntries.length > 0) {
      await prisma.fieldHistory.createMany({ data: historyEntries })
    }

    return NextResponse.json({
      ...updated,
      encryptedPassword: undefined,
      encryptedTotp: undefined,
      hasPassword: !!updated.encryptedPassword,
      hasTotp:     !!updated.encryptedTotp,
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.credential.update({ where: { id }, data: { isRetired: true } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 })
  }
}
