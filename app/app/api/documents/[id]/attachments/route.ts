import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { storeUploadedFile, isStoreError } from "@/lib/files/store"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params

    // Verify doc exists and get clientId (the security boundary).
    const doc = await prisma.clientDocument.findUnique({ where: { id } })
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const notes = (formData.get("notes") as string) ?? ""

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const result = await storeUploadedFile(
      file,
      { clientId: doc.clientId, documentId: id },
      notes,
    )
    if (isStoreError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.attachment, { status: 201 })
  } catch (e: any) {
    console.error("Upload error:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
