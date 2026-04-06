import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

export async function GET(req: Request) {
  const { error } = await requireApiKey(req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const rawUrl = searchParams.get("url")

  if (!rawUrl) {
    return NextResponse.json({ error: "url query param required" }, { status: 400 })
  }

  let hostname: string
  try {
    hostname = new URL(rawUrl).hostname.replace(/^www\./, "")
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  // Find credentials whose stored url contains the same hostname
  const credentials = await prisma.credential.findMany({
    where: {
      isRetired: false,
      url: { contains: hostname, mode: "insensitive" },
    },
    select: {
      id: true,
      label: true,
      username: true,
      url: true,
      notes: true,
      isFavorite: true,
      clientId: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: [{ isFavorite: "desc" }, { label: "asc" }],
  })

  return NextResponse.json({ credentials, matchedHostname: hostname })
}
