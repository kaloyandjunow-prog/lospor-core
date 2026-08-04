import type {
  DoseCalc,
  DoseProfile,
  LocalAnaestheticFormulation,
  RouteMode,
  WeightBasis,
} from "./catalog/dose-profile"
import {
  canonicalConcentrationUnit,
  canonicalizeDoseProfile,
  normalizeAdministrationRoute,
  type ConcentrationUnit,
} from "./clinical-rule-vocabulary"
import { roundToPracticalDose } from "./dose-rounding"

export type DrugSelectionPatientContext = {
  totalBodyWeightKg?: number | null
  idealBodyWeightKg?: number | null
  idealBodyWeightMethod?: string | null
  bodySurfaceAreaM2?: number | null
}

export type DrugDoseCalculationAudit = {
  basis: "FLAT" | Exclude<WeightBasis, "none">
  calculationWeight?: number
  calculationMethod?: string
}

export type CanonicalConcentrationSelection = {
  label: string
  value: number
  unit: ConcentrationUnit
}

export type DrugSelectionSurface = {
  route: string
  routes: string[]
  mode: RouteMode["mode"]
  min: number
  max: number
  step: number
  quickValues: number[]
  unit: string
  dose: string
  concentrationOptions: string[]
  concentration: string
  concentrationUnit?: string
  formulationOptions: LocalAnaestheticFormulation[]
  formulation?: LocalAnaestheticFormulation
  calculation?: DrugDoseCalculationAudit
  calculationUnavailableReason?:
    | "MISSING_TBW"
    | "MISSING_IBW"
    | "MISSING_BSA"
    | "NO_AUTOFILL"
}

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function activeRoute(profile: DoseProfile, requestedRoute?: string | null): string {
  const requested = requestedRoute ? normalizeAdministrationRoute(requestedRoute) : null
  if (requested && profile.routes.includes(requested)) return requested
  return profile.defaultRoute || profile.routes[0] || "IV"
}

function roundCalculatedDose(value: number, increment: number | undefined, mode: DoseProfile["rounding"]): number {
  // Snaps to the declared increment, or to a drawable one when the declared
  // increment is missing or finer than a clinician could measure. Adult profiles
  // declare sensible increments already (propofol 10 mg) and are unaffected;
  // this rescues the paediatric profiles, whose roundTo came from the UI step.
  return roundToPracticalDose(value, increment, mode)
}

function calculatedDose(input: {
  calculation?: DoseCalc
  profileBasis: WeightBasis
  rounding: DoseProfile["rounding"]
  patient: DrugSelectionPatientContext
  allowWeightBasisFallback: boolean
}): Pick<DrugSelectionSurface, "dose" | "calculation" | "calculationUnavailableReason"> {
  const calculation = input.calculation
  if (!calculation) return { dose: "", calculationUnavailableReason: "NO_AUTOFILL" }
  if (calculation.flat != null) {
    const amount = calculation.cap == null
      ? calculation.flat
      : Math.min(calculation.flat, calculation.cap)
    return { dose: String(roundCalculatedDose(amount, calculation.roundTo, input.rounding)), calculation: { basis: "FLAT" } }
  }

  const basis = calculation.basis
    ?? (input.profileBasis === "none" ? "IBW" : input.profileBasis)
  let scalar: number | null = null
  let unavailable: DrugSelectionSurface["calculationUnavailableReason"]
  if (basis === "TBW") {
    scalar = finitePositive(input.patient.totalBodyWeightKg)
      ? input.patient.totalBodyWeightKg
      : input.allowWeightBasisFallback && finitePositive(input.patient.idealBodyWeightKg)
        ? input.patient.idealBodyWeightKg
        : null
    unavailable = "MISSING_TBW"
  } else if (basis === "IBW") {
    scalar = finitePositive(input.patient.idealBodyWeightKg)
      ? input.patient.idealBodyWeightKg
      : input.allowWeightBasisFallback && finitePositive(input.patient.totalBodyWeightKg)
        ? input.patient.totalBodyWeightKg
        : null
    if (
      scalar != null
      && (calculation.capAtActualWeight ?? true)
      && finitePositive(input.patient.totalBodyWeightKg)
    ) {
      scalar = Math.min(scalar, input.patient.totalBodyWeightKg)
    }
    unavailable = "MISSING_IBW"
  } else {
    scalar = finitePositive(input.patient.bodySurfaceAreaM2) ? input.patient.bodySurfaceAreaM2 : null
    unavailable = "MISSING_BSA"
  }
  if (scalar == null) return { dose: "", calculationUnavailableReason: unavailable }

  const multiplier = basis === "BSA_M2" ? calculation.perM2 : calculation.perKg
  if (multiplier == null) return { dose: "", calculationUnavailableReason: "NO_AUTOFILL" }
  let amount = roundCalculatedDose(scalar * multiplier, calculation.roundTo, input.rounding)
  if (calculation.cap != null) amount = Math.min(amount, calculation.cap)
  return {
    dose: String(amount),
    calculation: {
      basis,
      calculationWeight: scalar,
      ...(basis === "IBW" && input.patient.idealBodyWeightMethod
        ? { calculationMethod: input.patient.idealBodyWeightMethod }
        : {}),
    },
  }
}

