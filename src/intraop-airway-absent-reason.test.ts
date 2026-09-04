import { describe, expect, it } from "vitest"
import { airwayAbsentReason, buildAirwaySectionPatch } from "./intraop-domain"

describe("the two reasons an airway section can be empty", () => {
  const none = { presentsIntubated: false, airwayNotApplicable: false }

  it("turns one on", () => {
    expect(airwayAbsentReason("presentsIntubated", none))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: false })
    expect(airwayAbsentReason("airwayNotApplicable", none))
      .toEqual({ presentsIntubated: false, airwayNotApplicable: true })
  })

  it("turning one on turns the other off", () => {
    // A patient cannot both have arrived intubated and have had no airway
    // intervention -- arriving with a tube is one. Web used to allow both at
    // once while mobile did not, because each had its own rule.
    expect(airwayAbsentReason("airwayNotApplicable", { presentsIntubated: true, airwayNotApplicable: false }))
      .toEqual({ presentsIntubated: false, airwayNotApplicable: true })
    expect(airwayAbsentReason("presentsIntubated", { presentsIntubated: false, airwayNotApplicable: true }))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: false })
  })

  it("turning one off leaves the other alone", () => {
    expect(airwayAbsentReason("presentsIntubated", { presentsIntubated: true, airwayNotApplicable: false }))
      .toEqual({ presentsIntubated: false, airwayNotApplicable: false })
  })

  it("treats absent flags as off", () => {
    expect(airwayAbsentReason("presentsIntubated", {}))
      .toEqual({ presentsIntubated: true, airwayNotApplicable: false })
  })

  it("writes explicit false into the patch rather than omitting the key", () => {
    // An absent key is dropped from a patch as "not mentioned", so a flag
    // turned back off would silently keep its previous true.
    const patch = buildAirwaySectionPatch({ airwayTools: [], airwayDevices: [], ventilationModes: [] })
    expect(patch).toHaveProperty("presentsIntubated", false)
    expect(patch).toHaveProperty("airwayNotApplicable", false)
  })
})
