const DSM_ERRORS: Record<number, string> = {
  400: "Invalid credentials",
  401: "Account disabled",
  402: "Permission denied",
  403: "2FA required — disable 2FA for this account",
  404: "Authentication failed",
}

function base(host: string, port: number, useHttps: boolean) {
  return `${useHttps ? "https" : "http"}://${host}:${port}`
}

async function dsmFetch(url: string, skipSslVerify: boolean): Promise<any> {
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (skipSslVerify) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
  try {
    const res = await fetch(url, { cache: "no-store" })
    return await res.json()
  } finally {
    if (skipSslVerify) process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev ?? "1"
  }
}

export async function dsmLogin(
  host: string, port: number, useHttps: boolean, skipSslVerify: boolean,
  username: string, password: string
): Promise<string> {
  const url = `${base(host, port, useHttps)}/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login` +
    `&account=${encodeURIComponent(username)}&passwd=${encodeURIComponent(password)}&session=DocHub&format=sid`
  const data = await dsmFetch(url, skipSslVerify)
  if (!data.success) throw new Error(DSM_ERRORS[data.error?.code] ?? `DSM error ${data.error?.code}`)
  return data.data.sid
}

export async function dsmLogout(
  host: string, port: number, useHttps: boolean, skipSslVerify: boolean, sid: string
): Promise<void> {
  const url = `${base(host, port, useHttps)}/webapi/auth.cgi?api=SYNO.API.Auth&version=1&method=logout&session=DocHub&_sid=${sid}`
  await dsmFetch(url, skipSslVerify).catch(() => {})
}

export type BackupJob = {
  taskId: string
  name: string
  type: "hyper_backup" | "active_backup"
  lastResult: string
  lastRunAt: Date | null
  nextRunAt: Date | null
  destination: string | null
}

export async function dsmGetBackupJobs(
  host: string, port: number, useHttps: boolean, skipSslVerify: boolean, sid: string
): Promise<BackupJob[]> {
  const jobs: BackupJob[] = []

  // Hyper Backup
  try {
    const url = `${base(host, port, useHttps)}/webapi/entry.cgi?api=SYNO.Backup.Task&version=1&method=list&_sid=${sid}`
    const data = await dsmFetch(url, skipSslVerify)
    if (data.success && Array.isArray(data.data?.task_list)) {
      for (const t of data.data.task_list) {
        jobs.push({
          taskId:      String(t.task_id ?? t.id),
          name:        t.task_name ?? t.name ?? "Unknown",
          type:        "hyper_backup",
          lastResult:  normaliseResult(t.last_bkp_result ?? t.status),
          lastRunAt:   t.last_bkp_time ? new Date(t.last_bkp_time * 1000) : null,
          nextRunAt:   t.next_bkp_time ? new Date(t.next_bkp_time * 1000) : null,
          destination: t.destination?.name ?? t.dest_name ?? null,
        })
      }
    }
  } catch {}

  // Active Backup for Business
  try {
    const url = `${base(host, port, useHttps)}/webapi/entry.cgi?api=SYNO.ActiveBackup.Task&version=1&method=list&_sid=${sid}`
    const data = await dsmFetch(url, skipSslVerify)
    if (data.success && Array.isArray(data.data?.list)) {
      for (const t of data.data.list) {
        jobs.push({
          taskId:      String(t.task_id),
          name:        t.task_name ?? "Unknown",
          type:        "active_backup",
          lastResult:  normaliseResult(t.last_backup_result ?? t.status),
          lastRunAt:   t.last_backup_time ? new Date(t.last_backup_time * 1000) : null,
          nextRunAt:   t.next_backup_time ? new Date(t.next_backup_time * 1000) : null,
          destination: null,
        })
      }
    }
  } catch {}

  return jobs
}

function normaliseResult(raw: any): string {
  if (!raw && raw !== 0) return "none"
  const s = String(raw).toLowerCase()
  if (s === "0" || s === "success" || s === "done")    return "success"
  if (s === "1" || s === "error" || s === "failed")    return "error"
  if (s === "2" || s === "warning" || s === "warn")    return "warning"
  if (s === "running" || s === "3")                    return "running"
  if (s === "unfinished" || s === "interrupted")       return "unfinished"
  return s
}
