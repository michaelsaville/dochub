/**
 * Cross-app URL helpers for DocHub. Both DocHub and TicketHub are deployed
 * under pcc2k.com — defaults reflect that. Override via env when staging.
 */

export const TICKETHUB_PUBLIC_URL =
  process.env.TICKETHUB_PUBLIC_URL ?? "https://tickethub.pcc2k.com"
export const DOCHUB_PUBLIC_URL =
  process.env.DOCHUB_PUBLIC_URL ?? "https://dochub.pcc2k.com"

export function thContactUrl(thContactId: string): string {
  return `${TICKETHUB_PUBLIC_URL}/contacts/${thContactId}`
}

export function thSiteUrl(thSiteId: string, clientId?: string): string {
  // TH doesn't have a per-site page; deep-link to the client's sites tab
  // and let the operator find the matching site by name.
  return clientId
    ? `${TICKETHUB_PUBLIC_URL}/clients/${clientId}/sites#site-${thSiteId}`
    : `${TICKETHUB_PUBLIC_URL}/clients`
}

export function thClientUrl(thClientId: string): string {
  return `${TICKETHUB_PUBLIC_URL}/clients/${thClientId}`
}

export function thTicketUrl(thTicketId: string): string {
  return `${TICKETHUB_PUBLIC_URL}/tickets/${thTicketId}`
}
