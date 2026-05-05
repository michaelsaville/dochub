import "server-only"
import { createHmac } from "node:crypto"

/**
 * Outbound HMAC-signed POSTs from DocHub → TicketHub BFF.
 *
 * Mirrors TH's verifyPortalHmac scheme but uses a separate caller
 * identity (X-Dh-* headers + DH_BFF_SECRET) so a leaked Portal secret
 * can't forge DocHub calls and vice versa.
 *
 *   canonical = `${timestampMs}.${rawBody}`
 *   signature = HMAC-SHA256(secret, canonical) as lowercase hex
 *   headers:
 *     X-Dh-Timestamp: <unix-ms>
 *     X-Dh-Signature: sha256=<hex>
 */

interface CallOpts {
  /** Path under TH including leading slash, e.g. /api/bff/dh/identity/clients/abc/status */
  path: string
  /** Optional JSON body. Empty body still gets signed. */
  body?: unknown
}

export class BffCallError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`TH BFF call failed (${status})`)
  }
}

export async function callTickethubBff<T = unknown>(opts: CallOpts): Promise<T> {
  const secret = process.env.DH_BFF_SECRET
  const baseUrl = process.env.TICKETHUB_BASE_URL
  if (!secret) throw new Error("DH_BFF_SECRET not set on DocHub")
  if (!baseUrl) throw new Error("TICKETHUB_BASE_URL not set on DocHub")

  const rawBody = opts.body === undefined ? "" : JSON.stringify(opts.body)
  const ts = Date.now().toString()
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex")

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${opts.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Dh-Timestamp": ts,
      "X-Dh-Signature": `sha256=${sig}`,
    },
    body: rawBody,
    cache: "no-store",
  })

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  if (!res.ok) throw new BffCallError(res.status, parsed)
  return parsed as T
}
