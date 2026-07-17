import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { resolveExportToken } from "@/lib/full-export"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import { Readable } from "stream"

export const dynamic = "force-dynamic"

// Streams a previously-generated full export by its 48h token. ADMIN-gated on
// top of the token (defense in depth — a crown-jewel bundle should never be
// downloadable by URL capability alone). 410 once the link has expired.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const { token } = await params
  const meta = await resolveExportToken(token)
  if (!meta) {
    return NextResponse.json({ error: "This export link has expired or is invalid" }, { status: 410 })
  }

  let size: number
  try {
    size = (await stat(meta.path)).size
  } catch {
    return NextResponse.json({ error: "Export file is no longer available" }, { status: 410 })
  }

  const stream = Readable.toWeb(createReadStream(meta.path)) as ReadableStream
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${meta.filename}"`,
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
    },
  })
}
