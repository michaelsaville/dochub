"use client"

import { useEffect, useState } from "react"
import { initSyncQueue, subscribeSyncState, flushQueue, type SyncState } from "@/lib/sync-queue"

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState>({ online: true, queueSize: 0, syncing: false })

  useEffect(() => {
    initSyncQueue()
    const unsub = subscribeSyncState(setState)
    return unsub
  }, [])

  // Don't render when online and queue is empty
  if (state.online && state.queueSize === 0 && !state.syncing) return null

  const label = !state.online
    ? `Offline${state.queueSize ? ` · ${state.queueSize} queued` : ""}`
    : state.syncing
    ? `Syncing · ${state.queueSize}`
    : `${state.queueSize} pending`

  const bg = !state.online ? "#7f1d1d" : state.syncing ? "#854d0e" : "#1e293b"

  return (
    <button
      onClick={() => { if (state.online) flushQueue() }}
      className="pcc-sync-badge"
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 9999,
        background: bg,
        color: "#e2e8f0",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "20px",
        padding: "6px 14px",
        fontSize: "12px",
        fontWeight: 500,
        cursor: state.online ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <span style={{
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: !state.online ? "#ef4444" : state.syncing ? "#f59e0b" : "#3b82f6",
      }} />
      {label}
    </button>
  )
}
