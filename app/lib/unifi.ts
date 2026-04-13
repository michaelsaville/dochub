import https from "node:https"

export type UnifiConfig = {
  controllerType: "network_application" | "unifi_os" | "ui_cloud"
  // Local controller fields (network_application / unifi_os)
  url?: string
  username?: string
  password?: string
  // UI.com cloud field
  apiKey?: string
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

// ── Local controller auth ────────────────────────────────────────────────────

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
  return cfg.controllerType === "unifi_os" ? `${cfg.url}/proxy/network` : cfg.url!
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

// ── UI.com cloud API ─────────────────────────────────────────────────────────

const UI_API = "https://api.ui.com"

function cloudHeaders(apiKey: string): Record<string, string> {
  return { "X-API-KEY": apiKey, Accept: "application/json" }
}

export async function uiCloudGetHosts(
  apiKey: string
): Promise<{ id: string; name: string }[]> {
  const { data } = await httpsRequest(`${UI_API}/v1/hosts`, "GET", undefined, cloudHeaders(apiKey))
  const hosts: any[] = data?.data ?? []
  return hosts.map((h: any) => ({
    id: h.id,
    name: h.reportedState?.name || h.id,
  }))
}

export async function uiCloudGetDevices(apiKey: string, hostId: string): Promise<any[]> {
  const { data } = await httpsRequest(
    `${UI_API}/v1/devices?hostIds[]=${encodeURIComponent(hostId)}`,
    "GET",
    undefined,
    cloudHeaders(apiKey)
  )
  // API returns: { data: [{ hostId, hostName, devices: [...] }] }
  const hostEntry = (data?.data ?? []).find((h: any) => h.hostId === hostId)
  return hostEntry?.devices ?? []
}

// ── Local controller data endpoints (via Tailscale IP) ──────────────────────

export type LocalControllerAuth = {
  url: string          // https://<tailscaleIp>
  cookies: string
  csrfToken: string
  controllerType: "network_application" | "unifi_os"
}

export async function localLogin(tailscaleIp: string, username: string, password: string, controllerType: "network_application" | "unifi_os" = "unifi_os"): Promise<LocalControllerAuth> {
  const url = `https://${tailscaleIp}`
  const loginPath = controllerType === "unifi_os" ? "/api/auth/login" : "/api/login"
  const { rawHeaders } = await httpsRequest(`${url}${loginPath}`, "POST", { username, password, remember: false })
  return {
    url,
    cookies: extractCookies(rawHeaders),
    csrfToken: extractCsrfToken(rawHeaders),
    controllerType,
  }
}

export async function localLogout(auth: LocalControllerAuth) {
  const logoutPath = auth.controllerType === "unifi_os" ? "/api/auth/logout" : "/api/logout"
  await httpsRequest(`${auth.url}${logoutPath}`, "POST", {}, {
    Cookie: auth.cookies,
    ...(auth.csrfToken ? { "X-CSRF-Token": auth.csrfToken } : {}),
  })
}

function localApiBase(auth: LocalControllerAuth): string {
  return auth.controllerType === "unifi_os" ? `${auth.url}/proxy/network` : auth.url
}

function localHeaders(auth: LocalControllerAuth): Record<string, string> {
  return {
    Cookie: auth.cookies,
    ...(auth.csrfToken ? { "X-CSRF-Token": auth.csrfToken } : {}),
  }
}

/** Fetch per-device port_table for all switches at a site. Returns { mac, portTable[] } per device. */
export async function localGetPortTables(auth: LocalControllerAuth, siteId: string = "default"): Promise<{ mac: string; name: string; portTable: any[] }[]> {
  const base = localApiBase(auth)
  const { data } = await httpsRequest(`${base}/api/s/${siteId}/stat/device`, "GET", undefined, localHeaders(auth))
  const devices: any[] = data?.data ?? []
  return devices
    .filter((d: any) => d.type === "usw" && d.port_table)
    .map((d: any) => ({
      mac: (d.mac || "").toLowerCase(),
      name: d.name || d.model || d.mac,
      portTable: d.port_table.map((p: any) => ({
        portIdx: p.port_idx,
        name: p.name,
        enable: p.enable,
        up: p.up,
        speed: p.speed,
        isUplink: p.is_uplink ?? false,
        poeEnable: p.poe_enable ?? false,
        poePower: p.poe_power ? parseFloat(p.poe_power) : 0,
        rxBytes: p.rx_bytes ?? 0,
        txBytes: p.tx_bytes ?? 0,
        mac: (p.mac || "").toLowerCase(),
        lldpTable: p.lldp_table ?? [],
        macTable: (p.mac_table ?? []).map((m: any) => (m.mac || "").toLowerCase()),
      })),
    }))
}

/** Fetch active DHCP leases from a local controller. */
export async function localGetDhcpLeases(auth: LocalControllerAuth, siteId: string = "default"): Promise<{ mac: string; ip: string; hostname: string; networkId: string; expiresAt: number }[]> {
  const base = localApiBase(auth)
  // UniFi stores DHCP leases under stat/sta (active clients)
  const { data } = await httpsRequest(`${base}/api/s/${siteId}/stat/sta`, "GET", undefined, localHeaders(auth))
  const clients: any[] = data?.data ?? []
  return clients
    .filter((c: any) => c.ip && c.mac)
    .map((c: any) => ({
      mac: (c.mac || "").toLowerCase(),
      ip: c.ip,
      hostname: c.hostname || c.name || "",
      networkId: c.network_id || c.network || "",
      expiresAt: c.last_seen ? (c.last_seen * 1000) + 86400000 : 0, // approximate: last_seen + 24h
    }))
}

/** Fetch VLAN / network configurations from a local controller. */
export async function localGetNetworks(auth: LocalControllerAuth, siteId: string = "default"): Promise<{ id: string; name: string; vlanId: number | null; subnet: string | null; gateway: string | null; dhcpEnabled: boolean; purpose: string }[]> {
  const base = localApiBase(auth)
  const { data } = await httpsRequest(`${base}/api/s/${siteId}/rest/networkconf`, "GET", undefined, localHeaders(auth))
  const networks: any[] = data?.data ?? []
  return networks.map((n: any) => ({
    id: n._id,
    name: n.name || "Unnamed",
    vlanId: n.vlan_enabled ? (n.vlan ?? null) : null,
    subnet: n.ip_subnet || null,
    gateway: n.gateway || null,
    dhcpEnabled: n.dhcpd_enabled ?? false,
    purpose: n.purpose || "corporate",
  }))
}

/** Fetch WiFi SSID configurations from a local controller. */
export async function localGetWifiNetworks(auth: LocalControllerAuth, siteId: string = "default"): Promise<{ id: string; name: string; ssid: string; security: string; vlanId: number | null; isHidden: boolean; isEnabled: boolean; bandSteering: string; networkId: string }[]> {
  const base = localApiBase(auth)
  const { data } = await httpsRequest(`${base}/api/s/${siteId}/rest/wlanconf`, "GET", undefined, localHeaders(auth))
  const wlans: any[] = data?.data ?? []
  return wlans.map((w: any) => ({
    id: w._id,
    name: w.name || w.x_passphrase ? w.name : "Unnamed",
    ssid: w.name || "",
    security: w.security || "wpapsk",
    vlanId: w.vlan_enabled ? (w.vlan ?? null) : null,
    isHidden: w.hide_ssid ?? false,
    isEnabled: w.enabled ?? true,
    bandSteering: w.band_steering_mode || "off",
    networkId: w.networkconf_id || "",
  }))
}

// ── Shared helpers ───────────────────────────────────────────────────────────

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

/** Map a UI.com cloud device's productLine/model to a NetworkDevice type */
export function uiCloudDeviceType(device: any): string {
  const model: string = (device.model || "").toLowerCase()
  const line: string = (device.productLine || "").toLowerCase()
  if (line === "protect") return "OTHER"
  if (model.startsWith("uap") || model.startsWith("u6") || model.startsWith("bea") || line === "wifi") return "ACCESS_POINT"
  if (model.startsWith("usw") || model.startsWith("us-") || line === "switching") return "SWITCH"
  if (model.startsWith("udm") || model.startsWith("uxg") || model.startsWith("usg") || model.startsWith("ucg") || line === "routing") return "ROUTER"
  return "OTHER"
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
