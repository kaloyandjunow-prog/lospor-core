import { describe, expect, it, vi } from "vitest"

import { createAutosaveManager } from "./autosave-manager"
import { outboxPatchKey, type PatchFailure } from "./outbox"
import type { KVAdapter } from "./protocol"

function memoryKV(): KVAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

function manager(kv: ReturnType<typeof memoryKV>, sendPatch = vi.fn()) {
  return createAutosaveManager({
    outbox: {
      kv,
      sendPatch,
      classifyError: (error): PatchFailure =>
        error instanceof TypeError ? { kind: "network" } : { kind: "other" },
    },
    pendingEvents: {
      kv,
      postEvent: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 3 }),
      isNetworkError: (error) => error instanceof TypeError,
    },
    eventMutations: {
      kv,
      send: vi.fn().mockResolvedValue({ ok: true, status: 200, revision: 3 }),
      isNetworkError: (error) => error instanceof TypeError,
    },
    now: () => new Date("2026-07-23T20:00:00.000Z"),
  })
}

describe("createAutosaveManager", () => {
  it("persists a section patch before attempting the network", async () => {
    const kv = memoryKV()
    const sendPatch = vi.fn(async () => {
      expect(kv.data.has(outboxPatchKey("case-1", "preop"))).toBe(true)
      return { preopRevision: 6 }
    })
    const autosave = manager(kv, sendPatch)
    autosave.hydrateSection("case-1", "preop", { ageYears: 40 }, 5)

    await expect(autosave.saveSection("case-1", "preop", { ageYears: 41 })).resolves.toEqual({
      result: "saved",
      response: { preopRevision: 6 },
    })
    expect(autosave.getRevision("case-1", "preop")).toBe(6)
    expect(autosave.getState("case-1")).toMatchObject({ status: "saved", pending: 0 })
  })

  it("keeps a durable patch after a network failure and flushes it after recreation", async () => {
    const kv = memoryKV()
    const offline = manager(kv, vi.fn().mockRejectedValue(new TypeError("offline")))
    offline.hydrateSection("case-1", "postop", { disposition: "WARD" }, 1)
    await expect(offline.saveSection("case-1", "postop", { disposition: "ICU" }))
      .resolves.toEqual({ result: "queued" })
    expect(offline.getState("case-1")).toMatchObject({ status: "queued", pending: 1 })

    const onlineSend = vi.fn().mockResolvedValue({ postopRevision: 2 })
    const reopened = manager(kv, onlineSend)
    await reopened.flushCase("case-1")
    expect(onlineSend).toHaveBeenCalledTimes(1)
    expect(reopened.getState("case-1")).toMatchObject({ status: "saved", pending: 0 })
  })

  it("accepts explicit partial section patches without losing the full snapshot", async () => {
    const kv = memoryKV()
    const sendPatch = vi.fn()
      .mockResolvedValueOnce({ intraopRevision: 2 })
      .mockResolvedValueOnce({ intraopRevision: 3 })
    const autosave = manager(kv, sendPatch)
    autosave.hydrateSection("case-1", "intraop", { position: "SUPINE", technique: "GENERAL" }, 1)

    await autosave.saveSection("case-1", "intraop", { position: "PRONE" }, { partial: true })
    await autosave.saveSection("case-1", "intraop", { position: "PRONE", technique: "REGIONAL" })

    expect(sendPatch).toHaveBeenNthCalledWith(1, "case-1", "intraop", { position: "PRONE" }, 1)
    expect(sendPatch).toHaveBeenNthCalledWith(2, "case-1", "intraop", { technique: "REGIONAL" }, 2)
  })

  it("serializes event append and edit/delete through one case manager", async () => {
    const kv = memoryKV()
    const autosave = manager(kv)
    autosave.setRevision("case-1", "intraop", 2)

    await autosave.appendEvent("case-1", { id: "event-1", ts: "2026-07-23T20:00:00.000Z", type: "drug" })
    await autosave.stageEventMutation({
      operationId: "delete-1",
      caseId: "case-1",
      kind: "event.delete",
      eventId: "event-1",
      baseRevision: 2,
      queuedAt: "2026-07-23T20:01:00.000Z",
    })

    expect(autosave.getState("case-1")).toMatchObject({ status: "saved", pending: 0 })
    await expect(autosave.waitForCase("case-1")).resolves.toBeUndefined()
  })
})
