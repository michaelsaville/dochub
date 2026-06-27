"use client"

import { useEffect, useRef, useState, useCallback } from "react"

interface Props {
  clientId: string
}

type EmbedEvent =
  | { event: "init" }
  | { event: "load" }
  | { event: "save"; xml: string }
  | { event: "export"; data: string; format: string; message: { xml: string } }
  | { event: "configure" }

export default function NetworkDiagramPanel({ clientId }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [xml, setXml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const xmlRef = useRef<string | null>(null)

  // Load saved XML from the server
  useEffect(() => {
    fetch(`/api/clients/${clientId}/diagram`)
      .then(r => r.json())
      .then(data => {
        setXml(data.xml)
        xmlRef.current = data.xml
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [clientId])

  const sendToEditor = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*")
  }, [])

  const saveXml = useCallback(async (xmlToSave: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/diagram`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml: xmlToSave }),
      })
      if (res.ok) {
        setLastSaved(new Date().toLocaleTimeString())
        xmlRef.current = xmlToSave
        setXml(xmlToSave)
      }
    } finally {
      setSaving(false)
    }
  }, [clientId])

  // Handle messages from the embed
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      let msg: EmbedEvent
      try {
        msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data
      } catch {
        return
      }

      if (msg.event === "configure") {
        // Acknowledge configure handshake
        sendToEditor({ action: "configure", config: {} })
      } else if (msg.event === "init") {
        setEditorReady(true)
        // Load XML once editor is ready
        const currentXml = xmlRef.current
        if (currentXml) {
          sendToEditor({ action: "load", xml: currentXml })
        } else {
          sendToEditor({ action: "load", xml: "" })
        }
      } else if (msg.event === "load") {
        // Editor finished loading — nothing needed
      } else if (msg.event === "save") {
        saveXml(msg.xml)
        // Acknowledge so editor clears the "unsaved" indicator
        sendToEditor({ action: "load", xml: msg.xml })
      }
    }

    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [sendToEditor, saveXml])

  // When xml loads from server and editor is already ready, push it in
  useEffect(() => {
    if (editorReady && !loading && xml !== undefined) {
      sendToEditor({ action: "load", xml: xml ?? "" })
    }
  }, [editorReady, loading, xml, sendToEditor])

  // Base URL for the drawio editor. Defaults to the public diagrams.net embed
  // for backwards compatibility, but should be pointed at a self-hosted drawio
  // (set NEXT_PUBLIC_DRAWIO_URL) so client network topology never leaves our infra.
  const drawioBase = (
    process.env.NEXT_PUBLIC_DRAWIO_URL || "https://embed.diagrams.net"
  ).replace(/\/+$/, "")
  const embedUrl =
    `${drawioBase}/?embed=1&spin=1&proto=json&ui=dark` +
    "&modified=unsavedChanges&noSaveBtn=0&saveAndExit=0&noExitBtn=1" +
    "&libraries=1&lang=en"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
            Network Topology Diagram
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Use the editor below to draw your network topology. Changes are saved automatically.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {saving && (
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Saving…</span>
          )}
          {lastSaved && !saving && (
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              Saved {lastSaved}
            </span>
          )}
        </div>
      </div>

      {/* Editor frame */}
      {loading ? (
        <div style={{ height: "640px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg-secondary)", borderRadius: "8px", border: "0.5px solid var(--color-border-primary)" }}>
          <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Loading…</span>
        </div>
      ) : (
        <div style={{ border: "0.5px solid var(--color-border-primary)", borderRadius: "8px", overflow: "hidden" }}>
          <iframe
            ref={iframeRef}
            src={embedUrl}
            style={{ display: "block", width: "100%", height: "640px", border: "none" }}
            title="Network Diagram Editor"
          />
        </div>
      )}
    </div>
  )
}
