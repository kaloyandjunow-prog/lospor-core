import { describe, expect, it } from "vitest"
import {
  applyAdultDoseProfilesToOptions,
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  isClinicalRuleHidden,
  visibleClinicalOptions,
} from "./option-overlays"
import type { AdultDoseProfileRule } from "./adult-profiles"
import type {
  PediatricDrugProfileRule,
  PediatricInfusionProfileRule,
} from "./pediatric-profiles"

/**
 * These overlays decide what a clinician is offered and whether the app will
 * calculate a dose for them, so the cases below are about what reaches the
 * screen rather than about internal shape.
 */

const option = (label: string, extra: Record<string, unknown> = {}) =>
  ({ label, metadata: { unit: "mg" }, ...extra })

const adultRule = (over: Partial<AdultDoseProfileRule> = {}): AdultDoseProfileRule => ({
  ruleKey: "adult.propofol",
  ruleVersion: "LOSPOR_ADULTS.v2",
  itemKey: "PROPOFOL",
  labelEn: "Propofol",
  labelBg: null,
  category: null,
  kind: "ADULT_DRUG_PROFILE",
  profile: { unit: "mg", routes: ["IV"] } as AdultDoseProfileRule["profile"],
  unit: null,
  routeUnits: {},
  availability: "AUTO",
  origin: "PLATFORM",
  presetId: "lospor-adults-v2",
  ...over,
})

const pedDrugRule = (over: Partial<PediatricDrugProfileRule> = {}): PediatricDrugProfileRule => ({
  ruleKey: "ped.propofol",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  medicationKey: "PROPOFOL",
  labelEn: "Propofol",
  labelBg: null,
  inn: null,
  category: null,
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 6570,
  availability: "AUTO",
  profile: { unit: "mg", routes: ["IV"] } as PediatricDrugProfileRule["profile"],
  unit: null,
  routeUnits: {},
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
})

const pedInfusionRule = (
  over: Partial<PediatricInfusionProfileRule> = {},
): PediatricInfusionProfileRule => ({
  ruleKey: "ped.inf.noradrenaline",
  ruleVersion: "LOSPOR_PEDIATRICS.v2",
  itemKey: "NORADRENALINE",
  labelEn: "Noradrenaline",
  labelBg: null,
  category: null,
  disposition: "AUTO",
  routeDispositions: {},
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 6570,
  minimumWeightKg: null,
  minimumWeightInclusive: true,
  maximumWeightKg: null,
  maximumWeightInclusive: false,
  routineSuggestion: false,
  advisory: null,
  profile: { unit: "mcg/kg/min", routes: ["IV"] } as PediatricInfusionProfileRule["profile"],
  unit: null,
  routeUnits: {},
  manualUnit: null,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "lospor-pediatrics-v2",
  ...over,
})

const infant = { value: 6, unit: "MONTHS" as const }

describe("applyAdultDoseProfilesToOptions", () => {
  it("merges the ruleset profile onto a matching option", () => {
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol")],
      [adultRule()],
      "ADULT_DRUG_PROFILE",
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.clinicalRuleAvailability).toBe("AUTO")
    expect(meta.routes).toEqual(["IV"])
    expect(meta.manualEntryOnly).toBe(false)
  })

  it("matches on the option value as well as the label, ignoring case and padding", () => {
    const results = applyAdultDoseProfilesToOptions(
      [{ label: "Диприван", value: "  propofol  ", metadata: {} }],
      [adultRule()],
      "ADULT_DRUG_PROFILE",
    )
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBe("AUTO")
  })

  it("leaves options with no matching rule untouched", () => {
    const input = [option("Ketamine")]
    const [result] = applyAdultDoseProfilesToOptions(input, [adultRule()], "ADULT_DRUG_PROFILE")
    expect(result).toBe(input[0])
  })

  it("ignores rules belonging to a different kind", () => {
    const input = [option("Propofol")]
    const [result] = applyAdultDoseProfilesToOptions(input, [adultRule()], "ADULT_FLUID_PROFILE")
    expect(result).toBe(input[0])
  })

  it("strips autofill for MANUAL, so the app never suggests a dose it was told not to", () => {
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol", { metadata: { doseCalc: { basis: "TBW" } } })],
      [adultRule({ availability: "MANUAL" })],
      "ADULT_DRUG_PROFILE",
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.doseCalc).toBeUndefined()
    expect(meta.doseCalcByRoute).toEqual({})
    expect(meta.manualEntryOnly).toBe(false)
  })

  it("marks LOCAL as manual entry only", () => {
    const [result] = applyAdultDoseProfilesToOptions(
      [option("Propofol")],
      [adultRule({ availability: "LOCAL" })],
      "ADULT_DRUG_PROFILE",
    )
    expect((result.metadata as Record<string, unknown>).manualEntryOnly).toBe(true)
  })

  it("removes a HIDDEN option from the list entirely", () => {
    // NOTE: this documents current behaviour, and it differs from the pediatric
    // overlays below, which mark a hidden option and keep it. Nothing exercises
    // this today -- no adult rule in either published ruleset is HIDDEN -- but
    // the asymmetry is deliberate to record rather than to leave undescribed.
    // See the pediatric "keeps hidden options in the list" case for why marking
    // is the safer of the two: a dropped option cannot be resolved for a drug
    // already recorded on a case.
    const results = applyAdultDoseProfilesToOptions(
      [option("Propofol"), option("Ketamine")],
      [adultRule({ availability: "HIDDEN" })],
      "ADULT_DRUG_PROFILE",
    )
    expect(results.map(r => r.label)).toEqual(["Ketamine"])
  })
})

