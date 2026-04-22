"use client"

export default function TabFilter({
  value,
  onChange,
  placeholder,
  matched,
  total,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  matched: number
  total: number
}) {
  if (total === 0) return null
  const active = value.trim().length > 0
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "6px 10px",
          fontSize: "13px",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "7px",
          background: "var(--color-background-primary)",
          color: "var(--color-text-primary)",
          width: "240px",
        }}
      />
      {active && (
        <>
          <button
            onClick={() => onChange("")}
            style={{
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear
          </button>
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
            {matched} of {total}
          </span>
        </>
      )}
    </div>
  )
}