export function resolveDrugSelectionSurface(input: {
  profile: DoseProfile
  route?: string | null
  patient?: DrugSelectionPatientContext
  allowWeightBasisFallback?: boolean
}): DrugSelectionSurface {
  const profile = canonicalizeDoseProfile(input.profile)
  const route = activeRoute(profile, input.route)
  const routeProfile = profile.routeModes?.[route]
  const min = routeProfile?.min ?? profile.min ?? 0
  const max = routeProfile?.max ?? profile.max ?? Math.max(min + 1, 100)
  const step = routeProfile?.step ?? profile.step ?? profile.variableStep?.[0]?.step ?? 1
  const concentrationOptions = routeProfile?.concentrationOptions
    ?? profile.concentrationOptions
    ?? []
  const preferredConcentration = routeProfile?.defaultConcentration
    ?? routeProfile?.suggestedConcentration
    ?? profile.defaultConcentration
    ?? profile.suggestedConcentration
  const concentration = preferredConcentration && concentrationOptions.includes(preferredConcentration)
    ? preferredConcentration
    : concentrationOptions[0] ?? ""
  const formulationOptions = routeProfile?.formulationOptions
    ?? profile.formulationOptions
    ?? []
  const preferredFormulation = routeProfile?.defaultFormulation ?? profile.defaultFormulation
  const formulation = preferredFormulation && formulationOptions.includes(preferredFormulation)
    ? preferredFormulation
    : formulationOptions[0]
  const calculation = calculatedDose({
    calculation: routeProfile?.doseCalc ?? profile.doseCalcByRoute?.[route] ?? profile.doseCalc,
    profileBasis: routeProfile?.weightBasis ?? profile.weightBasis,
    rounding: profile.rounding,
    patient: input.patient ?? {},
    allowWeightBasisFallback: input.allowWeightBasisFallback ?? false,
  })
  return {
    route,
    routes: [...profile.routes],
    mode: routeProfile?.mode ?? profile.mode,
    min,
    max,
    step,
    quickValues: [...(routeProfile?.quickValues ?? profile.quickValues)],
    unit: routeProfile?.unit ?? profile.unit ?? "mg",
    ...calculation,
    concentrationOptions: [...concentrationOptions],
    concentration,
    concentrationUnit: routeProfile?.concentrationUnit ?? profile.concentrationUnit,
    formulationOptions: [...formulationOptions],
    formulation,
  }
}

export function canonicalConcentrationSelection(
  label: string | null | undefined,
  explicitUnit?: string | null,
): CanonicalConcentrationSelection | null {
  const normalized = label?.trim()
  if (!normalized) return null
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*(%|mcg\/mL|mg\/mL|IU\/mL|mmol\/mL|mEq\/mL)$/i)
  if (!match) return null
  const value = Number(match[1])
  const unit = canonicalConcentrationUnit(explicitUnit ?? match[2] ?? "")
  if (!Number.isFinite(value) || value <= 0 || !unit) return null
  return { label: normalized, value, unit: unit.kind }
}
