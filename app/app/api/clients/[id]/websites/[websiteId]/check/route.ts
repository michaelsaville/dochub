import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { checkWebsite } from "@/lib/website-check"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; websiteId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id, websiteId } = await params

  const updated = await checkWebsite(id, websiteId)
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(updated)
}
