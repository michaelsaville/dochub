// Shared AssetStatus -> display color map. Keep in sync with the AssetStatus
// enum in prisma/schema.prisma (9 values). Imported by both the asset detail
// page and the client detail page so they render identical status colors.
export const statusColor: Record<string, string> = {
  ACTIVE: "#22c55e",
  RETIRING: "#f59e0b",
  SUNSET: "#94a3b8",
  RETIRED: "#6b7280",
  IN_REPAIR: "#3b82f6",
  IN_STORAGE: "#8b5cf6",
  STOLEN: "#ef4444",
  LOST: "#f97316",
  DISPOSED: "#374151",
}
