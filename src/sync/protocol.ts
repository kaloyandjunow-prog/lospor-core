// Shared save/sync protocol contract for LOSPOR clients (web + mobile).
//
// This module is the single source of truth for the wire-level vocabulary the
// clients use to talk to the case API: section names, conflict headers,
// response shapes, idempotency keys, and the one sync status vocabulary every
// screen renders. Client apps must not hardcode any of these strings locally.

export type CaseSection = "preop" | "postop" | "intraop"

export const CASE_SECTIONS: readonly CaseSection[] = ["preop", "postop", "intraop"]

/** Per-section optimistic-concurrency header: "I last saw this section at <ts>". */
export const SECTION_CONFLICT_HEADER: Record<CaseSection, string> = {
  preop: "x-lospor-preop-updated-at",
  postop: "x-lospor-postop-updated-at",
  intraop: "x-lospor-intraop-updated-at",
}

/** Escape hatch: user explicitly chose "overwrite" in a conflict resolution UI. */
export const FORCE_UPDATE_HEADER = "x-lospor-force-update"

/** Dedup header for event appends — replaying the same key stores the event once. */
export const IDEMPOTENCY_HEADER = "X-Idempotency-Key"

/** Which client produced a write (audit trail). */
export const SOURCE_HEADER = "X-Lospor-Source"

export type WriteSource = "web" | "mobile" | "ai" | "import"

/** Stable idempotency key for a single intraop event append. */
export function eventIdempotencyKey(caseId: string, eventId: string): string {
  return `${caseId}:${eventId}`
}

/** Successful PATCH/PUT responses echo the fresh per-section timestamps. */
export type CasePatchResponse = {
  updatedAt?: string
  preopUpdatedAt?: string
  postopUpdatedAt?: string
  intraopUpdatedAt?: string
}

export type ServerVersion = { updatedAt?: string } & Record<string, unknown>

/** Body shape of a 409 conflict response. */
export type ConflictBody = {
  error?: string
  section?: string
  reason?: string
  serverVersion?: ServerVersion
}

/**
 * The one sync-status vocabulary. Every save surface on web and mobile maps to
 * this union — no screen defines its own status enum.
 *
 * idle     nothing to do
 * saving   a write is in flight
 * saved    last write acknowledged by the server
 * queued   write stored locally, waiting for connectivity (offline tray)
 * conflict server rejected a stale write and self-heal did not resolve it
 * failed   write failed for another reason; will be retried
 * offline  device knows it has no connectivity
 */
export type SyncStatus =
  | "idle"
  | "saving"
  | "saved"
  | "queued"
  | "conflict"
  | "failed"
  | "offline"

/** Mutable holder for the client's base timestamp of a section (React ref-compatible). */
export type TimestampRef = { current: string | null }

/**
 * Minimal async key-value storage the sync engine persists queues into.
 * Mobile: expo-secure-store. Web: IndexedDB adapter. Tests: in-memory map.
 */
export type KVAdapter = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

/** Safely extract serverVersion.updatedAt from an unknown 409 body. */
export function serverVersionUpdatedAt(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const serverVersion = (body as { serverVersion?: unknown }).serverVersion
  if (!serverVersion || typeof serverVersion !== "object") return null
  const updatedAt = (serverVersion as { updatedAt?: unknown }).updatedAt
  return typeof updatedAt === "string" ? updatedAt : null
}
