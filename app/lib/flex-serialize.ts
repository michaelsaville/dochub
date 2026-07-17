import { prisma } from "@/lib/prisma"
import { RELATION_TARGETS } from "@/lib/flex-fields"

// Server-side serialization + relation helpers shared by the flex-asset routes.
// Kept out of route.ts files (which may only export HTTP handlers) and out of
// lib/flex-fields.ts (which stays prisma-free / import-safe).

/** Map layoutId → the password field keys of that layout (for redaction). */
export async function secretKeysFor(layoutIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  const ids = Array.from(new Set(layoutIds))
  if (ids.length === 0) return map
  const rows = await prisma.flexLayoutField.findMany({
    where: { layoutId: { in: ids }, type: "password" },
    select: { layoutId: true, key: true },
  })
  for (const r of rows) {
    const arr = map.get(r.layoutId) ?? []
    arr.push(r.key)
    map.set(r.layoutId, arr)
  }
  return map
}

/** Copy of `values` with the given secret keys removed (ciphertext never ships). */
export function redactValues(values: any, secretKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(values ?? {}) }
  for (const k of secretKeys) delete out[k]
  return out
}

/** Shape a FlexAsset row (with compact layout/location/_count include) for a list. */
export function serializeListRow(a: any, secretKeys: string[]) {
  const secretSet: Record<string, boolean> = {}
  for (const k of secretKeys) secretSet[k] = a.values?.[k] != null && a.values?.[k] !== ""
  return {
    id: a.id,
    layoutId: a.layoutId,
    clientId: a.clientId,
    locationId: a.locationId,
    title: a.title,
    values: redactValues(a.values, secretKeys),
    secretSet,
    archivedAt: a.archivedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    layout: a.layout,
    location: a.location ?? null,
    client: a.client ?? undefined,
    relationCount: a._count?.relations ?? 0,
    attachmentCount: a._count?.attachments ?? 0,
  }
}

/** Filter/normalise raw relation input into insertable FlexAssetRelation rows. */
export function normalizeRelations(
  input: any[],
): { fieldKey: string; targetType: string; targetId: string }[] {
  const out: { fieldKey: string; targetType: string; targetId: string }[] = []
  for (const r of input) {
    const fieldKey = r?.fieldKey?.toString().trim()
    const targetType = r?.targetType?.toString().trim()
    const targetId = r?.targetId?.toString().trim()
    if (!fieldKey || !targetId) continue
    if (!RELATION_TARGETS.includes(targetType as any)) continue
    out.push({ fieldKey, targetType, targetId })
  }
  return out
}
