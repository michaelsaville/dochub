import "server-only"
import { prisma } from "@/lib/prisma"
import {
  getTemplate,
  type DochubTemplateKey,
  type AnyDochubTemplate,
  DOCHUB_TEMPLATES,
} from "./templates"

export interface SendMessageInput {
  toEmail: string
  toName?: string | null
  /** Arbitrary context stored on the outbound row, e.g. { runId, total }. */
  metadata?: Record<string, unknown>
}

export interface SendResult {
  id: string
  status: "SENT" | "FAILED"
  errorMessage?: string
}

const PREVIEW_CAP = 2000

/**
 * Render a template, deliver via Resend, and always log the attempt.
 * Never throws. Mailer config lives in AppSetting — missing config
 * becomes a FAILED row with an explanatory errorMessage, not a 500.
 */
export async function sendMessage<K extends DochubTemplateKey>(
  templateKey: K,
  vars: Parameters<(typeof DOCHUB_TEMPLATES)[K]["subject"]>[0],
  input: SendMessageInput,
): Promise<SendResult> {
  const template = getTemplate(templateKey) as AnyDochubTemplate | null
  if (!template) {
    const row = await prisma.outboundMessage.create({
      data: {
        templateKey,
        toEmail: input.toEmail,
        toName: input.toName ?? null,
        subject: "(unknown template)",
        bodyPreview: "",
        status: "FAILED",
        errorMessage: `Template "${templateKey}" not registered`,
        metadata: input.metadata as object | undefined,
      },
    })
    return { id: row.id, status: "FAILED", errorMessage: row.errorMessage ?? undefined }
  }

  let subject = "(render failed)"
  let body = ""
  let renderError: string | null = null
  try {
    subject = template.subject(vars)
    body = template.body(vars)
  } catch (err) {
    renderError = err instanceof Error ? err.message : String(err)
  }

  if (renderError) {
    const row = await prisma.outboundMessage.create({
      data: {
        templateKey,
        toEmail: input.toEmail,
        toName: input.toName ?? null,
        subject,
        bodyPreview: "",
        status: "FAILED",
        errorMessage: `render failed: ${renderError}`,
        metadata: input.metadata as object | undefined,
      },
    })
    return { id: row.id, status: "FAILED", errorMessage: row.errorMessage ?? undefined }
  }

  let deliveryError: string | null = null
  try {
    await deliverViaResend({ to: input.toEmail, subject, html: body })
  } catch (err) {
    deliveryError = err instanceof Error ? err.message : String(err)
    console.error("[dochub-mail] delivery failed", err)
  }

  const row = await prisma.outboundMessage.create({
    data: {
      templateKey,
      toEmail: input.toEmail,
      toName: input.toName ?? null,
      subject,
      bodyPreview: body.slice(0, PREVIEW_CAP),
      status: deliveryError ? "FAILED" : "SENT",
      errorMessage: deliveryError,
      metadata: input.metadata as object | undefined,
    },
  })

  return {
    id: row.id,
    status: deliveryError ? "FAILED" : "SENT",
    errorMessage: deliveryError ?? undefined,
  }
}

/**
 * Delivery backend. DocHub uses Resend (same as the previous inline
 * cron-alerts implementation). Config lives in AppSetting:
 *   integration:resend:apiKey, integration:alerts:from
 */
async function deliverViaResend(msg: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["integration:resend:apiKey", "integration:alerts:from"] } },
  })
  const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  const apiKey = cfg["integration:resend:apiKey"]
  const from = cfg["integration:alerts:from"] || "DocHub <noreply@dochub.pcc2k.com>"

  if (!apiKey) {
    throw new Error("Resend API key not configured (integration:resend:apiKey)")
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Resend HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
}
