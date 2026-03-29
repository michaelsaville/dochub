import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Called by cron: GET /api/cron/domains  (Bearer CRON_SECRET)
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const websites = await prisma.website.findMany({
    where: {
      // Skip sites checked within the last 23 hours
      OR: [
        { lastChecked: null },
        { lastChecked: { lt: new Date(Date.now() - 23 * 60 * 60 * 1000) } },
      ],
    },
    select: { id: true, clientId: true },
  })

  let checked = 0
  let errors = 0

  for (const site of websites) {
    try {
      const res = await fetch(
        `http://localhost:3000/api/clients/${site.clientId}/websites/${site.id}/check`,
        { method: "POST" }
      )
      if (res.ok) checked++
      else errors++
    } catch {
      errors++
    }
  }

  return NextResponse.json({ checked, errors, total: websites.length })
}
