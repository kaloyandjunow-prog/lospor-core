import { describe, expect, it } from "vitest"
import { parseDoseProfile } from "./catalog"
import {
  canonicalConcentrationSelection,
  resolveDrugSelectionSurface,
} from "./drug-selection"

const profile = parseDoseProfile("Bupivacaine", "bolus", {
  routes: ["IV", "IT"],
  defaultRoute: "IT",
  rounding: "nearest_step",
  routeModes: {
    IV: {
      min: 0,
      max: 20,
      step: 1,
      unit: "mg",
      quickValues: [1, 2, 3, 4, 5, 6],
      doseCalc: { perKg: 0.1, basis: "TBW", roundTo: 1 },
    },
    IT: {
      min: 0,
      max: 5,
      step: 0.1,
      unit: "mg",
      quickValues: [0.5, 1, 1.5, 2],
      doseCalc: { flat: 1.2, roundTo: 0.1 },
      concentrationOptions: ["0.25%", "0.5%"],
      concentrationUnit: "PERCENT",
      defaultConcentration: "0.5%",
      formulationOptions: ["ISOBARIC", "HYPERBARIC"],
      defaultFormulation: "HYPERBARIC",
    },
  },
})

describe("drug selection surface", () => {
  it("preselects the configured route and every dependent field", () => {
    expect(resolveDrugSelectionSurface({ profile, patient: { totalBodyWeightKg: 20 } })).toMatchObject({
      route: "INTRATHECAL",
      dose: "1.2",
      unit: "mg",
      concentration: "0.5%",
      formulation: "HYPERBARIC",
      quickValues: [0.5, 1, 1.5, 2],
    })
  })

  it("reinitializes the full surface when route changes", () => {
    expect(resolveDrugSelectionSurface({
      profile,
      route: "IV",
      patient: { totalBodyWeightKg: 20 },
    })).toMatchObject({
      route: "IV",
      dose: "2",
      min: 0,
      max: 20,
      quickValues: [1, 2, 3, 4, 5, 6],
      concentration: "",
      formulationOptions: [],
    })
  })

  it("requires IBW when configured and never falls back to TBW", () => {
    const ibwProfile = parseDoseProfile("Example", "bolus", {
      min: 0,
      max: 200,
      step: 1,
      unit: "mg",
      routes: ["IV"],
      doseCalc: { perKg: 1, basis: "IBW", roundTo: 1 },
    })
    expect(resolveDrugSelectionSurface({
      profile: ibwProfile,
      patient: { totalBodyWeightKg: 100 },
    })).toMatchObject({ dose: "", calculationUnavailableReason: "MISSING_IBW" })
  })

  it("preserves the adult v7.3.2 weight fallback when requested", () => {
    const ibwProfile = parseDoseProfile("Example", "bolus", {
      min: 0,
      max: 200,
      step: 1,
      unit: "mg",
      routes: ["IV"],
      doseCalc: { perKg: 1, basis: "IBW", roundTo: 1 },
    })
    expect(resolveDrugSelectionSurface({
      profile: ibwProfile,
      patient: { totalBodyWeightKg: 100 },
      allowWeightBasisFallback: true,
    })).toMatchObject({ dose: "100", calculation: { basis: "IBW", calculationWeight: 100 } })
  })

  it("parses canonical concentration values and units", () => {
    expect(canonicalConcentrationSelection("0.5%", "PERCENT")).toEqual({
      label: "0.5%",
      value: 0.5,
      unit: "PERCENT",
    })
  })
})
