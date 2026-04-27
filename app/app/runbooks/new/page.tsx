"use client"

// /clients, /runbooks/new, and /reports/custom/builder all use useSearchParams()
// in a client component. Without this, Next.js tries to statically prerender
// the JSX skeleton and bombs with: "useSearchParams() should be wrapped in
// a suspense boundary". These are auth-gated user pages — there is no value
// in static generation, so opt out wholesale.
export const dynamic = "force-dynamic"

import AppShell from "@/components/AppShell"
import RunbookEditor from "@/components/RunbookEditor"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function NewRunbookInner() {
  const params = useSearchParams()
  const clientId = params.get("clientId") ?? undefined
  return <RunbookEditor clientId={clientId} />
}

export default function NewRunbookPage() {
  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "24px" }}>New SOP</div>
        <Suspense fallback={null}>
          <NewRunbookInner />
        </Suspense>
      </div>
    </AppShell>
  )
}
