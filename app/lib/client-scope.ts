import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

export type ClientScope = { all: true } | { all: false; clientIds: string[] }

/**
 * Which clients may the current staff user access?
 *
 *   ADMIN                         -> all clients
 *   TECH with client assignments  -> only the assigned clients
 *   TECH with NO assignments      -> all clients  (opt-in restriction: a tech is
 *                                    scoped only once you explicitly assign them,
 *                                    so enabling this never locks anyone out)
 *
 * Returns { all: true } for the unrestricted cases so callers can skip filtering.
 */
export async function getClientScope(): Promise<ClientScope> {
  const session = await getServerSession(authOptions)
  const uid = (session?.user as { id?: string } | undefined)?.id
  if (!uid) return { all: false, clientIds: [] }

  const staff = await prisma.staffUser.findUnique({ where: { id: uid }, select: { role: true } })
  if (!staff || staff.role === "ADMIN") return { all: true }

  const assignments = await prisma.staffClientAssignment.findMany({
    where: { staffUserId: uid },
    select: { clientId: true },
  })
  if (assignments.length === 0) return { all: true } // unassigned = see all
  return { all: false, clientIds: assignments.map((a) => a.clientId) }
}

/** True if this scope permits access to a specific client id. */
export function scopeAllows(scope: ClientScope, clientId: string | null | undefined): boolean {
  if (scope.all) return true
  return !!clientId && scope.clientIds.includes(clientId)
}

/**
 * A Prisma `where` fragment to AND into a client-scoped query. `field` is the
 * column holding the client id on the queried model (default "id" for Client).
 * Returns {} when the scope is unrestricted.
 */
export function scopeWhere(scope: ClientScope, field = "id"): Record<string, unknown> {
  if (scope.all) return {}
  return { [field]: { in: scope.clientIds } }
}
