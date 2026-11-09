"use client"

/**
 * ⌘K command palette — the primary way techs move around DocHub.
 *
 * - Empty query: recently opened items (lib/recents.ts, per-browser localStorage).
 * - Search: /api/search fans out across every entity type in parallel; rows are
 *   re-ranked here across types (exact > prefix > word > substring, clients win ties).
 * - Client scoping: `queen > printer` turns "queen" into a client chip; typing
 *   "queen printer" offers a one-tap scoped suggestion; on /clients/<id> an
 *   "In <Client>" chip is offered (off by default, ⌥S toggles). Backspace on an
 *   empty query removes the scope chip. The client page's `/` search passes
 *   scopeClientId and starts scoped (unchanged behaviour).
 * - Credential rows: copy username / password / 2FA. Secrets are fetched on demand
 *   from /api/credentials/<id>/reveal so RBAC + reveal audit still apply; the
 *   search API never returns secrets.
 * - Commands: "new …" / "add …" / "go to …" plus page-name matches.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { getRecents, getRecentClients, pushRecent, type RecentItem } from "@/lib/recents"
import { matchScore, norm, parseScopedQuery } from "@/lib/search-rank"

type CredMeta = { username: string | null; hasTotp: boolean; canReveal: boolean }

type SearchResult = {
  id: string
  label: string
  sublabel?: string
  category: string
  href: string
  categoryColor: string
  clientId?: string | null
  clientName?: string | null
  cred?: CredMeta
  /** extra text to rank against when the label itself doesn't match (e.g. username) */
  alt?: (string | null | undefined)[]
}

type Client = { id: string; name: string }

type Row =
  | { kind: "result"; key: string; r: SearchResult; score: number }
  | { kind: "recent"; key: string; r: SearchResult }
  | { kind: "action"; key: string; label: string; sublabel?: string; href: string; icon: string; score: number }
  | { kind: "suggest"; key: string; client: Client; rest: string }

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  client:     { label: "Client",     color: "#3d6fff" },
  asset:      { label: "Asset",      color: "#00d4aa" },
  // An unregistered category falls back to FALLBACK_META below, but register every
  // group the API returns so it gets a proper label + colour.
  cableRun:   { label: "Cable Run",  color: "#f59e0b" },
  credential: { label: "Credential", color: "#ec4899" },
  runbook:    { label: "Runbook",    color: "#f59e0b" },
  document:   { label: "Document",   color: "#6366f1" },
  file:       { label: "File",       color: "#14b8a6" },
  person:     { label: "Contact",    color: "#0ea5e9" },
  vendor:     { label: "Vendor",     color: "#a855f7" },
  license:    { label: "License",    color: "#f97316" },
  location:   { label: "Location",   color: "#eab308" },
  netdevice:  { label: "Network",    color: "#10b981" },
  circuit:    { label: "Circuit",    color: "#f43f5e" },
  flexAsset:  { label: "Flex Asset", color: "#8b5cf6" },
  subnet:     { label: "Subnet",     color: "#06b6d4" },
  ipAssignment: { label: "IP Address", color: "#84cc16" },
  rack:       { label: "Rack",       color: "#64748b" },
  website:    { label: "Domain",     color: "#22c55e" },
  application:{ label: "App",        color: "#e879f9" },
  vlan:       { label: "VLAN",       color: "#38bdf8" },
  phoneExt:   { label: "Extension",  color: "#fb923c" },
  did:        { label: "DID",        color: "#fbbf24" },
  wifi:       { label: "Wi-Fi",      color: "#2dd4bf" },
  // recents pushed by other pages may use these spellings
  doc:        { label: "Document",   color: "#6366f1" },
  page:       { label: "Page",       color: "#94a3b8" },
}
const FALLBACK_META = { label: "Item", color: "#94a3b8" }
const metaFor = (cat: string) => CATEGORY_META[cat] ?? { ...FALLBACK_META, label: cat || FALLBACK_META.label }

/** Type filter chips. Tab / Shift+Tab cycles them. */
const FILTERS: { key: string; label: string; cats?: string[] }[] = [
  { key: "all",     label: "All" },
  { key: "clients", label: "Clients",     cats: ["client"] },
  { key: "creds",   label: "Credentials", cats: ["credential"] },
  { key: "assets",  label: "Assets",      cats: ["asset", "flexAsset", "application", "license"] },
  { key: "network", label: "Network",     cats: ["netdevice", "circuit", "subnet", "ipAssignment", "rack", "vlan", "wifi", "cableRun", "website"] },
  { key: "phone",   label: "Phone",       cats: ["phoneExt", "did"] },
  { key: "docs",    label: "Docs",        cats: ["document", "file", "runbook"] },
  { key: "people",  label: "People",      cats: ["person", "location", "vendor"] },
]

