import {
  CDC_CHILD_MEDIAN_STATURE_CM,
  CDC_CHILD_MEDIAN_WEIGHT_KG,
  CDC_GROWTH_REFERENCE_VERSION,
  CDC_INFANT_MEDIAN_LENGTH_CM,
  CDC_INFANT_MEDIAN_WEIGHT_KG,
  type CdcMedianReferencePoint,
  type CdcSex,
} from "./cdc-growth-reference"
import {
  normalizePediatricAge,
  type ClinicalMode,
  type PediatricAgeInput,
} from "./pediatric"

export const DEVINE_IBW_VERSION = "DEVINE_1974" as const
export const MCLAREN_IBW_VERSION = "MCLAREN_CDC_2000" as const

export type IdealBodyWeightMethod =
  | typeof DEVINE_IBW_VERSION
  | typeof MCLAREN_IBW_VERSION

export type IdealBodyWeightUnavailableReason =
  | "MISSING_HEIGHT"
  | "INVALID_HEIGHT"
  | "MISSING_AGE"
  | "INVALID_AGE"
  | "UNSUPPORTED_SEX"
  | "OUTSIDE_REFERENCE_HEIGHT"
  | "PRETERM_REFERENCE_REQUIRED"

export type IdealBodyWeightResolution =
  | {
      available: true
      kilograms: number
      roundedKg: number
      method: IdealBodyWeightMethod
      methodVersion: string
      sourceIds: string[]
      referenceMeasurement: "STATURE" | "LENGTH"
      referenceAgeMonths?: number
    }
  | {
      available: false
      reason: IdealBodyWeightUnavailableReason
      method: IdealBodyWeightMethod
      methodVersion: string
      sourceIds: string[]
    }

function cdcSex(value: string | null | undefined): CdcSex | null {
  const normalized = value?.trim().toUpperCase()
  if (normalized === "MALE" || normalized === "M") return "MALE"
  if (normalized === "FEMALE" || normalized === "F") return "FEMALE"
  return null
}

function roundedKg(value: number): number {
  return Math.round(value * 10) / 10
}

function unavailable(
  method: IdealBodyWeightMethod,
  reason: IdealBodyWeightUnavailableReason,
): IdealBodyWeightResolution {
  return {
    available: false,
    reason,
    method,
    methodVersion: method === DEVINE_IBW_VERSION
      ? DEVINE_IBW_VERSION
      : CDC_GROWTH_REFERENCE_VERSION,
    sourceIds: method === DEVINE_IBW_VERSION
      ? [DEVINE_IBW_VERSION]
      : ["MCLAREN_IBW_1972", "CDC_GROWTH_CHARTS_2000"],
  }
}

export function calculateDevineIdealBodyWeight(input: {
  heightCm?: number | null
  sex?: string | null
}): IdealBodyWeightResolution {
  if (input.heightCm == null) return unavailable(DEVINE_IBW_VERSION, "MISSING_HEIGHT")
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    return unavailable(DEVINE_IBW_VERSION, "INVALID_HEIGHT")
  }
  const sex = cdcSex(input.sex)
  if (!sex) return unavailable(DEVINE_IBW_VERSION, "UNSUPPORTED_SEX")
  const inches = input.heightCm / 2.54
  const kilograms = Math.max(0, (sex === "FEMALE" ? 45.5 : 50) + 2.3 * (inches - 60))
  return {
    available: true,
    kilograms,
    roundedKg: roundedKg(kilograms),
    method: DEVINE_IBW_VERSION,
    methodVersion: DEVINE_IBW_VERSION,
    sourceIds: [DEVINE_IBW_VERSION],
    referenceMeasurement: "STATURE",
  }
}

