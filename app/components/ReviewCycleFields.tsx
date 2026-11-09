"use client"

import { useEffect, useState } from "react"

/**
 * Review-cycle inputs shared by the document editor (MergedDocumentsPanel) and
 * the SOP editor (RunbookEditor): "Review every N days" + an owner. Controlled;
 * the parent sends `reviewIntervalDays` (number | null) and `ownerId`
 * (string | null) with its normal save. The server stamps reviewDueAt.
 */

export const REVIEW_INTERVALS: { label: string; days: number | null }[] = [
  { label: "No review cycle", days: null },
  { label: "Every 30 days", days: 30 },
  { label: "Every 90 days", days: 90 },
  { label: "Every 6 months", days: 180 },
  { label: "Every year", days: 365 },
]

type Staff = { id: string; name: string | null; email: string }

let staffCache: Promise<Staff[]> | null = null
function loadStaff(): Promise<Staff[]> {
  if (!staffCache) {
    staffCache = fetch("/api/staff")
      .then(r => (r.ok ? r.json() : []))
      .then((rows: any[]) => rows.map(r => ({ id: r.id, name: r.name ?? null, email: r.email })))
      .catch(() => {
        staffCache = null
        return []
      })
  }
  return staffCache
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "14px", minHeight: "36px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

export function reviewDueText(dueAt: string | null | undefined): { text: string; overdue: boolean } | null {
  if (!dueAt) return null
  const ms = new Date(dueAt).getTime() - Date.now()
  const days = Math.round(ms / 86_400_000)
  if (ms < 0) return { text: `Review overdue ${Math.max(1, -days)}d`, overdue: true }
  return { text: days <= 1 ? "Review due tomorrow" : `Review due in ${days}d`, overdue: false }
}

export default function ReviewCycleFields({
  intervalDays,
  ownerId,
  dueAt,
  onChange,
  idPrefix,
}: {
  intervalDays: number | null
  ownerId: string | null
  dueAt?: string | null
  onChange: (next: { reviewIntervalDays: number | null; ownerId: string | null }) => void
  idPrefix: string
}) {
  const [staff, setStaff] = useState<Staff[]>([])
  useEffect(() => {
    let live = true
    loadStaff().then(s => { if (live) setStaff(s) })
    return () => { live = false }
  }, [])

  const known = REVIEW_INTERVALS.some(o => o.days === intervalDays)
  const due = reviewDueText(dueAt)

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-review`} style={lbl}>Review cycle</label>
        <select
          id={`${idPrefix}-review`}
          value={intervalDays ?? ""}
          onChange={e => onChange({ reviewIntervalDays: e.target.value ? parseInt(e.target.value, 10) : null, ownerId })}
          style={inp}
        >
          {REVIEW_INTERVALS.map(o => (
            <option key={o.label} value={o.days ?? ""}>{o.label}</option>
          ))}
          {!known && intervalDays != null && <option value={intervalDays}>Every {intervalDays} days</option>}
        </select>
        {due && (
          <div style={{ fontSize: "11px", marginTop: "4px", color: due.overdue ? "var(--color-text-warning)" : "var(--color-text-muted)" }}>
            {due.text} · saving restarts the clock
          </div>
        )}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-owner`} style={lbl}>Owner</label>
        <select
          id={`${idPrefix}-owner`}
          value={ownerId ?? ""}
          onChange={e => onChange({ reviewIntervalDays: intervalDays, ownerId: e.target.value || null })}
          style={inp}
        >
          <option value="">(No owner)</option>
          {staff.map(s => (
            <option key={s.id} value={s.id}>{s.name || s.email}</option>
          ))}
        </select>
      </div>
    </>
  )
}