describe("applyPediatricDrugProfilesToOptions", () => {
  it("keeps hidden options in the list and only marks them", () => {
    // The invariant that makes hiding safe. A hidden drug must still resolve
    // its unit, code and colour for a case where it was already given, and must
    // still be reachable by search so a clinician is never blocked from
    // documenting what they actually administered. Only the default picker is
    // trimmed, by visibleClinicalOptions.
    const results = applyPediatricDrugProfilesToOptions(
      [option("Propofol"), option("Ketamine")],
      [pedDrugRule({ availability: "HIDDEN" })],
      infant,
    )
    expect(results.map(r => r.label)).toEqual(["Propofol", "Ketamine"])
    expect(isClinicalRuleHidden(results[0])).toBe(true)
    expect(isClinicalRuleHidden(results[1])).toBe(false)
    expect(visibleClinicalOptions(results).map(r => r.label)).toEqual(["Ketamine"])
  })

  it("returns the options untouched when there is no patient age to band on", () => {
    const input = [option("Propofol")]
    const results = applyPediatricDrugProfilesToOptions(input, [pedDrugRule()], null)
    expect(results).toEqual(input)
  })

  it("does not apply a rule whose age band excludes the patient", () => {
    const results = applyPediatricDrugProfilesToOptions(
      [option("Propofol")],
      [pedDrugRule({ minimumAgeDays: 3650, maximumAgeDaysExclusive: 6570 })],
      infant,
    )
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBeUndefined()
  })
})

describe("applyPediatricInfusionProfilesToOptions", () => {
  it("marks a hidden infusion rather than dropping it", () => {
    const results = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline"), option("Adrenaline")],
      [pedInfusionRule({ disposition: "HIDDEN" })],
      infant,
    )
    expect(results).toHaveLength(2)
    expect(isClinicalRuleHidden(results[0])).toBe(true)
    expect(visibleClinicalOptions(results).map(r => r.label)).toEqual(["Adrenaline"])
  })

  it("strips autofill for MANUAL", () => {
    const [result] = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline", { metadata: { doseCalc: { basis: "TBW" } } })],
      [pedInfusionRule({ disposition: "MANUAL" })],
      infant,
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.doseCalc).toBeUndefined()
    expect(meta.clinicalRuleAvailability).toBe("MANUAL")
  })

  it("honours manualEntryOnly on the rule even when the disposition is AUTO", () => {
    const [result] = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline", { metadata: { doseCalc: { basis: "TBW" } } })],
      [pedInfusionRule({ manualEntryOnly: true })],
      infant,
    )
    const meta = result.metadata as Record<string, unknown>
    expect(meta.manualEntryOnly).toBe(true)
    expect(meta.doseCalc).toBeUndefined()
  })

  it("returns the options untouched when there is no patient age", () => {
    const input = [option("Noradrenaline")]
    expect(applyPediatricInfusionProfilesToOptions(input, [pedInfusionRule()], null)).toEqual(input)
  })

  it("does not apply an infusion rule whose weight band excludes the patient", () => {
    const results = applyPediatricInfusionProfilesToOptions(
      [option("Noradrenaline")],
      [pedInfusionRule({ minimumWeightKg: 20 })],
      infant,
      8,
    )
    expect((results[0].metadata as Record<string, unknown>).clinicalRuleAvailability).toBeUndefined()
  })
})
