import { NextResponse } from "next/server"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { prisma } from "@/lib/prisma"
import { verifyTicketHub, resolveDochubClient, redactSecrets, dhUrls } from "@/lib/ticketlink"
import { getAnthropic, isIntakeEnabled, INTAKE_MODEL } from "@/lib/ai/anthropic"

/**
 * POST /api/bff/tickethub/draft-doc  (HMAC-signed, TH_DOCHUB_BFF_SECRET, X-Th-* headers)
 *
 * "Write a doc from this ticket". TicketHub sends the ticket (subject,
 * description, notes, resolution); we draft a client document with Claude
 * (same client/model as the SOP drafter) and file it for the mapped client as
 * a REVIEW-FIRST draft:
 *   - needsReview = true  → it sits in /docs/review until a human resolves it
 *   - portalVisible = false → never shown on the customer portal
 * Idempotent per TicketHub ticket (ClientDocument.sourceTicketId): a second
 * click returns the existing draft instead of writing another.
 *
 * Every piece of ticket text is run through redactSecrets() before it reaches
 * the model or the database, and the model is told never to write a secret.
 *
 * Body: {
 *   ticketId, ticketNumber?, title, description?, status?, resolutionCode?,
 *   notes?: [{ body, isInternal?, author?, createdAt? }],
 *   syncroId?, clientName?, dochubClientId?, dochubAssetId?,
 *   staffName?, staffEmail?, ticketUrl?
 * }
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

const DraftSchema = z.object({
  title: z.string().describe("Short document title naming the system and the procedure/fix, e.g. 'Front-desk HP M404 — fixing offline print queue'. No ticket numbers."),
  content: z.string().describe("The document body as GitHub-flavored markdown."),
})

const SYSTEM = `You are a senior MSP technician turning a finished support ticket into durable internal client documentation for the next technician.

Write a concise, reusable document as GitHub-flavored markdown with these sections (omit a section only when there is genuinely nothing for it):
  ## Summary — one or two sentences: what system, what went wrong, what fixed it.
  ## Environment — the devices, software, locations, and people involved (from the ticket only).
  ## Symptoms — how the problem presents, so it can be recognised next time.
  ## Resolution — the steps that actually fixed it, as an ordered list.
  ## Verification — how to confirm it is fixed.
  ## Notes / gotchas — anything surprising, follow-ups, or things that did NOT work.

Rules:
  - Use only facts in the ticket. Do not invent IPs, names, versions, or steps. Mark anything uncertain with "(unverified)".
  - NEVER write a password, PIN, passphrase, API key, token, Wi-Fi key, or any other secret, even if one appears in the input. Where a credential is needed write "see DocHub Credentials: <what it is>".
  - Text shown as [REDACTED] was removed on purpose — do not guess it.
  - Drop chit-chat, scheduling back-and-forth, billing, and customer pleasantries.
  - Terse, evidence-driven, no filler.`

interface NoteIn {
  body?: unknown
  isInternal?: unknown
  author?: unknown
  createdAt?: unknown
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

function fallbackBody(t: { title: string; description: string; notes: string[]; resolution: string }): string {
  return [
    "## Summary",
    "",
    `_Auto-drafted from a TicketHub ticket without AI (AI drafting unavailable). Edit before relying on it._`,
    "",
    t.description ? `## Symptoms\n\n${t.description}` : null,
    t.notes.length ? `## Work notes\n\n${t.notes.map((n) => `- ${n.replace(/\n+/g, " ")}`).join("\n")}` : null,
    t.resolution ? `## Resolution\n\n${t.resolution}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyTicketHub(req, rawBody)
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let p: Record<string, unknown>
  try {
    p = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 })
  }

  const ticketId = str(p.ticketId, 100).trim()
  const title = str(p.title, 300).trim()
  if (!ticketId || !title) {
    return NextResponse.json({ ok: false, error: "ticketId and title are required" }, { status: 400 })
  }

  const resolved = await resolveDochubClient(p)
  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "No DocHub client matches this TicketHub client (by Syncro id or name)." },
      { status: 404 },
    )
  }
  const { client } = resolved

  // ---- idempotency: one draft per ticket ----
  const existing = await prisma.clientDocument.findFirst({
    where: { sourceTicketId: ticketId, clientId: client.id },
    select: { id: true, title: true },
  })
  if (existing) {
    return NextResponse.json({
      ok: true,
      created: false,
      documentId: existing.id,
      title: existing.title,
      url: dhUrls.document(client.id, existing.id),
      clientId: client.id,
    })
  }

  const ticketNumber = typeof p.ticketNumber === "number" ? p.ticketNumber : parseInt(str(p.ticketNumber, 12), 10) || null
  const description = redactSecrets(str(p.description, 8000)).trim()
  const resolution = redactSecrets(str(p.resolutionCode, 2000)).trim()
  const notesIn = Array.isArray(p.notes) ? (p.notes as NoteIn[]).slice(0, 60) : []
  const notes = notesIn
    .map((n) => {
      const body = redactSecrets(str(n.body, 4000)).trim()
      if (!body) return null
      const who = str(n.author, 80).trim()
      const when = str(n.createdAt, 40).slice(0, 10)
      const tag = n.isInternal === true ? "internal note" : "reply"
      return `[${[when, who, tag].filter(Boolean).join(" · ")}] ${body}`
    })
    .filter((x): x is string => !!x)
  const ticketUrl = str(p.ticketUrl, 300)
  const staffName = str(p.staffName, 100).trim() || str(p.staffEmail, 150).trim() || "TicketHub"
  const safeTitle = redactSecrets(title)

  // Linked DocHub asset only when it really belongs to this client.
  let assetId: string | null = null
  const dhAssetId = str(p.dochubAssetId, 100)
  if (dhAssetId) {
    const a = await prisma.asset.findFirst({
      where: { id: dhAssetId, location: { clientId: client.id } },
      select: { id: true, name: true },
    })
    assetId = a?.id ?? null
  }

  let docTitle = safeTitle
  let content = ""
  let aiUsed = false
  if (isIntakeEnabled()) {
    try {
      const userText = [
        `Client: ${client.name}`,
        `Ticket subject: ${safeTitle}`,
        p.status ? `Status: ${str(p.status, 30)}` : null,
        description ? `Description:\n${description}` : null,
        resolution ? `Resolution code / summary:\n${resolution}` : null,
        notes.length ? `Ticket notes (oldest first):\n${notes.join("\n\n")}` : null,
        "Write the document now. Return structured JSON per the schema.",
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 60_000)

      const response = await getAnthropic().messages.parse({
        model: INTAKE_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM,
        messages: [{ role: "user", content: userText }],
        output_config: { format: zodOutputFormat(DraftSchema) },
      })
      const out = response.parsed_output as z.infer<typeof DraftSchema> | null
      if (out?.content?.trim()) {
        // Scrub the model's output too — the rule is "never stored", not "never asked".
        content = redactSecrets(out.content.trim())
        if (out.title?.trim()) docTitle = redactSecrets(out.title.trim()).slice(0, 200)
        aiUsed = true
      }
    } catch (err) {
      console.error("[bff/tickethub/draft-doc] AI draft failed, using fallback:", err)
    }
  }
  if (!content) content = fallbackBody({ title: safeTitle, description, notes, resolution })

  const sourceLine = `Source: TicketHub ticket ${ticketNumber ? `#${ticketNumber}` : ticketId}${ticketUrl ? ` — ${ticketUrl}` : ""} · drafted ${aiUsed ? `by ${INTAKE_MODEL} ` : ""}for ${staffName} on ${new Date().toISOString().slice(0, 10)}`
  content = `${content}\n\n---\n_${sourceLine}_`

  const doc = await prisma.clientDocument.create({
    data: {
      clientId: client.id,
      title: docTitle || safeTitle,
      content,
      category: "Ticket write-up",
      assetId,
      sourceTicketId: ticketId,
      // Review-first: lands in /docs/review, never on the customer portal.
      portalVisible: false,
      needsReview: true,
      flaggedAt: new Date(),
      flaggedBy: staffName,
      reviewNote: `Draft written from TicketHub ${ticketNumber ? `#${ticketNumber}` : "ticket"}${aiUsed ? " by AI" : ""} — review, edit, then resolve.`,
    },
    select: { id: true, title: true },
  })

  return NextResponse.json({
    ok: true,
    created: true,
    aiUsed,
    documentId: doc.id,
    title: doc.title,
    url: dhUrls.document(client.id, doc.id),
    clientId: client.id,
  })
}
