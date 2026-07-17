"use client"

import AppShell from "@/components/AppShell"
import Sheet from "@/components/Sheet"
import DataCards, { type DataColumn } from "@/components/DataCards"
import { useCallback, useEffect, useMemo, useState } from "react"

type Run = {
  id: string
  kind: string
  status: string
  scope: string
  clientId: string | null
  startedAt: string
  finishedAt: string | null
  hasFile: boolean
  sizeBytes: number | null
  sha256: string | null
  itemCounts: Record<string, number> | null
  secretsMode: string
  includeUploads: boolean
  verifiedAt: string | null
  verifyStatus: string | null
  error: string | null
  triggeredBy: string | null
}

type Schedule = {
  enabled: boolean
  frequency: string
  hourUtc: number
  weekday: number | null
  retentionCount: number
  maxAgeDays: number | null
  includeUploads: boolean
  secretsMode: string
  target: string
  s3Bucket: string | null
  s3Prefix: string | null
  s3Endpoint: string | null
  s3AccessKey: string | null
  s3SecretKeySet: boolean
  lastRunAt: string | null
  nextRunAt: string | null
}

type ApiResponse = { schedule: Schedule; runs: Run[]; keyConfigured: boolean }

function formatBytes(n: number | null): string {
  if (n == null) return "—"
  if (n < 1024) return `${n} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}

function formatAge(iso: string | null): string {
  if (!iso) return "never"
  const ms = Date.now() - new Date(iso).getTime()
  const h = ms / 3_600_000
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m ago`
  if (h < 48) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "success" ? "badge-success" : status === "failed" ? "badge-danger" : "badge-warn"
  return <span className={cls}>{status}</span>
}

function VerifyBadge({ v }: { v: string | null }) {
  if (!v) return <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
  const cls = v === "ok" ? "badge-success" : "badge-danger"
  return <span className={cls}>{v}</span>
}

const HERO_COLORS: Record<string, { bg: string; border: string; fg: string; label: string }> = {
  green: { bg: "rgba(0,212,170,0.10)", border: "var(--accent2)", fg: "var(--accent2)", label: "Protected" },
  amber: { bg: "rgba(255,179,71,0.12)", border: "var(--warn)", fg: "var(--warn)", label: "Backup is late" },
  red: { bg: "rgba(255,77,109,0.10)", border: "var(--danger)", fg: "var(--danger)", label: "Attention needed" },
}

