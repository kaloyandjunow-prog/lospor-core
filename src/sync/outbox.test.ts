import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import type { KVAdapter } from "./protocol"
import { createCaseOutbox, OUTBOX_INDEX_KEY, outboxPatchKey, type OutboxDeps, type PatchFailure } from "./outbox"

// Core's tsconfig has no DOM/node lib; the test runtime provides timers.
declare function setTimeout(handler: () => void, timeout?: number): unknown

function memoryKV(): KVAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    async get(key) { return data.get(key) ?? null },
    async set(key, value) { data.set(key, value) },
    async delete(key) { data.delete(key) },
  }
}

class HttpError extends Error {
  constructor(public status: number) { super(`http ${status}`) }
}
class NetworkError extends Error {}

const classifyError = (err: unknown): PatchFailure => {
  if (err instanceof NetworkError) return { kind: "network" }
  if (err instanceof HttpError) return { kind: "http", status: err.status }
  return { kind: "other" }
}

describe("createCaseOutbox", () => {
  let kv: ReturnType<typeof memoryKV>
  let sendPatch: Mock<OutboxDeps["sendPatch"]>

  beforeEach(() => {
    kv = memoryKV()
    sendPatch = vi.fn<OutboxDeps["sendPatch"]>()
  })

  function outbox() {
    return createCaseOutbox({ kv, sendPatch, classifyError })
  }

  it("saves straight through and clears any queued patch on success", async () => {
    sendPatch.mockResolvedValue({ preopUpdatedAt: "t1" })
    const box = outbox()
    await box.queue("case-1", "preop", { asaScore: "II" }, "base-0")

    const result = await box.save("case-1", "preop", { asaScore: "III" }, "base-1")

    expect(result).toEqual({ result: "saved", response: { preopUpdatedAt: "t1" } })
    expect((await box.summary()).count).toBe(0)
    expect(await box.load("case-1", "preop")).toBeNull()
  })

  it("queues on network failure instead of losing the patch", async () => {
    sendPatch.mockRejectedValue(new NetworkError())
    const box = outbox()

    const result = await box.save("case-1", "preop", { asaScore: "II" }, "base-0")

    expect(result).toEqual({ result: "queued" })
    expect(await box.load("case-1", "preop")).toEqual({ asaScore: "II" })
    expect((await box.summary()).entries).toEqual([{ caseId: "case-1", section: "preop" }])
  })

  it("rethrows non-network save errors", async () => {
    sendPatch.mockRejectedValue(new HttpError(400))
    const box = outbox()

    await expect(box.save("case-1", "preop", {}, null)).rejects.toThrow("http 400")
    expect((await box.summary()).count).toBe(0)
  })

  it("merge-on-queue lays newer fields over queued ones and keeps the original base timestamp", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { asaScore: "II", weightKg: 80 }, "base-original")
    await box.queue("case-1", "preop", { asaScore: "III" }, "base-newer")

    expect(await box.load("case-1", "preop")).toEqual({ asaScore: "III", weightKg: 80 })
    const stored = JSON.parse(kv.data.get(outboxPatchKey("case-1", "preop"))!)
    expect(stored.baseUpdatedAt).toBe("base-original")
    expect((await box.summary()).count).toBe(1)
  })

  it("flushOne discards permanently-rejected patches (404/403) and keeps transient failures", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-2", "preop", { b: 2 })
    await box.queue("case-3", "preop", { c: 3 })

    sendPatch.mockRejectedValueOnce(new HttpError(404))
    await expect(box.flushOne("case-1", "preop")).resolves.toEqual({ result: "empty" })
    expect(await box.load("case-1", "preop")).toBeNull()

    sendPatch.mockRejectedValueOnce(new HttpError(500))
    await expect(box.flushOne("case-2", "preop")).resolves.toEqual({ result: "failed" })
    expect(await box.load("case-2", "preop")).toEqual({ b: 2 })

    sendPatch.mockRejectedValueOnce(new NetworkError())
    await expect(box.flushOne("case-3", "preop")).resolves.toEqual({ result: "failed" })
    expect(await box.load("case-3", "preop")).toEqual({ c: 3 })
  })

  it("flushAll tallies saved / failed / discarded separately", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-2", "postop", { b: 2 })
    await box.queue("case-3", "intraop", { c: 3 })

    sendPatch.mockImplementation(async (caseId: string) => {
      if (caseId === "case-1") return { preopUpdatedAt: "t" }
      if (caseId === "case-2") throw new HttpError(403)
      throw new NetworkError()
    })

    await expect(box.flushAll()).resolves.toEqual({ saved: 1, failed: 1, discarded: 1 })
    expect((await box.summary()).entries).toEqual([{ caseId: "case-3", section: "intraop" }])
  })

  it("flushes multiple sections of one case sequentially, in queue order", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-1", "intraop", { b: 2 })

    const order: string[] = []
    sendPatch.mockImplementation(async (_caseId: string, section: string) => {
      order.push(`start:${section}`)
      await new Promise<void>((resolve) => setTimeout(() => resolve(), section === "preop" ? 10 : 0))
      order.push(`end:${section}`)
      return {}
    })

    await box.flushAll()

    expect(order).toEqual(["start:preop", "end:preop", "start:intraop", "end:intraop"])
  })

  it("reconcile removes index entries whose data is gone and readopts orphaned data", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-2", "preop", { b: 2 })

    // Simulate crash inconsistencies: case-1's data vanished; case-2 also has
    // orphaned intraop data that never made it into the index.
    kv.data.delete(outboxPatchKey("case-1", "preop"))
    kv.data.set(outboxPatchKey("case-2", "intraop"), JSON.stringify({ payload: { orphan: true } }))

    await box.reconcile()

    const entries = (await box.summary()).entries
    expect(entries).toEqual(
      expect.arrayContaining([
        { caseId: "case-2", section: "preop" },
        { caseId: "case-2", section: "intraop" },
      ]),
    )
    expect(entries).toHaveLength(2)
  })

  it("clearAllForCase drops every section of one case only", async () => {
    const box = outbox()
    await box.queue("case-1", "preop", { a: 1 })
    await box.queue("case-1", "postop", { b: 2 })
    await box.queue("case-2", "preop", { c: 3 })

    await box.clearAllForCase("case-1")

    expect((await box.summary()).entries).toEqual([{ caseId: "case-2", section: "preop" }])
    expect(await box.load("case-1", "preop")).toBeNull()
  })

  it("routes writes through orderWrite when provided", async () => {
    const seen: string[] = []
    const box = createCaseOutbox({
      kv,
      sendPatch: sendPatch.mockResolvedValue({}),
      classifyError,
      orderWrite: (caseId, section, run) => {
        seen.push(`${caseId}:${section}`)
        return run()
      },
    })

    await box.save("case-1", "intraop", { x: 1 })
    expect(seen).toEqual(["case-1:intraop"])
  })

  it("uses the historical storage keys", () => {
    expect(OUTBOX_INDEX_KEY).toBe("lospor_pending_case_patches")
    expect(outboxPatchKey("c1", "preop")).toBe("lospor_pending_preop_c1")
  })
})
