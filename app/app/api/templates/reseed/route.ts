import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { applyTemplateSeeds } from "@/lib/template-seeds"

// POST /api/templates/reseed — ADMIN. Idempotent upsert-by-seedKey of the
// starter library (same logic as scripts/seed-templates.mjs). Body { force? }:
// force=true overwrites seed content back to defaults (loses admin edits);
// default only creates missing rows + restores archived seeds.
export async function POST(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const body = await req.json().catch(() => ({}))
    const force = body?.force === true
    const result = await applyTemplateSeeds(prisma, { force })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: "Failed to re-seed template library" }, { status: 500 })
  }
}
