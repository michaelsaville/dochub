"use client"

import AppShell from "@/components/AppShell"
import RunbookEditor from "@/components/RunbookEditor"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

export default function EditRunbookPage() {
  const { id } = useParams()
  const [runbook, setRunbook] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/runbooks/${id}`)
      .then(r => r.json())
      .then(data => setRunbook(data))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "24px" }}>Edit SOP</div>
        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
        ) : runbook ? (
          <RunbookEditor initial={runbook} />
        ) : (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>SOP not found.</div>
        )}
      </div>
    </AppShell>
  )
}
