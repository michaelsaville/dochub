// CIDR helpers for InternetCircuit static-IP blocks.
// IPv4 only — IPv6 prefixes are stored verbatim and not derived.

export type CidrInfo = {
  cidr: string
  prefix: number
  networkIp: string
  broadcastIp: string
  subnetMask: string
  usableStartIp: string | null
  usableEndIp: string | null
  gatewayCandidate: string | null
  hostCount: number
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const CIDR = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/

export function isIpv4(s: string): boolean {
  const m = s.trim().match(IPV4)
  if (!m) return false
  return m.slice(1, 5).every(o => { const n = Number(o); return n >= 0 && n <= 255 })
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc * 256) + Number(o), 0) >>> 0
}

function intToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')
}

export function parseCidr(input: string): CidrInfo | null {
  const trimmed = input.trim()
  const m = trimmed.match(CIDR)
  if (!m) return null
  const ip = m[1]
  const prefix = Number(m[2])
  if (!isIpv4(ip)) return null
  if (prefix < 0 || prefix > 32) return null

  const ipInt = ipToInt(ip)
  const maskInt = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const networkInt = (ipInt & maskInt) >>> 0
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0
  const hostCount = prefix >= 31 ? 0 : Math.max(0, (broadcastInt - networkInt) - 1)

  let usableStartIp: string | null = null
  let usableEndIp: string | null = null
  let gatewayCandidate: string | null = null
  if (prefix === 32) {
    usableStartIp = usableEndIp = gatewayCandidate = intToIp(networkInt)
  } else if (prefix === 31) {
    usableStartIp = intToIp(networkInt)
    usableEndIp = intToIp(broadcastInt)
    gatewayCandidate = usableStartIp
  } else {
    usableStartIp = intToIp(networkInt + 1)
    usableEndIp = intToIp(broadcastInt - 1)
    gatewayCandidate = usableStartIp
  }

  return {
    cidr: `${intToIp(networkInt)}/${prefix}`,
    prefix,
    networkIp: intToIp(networkInt),
    broadcastIp: intToIp(broadcastInt),
    subnetMask: intToIp(maskInt),
    usableStartIp,
    usableEndIp,
    gatewayCandidate,
    hostCount,
  }
}

// Lenient parse for legacy free-text wanIp values during backfill.
// Returns { kind: 'ip' | 'cidr' | 'none', value, info? }.
export function parseLegacyWanIp(raw: string | null | undefined): {
  kind: 'ip' | 'cidr' | 'none'
  value: string | null
  info: CidrInfo | null
} {
  if (!raw) return { kind: 'none', value: null, info: null }
  const trimmed = raw.trim()
  if (!trimmed) return { kind: 'none', value: null, info: null }
  if (CIDR.test(trimmed)) {
    const info = parseCidr(trimmed)
    if (info) return { kind: 'cidr', value: info.cidr, info }
  }
  if (isIpv4(trimmed)) return { kind: 'ip', value: trimmed, info: null }
  return { kind: 'none', value: null, info: null }
}
