// Single-source AI proxy. Sister apps (CoinHub today, others later)
// call POST /api/ai/proxy with a bearer token + an Anthropic-shaped
// request, and we relay it via the existing getAnthropic() singleton.
//
// Why a proxy and not a shared API key in each app:
//   - Single source of truth for ANTHROPIC_API_KEY (rotate in one place)
//   - One audit log of token spend per caller (X-App header)
//   - One rate-limit chokepoint
//   - One place to add caching, redaction, or model-routing later
//
// Auth: Authorization: Bearer ${AI_PROXY_TOKEN} (separate from CRON_SECRET
// so we can rotate independently).

import { NextResponse } from "next/server"
import { getAnthropic } from "@/lib/ai/anthropic"

// In-memory rate limit per caller. Resets every minute. Generous default
// because none of these calls happen at high frequency, but it's a cheap
// safety net against a runaway loop in a sister app.
const RATE_LIMIT_PER_MINUTE = 60
const buckets = new Map<string, { count: number; windowStart: number }>()

function checkRate(caller: string): boolean {
  const now = Date.now()
  const window = 60_000
  const b = buckets.get(caller)
  if (!b || now - b.windowStart > window) {
    buckets.set(caller, { count: 1, windowStart: now })
    return true
  }
  b.count += 1
  return b.count <= RATE_LIMIT_PER_MINUTE
}

// Default to Sonnet 4.6 — best price/quality for the kinds of structured
// extraction work the sister apps need (coin identification, etc.). The
// caller can override with `model` in the request body when a specific
// task warrants Haiku speed or Opus depth.
const DEFAULT_MODEL = "claude-sonnet-4-6"

export async function POST(req: Request) {
  // ─── Auth ─────────────────────────────────────────────────────────
  const expected = process.env.AI_PROXY_TOKEN
  if (!expected) {
    console.error("[ai-proxy] AI_PROXY_TOKEN not set on DocHub")
    return NextResponse.json(
      { error: "Proxy is not configured on the server" },
      { status: 503 },
    )
  }
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const caller = (req.headers.get("x-app") || "unknown").slice(0, 64)

  // ─── Rate limit ──────────────────────────────────────────────────
  if (!checkRate(caller)) {
    return NextResponse.json(
      { error: `Rate limit exceeded (${RATE_LIMIT_PER_MINUTE}/min for ${caller})` },
      { status: 429 },
    )
  }

  // ─── Validate body ───────────────────────────────────────────────
  let body: {
    model?: string
    system?: string | unknown
    messages?: unknown
    max_tokens?: number
    temperature?: number
    tools?: unknown
    tool_choice?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "`messages` (non-empty array) is required" },
      { status: 400 },
    )
  }
  const maxTokens = typeof body.max_tokens === "number" ? body.max_tokens : 1024
  if (maxTokens < 1 || maxTokens > 32_000) {
    return NextResponse.json(
      { error: "`max_tokens` must be between 1 and 32000" },
      { status: 400 },
    )
  }

  // ─── Call Anthropic ──────────────────────────────────────────────
  const client = getAnthropic()
  const requestPayload = {
    model: body.model ?? DEFAULT_MODEL,
    max_tokens: maxTokens,
    ...(body.system !== undefined ? { system: body.system as never } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.tools !== undefined ? { tools: body.tools as never } : {}),
    ...(body.tool_choice !== undefined ? { tool_choice: body.tool_choice as never } : {}),
    messages: body.messages as never,
  }

  const startedAt = Date.now()
  try {
    const response = await client.messages.create(requestPayload)
    const elapsedMs = Date.now() - startedAt
    const usage = response.usage
    console.log(
      `[ai-proxy] ${caller} model=${requestPayload.model} in=${usage.input_tokens} out=${usage.output_tokens} ${elapsedMs}ms stop=${response.stop_reason}`,
    )
    return NextResponse.json(response)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const elapsedMs = Date.now() - startedAt
    console.error(`[ai-proxy] ${caller} failed (${elapsedMs}ms):`, msg)
    // Pass through Anthropic API errors with a 502 — helps the caller
    // distinguish transient upstream issues from local 5xx.
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

// Block other methods explicitly so a stray browser GET doesn't get a
// confusing 404; it gets a clear "this is POST-only" message.
export async function GET() {
  return NextResponse.json(
    { error: "POST only" },
    { status: 405, headers: { Allow: "POST" } },
  )
}
