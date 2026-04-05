"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { marked } from "marked"

export default function RunbookViewPage() {
  const { id } = useParams()
  const router = useRouter()
  const [runbook, setRunbook] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [allDone, setAllDone] = useState(false)

  useEffect(() => {
    fetch(`/api/runbooks/${id}`)
      .then(r => r.json())
      .then(data => setRunbook(data))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!runbook?.steps?.length) return
    setAllDone(runbook.steps.every((_: any, i: number) => checked[i]))
  }, [checked, runbook])

  function toggleStep(i: number) {
    setChecked(c => ({ ...c, [i]: !c[i] }))
  }

  function resetChecklist() {
    setChecked({})
  }

  if (loading) return <AppShell><div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div></AppShell>
  if (!runbook || runbook.error) return <AppShell><div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>SOP not found.</div></AppShell>

  const completedCount = Object.values(checked).filter(Boolean).length
  const totalSteps = runbook.steps.length

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "820px" }}>
        {/* Back + actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <button onClick={() => router.back()} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={() => router.push(`/runbooks/${id}/edit`)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Edit</button>
          </div>
        </div>

        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            {runbook.category && (
              <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: runbook.category.color + "22", color: runbook.category.color, fontWeight: 500, border: `1px solid ${runbook.category.color}44` }}>
                {runbook.category.name}
              </span>
            )}
            {!runbook.clientId && (
              <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>Global</span>
            )}
            {runbook.client && (
              <button onClick={() => router.push(`/clients/${runbook.client.id}`)} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "#3b82f622", color: "#3b82f6", border: "none", cursor: "pointer" }}>
                {runbook.client.name} ↗
              </button>
            )}
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 8px 0" }}>{runbook.title}</h1>
          {runbook.summary && (
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: "0 0 12px 0" }}>{runbook.summary}</p>
          )}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {runbook.tags.map((t: any) => (
              <span key={t.tagId} style={{ fontSize: "12px", color: "var(--color-text-muted)", background: "var(--color-background-hover)", padding: "2px 8px", borderRadius: "5px" }}>#{t.tag.name}</span>
            ))}
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Updated {new Date(runbook.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", marginBottom: "28px" }} />

        {/* Checklist steps */}
        {totalSteps > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>Checklist</span>
                <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginLeft: "10px" }}>
                  {completedCount}/{totalSteps} complete
                </span>
              </div>
              {completedCount > 0 && (
                <button onClick={resetChecklist} style={{ fontSize: "12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reset</button>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: "4px", background: "var(--color-background-hover)", borderRadius: "2px", marginBottom: "16px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${totalSteps ? (completedCount / totalSteps) * 100 : 0}%`, background: allDone ? "#22c55e" : "#3b82f6", borderRadius: "2px", transition: "width 0.3s ease" }} />
            </div>

            {allDone && (
              <div style={{ padding: "12px 16px", background: "#22c55e22", border: "1px solid #22c55e44", borderRadius: "8px", fontSize: "14px", color: "#22c55e", fontWeight: 500, marginBottom: "16px" }}>
                All steps complete ✓
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {runbook.steps.map((step: any, i: number) => (
                <div
                  key={step.id}
                  onClick={() => toggleStep(i)}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)", background: checked[i] ? "var(--color-background-secondary)" : "var(--color-background-primary)", cursor: "pointer", transition: "background 0.15s" }}
                >
                  <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${checked[i] ? "#22c55e" : "var(--color-border-secondary)"}`, background: checked[i] ? "#22c55e" : "transparent", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                    {checked[i] && <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: checked[i] ? "var(--color-text-muted)" : "var(--color-text-primary)", textDecoration: checked[i] ? "line-through" : "none" }}>
                      <span style={{ color: "var(--color-text-muted)", marginRight: "6px", fontSize: "12px" }}>{i + 1}.</span>
                      {step.title}
                    </div>
                    {step.notes && (
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "3px" }}>{step.notes}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Markdown content */}
        {runbook.content && (
          <div>
            {totalSteps > 0 && (
              <>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "16px" }}>Procedure</div>
                <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", marginBottom: "20px" }} />
              </>
            )}
            <div
              className="markdown-body"
              style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--color-text-primary)" }}
              dangerouslySetInnerHTML={{ __html: marked(runbook.content) as string }}
            />
          </div>
        )}

        {!runbook.content && totalSteps === 0 && (
          <div style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>This SOP has no content yet. <button onClick={() => router.push(`/runbooks/${id}/edit`)} style={{ color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: "14px", padding: 0 }}>Add some →</button></div>
        )}
      </div>
    </AppShell>
  )
}
