import { describe, expect, it } from "vitest"
import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  DEFAULT_CLINICAL_PREFERENCES,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
} from "./clinical-preferences"
import {
  AUTOMATION_GROUPS,
  automationGroupEnabled,
  DEFAULT_INTRAOP_AUTOMATION,
  parseIntraopAutomation,
  vitalQuestionsEnabled,
} from "./intraop-automation"

describe("automation groups (10.2.0)", () => {
  it("start off, with a 20 mg dantrolene vial", () => {
    for (const group of AUTOMATION_GROUPS) expect(DEFAULT_INTRAOP_AUTOMATION.groups[group]).toBe(false)
    expect(DEFAULT_INTRAOP_AUTOMATION.dantroleneVialMg).toBe(20)
    // Anything missing or unreadable reads as off: the public demo has no Status.
    expect(parseIntraopAutomation(null).groups.treatmentSuggestions).toBe(false)
    expect(parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: "yes" } }).groups.treatmentSuggestions).toBe(false)
  })

  it("read each group the hospital switched on, and only the vial sizes on offer", () => {
    const settings = parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true, timers: true }, dantroleneVialMg: 250 })
    expect(settings.groups).toMatchObject({ treatmentSuggestions: true, timers: true, labQuestions: false })
    expect(settings.dantroleneVialMg).toBe(250)
    expect(parseIntraopAutomation({ dantroleneVialMg: 30 }).dantroleneVialMg).toBe(20)
  })

  it("run only when the master switch and the group are on, and the clinician has not turned it off", () => {
    const settings = parseIntraopAutomation({ enabled: true, groups: { reverseQuestions: true } })
    expect(automationGroupEnabled(settings, "reverseQuestions")).toBe(true)
    expect(automationGroupEnabled(settings, "reverseQuestions", {})).toBe(true)
    expect(automationGroupEnabled(settings, "reverseQuestions", { reverseQuestions: false })).toBe(false)
    // A clinician cannot turn on what the hospital has off.
    expect(automationGroupEnabled(settings, "labQuestions", { labQuestions: true })).toBe(false)
    // The master switch off silences every group.
    expect(automationGroupEnabled({ ...settings, enabled: false }, "reverseQuestions")).toBe(false)
    expect(automationGroupEnabled(null, "reverseQuestions")).toBe(false)
  })

  it("let a clinician turn the 10.1.0 vitals questions off for themselves too", () => {
    const settings = parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } })
    expect(vitalQuestionsEnabled(settings)).toBe(true)
    expect(vitalQuestionsEnabled(settings, { vitalQuestions: false })).toBe(false)
  })
})

describe("clinician automation switches and knob skin (10.2.0)", () => {
  it("default to everything on and knob A", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.automationGroups).toEqual({})
    expect(DEFAULT_CLINICAL_PREFERENCES.energyKnobSkin).toBe("A")
    expect(normalizeClinicalPreferences({}).energyKnobSkin).toBe("A")
  })

  it("keep only the groups switched off", () => {
    const preferences = normalizeClinicalPreferences({ automationGroups: { timers: false, reminders: true, unknown: false } })
    expect(preferences.automationGroups).toEqual({ timers: false })
  })

  it("turn a group back on through a patch", () => {
    const off = applyClinicalPreferencesPatch({}, { automationGroups: { timers: false, labQuestions: false } })
    expect(off.automationGroups).toEqual({ timers: false, labQuestions: false })
    const back = applyClinicalPreferencesPatch(off, { automationGroups: { timers: true } })
    expect(back.automationGroups).toEqual({ labQuestions: false })
  })

  it("accepts only the three knob skins", () => {
    expect(normalizeClinicalPreferences({ energyKnobSkin: "C" }).energyKnobSkin).toBe("C")
    expect(normalizeClinicalPreferences({ energyKnobSkin: "D" }).energyKnobSkin).toBe("A")
  })

  it("lets the server win over the device and combines patches in order", () => {
    const merged = mergeClinicalPreferences({ energyKnobSkin: "B", automationGroups: { timers: false } }, { energyKnobSkin: "C", automationGroups: { labQuestions: false } })
    expect(merged.energyKnobSkin).toBe("B")
    expect(merged.automationGroups).toEqual({ timers: false, labQuestions: false })
    expect(combineClinicalPreferencesPatches({ energyKnobSkin: "B" }, { energyKnobSkin: "C", automationGroups: { reminders: false } }))
      .toEqual({ energyKnobSkin: "C", automationGroups: { reminders: false } })
  })
})
