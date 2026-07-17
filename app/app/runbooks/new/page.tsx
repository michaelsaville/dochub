"use client"

import AppShell from "@/components/AppShell"
import RunbookEditor from "@/components/RunbookEditor"
import TemplatePicker from "@/components/TemplatePicker"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

type Mode = "choose" | "blank" | "template"

function NewRunbookInner() {
  const params = useSearchParams()
  const clientId = params.get("clientId") ?? undefined
  const [mode, setMode] = useState<Mode>("choose")

  if (mode === "blank") return <RunbookEditor clientId={clientId} />

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px", maxWidth: 720 }}>
        <button onClick={() => setMode("blank")} style={choiceCard}>
          <div style={{ fontSize: 22 }}>📝</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Start blank</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Write a new SOP from scratch.</div>
        </button>
        <button onClick={() => setMode("template")} style={choiceCard}>
          <div style={{ fontSize: 22 }}>🧩</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>From a template</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Pick a starter SOP from the library.</div>
        </button>
        <button onClick={() => setMode("blank")} style={choiceCard}>
          <div style={{ fontSize: 22 }}>✨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Draft with AI</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Open the editor, then click “Draft with AI”.</div>
        </button>
      </div>

      {mode === "template" && (
        <TemplatePicker kind="RUNBOOK" clientId={clientId} onClose={() => setMode("choose")} />
      )}
    </>
  )
}

const choiceCard: React.CSSProperties = {
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "18px 20px",
  background: "var(--surface)",
  cursor: "pointer",
  minHeight: 44,
}

export default function NewRunbookPage() {
  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--text)", marginBottom: "24px" }}>New SOP</div>
        <Suspense fallback={null}>
          <NewRunbookInner />
        </Suspense>
      </div>
    </AppShell>
  )
}
