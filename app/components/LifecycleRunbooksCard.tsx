"use client"

import { useEffect, useState } from "react"

type RunbookOption = { id: string; title: string; clientId: string | null }

interface Props {
  clientId: string
  initial: {
    onboardingRunbookId: string | null
    offboardingRunbookId: string | null
    newClientRunbookId: string | null
  }
}

/**
 * Picker trio for client lifecycle automation. Saves on select. Lists
 * global runbooks (clientId=null) + this client's own runbooks. The
 * server-side hooks fire fire-and-forget on Person create/update + Client
 * create — see lib/runbook-triggers.ts.
 */
export default function LifecycleRunbooksCard({ clientId, initial }: Props) {
  const [runbooks, setRunbooks] = useState<RunbookOption[]>([])
  const [onboarding,  setOnboarding]  = useState(initial.onboardingRunbookId  ?? "")
  const [offboarding, setOffboarding] = useState(initial.offboardingRunbookId ?? "")
  const [newClient,   setNewClient]   = useState(initial.newClientRunbookId   ?? "")
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/runbooks")
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        // Keep only globals + this client's runbooks.
        setRunbooks(
          rows
            .filter(r => r.clientId === null || r.clientId === clientId)
            .map(r => ({ id: r.id, title: r.title, clientId: r.clientId })),
        )
      })
      .catch(() => {})
  }, [clientId])

  async function save(field: string, value: string) {
    setSavingKey(field)
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value || null }),
      })
    } finally {
      setSavingKey(null)
    }
  }

  const sel: React.CSSProperties = {
    width: "100%", padding: "6px 10px", fontSize: 13,
    border: "0.5px solid var(--color-border-secondary)", borderRadius: 6,
    background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  }

  const Field = ({ label, value, onChange, fieldName }: { label: string; value: string; onChange: (v: string) => void; fieldName: string }) => (
    <div>
      <label style={{ fontSize: 11, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
        {label} {savingKey === fieldName && <span style={{ color: "var(--color-text-muted)" }}>· saving...</span>}
      </label>
      <select
        value={value}
        onChange={(e) => { onChange(e.target.value); save(fieldName, e.target.value) }}
        style={sel}
      >
        <option value="">— None —</option>
        {runbooks.map(r => (
          <option key={r.id} value={r.id}>
            {r.title}{r.clientId ? "" : " (global)"}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 10, padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Lifecycle automation</div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 12 }}>
        Auto-spawn a runbook when a person is added/deactivated or this client is created. Leave blank for none.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <Field label="On new contact / person activation"  value={onboarding}  onChange={setOnboarding}  fieldName="onboardingRunbookId" />
        <Field label="On contact deactivation"             value={offboarding} onChange={setOffboarding} fieldName="offboardingRunbookId" />
        <Field label="On client creation (one-time)"        value={newClient}   onChange={setNewClient}   fieldName="newClientRunbookId" />
      </div>
    </div>
  )
}
