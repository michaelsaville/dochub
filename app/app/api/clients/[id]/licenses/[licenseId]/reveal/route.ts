import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { decrypt } from "@/lib/crypto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; licenseId: string }> }
) {
  // License keys are ADMIN-only (consistent with the CSV export, which redacts
  // them). TECH users get a 403.
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { licenseId } = await params
    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      select: { licenseKey: true },
    })
    if (!license) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!license.licenseKey) return NextResponse.json({ key: null })
    return NextResponse.json({ key: decrypt(license.licenseKey) })
  } catch (e) {
    return NextResponse.json({ error: "Failed to reveal license key" }, { status: 500 })
  }
}
