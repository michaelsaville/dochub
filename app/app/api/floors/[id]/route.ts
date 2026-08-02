import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { writeFile, mkdir, unlink, readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"
import sharp from "sharp"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 20 * 1024 * 1024
// Downscale cap. A phone photo of an architectural drawing is routinely 4000px+;
// the plan is only ever a backdrop for vector overlays, so anything beyond this is
// bytes on the wire for no legibility.
const MAX_DIM = 2000

async function authorize(floorId: string) {
  const floor = await prisma.floor.findUnique({
    where: { id: floorId },
    select: { id: true, planStorageName: true, location: { select: { id: true, clientId: true } } },
  })
  if (!floor) return { error: NextResponse.json({ error: "Floor not found" }, { status: 404 }) }
  const scope = await getClientScope()
  if (!scopeAllows(scope, floor.location?.clientId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { floor }
}

/** GET — the plan image itself. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const auth = await authorize(id)
    if (auth.error) return auth.error
    const name = auth.floor!.planStorageName
    if (!name) return NextResponse.json({ error: "No plan" }, { status: 404 })

    const buffer = await readFile(path.join(UPLOAD_DIR, name))
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600" },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}

/** POST — upload/replace the floor-plan image. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const auth = await authorize(id)
    if (auth.error) return auth.error

    const form = await req.formData()
    const file = form.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 20MB" }, { status: 400 })
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 })

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

    // sharp is already a dependency. Normalising to webp and capturing the natural
    // dimensions here is what lets the overlay use plan-pixel coordinates: every
    // room polygon and device pin is stored against THESE numbers, so they must be
    // recorded at upload and never recomputed from a re-encoded file.
    const out = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()                     // honour EXIF, or a phone shot lands sideways
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true })

    if (auth.floor!.planStorageName) {
      await unlink(path.join(UPLOAD_DIR, auth.floor!.planStorageName)).catch(() => {})
    }
    const storageName = `floorplan-${crypto.randomUUID()}.webp`
    await writeFile(path.join(UPLOAD_DIR, storageName), out.data)

    const floor = await prisma.floor.update({
      where: { id },
      data: {
        planStorageName: storageName,
        planWidth: out.info.width,
        planHeight: out.info.height,
        // A new image invalidates the old calibration: the same drag now spans a
        // different number of pixels. Silently keeping it would report wrong metres.
        pxPerMetre: null,
      },
      select: { id: true, planStorageName: true, planWidth: true, planHeight: true, pxPerMetre: true },
    })

    await writeAudit({
      action: "floor.plan-upload",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "floor",
      entityId: id,
      clientId: auth.floor!.location?.clientId ?? null,
      summary: `Uploaded a floor plan (${out.info.width}x${out.info.height})`,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json(floor)
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

/** PATCH — rename, or set the scale from a two-point calibration. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const auth = await authorize(id)
    if (auth.error) return auth.error

    const body = await req.json()
    const data: Record<string, unknown> = {}
    if (body.name !== undefined) data.name = body.name?.trim() || "Floor"
    if (body.pxPerMetre !== undefined) {
      const v = Number(body.pxPerMetre)
      data.pxPerMetre = Number.isFinite(v) && v > 0 ? v : null
    }

    const floor = await prisma.floor.update({
      where: { id },
      data,
      select: { id: true, name: true, pxPerMetre: true },
    })
    return NextResponse.json(floor)
  } catch {
    return NextResponse.json({ error: "Failed to update floor" }, { status: 500 })
  }
}
