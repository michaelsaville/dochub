/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { applyProposal, rejectProposal } from "@/lib/pile-agent/apply"

// POST /api/agent/proposals/[id]  { decision: "approve"|"reject", edits?: {field: value}, reason?: string }
// Approve applies the payload sealed on the proposal row (never the request body),
// except for operator inline edits of non-secret fields.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth("TECH")
  if (error) return error
  const { id } = await params
  const actor = { id: (session!.user as any).id ?? null, email: session!.user?.email ?? null }
  const body = (await req.json().catch(() => ({}))) as any
  try {
    if (body.decision === "approve") {
      const edits = body.edits && typeof body.edits === "object" ? Object.fromEntries(Object.entries(body.edits).map(([k, v]) => [k, String(v).slice(0, 500)])) : undefined
      const result = await applyProposal(id, actor, edits)
      return NextResponse.json({ ok: true, result })
    }
    if (body.decision === "reject") {
      await rejectProposal(id, actor, typeof body.reason === "string" ? body.reason : undefined)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: "decision must be approve or reject" }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err).slice(0, 300) }, { status: 400 })
  }
}
