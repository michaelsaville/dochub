import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkWebsite } from "@/lib/website-check"

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
      // Call the check logic directly. Previously this re-fetched the
      // session-gated HTTP route with no credentials, so every check was
      // redirected to /login and counted as an error.
      const result = await checkWebsite(site.clientId, site.id)
      if (result) checked++
      else errors++
    } catch {
      errors++
    }
  }

  // Don't report green on a total failure (every check errored) — that's the
  // silent-failure class that hid the 38-day-dead cron.
  const success = !(websites.length > 0 && checked === 0 && errors > 0)
  return NextResponse.json({ success, checked, errors, total: websites.length })
}
