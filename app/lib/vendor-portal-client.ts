import "server-only"
import { createHmac } from "node:crypto"

/**
 * Outbound HMAC-signed POSTs from DocHub → the super-portal (portal.pcc2k.com)
 * to provision vendor-portal accounts. Reuses the shared PORTAL_BFF_SECRET and
 * the same canonical scheme the portal uses to call us, so the portal can
 * verify our calls with the secret it already holds.
 *
 *   canonical = `${timestampMs}.${rawBody}`
 *   signature = HMAC-SHA256(secret, canonical) as lowercase hex
 *   headers:
 *     X-Portal-Timestamp: <unix-ms>
 *     X-Portal-Signature: sha256=<hex>
 *
 * PORTAL_BASE_URL points at the portal app — internally that is the shared
 * docker network host (http://portal-app:3000).
 */

export class PortalCallError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(`Portal call failed (${status})`)
  }
}

export async function callPortal<T = unknown>(path: string, body: unknown): Promise<T> {
  const secret = process.env.PORTAL_BFF_SECRET
  const baseUrl = process.env.PORTAL_BASE_URL
  if (!secret) throw new Error("PORTAL_BFF_SECRET not set on DocHub")
  if (!baseUrl) throw new Error("PORTAL_BASE_URL not set on DocHub")

  const rawBody = JSON.stringify(body)
  const ts = Date.now().toString()
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex")

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Portal-Timestamp": ts,
      "X-Portal-Signature": `sha256=${sig}`,
    },
    body: rawBody,
    cache: "no-store",
  })

  const text = await res.text()
  let parsed: unknown
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  if (!res.ok) throw new PortalCallError(res.status, parsed)
  return parsed as T
}
