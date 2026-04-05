import https from "node:https"

export type UnifiConfig = {
  url: string          // e.g. https://192.168.1.1 or https://unifi.example.com:8443
  username: string
  password: string
  controllerType: "network_application" | "unifi_os"
}

type UnifiResponse = { data: any; setCookie: string; csrfToken: string }

function httpsRequest(
  urlStr: string,
  method: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ data: any; rawHeaders: Record<string, string | string[]> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const bodyStr = body ? JSON.stringify(body) : undefined
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        rejectUnauthorized: false, // many controllers use self-signed certs
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(bodyStr ? { "Content-Length": String(Buffer.byteLength(bodyStr)) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = ""
        res.on("data", (c) => (raw += c))
        res.on("end", () => {
          let data: any
          try { data = JSON.parse(raw) } catch { data = raw }
          resolve({ data, rawHeaders: res.headers as Record<string, string | string[]> })
        })
      }
    )
    req.on("error", reject)
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function extractCookies(rawHeaders: Record<string, string | string[]>): string {
  const setCookie = rawHeaders["set-cookie"]
  if (!setCookie) return ""
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
  return cookies.map((c) => c.split(";")[0]).join("; ")
}

function extractCsrfToken(rawHeaders: Record<string, string | string[]>): string {
  const token = rawHeaders["x-csrf-token"]
  if (!token) return ""
  return Array.isArray(token) ? token[0] : token
}

export async function unifiLogin(cfg: UnifiConfig): Promise<{ cookies: string; csrfToken: string }> {
  const loginPath =
    cfg.controllerType === "unifi_os" ? "/api/auth/login" : "/api/login"
  const { rawHeaders } = await httpsRequest(
    `${cfg.url}${loginPath}`,
    "POST",
    { username: cfg.username, password: cfg.password, remember: false }
  )
  return {
    cookies: extractCookies(rawHeaders),
    csrfToken: extractCsrfToken(rawHeaders),
  }
}

export async function unifiLogout(cfg: UnifiConfig, cookies: string, csrfToken: string) {
  const logoutPath =
    cfg.controllerType === "unifi_os" ? "/api/auth/logout" : "/api/logout"
  await httpsRequest(`${cfg.url}${logoutPath}`, "POST", {}, {
    Cookie: cookies,
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  })
}

function apiBase(cfg: UnifiConfig): string {
  return cfg.controllerType === "unifi_os" ? `${cfg.url}/proxy/network` : cfg.url
}

export async function unifiGetSites(
  cfg: UnifiConfig,
  cookies: string,
  csrfToken: string
): Promise<{ id: string; name: string; desc: string }[]> {
  const base = apiBase(cfg)
  const { data } = await httpsRequest(`${base}/api/self/sites`, "GET", undefined, {
    Cookie: cookies,
    ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
  })
  const sites = data?.data ?? []
  return sites.map((s: any) => ({ id: s.name, name: s.desc || s.name, desc: s.desc || s.name }))
}

export async function unifiGetDevices(
  cfg: UnifiConfig,
  cookies: string,
  csrfToken: string,
  siteId: string
): Promise<any[]> {
  const base = apiBase(cfg)
  const { data } = await httpsRequest(
    `${base}/api/s/${siteId}/stat/device`,
    "GET",
    undefined,
    {
      Cookie: cookies,
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    }
  )
  return data?.data ?? []
}

export function unifiDeviceType(type: string): string {
  const map: Record<string, string> = {
    uap: "ACCESS_POINT",
    usw: "SWITCH",
    ugw: "FIREWALL",
    udm: "ROUTER",
    "udm-pro": "ROUTER",
    uxg: "ROUTER",
    usg: "FIREWALL",
    "usw-flex": "SWITCH",
    "usw-pro": "SWITCH",
  }
  return map[type?.toLowerCase()] ?? "OTHER"
}

export function formatUptime(seconds: number): string {
  if (!seconds) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