export default function PlatformBackupsPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Schedule | null>(null)
  const [s3Secret, setS3Secret] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/backups")
      if (res.status === 401 || res.status === 403) {
        setError("You must be signed in as an ADMIN to manage platform backups.")
        setData(null)
        return
      }
      if (!res.ok) { setError(`Failed to load (HTTP ${res.status})`); return }
      const json = (await res.json()) as ApiResponse
      setData(json)
      setForm(json.schedule)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const hero = useMemo(() => {
    if (!data) return null
    const runs = data.runs
    const lastSuccess = runs.find((r) => r.status === "success") ?? null
    const lastRun = runs[0] ?? null
    const intervalH = data.schedule.frequency === "weekly" ? 168 : 24
    let color: "green" | "amber" | "red" = "green"
    if (!data.keyConfigured) color = "red"
    else if (!lastSuccess) color = "red"
    else {
      const ageH = (Date.now() - new Date(lastSuccess.startedAt).getTime()) / 3_600_000
      const lastFailed = lastRun && lastRun.status === "failed"
      if (lastFailed || ageH > intervalH * 2) color = "red"
      else if (ageH > intervalH) color = "amber"
      else color = "green"
    }
    return { color, lastSuccess, lastRun }
  }, [data])

  async function runNow() {
    setBusy("run")
    try {
      const res = await fetch("/api/admin/backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || `Failed (HTTP ${res.status})`) }
      await load()
    } finally { setBusy(null) }
  }

  async function verify(id: string) {
    setBusy(`verify:${id}`)
    try {
      await fetch(`/api/admin/backups/${id}/verify`, { method: "POST" })
      await load()
    } finally { setBusy(null) }
  }

  async function saveSchedule() {
    if (!form) return
    setBusy("save")
    try {
      const payload: Record<string, unknown> = { ...form }
      if (s3Secret) payload.s3SecretKey = s3Secret
      const res = await fetch("/api/admin/backups/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || `Failed (HTTP ${res.status})`); return }
      setEditing(false)
      setS3Secret("")
      await load()
    } finally { setBusy(null) }
  }

  const runCols: DataColumn<Run>[] = [
    { key: "startedAt", label: "Started", primary: true, render: (r) => (
      <span>{new Date(r.startedAt).toLocaleString()}</span>
    ) },
    { key: "kind", label: "Kind", render: (r) => <span className="badge-warn">{r.kind}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "scope", label: "Scope", render: (r) => <span style={{ fontSize: 12 }}>{r.scope}{r.secretsMode === "decrypted" ? " · decrypted" : ""}</span> },
    { key: "sizeBytes", label: "Size", mono: true, render: (r) => <span>{formatBytes(r.sizeBytes)}</span> },
    { key: "verifyStatus", label: "Verify", render: (r) => <VerifyBadge v={r.verifyStatus} /> },
    { key: "actions", label: "Actions", render: (r) => (
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {r.hasFile && (
          <a className="btn btn-secondary btn-sm" href={`/api/admin/backups/${r.id}/download`}>Download</a>
        )}
        {r.hasFile && (
          <button className="btn btn-secondary btn-sm" disabled={busy === `verify:${r.id}`} onClick={() => verify(r.id)}>
            {busy === `verify:${r.id}` ? "Verifying…" : "Verify"}
          </button>
        )}
      </span>
    ) },
  ]

  return (
    <AppShell>
      <div style={{ padding: "var(--space-6, 24px)", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Platform Backup &amp; DR</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>
              Full-fidelity encrypted self-backup of the entire DocHub dataset. Distinct from clients&rsquo; backups.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" disabled={busy === "run"} onClick={runNow}>
              {busy === "run" ? "Backing up…" : "Run backup now"}
            </button>
            <button className="btn btn-secondary" onClick={() => { setForm(data?.schedule ?? null); setEditing(true) }}>Edit schedule</button>
          </div>
        </div>

        {error && (
          <div className="state-box" style={{ border: "1px solid var(--danger)", color: "var(--danger)", padding: 16, borderRadius: 8, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="state-box"><div className="spinner" /><span>Loading…</span></div>
        ) : data ? (
          <>
            {/* ── Health hero ── */}
            {hero && (
              <div
                style={{
                  border: `1px solid ${HERO_COLORS[hero.color].border}`,
                  background: HERO_COLORS[hero.color].bg,
                  borderRadius: 12,
                  padding: "20px 24px",
                  marginBottom: 24,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: HERO_COLORS[hero.color].fg }}>
                    {HERO_COLORS[hero.color].label}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {data.schedule.enabled
                      ? `Scheduled ${data.schedule.frequency} @ ${String(data.schedule.hourUtc).padStart(2, "0")}:00 UTC`
                      : "Scheduling disabled"}
                    {data.schedule.nextRunAt && data.schedule.enabled ? ` · next ${new Date(data.schedule.nextRunAt).toLocaleString()}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 14 }}>
                  <Stat label="Last successful" value={formatAge(hero.lastSuccess?.startedAt ?? null)} />
                  <Stat label="Size" value={formatBytes(hero.lastSuccess?.sizeBytes ?? null)} />
                  <Stat label="Secrets" value={hero.lastSuccess?.secretsMode ?? "—"} />
                  <Stat label="Verified" value={hero.lastSuccess?.verifyStatus ?? "not verified"} />
                  <Stat label="Retention" value={`${data.schedule.retentionCount} keep${data.schedule.maxAgeDays ? ` · ${data.schedule.maxAgeDays}d max` : ""}`} />
                </div>
                {!data.keyConfigured && (
                  <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>
                    BACKUP_ENCRYPTION_KEY is not set — no backup can run until it is configured.
                  </div>
                )}
                {hero.lastRun?.status === "failed" && hero.lastRun.error && (
                  <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 13 }}>Last run failed: {hero.lastRun.error}</div>
                )}
              </div>
            )}

            {/* ── Run history ── */}
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px" }}>Run history</h2>
            <DataCards columns={runCols} rows={data.runs} rowKey={(r) => r.id} />

            {/* ── Restore hint ── */}
            <div className="state-box" style={{ marginTop: 24, alignItems: "flex-start", textAlign: "left", padding: 16 }}>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>Restore is a CLI-only operation</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Download the encrypted <code>.dhb</code> artifact, then run <code>scripts/restore-backup.sh</code> on the host to
                decrypt with BACKUP_ENCRYPTION_KEY, gunzip, and load the NDJSON into an EMPTY database. There is deliberately no
                restore button — it would clobber live data. Local <code>/backups</code> beside the DB volume is a single point of
                failure; rsync it offsite or target S3/MinIO for real DR.
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Schedule editor (bottom sheet on mobile, modal on desktop) ── */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Backup schedule"
        footer={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancel</button>
            <button className="btn btn-primary" disabled={busy === "save"} onClick={saveSchedule} style={{ flex: 1 }}>
              {busy === "save" ? "Saving…" : "Save schedule"}
            </button>
          </div>
        }
      >
        {form && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              Enable scheduled backups
            </label>

            <Row label="Frequency">
              <select className="filter-input" style={{ width: "100%" }} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </Row>

            <Row label="Hour (UTC)">
              <input className="filter-input" style={{ width: "100%" }} type="number" min={0} max={23} value={form.hourUtc}
                onChange={(e) => setForm({ ...form, hourUtc: Number(e.target.value) })} />
            </Row>

            {form.frequency === "weekly" && (
              <Row label="Weekday">
                <select className="filter-input" style={{ width: "100%" }} value={form.weekday ?? 0} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </Row>
            )}

            <Row label="Retention (keep N)">
              <input className="filter-input" style={{ width: "100%" }} type="number" min={1} max={3650} value={form.retentionCount}
                onChange={(e) => setForm({ ...form, retentionCount: Number(e.target.value) })} />
            </Row>

            <Row label="Max age (days, optional)">
              <input className="filter-input" style={{ width: "100%" }} type="number" min={1} max={3650} value={form.maxAgeDays ?? ""}
                placeholder="none"
                onChange={(e) => setForm({ ...form, maxAgeDays: e.target.value === "" ? null : Number(e.target.value) })} />
            </Row>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked={form.includeUploads} onChange={(e) => setForm({ ...form, includeUploads: e.target.checked })} />
              Bundle uploaded files into the backup
            </label>

            <Row label="Secrets">
              <select className="filter-input" style={{ width: "100%" }} value={form.secretsMode} onChange={(e) => setForm({ ...form, secretsMode: e.target.value })}>
                <option value="ciphertext">Keep encrypted (safest)</option>
                <option value="decrypted">Decrypt into bundle (migration-out)</option>
              </select>
            </Row>
            {form.secretsMode === "decrypted" && (
              <div className="state-box" style={{ padding: 12, border: "1px solid var(--warn)", color: "var(--warn)", fontSize: 12, textAlign: "left", alignItems: "flex-start" }}>
                &ldquo;Decrypt&rdquo; writes plaintext client passwords into the bundle. It stays AES-256-GCM encrypted at rest under
                BACKUP_ENCRYPTION_KEY, but treat the file as crown-jewels.
              </div>
            )}

            <Row label="Target">
              <select className="filter-input" style={{ width: "100%" }} value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                <option value="local">Local volume</option>
                <option value="s3">S3 / MinIO</option>
              </select>
            </Row>

            {form.target === "s3" && (
              <>
                <Row label="S3 bucket"><input className="filter-input" style={{ width: "100%" }} value={form.s3Bucket ?? ""} onChange={(e) => setForm({ ...form, s3Bucket: e.target.value })} /></Row>
                <Row label="S3 prefix"><input className="filter-input" style={{ width: "100%" }} value={form.s3Prefix ?? ""} onChange={(e) => setForm({ ...form, s3Prefix: e.target.value })} /></Row>
                <Row label="S3 endpoint"><input className="filter-input" style={{ width: "100%" }} placeholder="MinIO endpoint" value={form.s3Endpoint ?? ""} onChange={(e) => setForm({ ...form, s3Endpoint: e.target.value })} /></Row>
                <Row label="S3 access key"><input className="filter-input" style={{ width: "100%" }} value={form.s3AccessKey ?? ""} onChange={(e) => setForm({ ...form, s3AccessKey: e.target.value })} /></Row>
                <Row label={`S3 secret key${form.s3SecretKeySet ? " (set)" : ""}`}>
                  <input className="filter-input" style={{ width: "100%" }} type="password" value={s3Secret}
                    placeholder={form.s3SecretKeySet ? "•••••• (unchanged)" : ""}
                    onChange={(e) => setS3Secret(e.target.value)} />
                </Row>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>S3/MinIO upload is a documented later config flip; local target ships today.</div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </AppShell>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{value}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{label}</span>
      {children}
    </label>
  )
}
