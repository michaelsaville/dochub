export type PortalPermissions = {
  assets: boolean
  documents: boolean
  contacts: boolean
  locations: boolean
  licenses: boolean
  domains: boolean
}

export const DEFAULT_PERMISSIONS: PortalPermissions = {
  assets: false,
  documents: false,
  contacts: false,
  locations: false,
  licenses: false,
  domains: false,
}
