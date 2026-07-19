import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { parseOtpauthText } from "@/lib/notes-intake-csv"
import { stageCredentialSuggestions } from "@/lib/notes-intake-stage"

// POST /api/notes-intake/import-otpauth  body: { text }
// Paste a block of otpauth:// lines (what Authy/2FA extractors emit). Each
// becomes a credential-with-TOTP suggestion, matched to a client. No AI.
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const body = (await req.json().catch(() => ({}))) as { text?: string }
  const text = (body.text || "").trim()
  if (!text) return NextResponse.json({ error: "Paste some otpauth:// lines" }, { status: 400 })

  const rows = parseOtpauthText(text)
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid otpauth:// lines found (each line must start with otpauth:// and contain a secret)." }, { status: 400 })
  }

  const res = await stageCredentialSuggestions(rows, { source: "csv", sourceType: "csv", label: "otpauth paste" })
  return NextResponse.json(res)
}
