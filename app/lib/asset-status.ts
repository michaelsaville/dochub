// Shared AssetStatus -> display color map. Keep in sync with the AssetStatus
// enum in prisma/schema.prisma (9 values). Imported by both the asset detail
// page and the client detail page so they render identical status colors.
export const statusColor: Record<string, string> = {
  ACTIVE: "#00d4aa",
  RETIRING: "#ffb347",
  SUNSET: "#94a3b8",
  RETIRED: "#6b7280",
  IN_REPAIR: "#3d6fff",
  IN_STORAGE: "#8b5cf6",
  STOLEN: "#ff4d6d",
  LOST: "#f97316",
  DISPOSED: "#374151",
}
