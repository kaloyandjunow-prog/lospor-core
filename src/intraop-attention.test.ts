import { describe, expect, it } from "vitest"

import { intraopAttentionItems, intraopResolveAttention } from "./intraop-attention"
import { INTRAOP_ATTENTION_SCENARIOS } from "./intraop-attention-scenarios"

describe.each(INTRAOP_ATTENTION_SCENARIOS)("$name", scenario => {
  it("lists exactly the expected items", () => {
    expect(intraopAttentionItems(scenario.log, scenario.context).map(item => ({ key: item.key, kind: item.kind })))
      .toEqual(scenario.expected)
  })

  it.each(scenario.resolutions.map(resolution => [resolution.action, resolution] as const))(
    "%s writes exactly its operations",
    (_action, resolution) => {
      const ops = intraopResolveAttention(scenario.log, resolution.key, resolution.action, scenario.context)
      expect(ops.add).toEqual([])
      expect([...ops.remove].sort()).toEqual([...(resolution.removes ?? [])].sort())
      expect(ops.update.map(event => event.id).sort()).toEqual(Object.keys(resolution.updates ?? {}).sort())
      for (const event of ops.update) expect(event).toMatchObject(resolution.updates![event.id])
    },
  )
})

describe("answers that no longer fit", () => {
  it("write nothing", () => {
    const [scenario] = INTRAOP_ATTENTION_SCENARIOS
    expect(intraopResolveAttention(scenario.log, "stop", "happened", scenario.context))
      .toEqual({ add: [], update: [], remove: [] })
    expect(intraopResolveAttention(scenario.log, "unknown", "stopped", scenario.context))
      .toEqual({ add: [], update: [], remove: [] })
  })
})
