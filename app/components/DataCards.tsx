"use client"

import React, { useEffect, useState } from "react"

// =============================================================================
// DataCards — DocHub's responsive table primitive (Phase-1 shared infra).
//
// Above 767px it renders a normal <table className="data-table"> (wrapped in an
// overflow-x:auto container so wide content never side-scrolls the page body).
// At/below 767px every row COLLAPSES to a stacked card: the `primary` column
// becomes the card heading and the remaining columns render as label -> value
// rows. Columns flagged `hideOnMobile` are dropped from the card. The whole card
// is a >=44px tap target when `onRowClick` is provided.
//
// Consumed by the asset / credential / license / backup / flex-instance / audit
// lists so those pages get identical desktop tables + phone cards for free.
// =============================================================================

export type DataColumn<T> = {
  key: string
  label: string
  render?: (row: T) => React.ReactNode
  /** Marks the card heading on mobile. First column is used if none is set. */
  primary?: boolean
  /** Monospace the cell (desktop td + mobile value). */
  mono?: boolean
  /** Omit this column from the mobile card entirely. */
  hideOnMobile?: boolean
}

const MOBILE_QUERY = "(max-width: 767px)"

// SSR-safe: starts `false` so server + first client render agree (desktop
// table), then the effect flips it on mount / when the media query changes.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])
  return isMobile
}

function renderCell<T>(col: DataColumn<T>, row: T): React.ReactNode {
  if (col.render) return col.render(row)
  const raw = (row as Record<string, unknown>)[col.key]
  if (raw == null) return null
  return raw as React.ReactNode
}

export default function DataCards<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
}: {
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
}): React.ReactElement {
  const isMobile = useIsMobile()
  const clickable = typeof onRowClick === "function"

  if (rows.length === 0) {
    return (
      <div className="state-box">
        <span>No records.</span>
      </div>
    )
  }

  // ── Mobile: stacked cards ────────────────────────────────────────────────
  if (isMobile) {
    const primaryCol = columns.find((c) => c.primary) ?? columns[0]
    const detailCols = columns.filter((c) => c !== primaryCol && !c.hideOnMobile)

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {rows.map((row) => {
          const handleClick = clickable ? () => onRowClick!(row) : undefined
          return (
            <div
              key={rowKey(row)}
              onClick={handleClick}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onRowClick!(row)
                      }
                    }
                  : undefined
              }
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "var(--space-3) var(--space-4)",
                minHeight: 44,
                boxShadow: "var(--shadow-sm)",
                cursor: clickable ? "pointer" : "default",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {primaryCol && (
                <div
                  style={{
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    color: "var(--text)",
                    fontFamily: primaryCol.mono ? "var(--mono)" : undefined,
                    marginBottom: detailCols.length ? "var(--space-2)" : 0,
                    wordBreak: "break-word",
                  }}
                >
                  {renderCell(primaryCol, row)}
                </div>
              )}
              {detailCols.map((col) => (
                <div
                  key={col.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "var(--space-4)",
                    padding: "var(--space-1) 0",
                    minHeight: 22,
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                    }}
                  >
                    {col.label}
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      textAlign: "right",
                      fontSize: "var(--text-sm)",
                      color: "var(--text)",
                      fontFamily: col.mono ? "var(--mono)" : undefined,
                      wordBreak: "break-word",
                    }}
                  >
                    {renderCell(col, row)}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Desktop: standard data-table in an overflow-x:auto wrapper ───────────
  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const handleClick = clickable ? () => onRowClick!(row) : undefined
            return (
              <tr
                key={rowKey(row)}
                onClick={handleClick}
                style={clickable ? { cursor: "pointer" } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.mono ? "mono" : undefined}>
                    {renderCell(col, row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
