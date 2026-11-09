/* DocHub extension — domain matching (pure JS, no chrome.* APIs).
 *
 * Loaded by popup.html (<script>), background.js (importScripts) and the node
 * test (require). Exposes `DocHubDomain` on the global in browsers.
 *
 * Answers two questions:
 *   1. Does a credential's saved URL belong to the page the tech is on?
 *      (matchScore — eTLD+1 aware, plus identity-provider alias groups so a
 *      credential saved as portal.office.com matches login.microsoftonline.com)
 *   2. Is it safe to continue a pending split-login fill on this frame?
 *      (isContinuationHostAllowed)
 */
;(function (root, factory) {
  const api = factory()
  if (typeof module === "object" && module.exports) module.exports = api
  else root.DocHubDomain = api
})(typeof self !== "undefined" ? self : this, function () {
  "use strict"

  // Multi-label public suffixes we care about. Not the full PSL — a short,
  // known list is enough for an MSP's client base (US + a few common ccTLDs).
  // Platform suffixes (sharepoint.com, azurewebsites.net …) are included so
  // that contoso.sharepoint.com and fabrikam.sharepoint.com are different
  // sites, the same way the real PSL treats them.
  const MULTI_SUFFIXES = new Set([
    // ccTLD second levels
    "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "nhs.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
    "co.nz", "org.nz", "net.nz", "govt.nz",
    "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
    "com.br", "net.br", "org.br", "com.mx", "org.mx", "gob.mx",
    "co.za", "org.za", "co.in", "net.in", "org.in", "gov.in",
    "com.cn", "net.cn", "org.cn", "com.sg", "edu.sg", "com.hk", "co.kr", "or.kr",
    "com.tw", "com.ar", "com.co", "com.tr", "co.il", "com.my", "com.ph",
    "k12.md.us", "state.md.us", "k12.pa.us", "k12.va.us", "k12.wv.us",
    // platform / multi-tenant suffixes (each subdomain is its own site)
    "sharepoint.com", "onmicrosoft.com", "azurewebsites.net", "cloudapp.net",
    "cloudapp.azure.com", "blob.core.windows.net", "github.io", "gitlab.io",
    "herokuapp.com", "myshopify.com", "blogspot.com", "netlify.app",
    "vercel.app", "pages.dev", "workers.dev", "web.app", "firebaseapp.com",
    "appspot.com", "my.salesforce.com", "lightning.force.com", "zendesk.com",
    "freshdesk.com", "atlassian.net", "s3.amazonaws.com", "cloudfront.net",
    "synology.me", "dyndns.org", "duckdns.org", "ddns.net", "no-ip.org",
  ])

  // Identity-provider alias groups. A credential whose host is in a group
  // matches any page in that group (score ALIAS). `loginHosts` are the shared
  // sign-in pages where split username → password → OTP flows happen.
  const GROUPS = [
    {
      key: "microsoft",
      label: "Microsoft 365",
      // host === suffix or host endsWith "." + suffix
      suffixes: [
        "microsoftonline.com", "office.com", "office365.com", "microsoft365.com",
        "cloud.microsoft", "sharepoint.com", "onmicrosoft.com", "live.com",
        "outlook.com", "portal.azure.com", "windowsazure.com",
        "admin.microsoft.com", "entra.microsoft.com", "intune.microsoft.com",
        "security.microsoft.com", "compliance.microsoft.com", "login.microsoft.com",
        "account.microsoft.com", "myaccount.microsoft.com", "mysignins.microsoft.com",
        "teams.microsoft.com", "admin.teams.microsoft.com", "endpoint.microsoft.com",
        "partner.microsoft.com",
      ],
      loginHosts: [
        "login.microsoftonline.com", "login.live.com", "login.microsoft.com",
        "login.windows.net", "account.live.com", "login.microsoftonline.us",
      ],
      // Substrings sent to /api/v1/credentials?search= (server does ILIKE
      // %term% over url/label/notes/client); results are re-filtered here.
      searchTerms: ["microsoft", "office", "sharepoint", "azure", "live.com", "outlook"],
    },
    {
      key: "google",
      label: "Google Workspace",
      suffixes: [
        "accounts.google.com", "admin.google.com", "mail.google.com",
        "workspace.google.com", "myaccount.google.com", "drive.google.com",
        "calendar.google.com", "console.cloud.google.com", "gmail.com",
      ],
      loginHosts: ["accounts.google.com"],
      searchTerms: ["google", "gmail"],
    },
  ]

  // Other well-known shared sign-in hosts. A pending split-login fill may
  // continue onto these after an SSO redirect even though their host doesn't
  // match the credential URL (the tech started the fill on this tab < 2 min ago).
  const IDP_SUFFIXES = [
    "okta.com", "oktapreview.com", "onelogin.com", "auth0.com", "duosecurity.com",
    "pingidentity.com", "jumpcloud.com",
  ]

  const SCORE = { EXACT: 100, SUBDOMAIN: 80, SITE: 60, ALIAS: 40, NONE: 0 }

  function isIp(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")
  }

  /** Hostname of a URL or URL-ish string ("portal.office.com/admin", "https://x"). */
  function hostOf(input) {
    if (!input || typeof input !== "string") return ""
    let s = input.trim()
    if (!s) return ""
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      // bare "host/path" or "host:port"; reject obvious non-URLs (spaces)
      if (/\s/.test(s)) return ""
      s = "https://" + s
    }
    try {
      const u = new URL(s)
      if (u.protocol !== "http:" && u.protocol !== "https:") return ""
      let h = u.hostname.toLowerCase().replace(/\.$/, "")
      if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1)
      return h.replace(/^www\d?\./, "")
    } catch {
      return ""
    }
  }

  /** eTLD+1 ("registrable domain"). IPs / single labels return themselves. */
  function registrableDomain(host) {
    host = (host || "").toLowerCase()
    if (!host || isIp(host)) return host
    const labels = host.split(".")
    if (labels.length <= 2) return host
    // longest matching multi-label suffix wins
    for (let n = Math.min(4, labels.length - 1); n >= 2; n--) {
      const suffix = labels.slice(-n).join(".")
      if (MULTI_SUFFIXES.has(suffix)) {
        return labels.slice(-(n + 1)).join(".")
      }
    }
    return labels.slice(-2).join(".")
  }

  function hostInSuffixList(host, list) {
    return list.some(s => host === s || host.endsWith("." + s))
  }

  function groupOf(host) {
    if (!host) return null
    for (const g of GROUPS) {
      if (hostInSuffixList(host, g.suffixes) || g.loginHosts.includes(host)) return g
    }
    return null
  }

  function isLoginHost(host) {
    return GROUPS.some(g => g.loginHosts.includes(host))
  }

  function isKnownIdpHost(host) {
    return isLoginHost(host) || hostInSuffixList(host, IDP_SUFFIXES)
  }

  /**
   * How well does a credential's saved URL match the page URL?
   * Returns { score, reason } — score 0 means "not for this site".
   */
  function matchScore(credUrl, pageUrl) {
    const ch = hostOf(credUrl)
    const ph = hostOf(pageUrl)
    if (!ch || !ph) return { score: SCORE.NONE, reason: null }
    if (ch === ph) return { score: SCORE.EXACT, reason: "exact" }
    if (!isIp(ch) && !isIp(ph)) {
      const cs = registrableDomain(ch)
      const ps = registrableDomain(ph)
      if (cs === ps) {
        if (ph.endsWith("." + ch) || ch.endsWith("." + ph)) return { score: SCORE.SUBDOMAIN, reason: "subdomain" }
        return { score: SCORE.SITE, reason: "site" }
      }
    }
    const cg = groupOf(ch)
    const pg = groupOf(ph)
    if (cg && pg && cg.key === pg.key) return { score: SCORE.ALIAS, reason: cg.key }
    return { score: SCORE.NONE, reason: null }
  }

  /** Key used to remember "last used on this site". Alias groups share a key. */
  function siteKey(pageUrl) {
    const h = hostOf(pageUrl)
    if (!h) return ""
    const g = groupOf(h)
    if (g) return "group:" + g.key
    return registrableDomain(h)
  }

  /** Search terms to send to the list endpoint for this page (deduped, ≤ 8). */
  function searchTermsFor(pageUrl) {
    const h = hostOf(pageUrl)
    if (!h) return []
    const terms = []
    const site = registrableDomain(h)
    if (site) terms.push(site)
    const g = groupOf(h)
    if (g) for (const t of g.searchTerms) terms.push(t)
    return Array.from(new Set(terms)).slice(0, 8)
  }

  /** Friendly label for the page context ("Microsoft 365", "contoso.com"). */
  function siteLabel(pageUrl) {
    const h = hostOf(pageUrl)
    const g = groupOf(h)
    return g ? g.label : registrableDomain(h)
  }

  /**
   * May a pending split-login fill (started on `originUrl` for a credential
   * saved as `credUrl`) continue into a frame at `frameUrl`?
   * Must be https (or http on a private/IP host the original page also used),
   * and the frame must either match the credential, be the same site as the
   * original page, or be a well-known identity provider login host.
   */
  function isContinuationHostAllowed(frameUrl, originUrl, credUrl) {
    let proto
    try { proto = new URL(frameUrl).protocol } catch { return false }
    const fh = hostOf(frameUrl)
    if (!fh) return false
    if (proto !== "https:") {
      // plain http only for the exact same host the fill started on (LAN gear)
      return proto === "http:" && fh === hostOf(originUrl)
    }
    if (credUrl && matchScore(credUrl, frameUrl).score > 0) return true
    if (originUrl) {
      const oh = hostOf(originUrl)
      if (oh && registrableDomain(oh) === registrableDomain(fh)) return true
    }
    return isKnownIdpHost(fh)
  }

  return {
    SCORE,
    GROUPS,
    hostOf,
    registrableDomain,
    groupOf,
    isLoginHost,
    isKnownIdpHost,
    matchScore,
    siteKey,
    siteLabel,
    searchTermsFor,
    isContinuationHostAllowed,
  }
})