const PAGES: { label: string; href: string; icon: string; kw?: string }[] = [
  { label: "Dashboard",       href: "/dashboard",   icon: "🏠", kw: "home" },
  { label: "Clients",         href: "/clients",     icon: "🏢", kw: "customers" },
  { label: "Alerts",          href: "/alerts",      icon: "🔔", kw: "alarms" },
  { label: "Runbooks",        href: "/runbooks",    icon: "📋", kw: "sops" },
  { label: "Reports",         href: "/reports",     icon: "📊" },
  { label: "Inbox",           href: "/inbox",       icon: "📥", kw: "intake" },
  { label: "Licenses",        href: "/licenses",    icon: "📜" },
  { label: "Vendors",         href: "/vendors",     icon: "🏷" },
  { label: "Expirations",     href: "/expirations", icon: "⏳", kw: "expiring renewals" },
  { label: "Settings",        href: "/settings",    icon: "⚙" },
  { label: "Flexible Assets", href: "/flex",        icon: "🧩", kw: "flex" },
  { label: "Templates",       href: "/templates",   icon: "🗂" },
]

const enc = encodeURIComponent
const tabHref = (clientId: string, tab: string, extra = "") => `/clients/${clientId}?tab=${enc(tab)}${extra}`

// ─── API → rows ─────────────────────────────────────────────────────────────

