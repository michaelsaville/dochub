"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { marked } from "marked"

type StepCompletion = {
  id: string
  stepId: string
  completed: boolean
  notes: string | null
  completedAt: string | null
  step: { id: string; order: number; title: string; notes: string | null }
}

type ActiveRun = {
  id: string
  clientId: string
  startedBy: string | null
  startedAt: string
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
  notes: string | null
  client: { id: string; name: string }
  steps: StepCompletion[]
}

type PastRun = {
  id: string
  startedAt: string
  completedAt: string | null
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED"
  startedBy: string | null
  client: { id: string; name: string }
  steps: { completed: boolean }[]
}

export default function RunbookViewPage() {
  const { id } = useParams()
  const router = useRouter()
  const [runbook, setRunbook] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Ephemeral checklist (no active run)
  const [checked, setChecked] = useState<Record<number, boolean>>({})

  // Run state
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [showStartRun, setShowStartRun] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState("")
  const [startingRun, setStartingRun] = useState(false)
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)
  const [stepNotes, setStepNotes] = useState<Record<string, string>>({})
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})
  const [savingStep, setSavingStep] = useState<string | null>(null)
  const [runNotes, setRunNotes] = useState("")
  const [finishingRun, setFinishingRun] = useState(false)
  const [pastRuns, setPastRuns] = useState<PastRun[]>([])
  const [showPastRuns, setShowPastRuns] = useState(false)
  const [loadingRuns, setLoadingRuns] = useState(false)

  useEffect(() => {
    fetch(`/api/runbooks/${id}`)
      .then(r => r.json())
      .then(data => {
        setRunbook(data)
        if (data.clientId) setSelectedClientId(data.clientId)
      })
      .finally(() => setLoading(false))
    fetch("/api/clients").then(r => r.json()).then((cs: any[]) =>
      setClients(cs.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)))
    ).catch(() => {})
  }, [id])

  const completedStepIds = new Set(activeRun?.steps.filter(s => s.completed).map(s => s.stepId) ?? [])
  const totalSteps = runbook?.steps?.length ?? 0
  const completedCount = activeRun ? completedStepIds.size : Object.values(checked).filter(Boolean).length
  const allDone = totalSteps > 0 && completedCount === totalSteps

  async function startRun() {
    if (!selectedClientId) return
    setStartingRun(true)
    try {
      const res = await fetch(`/api/runbooks/${id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClientId }),
      })
      if (res.ok) {
        const run = await res.json()
        setActiveRun(run)
        setShowStartRun(false)
        setStepNotes({})
        setExpandedNotes({})
        setRunNotes("")
      }
    } finally { setStartingRun(false) }
  }

  async function toggleStep(completion: StepCompletion) {
    if (!activeRun) return
    setSavingStep(completion.stepId)
    try {
      const next = !completion.completed
      const res = await fetch(`/api/runbook-runs/${activeRun.id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: completion.stepId, completed: next, notes: stepNotes[completion.stepId] ?? completion.notes }),
      })
      if (res.ok) {
        setActiveRun(r => r ? {
          ...r,
          steps: r.steps.map(s => s.stepId === completion.stepId ? { ...s, completed: next } : s),
        } : r)
      }
    } finally { setSavingStep(null) }
  }

  async function saveStepNotes(completion: StepCompletion) {
    if (!activeRun) return
    const notes = stepNotes[completion.stepId] ?? completion.notes ?? ""
    await fetch(`/api/runbook-runs/${activeRun.id}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId: completion.stepId, completed: completion.completed, notes }),
    })
    setActiveRun(r => r ? {
      ...r,
      steps: r.steps.map(s => s.stepId === completion.stepId ? { ...s, notes } : s),
    } : r)
  }

  async function finishRun(status: "COMPLETED" | "ABANDONED") {
    if (!activeRun) return
    setFinishingRun(true)
    try {
      const res = await fetch(`/api/runbook-runs/${activeRun.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: runNotes || null }),
      })
      if (res.ok) {
        setActiveRun(null)
        setChecked({})
        if (showPastRuns) loadPastRuns()
      }
    } finally { setFinishingRun(false) }
  }

  async function loadPastRuns() {
    setLoadingRuns(true)
    try {
      const res = await fetch(`/api/runbooks/${id}/runs`)
      if (res.ok) setPastRuns(await res.json())
    } finally { setLoadingRuns(false) }
  }

  const inp = { width: "100%", padding: "6px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }

  if (loading) return <AppShell><div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div></AppShell>
  if (!runbook || runbook.error) return <AppShell><div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>SOP not found.</div></AppShell>

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "820px" }}>

        {/* Back + actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <button onClick={() => router.back()} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
          <div style={{ display: "flex", gap: "8px" }}>
            {!activeRun && totalSteps > 0 && (
              <button
                onClick={() => setShowStartRun(s => !s)}
                style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "7px", border: "none", background: showStartRun ? "var(--color-background-secondary)" : "var(--accent)", color: showStartRun ? "var(--color-text-primary)" : "#fff", cursor: "pointer" }}
              >
                {showStartRun ? "Cancel" : "Start Run"}
              </button>
            )}
            <button onClick={() => router.push(`/runbooks/${id}/edit`)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Edit</button>
          </div>
        </div>

        {/* Start run panel */}
        {showStartRun && !activeRun && (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "16px 20px", marginBottom: "20px" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px" }}>Start a run</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {runbook.clientId ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  Running for: <strong>{runbook.client?.name}</strong>
                </div>
              ) : (
                <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} style={{ ...inp, flex: 1 }}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button
                onClick={startRun}
                disabled={startingRun || !selectedClientId}
                style={{ fontSize: "13px", fontWeight: 500, padding: "7px 16px", borderRadius: "7px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", flexShrink: 0, opacity: !selectedClientId ? 0.5 : 1 }}
              >
                {startingRun ? "Starting..." : "Start"}
              </button>
            </div>
          </div>
        )}

        {/* Active run banner */}
        {activeRun && (
          <div style={{ background: "rgba(59,130,246,0.08)", border: "0.5px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "14px 20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                  Active run — {activeRun.client.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                  Started {new Date(activeRun.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {activeRun.startedBy ? ` by ${activeRun.startedBy}` : ""}
                  {" · "}{completedCount}/{totalSteps} steps complete
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button
                  onClick={() => finishRun("COMPLETED")}
                  disabled={finishingRun}
                  style={{ fontSize: "12px", fontWeight: 500, padding: "5px 12px", borderRadius: "6px", border: "none", background: "#22c55e", color: "#fff", cursor: "pointer" }}
                >
                  Complete
                </button>
                <button
                  onClick={() => { if (confirm("Abandon this run?")) finishRun("ABANDONED") }}
                  disabled={finishingRun}
                  style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}
                >
                  Abandon
                </button>
              </div>
            </div>
            <div style={{ marginTop: "10px" }}>
              <input
                value={runNotes}
                onChange={e => setRunNotes(e.target.value)}
                placeholder="Run notes (optional)..."
                style={{ ...inp, fontSize: "12px" }}
              />
            </div>
          </div>
        )}

        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "8px" }}>
            {runbook.category && (
              <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: runbook.category.color + "22", color: runbook.category.color, fontWeight: 500, border: `1px solid ${runbook.category.color}44` }}>
                {runbook.category.name}
              </span>
            )}
            {!runbook.clientId && <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>Global</span>}
            {runbook.client && (
              <button onClick={() => router.push(`/clients/${runbook.client.id}`)} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "#3b82f622", color: "#3b82f6", border: "none", cursor: "pointer" }}>
                {runbook.client.name} ↗
              </button>
            )}
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 8px 0" }}>{runbook.title}</h1>
          {runbook.summary && <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", margin: "0 0 12px 0" }}>{runbook.summary}</p>}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {runbook.tags.map((t: any) => (
              <span key={t.tagId} style={{ fontSize: "12px", color: "var(--color-text-muted)", background: "var(--color-background-hover)", padding: "2px 8px", borderRadius: "5px" }}>#{t.tag.name}</span>
            ))}
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Updated {new Date(runbook.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", marginBottom: "28px" }} />

        {/* Checklist / Run steps */}
        {totalSteps > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {activeRun ? "Steps" : "Checklist"}
                </span>
                <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginLeft: "10px" }}>
                  {completedCount}/{totalSteps} complete
                </span>
              </div>
              {!activeRun && completedCount > 0 && (
                <button onClick={() => setChecked({})} style={{ fontSize: "12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reset</button>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: "4px", background: "var(--color-background-hover)", borderRadius: "2px", marginBottom: "16px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${totalSteps ? (completedCount / totalSteps) * 100 : 0}%`, background: allDone ? "#22c55e" : "#3b82f6", borderRadius: "2px", transition: "width 0.3s ease" }} />
            </div>

            {allDone && !activeRun && (
              <div style={{ padding: "12px 16px", background: "#22c55e22", border: "1px solid #22c55e44", borderRadius: "8px", fontSize: "14px", color: "#22c55e", fontWeight: 500, marginBottom: "16px" }}>
                All steps complete ✓
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {activeRun ? (
                // DB-backed run steps
                activeRun.steps.map(completion => {
                  const done = completion.completed
                  const isSaving = savingStep === completion.stepId
                  const notesExpanded = expandedNotes[completion.stepId]
                  const localNotes = stepNotes[completion.stepId] ?? completion.notes ?? ""
                  return (
                    <div key={completion.stepId} style={{ borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)", background: done ? "var(--color-background-secondary)" : "var(--color-background-primary)", overflow: "hidden" }}>
                      <div
                        style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", cursor: isSaving ? "wait" : "pointer" }}
                        onClick={() => !isSaving && toggleStep(completion)}
                      >
                        <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${done ? "#22c55e" : "var(--color-border-secondary)"}`, background: done ? "#22c55e" : "transparent", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                          {done && <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: done ? "var(--color-text-muted)" : "var(--color-text-primary)", textDecoration: done ? "line-through" : "none" }}>
                            <span style={{ color: "var(--color-text-muted)", marginRight: "6px", fontSize: "12px" }}>{completion.step.order}.</span>
                            {completion.step.title}
                          </div>
                          {completion.step.notes && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "3px" }}>{completion.step.notes}</div>}
                          {completion.notes && !notesExpanded && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px", fontStyle: "italic" }}>Note: {completion.notes}</div>}
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); setExpandedNotes(n => ({ ...n, [completion.stepId]: !n[completion.stepId] })) }}
                          style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", flexShrink: 0 }}
                        >
                          {notesExpanded ? "▲" : "Note"}
                        </button>
                      </div>
                      {notesExpanded && (
                        <div style={{ padding: "0 14px 12px", display: "flex", gap: "8px" }} onClick={e => e.stopPropagation()}>
                          <input
                            value={localNotes}
                            onChange={e => setStepNotes(n => ({ ...n, [completion.stepId]: e.target.value }))}
                            placeholder="Add a note for this step..."
                            style={{ ...inp, flex: 1, fontSize: "12px" }}
                            onKeyDown={e => e.key === "Enter" && saveStepNotes(completion)}
                          />
                          <button
                            onClick={() => saveStepNotes(completion)}
                            style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }}
                          >
                            Save
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                // Ephemeral checklist
                runbook.steps.map((step: any, i: number) => (
                  <div key={step.id} onClick={() => setChecked(c => ({ ...c, [i]: !c[i] }))}
                    style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)", background: checked[i] ? "var(--color-background-secondary)" : "var(--color-background-primary)", cursor: "pointer", transition: "background 0.15s" }}
                  >
                    <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${checked[i] ? "#22c55e" : "var(--color-border-secondary)"}`, background: checked[i] ? "#22c55e" : "transparent", flexShrink: 0, marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                      {checked[i] && <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 500, color: checked[i] ? "var(--color-text-muted)" : "var(--color-text-primary)", textDecoration: checked[i] ? "line-through" : "none" }}>
                        <span style={{ color: "var(--color-text-muted)", marginRight: "6px", fontSize: "12px" }}>{i + 1}.</span>{step.title}
                      </div>
                      {step.notes && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "3px" }}>{step.notes}</div>}
                    </div>
                  </div>
                ))
              )}
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
            <div className="markdown-body" style={{ fontSize: "14px", lineHeight: 1.75, color: "var(--color-text-primary)" }}
              dangerouslySetInnerHTML={{ __html: marked(runbook.content) as string }} />
          </div>
        )}

        {!runbook.content && totalSteps === 0 && (
          <div style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>This SOP has no content yet. <button onClick={() => router.push(`/runbooks/${id}/edit`)} style={{ color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: "14px", padding: 0 }}>Add some →</button></div>
        )}

        {/* Past runs */}
        {totalSteps > 0 && (
          <div style={{ marginTop: "36px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "20px" }}>
            <button
              onClick={() => { setShowPastRuns(s => !s); if (!showPastRuns) loadPastRuns() }}
              style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span style={{ fontWeight: 500 }}>Run history</span>
              <span style={{ fontSize: "11px" }}>{showPastRuns ? "▲" : "▼"}</span>
            </button>

            {showPastRuns && (
              <div style={{ marginTop: "12px" }}>
                {loadingRuns ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading...</div>
                ) : pastRuns.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No runs recorded yet.</div>
                ) : pastRuns.map(run => {
                  const done = run.steps.filter(s => s.completed).length
                  const total = run.steps.length
                  const statusColor = run.status === "COMPLETED" ? "#22c55e" : run.status === "ABANDONED" ? "#ef4444" : "#3b82f6"
                  const statusLabel = run.status === "COMPLETED" ? "Completed" : run.status === "ABANDONED" ? "Abandoned" : "In progress"
                  return (
                    <div key={run.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "10px 14px", marginBottom: "4px", background: "var(--color-background-secondary)", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "10px", background: statusColor + "22", color: statusColor, flexShrink: 0 }}>{statusLabel}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500 }}>{run.client.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>
                          {new Date(run.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {run.startedBy ? ` · ${run.startedBy}` : ""}
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>{done}/{total} steps</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
