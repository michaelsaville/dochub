import { prisma } from "@/lib/prisma"

/**
 * Cross-client leak guard. Asset has no clientId column — it goes through
 * Location.clientId. Centralize so every per-relation link route runs the
 * same check.
 */

export class LinkScopeError extends Error {
  constructor(public readonly httpStatus: number, msg: string) {
    super(msg)
  }
}

/** Returns the clientId that owns this asset (via its location). */
export async function resolveAssetClient(assetId: string): Promise<string> {
  const a = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { location: { select: { clientId: true } } },
  })
  if (!a) throw new LinkScopeError(404, "Asset not found")
  if (!a.location) throw new LinkScopeError(500, "Asset has no location")
  return a.location.clientId
}

/** Returns the clientId for any direct-clientId entity (Vendor link → Client). */
export async function resolveVendorClients(vendorId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT c.id FROM "Client" c
       JOIN "_ClientVendors" cv ON cv."B" = c.id
      WHERE cv."A" = $1`,
    vendorId,
  )
  return rows.map(r => r.id)
}

/**
 * Throws LinkScopeError(403) when child.clientId !== parentClientId.
 * Use for Credential, License, Application, ClientDocument, Runbook,
 * Website — all have a direct clientId column.
 */
export async function assertChildBelongsToClient(
  childModel: "credential" | "license" | "application" | "clientDocument" | "runbook" | "website",
  childId: string,
  parentClientId: string,
): Promise<void> {
  // @ts-expect-error — dynamic model name; we constrained the string union above
  const row = await prisma[childModel].findUnique({
    where: { id: childId },
    select: { clientId: true },
  })
  if (!row) throw new LinkScopeError(404, `${childModel} not found`)
  // Runbook.clientId is nullable — global runbooks (clientId=null) are
  // linkable on any client's asset.
  if (childModel === "runbook" && row.clientId === null) return
  if (row.clientId !== parentClientId) {
    throw new LinkScopeError(403, `${childModel} belongs to a different client`)
  }
}

/**
 * Validate that the entity is "linkable" — exists, isActive when applicable.
 * Throws LinkScopeError on failure.
 */
export async function assertLinkable(
  model: "credential" | "license" | "application" | "clientDocument" | "runbook" | "website",
  id: string,
): Promise<void> {
  // @ts-expect-error — dynamic model name; constrained by union
  const row = await prisma[model].findUnique({
    where: { id },
    select: { id: true, ...(model === "credential" ? { isRetired: true } : {}) },
  })
  if (!row) throw new LinkScopeError(404, `${model} not found`)
  if (model === "credential" && (row as { isRetired?: boolean }).isRetired) {
    throw new LinkScopeError(400, "Cannot link a retired credential")
  }
}
