import { describe, expect, it } from "vitest"

import {
  BIS_MAX,
  BIS_MIN,
  CVP_MAX_MMHG,
  CVP_MIN_MMHG,
  cvpDisplayRange,
  cvpStep,
  cvpToCanonical,
  cvpToDisplay,
  mayCommitVitalDefault,
  MONITORING_VITAL_ROWS,
  TOF_RATIO_MAX,
  TOF_RATIO_MIN,
} from "./monitoring-values"

describe("CVP is stored in mmHg whatever the clinician typed", () => {
  it("converts a cmH2O reading to mmHg", () => {
    // 10 cmH2O is a little over 7 mmHg. A transducer scaled in cmH2O and one
    // scaled in mmHg watching the same patient must land on the same number.
    expect(cvpToCanonical(10, "cmH2O")).toBe(7.4)
    expect(cvpToCanonical(7.4, "mmHg")).toBe(7.4)
  })

  it("shows a stored mmHg value in whichever unit is chosen", () => {
    expect(cvpToDisplay(7.4, "mmHg")).toBe(7.4)
    expect(cvpToDisplay(7.4, "cmH2O")).toBe(10.1)
  })

  /**
   * The failure this guards against is silent and cumulative: a value typed,
   * shown back, and saved again drifts a digit at a time until the number in
   * the record is not the number the anaesthetist read off the monitor.
   */
  it("does not drift when a value is shown and re-entered", () => {
    for (const typed of [0.1, 3.2, 7.5, 10, 12.4, 33.3, 50]) {
      const stored = cvpToCanonical(typed, "cmH2O")
      const shown = cvpToDisplay(stored, "cmH2O")
      const restored = cvpToCanonical(shown, "cmH2O")
      expect(Math.abs(restored - stored), `${typed} cmH2O drifted`).toBeLessThanOrEqual(0.1)
    }
  })

  it("states its range in the unit on screen", () => {
    expect(cvpDisplayRange("mmHg")).toEqual({ min: CVP_MIN_MMHG, max: CVP_MAX_MMHG })
    // The same clinical range, read off a differently scaled transducer.
    expect(cvpDisplayRange("cmH2O")).toEqual({ min: 0.1, max: 68 })
  })
})

describe("the CVP step follows the clinical question, not the unit", () => {
  it("uses tenths below 10 mmHg and halves above it", () => {
    expect(cvpStep(4, "mmHg")).toBe(0.1)
    expect(cvpStep(9.9, "mmHg")).toBe(0.1)
    expect(cvpStep(10, "mmHg")).toBe(0.5)
    expect(cvpStep(40, "mmHg")).toBe(0.5)
  })

  it("moves the threshold with the unit, so granularity does not depend on it", () => {
    // 10 mmHg is 13.6 cmH2O. A clinician working in cmH2O must get the fine
    // step over the same clinical range, not over the same printed number.
    expect(cvpStep(13.5, "cmH2O")).toBe(0.1)
    expect(cvpStep(13.6, "cmH2O")).toBe(0.5)
  })
})

describe("the flag-to-row binding is stated once", () => {
  it("binds each vital row to the monitoring column that reveals it", () => {
    expect(MONITORING_VITAL_ROWS.map(r => `${r.flag}->${r.vital}`)).toEqual([
      "cvpMonitor->cvp",
      "bis->bis",
      "tofMonitor->tofRatio",
    ])
  })

  it("keeps BIS and TOF ratio on their reported scales", () => {
    // BIS is an index over 0-100; the train-of-four ratio is a fraction. A form
    // that let either wander off its scale would produce an uninterpretable
    // column, which is the whole reason the ratio and the count stay separate.
    expect([BIS_MIN, BIS_MAX]).toEqual([0, 100])
    expect([TOF_RATIO_MIN, TOF_RATIO_MAX]).toEqual([0, 1])
  })
})

describe("a dismissed stepper cannot invent a monitor reading", () => {
  it("refuses a population default when nothing was charted earlier", () => {
    for (const vital of ["bis", "tofRatio", "cvp"]) {
      expect(mayCommitVitalDefault(vital, false), `${vital} was fabricated`).toBe(false)
    }
  })

  it("still carries a previous reading forward", () => {
    // The workflow this must not break: a BIS charted at 09:40 and unchanged at
    // 09:45 is entered by opening the cell and dismissing it.
    for (const vital of ["bis", "tofRatio", "cvp"]) {
      expect(mayCommitVitalDefault(vital, true)).toBe(true)
    }
  })

  it("leaves the older vitals as they were", () => {
    // Changing seven established behaviours is a separate decision from fixing
    // three new ones.
    for (const vital of ["systolic", "heartRate", "spO2", "etco2", "temp", "bgl"]) {
      expect(mayCommitVitalDefault(vital, false)).toBe(true)
    }
  })
})