type C = { id: string; name: string } | null | undefined
/* eslint-disable @typescript-eslint/no-explicit-any */
function flattenResults(data: any): SearchResult[] {
  const results: SearchResult[] = []
  const push = (category: string, r: Omit<SearchResult, "category" | "categoryColor">) =>
    results.push({ ...r, category, categoryColor: metaFor(category).color })
  const cl = (c: C) => ({ clientId: c?.id ?? null, clientName: c?.name ?? null })

  for (const c of data.clients ?? []) {
    push("client", {
      id: c.id, label: c.name, clientId: c.id, clientName: c.name,
      sublabel: c.type === "BUSINESS" ? "Business client" : "Residential client",
      href: `/clients/${c.id}`,
    })
  }
  for (const a of data.assets ?? []) {
    const client = a.location?.client
    push("asset", {
      id: a.id, ...cl(client),
      label: a.friendlyName || a.name,
      alt: [a.name],
      sublabel: [a.room ? `Room ${a.room}` : null, a.make, a.model, client?.name].filter(Boolean).join(" · "),
      href: `/assets/${a.id}`,
    })
  }
  // The sublabel IS the deliverable here: it renders the whole chain
  // jack -> panel/port -> switch:port inline, so the 2am lookup is answered by the
  // search results list itself, without opening anything.
  for (const r of data.cableRuns ?? []) {
    const sw = r.switchAsset ? (r.switchAsset.friendlyName || r.switchAsset.name) : null
    push("cableRun", {
      id: r.id, ...cl(r.client),
      label: r.jackLabel,
      sublabel: [
        r.room,
        r.panelLabel ? `panel ${r.panelLabel}${r.panelPort != null ? `/${r.panelPort}` : ""}` : null,
        sw ? `${sw}${r.switchPortNumber != null ? `:${r.switchPortNumber}` : ""}` : null,
        r.client?.name,
      ].filter(Boolean).join(" · "),
      href: tabHref(r.clientId, "Network", `&sub=cabling&run=${r.id}`),
    })
  }
  for (const c of data.credentials ?? []) {
    push("credential", {
      id: c.id, ...cl(c.client),
      label: c.label,
      alt: [c.username, c.url],
      sublabel: [c.isRetired ? "retired" : null, c.username, c.client?.name].filter(Boolean).join(" · "),
      // `cred` = the client page scrolls to + highlights that row.
      href: tabHref(c.client.id, "Credentials", `&cred=${c.id}`),
      cred: { username: c.username ?? null, hasTotp: !!c.hasTotp, canReveal: !!c.canReveal },
    })
  }
  for (const r of data.runbooks ?? []) {
    push("runbook", {
      id: r.id, ...cl(r.client),
      label: r.title,
      sublabel: r.client ? r.client.name : "Global runbook",
      href: r.clientId ? tabHref(r.clientId, "SOPs") : `/runbooks/${r.id}`,
    })
  }
  for (const d of data.documents ?? []) {
    push("document", { id: d.id, ...cl(d.client), label: d.title, sublabel: d.client?.name, href: tabHref(d.clientId, "Documents") })
  }
  for (const f of data.files ?? []) {
    push("file", {
      id: f.id, ...cl(f.client),
      label: f.originalName,
      sublabel: [f.client?.name, f.mimeType].filter(Boolean).join(" · "),
      href: f.clientId ? tabHref(f.clientId, "Documents") : "#",
    })
  }
  for (const p of data.people ?? []) {
    push("person", {
      id: p.id, ...cl(p.client),
      label: p.name, alt: [p.email],
      sublabel: [p.jobTitle, p.email, p.client?.name].filter(Boolean).join(" · "),
      href: p.clientId ? tabHref(p.clientId, "People") : "#",
    })
  }
  for (const v of data.vendors ?? []) {
    push("vendor", { id: v.id, label: v.name, sublabel: [v.category, v.website].filter(Boolean).join(" · "), href: `/vendors/${v.id}` })
  }
  for (const l of data.licenses ?? []) {
    push("license", {
      id: l.id, ...cl(l.client), label: l.name,
      sublabel: [l.vendor, l.client?.name].filter(Boolean).join(" · "),
      href: l.clientId ? tabHref(l.clientId, "Licenses") : "#",
    })
  }
  for (const loc of data.locations ?? []) {
    push("location", {
      id: loc.id, ...cl(loc.client), label: loc.name,
      sublabel: [loc.city, loc.client?.name].filter(Boolean).join(" · "),
      href: loc.clientId ? tabHref(loc.clientId, "Locations") : "#",
    })
  }
  for (const n of data.netdevices ?? []) {
    push("netdevice", {
      id: n.id, ...cl(n.client), label: n.name, alt: [n.ipAddress],
      sublabel: [n.ipAddress, n.client?.name].filter(Boolean).join(" · "),
      href: n.clientId ? tabHref(n.clientId, "Network") : "#",
    })
  }
  for (const c of data.circuits ?? []) {
    push("circuit", {
      id: c.id, ...cl(c.client), label: c.label, alt: [c.wanIp],
      sublabel: [c.wanIp, c.client?.name].filter(Boolean).join(" · "),
      href: c.clientId ? tabHref(c.clientId, "Network", "&sub=circuits") : "#",
    })
  }
  for (const fa of data.flexAssets ?? []) {
    push("flexAsset", {
      id: fa.id, ...cl(fa.client), label: fa.title,
      sublabel: [fa.layout?.name, fa.client?.name].filter(Boolean).join(" · "),
      href: `/flex/asset/${fa.id}`,
    })
  }
  for (const s of data.subnets ?? []) {
    push("subnet", {
      id: s.id, ...cl(s.client), label: s.cidr, alt: [s.description],
      sublabel: [s.description, s.vlan ? `VLAN ${s.vlan}` : null, s.client?.name].filter(Boolean).join(" · "),
      href: s.clientId ? tabHref(s.clientId, "Network", "&sub=ipam") : "#",
    })
  }
  for (const ip of data.ipAssignments ?? []) {
    const client = ip.subnet?.client
    push("ipAssignment", {
      id: ip.id, ...cl(client), label: ip.ipAddress, alt: [ip.hostname],
      sublabel: [ip.hostname, ip.subnet?.cidr, client?.name].filter(Boolean).join(" · "),
      href: client?.id ? tabHref(client.id, "Network", "&sub=ipam") : "#",
    })
  }
  for (const rk of data.racks ?? []) {
    const client = rk.location?.client
    push("rack", {
      id: rk.id, ...cl(client), label: rk.name,
      sublabel: [rk.location?.name, rk.location?.city, client?.name].filter(Boolean).join(" · ") || "Rack",
      href: client?.id ? tabHref(client.id, "Network", "&sub=racks") : "#",
    })
  }
  for (const w of data.websites ?? []) {
    push("website", {
      id: w.id, ...cl(w.client), label: w.domain, alt: [w.label],
      sublabel: [w.label, w.registrar, w.expiresAt ? `exp ${String(w.expiresAt).slice(0, 10)}` : null, w.client?.name].filter(Boolean).join(" · "),
      href: tabHref(w.clientId, "Domains"),
    })
  }
  for (const a of data.applications ?? []) {
    push("application", {
      id: a.id, ...cl(a.client), label: a.name,
      sublabel: [a.vendor, a.version, a.client?.name].filter(Boolean).join(" · "),
      href: tabHref(a.clientId, "Applications"),
    })
  }
  for (const v of data.vlans ?? []) {
    push("vlan", {
      id: v.id, ...cl(v.client), label: `VLAN ${v.vlanNumber} · ${v.name}`, alt: [v.name, String(v.vlanNumber)],
      sublabel: [v.description, v.client?.name].filter(Boolean).join(" · "),
      href: tabHref(v.clientId, "Network", "&sub=ipam"),
    })
  }
  for (const e of data.phoneExtensions ?? []) {
    const client = e.system?.client
    push("phoneExt", {
      id: e.id, ...cl(client), label: `x${e.extension} · ${e.displayName}`, alt: [e.extension, e.displayName, e.did],
      sublabel: [e.did, e.system?.name, client?.name].filter(Boolean).join(" · "),
      href: client?.id ? tabHref(client.id, "Phone System") : "#",
    })
  }
  for (const d of data.dids ?? []) {
    const client = d.trunk?.system?.client
    push("did", {
      id: d.id, ...cl(client), label: d.number, alt: [d.designation],
      sublabel: [d.designation, d.extension ? `→ x${d.extension.extension} ${d.extension.displayName}` : null, d.trunk?.carrier, client?.name].filter(Boolean).join(" · "),
      href: client?.id ? tabHref(client.id, "Phone System") : "#",
    })
  }
  for (const w of data.wifiNetworks ?? []) {
    const client = w.controller?.client
    push("wifi", {
      id: w.id, ...cl(client), label: w.ssid,
      sublabel: [w.purpose ? String(w.purpose).toLowerCase() : null, w.vlanId != null ? `VLAN ${w.vlanId}` : null, w.controller?.name, client?.name].filter(Boolean).join(" · "),
      href: client?.id ? tabHref(client.id, "Network", "&sub=wireless") : "#",
    })
  }
  return results
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function scoreResult(r: SearchResult, q: string): number {
  let s = matchScore(r.label, q)
  for (const a of r.alt ?? []) s = Math.max(s, matchScore(a, q) - 5)
  if (s === 0) s = 20 // matched on a field we don't display (notes, content, serial…)
  if (r.category === "client") s += 8 // exact client name floats above everything
  return s
}

// ─── commands ───────────────────────────────────────────────────────────────

const NEW_VERB = /^(new|add|create)\b\s*/i
const GO_VERB = /^(go\s*to|goto|go|open)\b\s*/i

function buildCommands(q: string, client: Client | null): Extract<Row, { kind: "action" }>[] {
  const raw = q.trim()
  if (!raw) return []
  const out: Extract<Row, { kind: "action" }>[] = []

  const newM = raw.match(NEW_VERB)
  const newRest = newM ? raw.slice(newM[0].length) : null
  const newItems: { what: string; href: string; icon: string; kw?: string }[] = [
    { what: "client", href: "/clients?new=1", icon: "🏢" },
    ...(client ? [
      { what: "credential", href: tabHref(client.id, "Credentials", "&new=1"), icon: "🔑", kw: "password login" },
      { what: "asset",      href: tabHref(client.id, "Assets", "&new=1"),      icon: "💻", kw: "device computer" },
      { what: "document",   href: tabHref(client.id, "Documents", "&new=1"),   icon: "📄", kw: "doc" },
      { what: "contact",    href: tabHref(client.id, "People", "&new=1"),      icon: "👤", kw: "person user" },
      { what: "license",    href: tabHref(client.id, "Licenses", "&new=1"),    icon: "📜" },
      { what: "SOP",        href: tabHref(client.id, "SOPs", "&new=1"),        icon: "📋", kw: "runbook" },
    ] : [
      { what: "SOP", href: "/runbooks?new=1", icon: "📋", kw: "runbook" },
    ]),
  ]
  for (const n of newItems) {
    const label = n.what === "client" || !client ? `New ${n.what}` : `New ${n.what} in ${client.name}`
    let s = 0
    if (newRest !== null) {
      s = newRest === "" ? 90 : Math.max(matchScore(n.what, newRest), ...(n.kw ?? "").split(" ").map((k) => matchScore(k, newRest)))
      if (s > 0) s += 30
    } else {
      s = matchScore(`New ${n.what}`, raw) >= 80 ? 85 : 0
    }
    if (s > 0) out.push({ kind: "action", key: `new:${n.what}`, label, href: n.href, icon: n.icon, score: s, sublabel: "Create" })
  }

  const goM = raw.match(GO_VERB)
  const goRest = goM ? raw.slice(goM[0].length) : raw
  for (const p of PAGES) {
    let s = Math.max(matchScore(p.label, goRest), ...(p.kw ?? "").split(" ").map((k) => matchScore(k, goRest) - 10))
    if (goM) s = goRest === "" ? 70 : s > 0 ? s + 30 : 0
    else s = s >= 80 ? s - 10 : 0 // bare page names only on a prefix match, below real exact hits
    if (s > 0) out.push({ kind: "action", key: `go:${p.href}`, label: `Go to ${p.label}`, href: p.href, icon: p.icon, score: s, sublabel: p.href })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, goM || newM ? 8 : 3)
}

// ─── clipboard ──────────────────────────────────────────────────────────────

/**
 * Copy text produced by an async fetch. Uses a promise-valued ClipboardItem so
 * Safari keeps the user-activation across the network round trip; falls back to
 * writeText elsewhere.
 */
async function copyFromPromise(p: Promise<string>): Promise<void> {
  const CI = typeof window !== "undefined" ? (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem : undefined
  if (CI && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new CI({ "text/plain": p.then((v) => new Blob([v], { type: "text/plain" })) })])
      return
    } catch {
      await p // surface the fetch error if that was the cause
    }
  }
  await navigator.clipboard.writeText(await p)
}

