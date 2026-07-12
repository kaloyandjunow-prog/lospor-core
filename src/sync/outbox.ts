// The offline tray ("outbox"): section patches that could not reach the
// server are persisted locally and replayed later. Ported from
// lospor-mobile/src/lib/offline-case-patches.ts (v4.1.x) with storage
// (KVAdapter) and transport injected so web and mobile share one
// implementation — including all its defenses:
//
//  - data written BEFORE the index (a crash leaves a repairable orphan,
//    never an index entry with no data), with reconcile() at startup
//  - merge-on-queue: re-queueing a section lays newer fields over the queued
//    ones (latest value per field wins), and keeps the ORIGINAL base
//    timestamp so conflict detection still compares against what the user
//    actually saw
//  - flush discards permanently-rejected patches (404/403: case deleted or
//    access revoked) instead of retrying forever, keeps everything else
//
// STORAGE KEYS are identical to the historical mobile keys so devices with
// queued data survive the upgrade without losing their tray.

import type { CasePatchResponse, CaseSection, KVAdapter } from "./protocol"
import { createSingleFlightQueue } from "./single-flight-queue"

export type CasePatchResult = "saved" | "queued" | "empty" | "failed"

export type OutboxEntry = { caseId: string; section: CaseSection }
export type OutboxSummary = { count: number; entries: OutboxEntry[] }

/** How a failed send should be treated by the outbox. */
export type PatchFailure =
  | { kind: "network" } // no connectivity — queue/keep the patch
  | { kind: "http"; status: number } // server answered with an error status
  | { kind: "other" } // anything else — keep the patch, report failed

export type OutboxDeps = {
  kv: KVAdapter
  /** Perform the actual PATCH. May throw; classifyError maps the throw. */
  sendPatch: (
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt: string | null | undefined,
  ) => Promise<CasePatchResponse>
  /** Map a thrown error from sendPatch to outbox semantics. */
  classifyError: (err: unknown) => PatchFailure
  /**
   * Optional write-ordering hook (per-case single-flight queue). Defaults to
   * immediate execution. Historically mobile only ordered intraop patches.
   */
  orderWrite?: <T>(caseId: string, section: CaseSection, run: () => Promise<T>) => Promise<T>
  /**
   * Best-effort notification after any mutation of the tray (queue, clear,
   * successful save/flush) with the fresh summary — lets UI badges track the
   * queued count live instead of polling. Never awaited, errors swallowed.
   */
  onChange?: (summary: OutboxSummary) => void
}

export const OUTBOX_INDEX_KEY = "lospor_pending_case_patches"

export function outboxPatchKey(caseId: string, section: CaseSection): string {
  return `lospor_pending_${section}_${caseId}`
}

const ALL_SECTIONS: readonly CaseSection[] = ["preop", "postop", "intraop"]

type StoredPatch = { payload?: unknown; baseUpdatedAt?: string | null; queuedAt?: string }

export type CaseOutbox = ReturnType<typeof createCaseOutbox>

