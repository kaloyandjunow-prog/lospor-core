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

/** Monotonic section revision used by v5.6+ clients. Timestamp headers remain
 * accepted during the compatibility window for older installed builds. */
export const SECTION_REVISION_HEADER: Record<CaseSection, string> = {
  preop: "x-lospor-preop-revision",
  postop: "x-lospor-postop-revision",
  intraop: "x-lospor-intraop-revision",
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
/** A field the server refused to store, and why. */
export type RejectedField = {
  /** Dotted path within the patch body, e.g. "preop.heightCm". */
  path: string
  message: string
}

export type CasePatchResponse = {
  updatedAt?: string
  preopUpdatedAt?: string
  postopUpdatedAt?: string
  intraopUpdatedAt?: string
  preopRevision?: number
  postopRevision?: number
  intraopRevision?: number
  /**
   * Set when the save succeeded but individual values were rejected (out of
   * range, wrong type). The rest of the section WAS stored. Clients must tell
   * the user — a value they can still see on screen was not saved.
   */
  rejectedFields?: RejectedField[]
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

/** A revision token can be the v5.6 monotonic integer or a legacy timestamp. */
export type SectionRevision = number | string | null
export type RevisionRef = { current: SectionRevision }

export function responseRevision(
  section: CaseSection,
  body: CasePatchResponse,
): SectionRevision {
  const numeric =
    section === "preop" ? body.preopRevision :
    section === "postop" ? body.postopRevision :
    body.intraopRevision
  if (typeof numeric === "number") return numeric
  const legacy =
    section === "preop" ? body.preopUpdatedAt :
    section === "postop" ? body.postopUpdatedAt :
    body.intraopUpdatedAt
  return typeof legacy === "string" ? legacy : null
}

/**
 * Minimal async key-value storage the sync engine persists queues into.
 * Mobile: expo-secure-store. Web: IndexedDB adapter. Tests: in-memory map.
 */
export type KVAdapter = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  /**
   * Optional key enumeration (prefix match). Where available (IndexedDB),
   * crash/multi-tab reconciliation can rebuild queue indexes from actual
   * storage contents instead of guessing from the possibly-corrupt index.
   * SecureStore cannot enumerate — engines must degrade gracefully without it.
   */
  keys?(prefix: string): Promise<string[]>
}

/** Safely extract serverVersion.updatedAt from an unknown 409 body. */
export function serverVersionUpdatedAt(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const serverVersion = (body as { serverVersion?: unknown }).serverVersion
  if (!serverVersion || typeof serverVersion !== "object") return null
  const updatedAt = (serverVersion as { updatedAt?: unknown }).updatedAt
  return typeof updatedAt === "string" ? updatedAt : null
}
