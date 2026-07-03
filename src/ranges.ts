export type ClinicalRange = {
  min: number
  max: number
  step: number
  unit: string
  precision?: number
}

export const CLINICAL_RANGES = {
  AGE_RANGE:              { min: 0, max: 149, step: 1,   unit: "years" },
  HEIGHT_RANGE:           { min: 0, max: 250, step: 1,   unit: "cm" },
  WEIGHT_RANGE:           { min: 0, max: 250, step: 1,   unit: "kg" },
  BP_SYSTOLIC_RANGE:      { min: 1, max: 300, step: 1,   unit: "mmHg" },
  BP_DIASTOLIC_RANGE:     { min: 1, max: 200, step: 1,   unit: "mmHg" },
  HEART_RATE_RANGE:       { min: 1, max: 300, step: 1,   unit: "bpm" },
  SPO2_RANGE:             { min: 0, max: 100, step: 1,   unit: "%" },
  TEMPERATURE_RANGE:      { min: 0, max: 45,  step: 0.1, unit: "°C", precision: 1 },
  RESPIRATORY_RATE_RANGE: { min: 0, max: 50,  step: 1,   unit: "/min" },
  MOUTH_OPENING_RANGE:    { min: 0, max: 10,  step: 0.5, unit: "cm", precision: 1 },
  THYROMENTAL_RANGE:      { min: 0, max: 15,  step: 1,   unit: "cm" },
  ALDRETE_SUBSCORE_RANGE: { min: 0, max: 2,   step: 1,   unit: "" },
  PAIN_NRS_RANGE:         { min: 0, max: 10,  step: 1,   unit: "" },
} satisfies Record<string, ClinicalRange>

export type ClinicalRangeKey = keyof typeof CLINICAL_RANGES

export function isClinicalNumberFilled(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value)
}

export function validateClinicalNumber(key: ClinicalRangeKey, value: unknown): boolean {
  if (!isClinicalNumberFilled(value)) return false
  const range = CLINICAL_RANGES[key]
  const numericValue = value as number
  return numericValue >= range.min && numericValue <= range.max
}
