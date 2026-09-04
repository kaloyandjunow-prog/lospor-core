import { cmH2OToMmHg, mmHgToCmH2O } from "./units"

/**
 * Numeric values for the monitors that carry one.
 *
 * The monitoring checklist answers "was it used". These three answer "what did
 * it read", which is the half a register can pool: a case whose BIS sat at 55
 * throughout and one that dropped to 22 for twenty minutes are the same case to
 * a yes/no flag, and so are a train-of-four of 0.9 and one of 0.4 at
 * extubation.
 *
 * Each value is bound to its modality flag. A value exists only while its
 * monitor is selected, which is why unselecting one clears it rather than
 * leaving an orphaned number nobody can interpret.
 */

export type CvpUnit = "cmH2O" | "mmHg"

/**
 * A tenth is one decimal place, and floating point does not give it for free:
 * 3.2 converted to cmH2O and back is not 3.2. Rounding at every boundary keeps
 * a value that is typed, shown, and converted back from drifting a digit at a
 * time.
 */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Storage is always mmHg, whatever the clinician typed.
 *
 * Two anaesthetists charting the same patient must produce the same stored
 * number, and a column whose unit follows a per-user display preference cannot
 * be pooled at all -- a mean CVP over a thousand cases would be an average of
 * two different quantities. cmH2O is the entry default because it is what the
 * transducers in this setting are usually scaled in.
 */
export function cvpToDisplay(mmHg: number, unit: CvpUnit): number {
  return round1(unit === "cmH2O" ? mmHgToCmH2O(mmHg) : mmHg)
}

export function cvpToCanonical(displayValue: number, unit: CvpUnit): number {
  return round1(unit === "cmH2O" ? cmH2OToMmHg(displayValue) : displayValue)
}

/** The canonical range, in mmHg. Every displayed range is derived from it. */
export const CVP_MIN_MMHG = 0.1
export const CVP_MAX_MMHG = 50

/** BIS is a dimensionless index and is read off as a whole number. */
export const BIS_MIN = 0
export const BIS_MAX = 100
export const BIS_STEP = 1

/**
 * The ratio, not the count. They are different measurements -- 0.9 and 4 both
 * mean "adequately reversed" but are not the same number, and one field taking
 * either would produce a column nobody could interpret. The count has its own
 * standard concept if it is ever added beside this.
 */
export const TOF_RATIO_MIN = 0
export const TOF_RATIO_MAX = 1
export const TOF_RATIO_STEP = 0.1

/**
 * The step coarsens above 10 mmHg because that is where the clinical question
 * changes. Below it a tenth separates a filled patient from an underfilled one
 * and is worth having; above it the number is already abnormal and tenths are
 * false precision.
 *
 * The threshold is expressed in whatever unit is on screen, so the granularity
 * a clinician gets does not depend on which unit they chose.
 */
export function cvpStep(displayValue: number, unit: CvpUnit): number {
  const threshold = unit === "cmH2O" ? mmHgToCmH2O(10) : 10
  return displayValue < threshold ? 0.1 : 0.5
}

/** The range as the entry control should show it, in the chosen unit. */
export function cvpDisplayRange(unit: CvpUnit): { min: number; max: number } {
  return {
    min: cvpToDisplay(CVP_MIN_MMHG, unit),
    max: cvpToDisplay(CVP_MAX_MMHG, unit),
  }
}

/**
 * Which monitoring flag governs which value.
 *
 * Exported so every surface -- both clients, the update route, the export --
 * agrees on the binding rather than each restating it. A fourth value is one
 * row here.
 */
export const MONITORING_VALUE_FIELDS = [
  { flag: "bis", value: "bisValue" },
  { flag: "tofMonitor", value: "tofRatio" },
  { flag: "cvpMonitor", value: "cvpMmHg" },
] as const

export type MonitoringValueField = typeof MONITORING_VALUE_FIELDS[number]

/**
 * Clear any value whose monitor is no longer selected.
 *
 * Unticking BIS and leaving a stored 42 behind would export a reading from a
 * monitor the same record says was not used. That contradiction is worse than
 * either statement alone, so the value goes when the flag does. Returns only
 * the fields needing a clear, so a caller can fold them into the patch it was
 * already sending.
 */
export function clearedMonitoringValues(
  flags: Readonly<Record<string, unknown>>,
): Record<string, null> {
  const cleared: Record<string, null> = {}
  for (const { flag, value } of MONITORING_VALUE_FIELDS) {
    if (!flags[flag]) cleared[value] = null
  }
  return cleared
}
