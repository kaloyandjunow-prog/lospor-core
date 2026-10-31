/**
 * Intraoperative automation settings (10.1.0): what a hospital has switched
 * on in Status. Everything new starts off, and anything missing or unreadable
 * reads as off -- the public demo has no Status, so it never turns anything on.
 *
 * Only presentation of questions: no case records these settings, and turning
 * a switch off never changes what was already charted.
 */

export const VITAL_BAND_KEYS = [
  "NEWBORN", "INFANT", "TODDLER", "PRESCHOOL", "SCHOOL", "ADOLESCENT", "ADULT", "OLDER",
] as const
export type VitalBandKey = typeof VITAL_BAND_KEYS[number]

export const VITAL_SIGN_KEYS = ["hr", "sbp", "dbp", "map"] as const
export type VitalSignKey = typeof VITAL_SIGN_KEYS[number]

/** The share of a band's readings counted as unusual at one end, in percent. */
export const VITAL_TAIL_STEPS = [0.1, 0.25, 0.5, 1, 2, 2.5, 5] as const
export const DEFAULT_VITAL_TAIL = 0.5

export const DEFAULT_VITAL_MIN_CASES = 100
export const MIN_VITAL_MIN_CASES = 20
export const MAX_VITAL_MIN_CASES = 10_000

export type VitalTail = { low: number; high: number }
export type VitalTails = Record<VitalBandKey, Record<VitalSignKey, VitalTail>>

export type IntraopAutomationSettings = {
  /** The master switch: off = no questions and no automatic logging anywhere. */
  enabled: boolean
  vitalQuestions: {
    enabled: boolean
    /** Cases a band needs before its statistics are used; until then only the fixed rules ask. */
    minCases: number
    tails: VitalTails
  }
}

function defaultTails(): VitalTails {
  return Object.fromEntries(VITAL_BAND_KEYS.map(band => [
    band,
    Object.fromEntries(VITAL_SIGN_KEYS.map(sign => [sign, { low: DEFAULT_VITAL_TAIL, high: DEFAULT_VITAL_TAIL }])),
  ])) as VitalTails
}

export const DEFAULT_INTRAOP_AUTOMATION: IntraopAutomationSettings = Object.freeze({
  enabled: false,
  vitalQuestions: { enabled: false, minCases: DEFAULT_VITAL_MIN_CASES, tails: defaultTails() },
}) as IntraopAutomationSettings

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** A tail is one of the steps the Status slider offers; anything else is the default. */
function tail(value: unknown): number {
  return typeof value === "number" && (VITAL_TAIL_STEPS as readonly number[]).includes(value) ? value : DEFAULT_VITAL_TAIL
}

/** The stored settings in full; anything absent, malformed or out of range takes its default. */
export function parseIntraopAutomation(value: unknown): IntraopAutomationSettings {
  const input = record(value)
  const vitals = record(input.vitalQuestions)
  const minCases = vitals.minCases
  const tailsInput = record(vitals.tails)
  return {
    enabled: input.enabled === true,
    vitalQuestions: {
      enabled: vitals.enabled === true,
      minCases: typeof minCases === "number" && Number.isInteger(minCases)
        && minCases >= MIN_VITAL_MIN_CASES && minCases <= MAX_VITAL_MIN_CASES
        ? minCases
        : DEFAULT_VITAL_MIN_CASES,
      tails: Object.fromEntries(VITAL_BAND_KEYS.map(band => {
        const signs = record(tailsInput[band])
        return [band, Object.fromEntries(VITAL_SIGN_KEYS.map(sign => {
          const pair = record(signs[sign])
          return [sign, { low: tail(pair.low), high: tail(pair.high) }]
        }))]
      })) as VitalTails,
    },
  }
}

/** Whether the vitals questions run: the master switch and the feature switch both on. */
export function vitalQuestionsEnabled(settings: IntraopAutomationSettings | null | undefined): boolean {
  return !!settings?.enabled && !!settings.vitalQuestions.enabled
}
