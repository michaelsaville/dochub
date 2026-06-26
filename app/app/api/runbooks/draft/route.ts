import { NextResponse } from "next/server"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { requireAuth } from "@/lib/auth"
import { getAnthropic, isIntakeEnabled, INTAKE_MODEL } from "@/lib/ai/anthropic"

/**
 * POST /api/runbooks/draft  { title, prompt? }
 *
 * Drafts an SOP/runbook from a title (plus optional free-form guidance):
 * a one-line summary, a markdown body, and an ordered checklist. Returned
 * transiently — the RunbookEditor populates its fields and the technician
 * edits + saves through the normal /api/runbooks POST/PUT path. No row is
 * created here.
 */

const DraftSchema = z.object({
  summary: z
    .string()
    .describe("One-line plain-text summary shown on the SOP list. No markdown."),
  content: z
    .string()
    .describe(
      "The full procedure as GitHub-flavored markdown: headings, ordered/unordered lists, inline code and code blocks where useful. This is the narrative reference a technician reads top-to-bottom.",
    ),
  steps: z
    .array(
      z.object({
        title: z.string().describe("Short imperative step title, e.g. 'Join the domain'."),
        notes: z
          .string()
          .describe("Optional one or two sentences of detail for this step. Empty string if none."),
      }),
    )
    .max(40)
    .describe(
      "Tick-off checklist steps in execution order. Empty array if the SOP is purely narrative.",
    ),
})

type DraftResult = z.infer<typeof DraftSchema>

function systemPrompt(): string {
  return `You are a senior MSP (managed service provider) engineer writing an internal SOP / runbook for technicians.

Given a title (and optional guidance), produce a complete, accurate, terse procedure that a competent tech could follow without you in the room.

Return JSON with these fields:
  - summary: one plain-text line that captures what the SOP accomplishes (no markdown).
  - content: the procedure as GitHub-flavored markdown — a short intro, prerequisites, then the detailed walkthrough. Use headings, lists, and code blocks for commands/config. Call out gotchas and verification.
  - steps: an ordered tick-off checklist mirroring the major actions in content. Keep titles imperative and short; put detail in notes. Use an empty array only when the SOP is genuinely narrative-only.

Style: evidence-driven, no flattery, no filler. Do not invent client-specific names, IPs, credentials, or vendor specifics that weren't given — write the generic, reusable procedure and mark spots that need a real value with a clear placeholder like <SERVER_NAME>.`
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  if (!isIntakeEnabled()) {
    return NextResponse.json(
      { error: "AI drafting is disabled (set AI_INTAKE_ENABLED=true and ANTHROPIC_API_KEY)." },
      { status: 503 },
    )
  }

  try {
    const { title, prompt } = await req.json()
    if (!title?.trim() && !prompt?.trim()) {
      return NextResponse.json({ error: "title or prompt required" }, { status: 400 })
    }

    const anthropic = getAnthropic()

    const userText = [
      title?.trim() ? `SOP title: ${title.trim()}` : null,
      prompt?.trim() ? `Additional guidance from the technician:\n${prompt.trim()}` : null,
      "Draft this runbook now. Return structured JSON per the schema.",
    ]
      .filter(Boolean)
      .join("\n\n")

    const response = await anthropic.messages.parse({
      model: INTAKE_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: systemPrompt(),
      messages: [{ role: "user", content: userText }],
      output_config: {
        format: zodOutputFormat(DraftSchema),
      },
    })

    const result = response.parsed_output as DraftResult | null
    if (!result) throw new Error("AI did not return parseable JSON")

    return NextResponse.json({
      summary: result.summary ?? "",
      content: result.content ?? "",
      steps: result.steps ?? [],
      aiModel: INTAKE_MODEL,
      tokens: {
        in: response.usage.input_tokens ?? 0,
        out: response.usage.output_tokens ?? 0,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[runbooks/draft] failed:", err)
    return NextResponse.json({ error: msg || "Draft failed" }, { status: 500 })
  }
}
