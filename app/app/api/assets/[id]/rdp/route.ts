import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { name: true, friendlyName: true, rdpHost: true, rdpPort: true, ipAddress: true },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const host = asset.rdpHost || asset.ipAddress
    if (!host) return NextResponse.json({ error: "No host/IP configured for this asset" }, { status: 422 })

    const port = asset.rdpPort ?? 3389
    const label = asset.friendlyName || asset.name

    const rdpContent = [
      `full address:s:${host}:${port}`,
      `screen mode id:i:2`,
      `use multimon:i:0`,
      `desktopwidth:i:1920`,
      `desktopheight:i:1080`,
      `session bpp:i:32`,
      `prompt for credentials:i:1`,
      `authentication level:i:2`,
      `negotiate security layer:i:1`,
      `remoteapplicationmode:i:0`,
      `alternate shell:s:`,
      `shell working directory:s:`,
      `disable wallpaper:i:0`,
      `disable full window drag:i:0`,
      `disable menu anims:i:0`,
      `disable themes:i:0`,
      `connection type:i:7`,
      `networkautodetect:i:1`,
      `bandwidthautodetect:i:1`,
      `drivestoredirect:s:`,
    ].join("\r\n")

    const filename = `${label.replace(/[^a-z0-9\-_]/gi, "_")}.rdp`

    return new Response(rdpContent, {
      headers: {
        "Content-Type": "application/x-rdp",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