function revealField(credId: string, field: "password" | "totp"): Promise<string> {
  return fetch(`/api/credentials/${credId}/reveal`).then(async (r) => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d?.error || (r.status === 403 ? "Not allowed to reveal" : `Reveal failed (${r.status})`))
    const v = field === "password" ? d.password : d.totpCode
    if (!v) throw new Error(field === "totp" ? "No 2FA secret on this credential" : "Password is empty")
    return String(v)
  })
}

// ─── component ──────────────────────────────────────────────────────────────

export default function SearchModal({
  onClose,
  scopeClientId,
  scopeClientName,
}: {
  onClose: () => void
  /** Passed by the client page's `/` search — palette starts scoped to it. */
  scopeClientId?: string | null
  scopeClientName?: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [suggestion, setSuggestion] = useState<{ client: Client; rest: string } | null>(null)
  const [scopeMiss, setScopeMiss] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [filterIdx, setFilterIdx] = useState(0)
  const [recents, setRecents] = useState<RecentItem[]>([])
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [coarse, setCoarse] = useState(false)
  const [isMac, setIsMac] = useState(true)

  // Context client: the explicit prop, else the /clients/<id> page we're on.
  const pathClientId = useMemo(() => {
    const m = pathname?.match(/^\/clients\/([^/?#]+)/)
    return m && m[1] !== "new" ? decodeURIComponent(m[1]) : null
  }, [pathname])
  const [ctxClient, setCtxClient] = useState<Client | null>(
    scopeClientId && scopeClientName ? { id: scopeClientId, name: scopeClientName } : null,
  )
  // Default: scoped only when explicitly opened as the in-client search (`/`).
  const [ctxScopeOn, setCtxScopeOn] = useState<boolean>(!!scopeClientId)
  const [explicitScope, setExplicitScope] = useState<Client | null>(null)
  const scope: Client | null = explicitScope ?? (ctxScopeOn ? ctxClient : null)
  const actionClient = scope ?? ctxClient

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqSeq = useRef(0)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    setRecents(getRecents(12))
    try { setCoarse(window.matchMedia("(pointer: coarse)").matches) } catch {}
    try { setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) } catch {}
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current) }
  }, [])

  // Resolve the context client's name when opened globally on a client page.
  useEffect(() => {
    if (scopeClientId || !pathClientId) return
    const known = getRecents().find((r) => (r.type === "client" ? r.id : r.clientId) === pathClientId)
    const name = known ? (known.type === "client" ? known.title : known.clientName) : null
    if (name) setCtxClient({ id: pathClientId, name })
    let alive = true
    fetch(`/api/search?ctx=${enc(pathClientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.client) setCtxClient(d.client) })
      .catch(() => {})
    return () => { alive = false }
  }, [pathClientId, scopeClientId])

  const flash = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  // Search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const seq = ++reqSeq.current
    const parsed = !explicitScope ? parseScopedQuery(query) : null
    const text = parsed ? parsed.rest : query.trim()
    setScopeMiss(null)
    if (!parsed && text.length < 2) { setResults([]); setSuggestion(null); setLoading(false); return }

    setLoading(true)
    const params = new URLSearchParams({ q: text })
    if (parsed) params.set("clientQ", parsed.clientQ)
    else if (scope) params.set("clientId", scope.id)
    if (!scope) {
      // tie-break for client resolution ("queen" → the Queen you actually work on)
      const prefer = getRecentClients(10).map((c) => c.id).join(",")
      if (prefer) params.set("prefer", prefer)
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/search?${params}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || seq !== reqSeq.current) return
          if (parsed) {
            if (d.scopedClient) {
              // Turn "queen >" into a chip; the query becomes just the remainder.
              setExplicitScope(d.scopedClient)
              setQuery(parsed.rest)
              return
            }
            setScopeMiss(parsed.clientQ)
          }
          setResults(flattenResults(d))
          setSuggestion(d.clientSuggestion ?? null)
          setActiveIdx(0)
        })
        .catch(() => {})
        .finally(() => { if (seq === reqSeq.current) setLoading(false) })
    }, 150)
  }, [query, scope?.id, explicitScope]) // eslint-disable-line react-hooks/exhaustive-deps

  const filter = FILTERS[filterIdx]
  const trimmed = query.trim()

  const rows: Row[] = useMemo(() => {
    if (!trimmed) {
      const rs = scope ? recents.filter((r) => (r.type === "client" ? r.id : r.clientId) === scope.id) : recents
      return rs.slice(0, 10).map((r) => ({
        kind: "recent" as const,
        key: `recent:${r.type}:${r.id}`,
        r: {
          id: r.id, label: r.title, sublabel: r.subtitle ?? (r.type !== "client" ? r.clientName : undefined), href: r.href,
          category: r.type, categoryColor: metaFor(r.type).color, clientId: r.clientId ?? (r.type === "client" ? r.id : null),
          clientName: r.clientName ?? (r.type === "client" ? r.title : null),
          // Recents don't store TOTP/username metadata — offer password copy only.
          cred: r.type === "credential" ? { username: null, hasTotp: false, canReveal: true } : undefined,
        },
      }))
    }
    const text = (!explicitScope && parseScopedQuery(query)?.rest) || trimmed
    const ranked: Row[] = results
      .filter((r) => !filter.cats || filter.cats.includes(r.category))
      .map((r, i) => ({ kind: "result" as const, key: `${r.category}:${r.id}`, r, score: scoreResult(r, text) - i * 0.001 }))
    const cmds = filter.key === "all" ? buildCommands(trimmed, actionClient) : []
    const merged = [...ranked, ...cmds].sort((a, b) => (b as { score: number }).score - (a as { score: number }).score)
    if (suggestion && filter.key === "all") {
      // after exact hits, before everything else
      const at = merged.findIndex((r) => (r as { score?: number }).score === undefined || (r as { score: number }).score < 100)
      merged.splice(at === -1 ? merged.length : at, 0, { kind: "suggest", key: `suggest:${suggestion.client.id}`, ...suggestion })
    }
    return merged
  }, [trimmed, query, results, filter, recents, scope, explicitScope, actionClient, suggestion])

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of FILTERS) m[f.key] = f.cats ? results.filter((r) => f.cats!.includes(r.category)).length : results.length
    return m
  }, [results])

  useEffect(() => { setActiveIdx((i) => Math.min(i, Math.max(rows.length - 1, 0))) }, [rows.length])

  const openResult = useCallback((r: SearchResult) => {
    if (r.href && r.href !== "#") {
      pushRecent({
        type: r.category, id: r.id, title: r.label, subtitle: r.sublabel || undefined, href: r.href,
        clientId: r.clientId ?? undefined, clientName: r.clientName ?? undefined,
      })
      router.push(r.href)
    }
    onClose()
  }, [router, onClose])

  const activate = useCallback((row: Row | undefined) => {
    if (!row) return
    if (row.kind === "suggest") {
      setExplicitScope(row.client)
      setQuery(row.rest)
      inputRef.current?.focus()
      return
    }
    if (row.kind === "action") { router.push(row.href); onClose(); return }
    openResult(row.r)
  }, [router, onClose, openResult])

  const copyCred = useCallback(async (r: SearchResult, field: "username" | "password" | "totp") => {
    if (!r.cred) return
    const what = field === "username" ? "Username" : field === "password" ? "Password" : "2FA code"
    try {
      if (field === "username") {
        if (!r.cred.username) { flash("No username on this credential", false); return }
        await navigator.clipboard.writeText(r.cred.username)
      } else {
        flash(`Copying ${what.toLowerCase()}…`)
        await copyFromPromise(revealField(r.id, field))
      }
      flash(`${what} copied — ${r.label}`)
      pushRecent({
        type: "credential", id: r.id, title: r.label, subtitle: r.sublabel || undefined, href: r.href,
        clientId: r.clientId ?? undefined, clientName: r.clientName ?? undefined,
      })
    } catch (e) {
      flash(e instanceof Error && e.message ? e.message : `Couldn't copy ${what.toLowerCase()}`, false)
    }
  }, [flash])

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const row = rows[activeIdx]
      const credRow = row && (row.kind === "result" || row.kind === "recent") && row.r.cred ? row.r : null
      if (e.key === "Escape") { e.preventDefault(); onClose(); return }
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, rows.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
      if (e.key === "Enter") { if (row) { e.preventDefault(); activate(row) } return }
      if (e.key === "Tab") {
        if (!trimmed) return
        e.preventDefault()
        setFilterIdx((i) => (i + (e.shiftKey ? FILTERS.length - 1 : 1)) % FILTERS.length)
        setActiveIdx(0)
        return
      }
      if (e.key === "Backspace" && query === "" && (explicitScope || (ctxScopeOn && ctxClient))) {
        e.preventDefault()
        if (explicitScope) setExplicitScope(null)
        else setCtxScopeOn(false)
        return
      }
      if (e.altKey && e.code === "KeyS" && ctxClient && !explicitScope) {
        e.preventDefault(); setCtxScopeOn((v) => !v); return
      }
      if (credRow) {
        const input = inputRef.current
        const hasSel = !!input && document.activeElement === input && input.selectionStart !== input.selectionEnd
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.code === "KeyC" && !hasSel) {
          e.preventDefault(); copyCred(credRow, "password"); return
        }
        if (e.altKey && !e.metaKey && !e.ctrlKey) {
          if (e.code === "KeyU") { e.preventDefault(); copyCred(credRow, "username"); return }
          if (e.code === "KeyP") { e.preventDefault(); copyCred(credRow, "password"); return }
          if (e.code === "KeyT") { e.preventDefault(); copyCred(credRow, "totp"); return }
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [rows, activeIdx, activate, onClose, trimmed, query, explicitScope, ctxScopeOn, ctxClient, copyCred])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  const mod = isMac ? "⌘" : "Ctrl+"
  const alt = isMac ? "⌥" : "Alt+"
  const activeRow = rows[activeIdx]
  const activeCred = activeRow && (activeRow.kind === "result" || activeRow.kind === "recent") ? activeRow.r.cred : undefined
  const btnH = coarse ? 36 : 26
  const showNoResults = trimmed.length >= 2 && !loading && rows.length === 0

  const kbd: React.CSSProperties = {
    background: "var(--card)", border: "0.5px solid var(--border)",
    borderRadius: "4px", padding: "1px 5px", fontFamily: "var(--mono)", fontSize: "10px",
  }
  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 11, padding: coarse ? "8px 12px" : "4px 10px", borderRadius: 12, cursor: "pointer",
    background: on ? "rgba(59,130,246,0.16)" : "var(--card)",
    color: on ? "#3b82f6" : "var(--text)",
    border: `0.5px solid ${on ? "rgba(59,130,246,0.5)" : "var(--border)"}`,
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", flexShrink: 0,
  })

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search DocHub"
        style={{
          position: "fixed", top: "max(12px, 12vh)", left: "50%", transform: "translateX(-50%)",
          zIndex: 1000, width: "calc(100% - 24px)", maxWidth: "620px",
          background: "var(--surface)", borderRadius: "14px",
          border: "0.5px solid var(--color-border-primary)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
          overflow: "hidden", display: "flex", flexDirection: "column",
          maxHeight: "calc(100dvh - 24px)",
        }}
      >
        {/* Input row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", borderBottom: "0.5px solid var(--border)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {scope && (
            <button
              type="button"
              data-testid="scope-chip"
              onClick={() => { if (explicitScope) setExplicitScope(null); else setCtxScopeOn(false); inputRef.current?.focus() }}
              title="Remove client scope (Backspace on empty query)"
              style={{ ...chip(true), borderRadius: 6, maxWidth: 200 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>in {scope.name}</span>
              <span aria-hidden style={{ opacity: 0.7 }}>×</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            placeholder={scope
              ? `Search within ${scope.name}…`
              : "Search everything, “client > thing”, or “new …” / “go to …”"}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); if (!e.target.value.trim()) setFilterIdx(0) }}
            style={{
              flex: 1, minWidth: 0, background: "none", border: "none", outline: "none",
              fontSize: coarse ? "16px" : "15px", color: "var(--text)", fontFamily: "var(--sans)",
            }}
          />
          {loading && <div style={{ fontSize: "11px", color: "var(--muted)", flexShrink: 0 }}>…</div>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              fontSize: "11px", color: "var(--muted)", background: "var(--card)",
              border: "0.5px solid var(--border)", borderRadius: "5px", cursor: "pointer",
              padding: coarse ? "8px 10px" : "2px 6px", flexShrink: 0, fontFamily: "var(--mono)",
            }}
          >ESC</button>
        </div>

        {/* Chip row: client-context toggle + type filters (Tab cycles) */}
        {(ctxClient && !explicitScope && !ctxScopeOn) || trimmed ? (
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", overflowX: "auto", borderBottom: "0.5px solid var(--border)", alignItems: "center" }}>
            {ctxClient && !explicitScope && !ctxScopeOn && (
              <button type="button" data-testid="ctx-chip" onClick={() => { setCtxScopeOn(true); inputRef.current?.focus() }}
                title={`Search only ${ctxClient.name} (${alt}S)`}
                style={{ ...chip(false), borderStyle: "dashed", borderColor: "rgba(59,130,246,0.6)", color: "#3b82f6" }}>
                + In {ctxClient.name}
              </button>
            )}
            {trimmed && FILTERS.map((f, i) => (
              <button key={f.key} type="button" onClick={() => { setFilterIdx(i); setActiveIdx(0); inputRef.current?.focus() }} style={chip(i === filterIdx)}>
                {f.label}
                {results.length > 0 && <span style={{ opacity: 0.6, fontFamily: "var(--mono)", fontSize: 10 }}>{counts[f.key]}</span>}
              </button>
            ))}
          </div>
        ) : null}

        {/* Jump-to chips on the empty state */}
        {!trimmed && !scope && (
          <div style={{ display: "flex", gap: 6, padding: "10px 14px", flexWrap: "wrap", borderBottom: "0.5px solid var(--border)" }}>
            <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, alignSelf: "center", marginRight: 4 }}>Jump to</span>
            {[
              { label: "Expiring soon",  href: "/expirations",                  icon: "⏳" },
              { label: "Flagged docs",   href: "/docs/review",                  icon: "🚩" },
              { label: "Sync errors",    href: "/settings?section=sync-status", icon: "⚠" },
              { label: "Active alarms",  href: "/alarms",                       icon: "🔔" },
              { label: "My vault",       href: "/settings?section=my-vault",    icon: "🔐" },
            ].map((f) => (
              <button key={f.label} type="button" onClick={() => { router.push(f.href); onClose() }} style={chip(false)}>
                <span>{f.icon}</span>{f.label}
              </button>
            ))}
          </div>
        )}

        {scopeMiss && (
          <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--color-text-warning, #f59e0b)" }}>
            No client matches “{scopeMiss}”.
          </div>
        )}

        {!trimmed && rows.length > 0 && (
          <div style={{ padding: "8px 16px 2px", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Recent{scope ? ` in ${scope.name}` : ""}
          </div>
        )}

        {rows.length > 0 && (
          <div ref={listRef} role="listbox" style={{ overflowY: "auto", maxHeight: "min(440px, 55dvh)", flex: "0 1 auto" }}>
            {rows.map((row, i) => {
              const active = i === activeIdx
              const base: React.CSSProperties = {
                display: "flex", alignItems: "center", gap: "12px",
                padding: coarse ? "12px 14px" : "9px 16px", cursor: "pointer",
                background: active ? "var(--card)" : "transparent",
                borderBottom: i < rows.length - 1 ? "0.5px solid rgba(35,40,64,0.6)" : "none",
              }
              let badge: { text: string; color: string }
              let label: string
              let sub: string | undefined
              let cred: CredMeta | undefined
              let r: SearchResult | undefined
              if (row.kind === "suggest") {
                badge = { text: "SCOPE", color: "#3b82f6" }
                label = `“${row.rest}” in ${row.client.name}`
                sub = `Search only ${row.client.name} · tip: type “${row.client.name.split(" ")[0].toLowerCase()} > ${row.rest}”`
              } else if (row.kind === "action") {
                badge = { text: row.icon + " " + (row.key.startsWith("new:") ? "NEW" : "GO"), color: "#94a3b8" }
                label = row.label
                sub = row.sublabel
              } else {
                r = row.r
                const meta = metaFor(r.category)
                badge = { text: meta.label.toUpperCase(), color: r.categoryColor }
                label = r.label
                sub = r.sublabel
                cred = r.cred
              }
              const showCredBtns = !!cred && !!r && (active || coarse)
              return (
                <div
                  key={row.key}
                  data-idx={i}
                  role="option"
                  aria-selected={active}
                  data-kind={row.kind}
                  onClick={() => activate(row)}
                  onMouseMove={() => { if (!active) setActiveIdx(i) }}
                  style={base}
                >
                  <span style={{
                    fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em",
                    padding: "2px 7px", borderRadius: "4px", flexShrink: 0,
                    background: `${badge.color}18`, color: badge.color,
                    minWidth: coarse ? 0 : "72px", textAlign: "center", fontFamily: "var(--mono)", whiteSpace: "nowrap",
                  }}>{badge.text}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                    {sub && <div style={{ fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
                  </div>
                  {showCredBtns && r && cred && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {cred.username && (
                        <button type="button" data-testid="copy-user" title={`Copy username (${alt}U)`} onClick={() => copyCred(r!, "username")}
                          style={{ ...kbd, height: btnH, padding: "0 8px", cursor: "pointer", color: "var(--text)", fontSize: 11 }}>user</button>
                      )}
                      <button type="button" data-testid="copy-pass" title={cred.canReveal ? `Copy password (${mod}C)` : "Admin role required to reveal"}
                        disabled={!cred.canReveal} onClick={() => copyCred(r!, "password")}
                        style={{ ...kbd, height: btnH, padding: "0 8px", cursor: cred.canReveal ? "pointer" : "not-allowed", opacity: cred.canReveal ? 1 : 0.45, color: "var(--text)", fontSize: 11 }}>pass</button>
                      {cred.hasTotp && (
                        <button type="button" data-testid="copy-totp" title={`Copy 2FA code (${alt}T)`} disabled={!cred.canReveal} onClick={() => copyCred(r!, "totp")}
                          style={{ ...kbd, height: btnH, padding: "0 8px", cursor: cred.canReveal ? "pointer" : "not-allowed", opacity: cred.canReveal ? 1 : 0.45, color: "var(--text)", fontSize: 11 }}>2FA</button>
                      )}
                    </div>
                  )}
                  {active && !showCredBtns && !coarse && <kbd style={{ ...kbd, fontSize: 11, flexShrink: 0 }}>↵</kbd>}
                </div>
              )
            })}
          </div>
        )}

        {!trimmed && rows.length === 0 && (
          <div style={{ padding: "22px 16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
            Nothing recent{scope ? ` in ${scope.name}` : ""} yet — items you open from here show up for quick return.
          </div>
        )}

        {showNoResults && !scopeMiss && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
            No results for <strong style={{ color: "var(--text)" }}>{trimmed}</strong>{scope ? <> in {scope.name}</> : null}
            {filter.key !== "all" && <> under {filter.label} — <kbd style={kbd}>Tab</kbd> to change filter</>}
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: "7px 14px", borderTop: "0.5px solid var(--border)",
          display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", minHeight: 32,
        }}>
          {toast ? (
            <span role="status" data-testid="toast" style={{ fontSize: 12, color: toast.ok ? "var(--color-text-success, #22c55e)" : "var(--color-text-danger, #ef4444)" }}>
              {toast.ok ? "✓ " : "⚠ "}{toast.msg}
            </span>
          ) : coarse ? null : (
            (activeCred
              ? [["↵", "open"], [`${mod}C`, "password"], [`${alt}U`, "user"], ...(activeCred.hasTotp ? [[`${alt}T`, "2FA"]] : []), ["ESC", "close"]]
              : [["↑↓", "navigate"], ["↵", "open"], ...(trimmed ? [["Tab", "filter"]] : []), ...(ctxClient && !explicitScope ? [[`${alt}S`, "scope"]] : []), ["ESC", "close"]]
            ).map(([key, action]) => (
              <span key={key + action} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--muted)" }}>
                <kbd style={kbd}>{key}</kbd>{action}
              </span>
            ))
          )}
        </div>
      </div>
    </>
  )
}
