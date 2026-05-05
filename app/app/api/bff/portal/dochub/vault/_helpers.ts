import { NextResponse } from "next/server"
import { verifyPortalHmac } from "@/lib/bff-hmac"

export const VAULT_VISIBILITY = ["PRIVATE", "TEAM", "MSP_SHARED"] as const
export type VaultVisibility = (typeof VAULT_VISIBILITY)[number]

export async function readSignedBody<T>(req: Request): Promise<
  | { ok: true; body: T }
  | { ok: false; res: NextResponse }
> {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status }),
    }
  }
  try {
    return { ok: true, body: JSON.parse(rawBody) as T }
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }),
    }
  }
}

export function buildVisibilityWhere(opts: {
  clientId: string
  portalUserId: string
  isPortalOwner: boolean
}) {
  if (opts.isPortalOwner) {
    return { clientId: opts.clientId }
  }
  return {
    clientId: opts.clientId,
    OR: [
      { ownedByUserId: opts.portalUserId },
      { visibility: "TEAM" as const },
      { visibility: "MSP_SHARED" as const },
    ],
  }
}

export function maskItem(item: {
  id: string
  label: string
  username: string | null
  url: string | null
  notes: string | null
  encryptedTotp: string | null
  visibility: string
  ownedByUserId: string | null
  createdByStaffId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: item.id,
    label: item.label,
    username: item.username,
    url: item.url,
    notes: item.notes,
    hasTotp: !!item.encryptedTotp,
    visibility: item.visibility,
    ownedByUserId: item.ownedByUserId,
    createdByStaffId: item.createdByStaffId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}
