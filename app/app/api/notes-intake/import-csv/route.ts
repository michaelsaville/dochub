import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { parseCsvCreds } from "@/lib/notes-intake-csv"
import { stageCredentialSuggestions } from "@/lib/notes-intake-stage"

// POST /api/notes-intake/import-csv — multipart CSV (password-manager / TOTP
// export). Deterministic, no AI (works without API credits).
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  let formData: FormData
  try { formData = await req.formData() } catch { return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 }) }
  const file = (formData.getAll("files").find((f) => f instanceof File) || formData.get("file")) as File | null
  if (!file) return NextResponse.json({ error: "No CSV file" }, { status: 400 })

  const text = Buffer.from(await file.arrayBuffer()).toString("utf-8")
  let parsed
  try { parsed = parseCsvCreds(text) } catch (e) { return NextResponse.json({ error: `CSV parse failed: ${e instanceof Error ? e.message : e}` }, { status: 400 }) }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: `No importable rows. Detected columns: ${parsed.headers.join(", ")}. Need at least a password or TOTP column.` }, { status: 400 })
  }

  const res = await stageCredentialSuggestions(parsed.rows, { source: "csv", sourceType: "csv", label: file.name })
  return NextResponse.json({ ...res, mapped: parsed.mapped, headers: parsed.headers })
}