function interpolateAgeForMeasurement(
  measurement: number,
  reference: readonly CdcMedianReferencePoint[],
): number | null {
  const first = reference[0]
  const last = reference[reference.length - 1]
  if (!first || !last || measurement < first[1] || measurement > last[1]) return null
  for (let index = 0; index < reference.length; index += 1) {
    const current = reference[index]
    if (!current) continue
    if (measurement === current[1]) return current[0]
    const next = reference[index + 1]
    if (!next || measurement > next[1]) continue
    const span = next[1] - current[1]
    if (span <= 0) return current[0]
    return current[0] + (measurement - current[1]) / span * (next[0] - current[0])
  }
  return null
}

function interpolateMedianAtAge(
  ageMonths: number,
  reference: readonly CdcMedianReferencePoint[],
): number | null {
  const first = reference[0]
  const last = reference[reference.length - 1]
  if (!first || !last || ageMonths < first[0] || ageMonths > last[0]) return null
  for (let index = 0; index < reference.length; index += 1) {
    const current = reference[index]
    if (!current) continue
    if (ageMonths === current[0]) return current[1]
    const next = reference[index + 1]
    if (!next || ageMonths > next[0]) continue
    const span = next[0] - current[0]
    if (span <= 0) return current[1]
    return current[1] + (ageMonths - current[0]) / span * (next[1] - current[1])
  }
  return null
}

export function calculateMcLarenIdealBodyWeight(input: {
  heightCm?: number | null
  sex?: string | null
  age?: PediatricAgeInput | null
  preterm?: boolean | null
}): IdealBodyWeightResolution {
  if (input.heightCm == null) return unavailable(MCLAREN_IBW_VERSION, "MISSING_HEIGHT")
  if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    return unavailable(MCLAREN_IBW_VERSION, "INVALID_HEIGHT")
  }
  if (!input.age) return unavailable(MCLAREN_IBW_VERSION, "MISSING_AGE")
  const age = normalizePediatricAge(input.age)
  if (!age) return unavailable(MCLAREN_IBW_VERSION, "INVALID_AGE")
  if (input.preterm === true) {
    return unavailable(MCLAREN_IBW_VERSION, "PRETERM_REFERENCE_REQUIRED")
  }
  const sex = cdcSex(input.sex)
  if (!sex) return unavailable(MCLAREN_IBW_VERSION, "UNSUPPORTED_SEX")

  const infant = age.approximateMonths < 24
  const heightReference = infant
    ? CDC_INFANT_MEDIAN_LENGTH_CM[sex]
    : CDC_CHILD_MEDIAN_STATURE_CM[sex]
  const weightReference = infant
    ? CDC_INFANT_MEDIAN_WEIGHT_KG[sex]
    : CDC_CHILD_MEDIAN_WEIGHT_KG[sex]
  const referenceAgeMonths = interpolateAgeForMeasurement(input.heightCm, heightReference)
  if (referenceAgeMonths == null) {
    return unavailable(MCLAREN_IBW_VERSION, "OUTSIDE_REFERENCE_HEIGHT")
  }
  const kilograms = interpolateMedianAtAge(referenceAgeMonths, weightReference)
  if (kilograms == null) {
    return unavailable(MCLAREN_IBW_VERSION, "OUTSIDE_REFERENCE_HEIGHT")
  }
  return {
    available: true,
    kilograms,
    roundedKg: roundedKg(kilograms),
    method: MCLAREN_IBW_VERSION,
    methodVersion: CDC_GROWTH_REFERENCE_VERSION,
    sourceIds: ["MCLAREN_IBW_1972", "CDC_GROWTH_CHARTS_2000"],
    referenceMeasurement: infant ? "LENGTH" : "STATURE",
    referenceAgeMonths,
  }
}

export function resolveIdealBodyWeight(input: {
  clinicalMode: ClinicalMode
  heightCm?: number | null
  sex?: string | null
  age?: PediatricAgeInput | null
  preterm?: boolean | null
}): IdealBodyWeightResolution {
  return input.clinicalMode === "PEDIATRIC"
    ? calculateMcLarenIdealBodyWeight(input)
    : calculateDevineIdealBodyWeight(input)
}
