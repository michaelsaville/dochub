import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get("days") ?? "90")
  const threshold = new Date(Date.now() + days * 86400000)
  const now = new Date()

  const [domains, sslCerts, licenses, credentials] = await Promise.all([
    prisma.website.findMany({
      where: { expiresAt: { lte: threshold, gte: now } },
      select: {
        id: true, domain: true, label: true, expiresAt: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.website.findMany({
      where: { sslExpiresAt: { lte: threshold, gte: now } },
      select: {
        id: true, domain: true, sslExpiresAt: true, sslIssuer: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { sslExpiresAt: "asc" },
    }),
    prisma.license.findMany({
      where: {
        isActive: true,
        OR: [
          { expiryDate: { lte: threshold, gte: now } },
          { renewalDate: { lte: threshold, gte: now } },
        ],
      },
      select: {
        id: true, name: true, vendor: true, expiryDate: true, renewalDate: true,
        client: { select: { id: true, name: true } },
        vendorRef: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.credential.findMany({
      where: { isRetired: false, expiryDate: { lte: threshold, gte: now } },
      select: {
        id: true, label: true, username: true, expiryDate: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),
  ])

  return NextResponse.json({ domains, sslCerts, licenses, credentials })
}