export function createCaseOutbox(deps: OutboxDeps) {
  const { kv, sendPatch, classifyError } = deps
  const orderWrite = deps.orderWrite ?? (<T,>(_caseId: string, _section: CaseSection, run: () => Promise<T>) => run())

  // All index mutations are serialized through one queue: the historical
  // mobile implementation let parallel flushes read-modify-write the index
  // concurrently, which could silently lose a removal (lost-update race).
  const indexQueue = createSingleFlightQueue()

  function notifyChanged(): void {
    if (!deps.onChange) return
    void summary()
      .then((s) => deps.onChange?.(s))
      .catch(() => {})
  }

  async function loadIndex(): Promise<OutboxEntry[]> {
    const raw = await kv.get(OUTBOX_INDEX_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async function storeIndex(entries: OutboxEntry[]): Promise<void> {
    if (entries.length === 0) {
      await kv.delete(OUTBOX_INDEX_KEY)
      return
    }
    await kv.set(OUTBOX_INDEX_KEY, JSON.stringify(entries))
  }

  function addIndexEntry(caseId: string, section: CaseSection): Promise<void> {
    return indexQueue.enqueue(async () => {
      const entries = await loadIndex()
      if (entries.some((entry) => entry.caseId === caseId && entry.section === section)) return
      await storeIndex([...entries, { caseId, section }])
    })
  }

  function removeIndexEntry(caseId: string, section: CaseSection): Promise<void> {
    return indexQueue.enqueue(async () => {
      const entries = await loadIndex()
      await storeIndex(entries.filter((entry) => entry.caseId !== caseId || entry.section !== section))
    })
  }

  async function summary(): Promise<OutboxSummary> {
    const entries = await loadIndex()
    return { count: entries.length, entries }
  }

  async function queuedCaseIds(): Promise<string[]> {
    const entries = await loadIndex()
    return [...new Set(entries.map((e) => e.caseId))]
  }

  async function clearAll(): Promise<number> {
    const entries = await loadIndex()
    await Promise.all(entries.map((e) => kv.delete(outboxPatchKey(e.caseId, e.section)).catch(() => {})))
    await kv.delete(OUTBOX_INDEX_KEY).catch(() => {})
    notifyChanged()
    return entries.length
  }

  async function queue(
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt?: string | null,
  ): Promise<void> {
    // Write patch data BEFORE updating the index so a crash between the two
    // leaves a repairable orphan rather than an index entry with no data.
    const key = outboxPatchKey(caseId, section)
    const existingRaw = await kv.get(key).catch(() => null)
    let nextPayload = payload
    let nextBaseUpdatedAt = baseUpdatedAt
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as StoredPatch
        if (
          payload &&
          existing.payload &&
          typeof payload === "object" &&
          typeof existing.payload === "object" &&
          !Array.isArray(payload) &&
          !Array.isArray(existing.payload)
        ) {
          nextPayload = { ...(existing.payload as Record<string, unknown>), ...(payload as Record<string, unknown>) }
        }
        nextBaseUpdatedAt = existing.baseUpdatedAt ?? baseUpdatedAt
      } catch {
        nextPayload = payload
      }
    }
    await kv.set(key, JSON.stringify({ payload: nextPayload, baseUpdatedAt: nextBaseUpdatedAt, queuedAt: new Date().toISOString() }))
    await addIndexEntry(caseId, section)
    notifyChanged()
  }

  /**
   * Reconcile the index against actual storage contents. Call once at app
   * startup so a crash mid-write cannot leave the queue permanently
   * inconsistent. See the mobile original for the two repair cases.
   */
  async function reconcile(): Promise<void> {
    await indexQueue.enqueue(reconcileUnlocked)
    notifyChanged()
  }

  async function reconcileUnlocked(): Promise<void> {
    const entries = await loadIndex()

    const candidates = new Map<string, OutboxEntry>()
    for (const entry of entries) {
      candidates.set(`${entry.caseId}:${entry.section}`, entry)
    }
    // Derive candidate keys across all sections for every known caseId so we
    // catch the "data written, index not written" crash case.
    const caseIds = [...new Set(entries.map((e) => e.caseId))]
    for (const caseId of caseIds) {
      for (const section of ALL_SECTIONS) {
        const key = `${caseId}:${section}`
        if (!candidates.has(key)) candidates.set(key, { caseId, section })
      }
    }

    const candidateList = [...candidates.values()]
    const results = await Promise.all(
      candidateList.map((entry) => kv.get(outboxPatchKey(entry.caseId, entry.section)).catch(() => null)),
    )
    await storeIndex(candidateList.filter((_, i) => results[i] !== null))
  }

  async function clearOne(caseId: string, section: CaseSection): Promise<void> {
    await kv.delete(outboxPatchKey(caseId, section))
    await removeIndexEntry(caseId, section)
    notifyChanged()
  }

  /** Remove all queued patches for a case (call after the case is deleted). */
  async function clearAllForCase(caseId: string): Promise<void> {
    await indexQueue.enqueue(async () => {
      const entries = await loadIndex()
      const forCase = entries.filter((e) => e.caseId === caseId)
      await Promise.all(forCase.map((e) => kv.delete(outboxPatchKey(e.caseId, e.section))))
      await storeIndex(entries.filter((e) => e.caseId !== caseId))
    })
    notifyChanged()
  }

  async function load<T = unknown>(caseId: string, section: CaseSection): Promise<T | null> {
    const raw = await kv.get(outboxPatchKey(caseId, section))
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      return parsed?.payload ?? null
    } catch {
      return null
    }
  }

  function sendInOrder(
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt: string | null | undefined,
  ): Promise<CasePatchResponse> {
    return orderWrite(caseId, section, () => sendPatch(caseId, section, payload, baseUpdatedAt))
  }

  /** Try to save now; on a network failure, queue for later instead of losing the data. */
  async function save(
    caseId: string,
    section: CaseSection,
    payload: unknown,
    baseUpdatedAt?: string | null,
  ): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
    try {
      const response = await sendInOrder(caseId, section, payload, baseUpdatedAt)
      await clearOne(caseId, section)
      return { result: "saved", response }
    } catch (err) {
      if (classifyError(err).kind === "network") {
        await queue(caseId, section, payload, baseUpdatedAt)
        return { result: "queued" }
      }
      throw err
    }
  }

  async function flushOne(
    caseId: string,
    section: CaseSection,
  ): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
    const raw = await kv.get(outboxPatchKey(caseId, section))
    if (!raw) return { result: "empty" }
    let parsed: StoredPatch
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { result: "empty" }
    }
    if (!parsed.payload) return { result: "empty" }
    try {
      const response = await sendInOrder(caseId, section, parsed.payload, parsed.baseUpdatedAt)
      await clearOne(caseId, section)
      return { result: "saved", response }
    } catch (err) {
      const failure = classifyError(err)
      // Case was deleted or access revoked — discard the stale patch instead
      // of retrying forever.
      if (failure.kind === "http" && (failure.status === 404 || failure.status === 403)) {
        await clearOne(caseId, section)
        return { result: "empty" }
      }
      // 401 (auth expired), network, and server errors all keep the patch
      // queued — a later flush pass retries once conditions improve.
      return { result: "failed" }
    }
  }

  async function flushAll(): Promise<{ saved: number; failed: number; discarded: number }> {
    const entries = await loadIndex()
    if (entries.length === 0) return { saved: 0, failed: 0, discarded: 0 }

    const byCaseId = new Map<string, OutboxEntry[]>()
    for (const entry of entries) {
      const arr = byCaseId.get(entry.caseId) ?? []
      arr.push(entry)
      byCaseId.set(entry.caseId, arr)
    }

    let saved = 0
    let failed = 0
    let discarded = 0
    // "empty" during a flush means the patch was dropped (stale 404/403 or no
    // data) — a discard, not a successful save.
    const tally = (result: CasePatchResult) => {
      if (result === "saved") saved += 1
      else if (result === "empty") discarded += 1
      else failed += 1
    }
    await Promise.all(
      [...byCaseId.values()].map(async (caseEntries) => {
        // Sections of one case flush sequentially to respect ordering; cases
        // flush in parallel.
        for (const entry of caseEntries) {
          const result = await flushOne(entry.caseId, entry.section)
          tally(result.result)
        }
      }),
    )
    return { saved, failed, discarded }
  }

  return {
    summary,
    queuedCaseIds,
    clearAll,
    clearAllForCase,
    clearOne,
    queue,
    load,
    reconcile,
    save,
    flushOne,
    flushAll,
  }
}
