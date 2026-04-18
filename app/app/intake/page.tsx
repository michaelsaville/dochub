"use client"

import AppShell from "@/components/AppShell"
import AIIntakeDropzone from "@/components/AIIntakeDropzone"

export default function IntakePage() {
  return (
    <AppShell>
      <div style={{ padding: "24px 28px", maxWidth: 980 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, margin: 0, marginBottom: 4 }}>AI Intake</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            Drop files or type notes — Claude figures out which client and asset they belong to and creates the documentation.
          </div>
        </div>
        <AIIntakeDropzone />
      </div>
    </AppShell>
  )
}
