import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { postExpirationDigestToTeams } from "@/lib/teams"

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const { webhookUrl } = await req.json()
  if (!webhookUrl?.trim()) {
    return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 })
  }

  const now = new Date()
  const result = await postExpirationDigestToTeams({
    critical: [
      { category: "SSL", label: "example.com", clientName: "Test Client", expiresAt: new Date(now.getTime() - 2 * 86400000) },
    ],
    warning: [
      { category: "Domain", label: "acme.net", clientName: "Acme Corp", expiresAt: new Date(now.getTime() + 18 * 86400000) },
      { category: "License", label: "Microsoft 365 Business", clientName: "Test Client", expiresAt: new Date(now.getTime() + 25 * 86400000) },
    ],
  }, webhookUrl.trim())

  return NextResponse.json(result)
}
