import { redirect } from "next/navigation"

/**
 * The customer-facing portal moved to portal.pcc2k.com (the unified
 * super-portal — merged with TicketHub's portal surface) in Phase 8
 * of the portal merge. DocHub still owns the data via the signed BFF
 * endpoints under /api/bff/portal/dochub/*, but no customer ever
 * lands here directly anymore.
 *
 * Any GET on this path bounces to the merged portal home.
 */
export default function PortalRedirect() {
  redirect("https://portal.pcc2k.com/")
}
