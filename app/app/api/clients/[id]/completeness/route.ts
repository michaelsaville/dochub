import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { getClientCompleteness } from "@/lib/client-completeness"

// Returns { score, checks: [{ key, label, action, met, weight }], gaps, nextAction, nextActionKey, type }.
// Checks are type-aware (RESIDENTIAL skips firewall-only/business-only items).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error

  const { id } = await params

  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const result = await getClientCompleteness(id)
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(result)
}
