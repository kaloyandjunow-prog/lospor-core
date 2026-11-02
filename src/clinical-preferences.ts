import {
  normalizeAutoFillVitalsPreferences,
  type AutoFillVitalsPreferences,
} from "./intraop-vitals"
import {
  BULGARIAN_NAME_SWITCH_KEYS,
  NO_BULGARIAN_NAMES,
  type BulgarianNameSwitches,
} from "./display/bulgarian-names"
import { USER_AUTOMATION_SWITCHES, type UserAutomationSwitches } from "./intraop-automation"

export const CLINICAL_PREFERENCES_VERSION = 1
export const MAX_INTRAOP_FAVOURITES = 8

export type ClinicalUnits = {
  height: "cm" | "in"
  weight: "kg" | "lb"
  temperature: "C" | "F"
  etco2: "mmHg" | "kPa"
  /**
   * Entry unit for central venous pressure. Display only -- the value is
   * always stored and exported in mmHg, so changing this re-renders existing
   * cases rather than altering them.
   */
  cvp: "cmH2O" | "mmHg"
}

export type DefaultMonitoring = "standard" | "advanced"

/** The three designs of the shock energy knob (10.2.0, Settings → UI). */
export const ENERGY_KNOB_SKINS = ["A", "B", "C"] as const
export type EnergyKnobSkin = typeof ENERGY_KNOB_SKINS[number]

/** The Airway tab a clinician sees: Smart selection or the tab as it was (10.2.0). */
export type AirwayScreen = "smart" | "legacy"

/** The Vascular access tab a clinician sees: Smart selection or the tab as it was (10.2.0). */
export type VascularScreen = "smart" | "legacy"

export type ClinicalPreferences = {
  clinicalPreferencesVersion: typeof CLINICAL_PREFERENCES_VERSION
  units: ClinicalUnits
  defaultMonitoring: DefaultMonitoring
  autoFillVitals: AutoFillVitalsPreferences
  intraopFavouriteDrugs: string[]
  intraopFavouriteInfusions: string[]
  /** Which catalogues a Bulgarian reader sees in Bulgarian (Settings → UI). Display only. */
  bulgarianNames: BulgarianNameSwitches
  /**
   * After a yes to a question from the vitals, keep logging the complication
   * while the readings stay out of range (10.1.0). Off: every out-of-range
   * reading asks again. On by default.
   */
  vitalEpisodeAutoLog: boolean
  /**
   * The automation groups this clinician turned off for themselves (10.2.0).
   * Only false is stored: a group the hospital has on runs unless switched off
   * here, and one the hospital has off never runs.
   */
  automationGroups: UserAutomationSwitches
  /** The shock energy knob design this clinician picked (10.2.0): A defibrillator knob, B metal knob, C selector. */
  energyKnobSkin: EnergyKnobSkin
  /**
   * Which Airway tab this clinician sees (10.2.0): "smart" opens on what is in
   * place and adds a device in one panel; "legacy" is the tab as it was.
   */
  airwayScreen: AirwayScreen
  /** Which Vascular access tab this clinician sees (10.2.0): "smart" opens on what is in place; "legacy" is the tab as it was. */
  vascularScreen: VascularScreen
}

export type ClinicalPreferencesPatch = {
  clinicalPreferencesVersion?: number
  units?: Partial<ClinicalUnits>
  defaultMonitoring?: DefaultMonitoring
  autoFillVitals?: Partial<AutoFillVitalsPreferences>
  intraopFavouriteDrugs?: string[]
  intraopFavouriteInfusions?: string[]
  bulgarianNames?: Partial<BulgarianNameSwitches>
  vitalEpisodeAutoLog?: boolean
  automationGroups?: UserAutomationSwitches
  energyKnobSkin?: EnergyKnobSkin
  airwayScreen?: AirwayScreen
  vascularScreen?: VascularScreen
}

export const DEFAULT_CLINICAL_PREFERENCES: ClinicalPreferences = {
  clinicalPreferencesVersion: CLINICAL_PREFERENCES_VERSION,
  units: {
    height: "cm",
    weight: "kg",
    temperature: "C",
    etco2: "mmHg",
    // cmH2O by default: it is what the transducers in this setting are scaled
    // in, so it is what a clinician reads off the monitor.
    cvp: "cmH2O",
  },
  defaultMonitoring: "standard",
  autoFillVitals: normalizeAutoFillVitalsPreferences({}),
  intraopFavouriteDrugs: [],
  intraopFavouriteInfusions: [],
  bulgarianNames: { ...NO_BULGARIAN_NAMES },
  vitalEpisodeAutoLog: true,
  automationGroups: {},
  energyKnobSkin: "A",
  airwayScreen: "smart",
  vascularScreen: "smart",
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function favourites(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean),
  )].slice(0, MAX_INTRAOP_FAVOURITES)
}

export function parseClinicalPreferencesPatch(value: unknown): ClinicalPreferencesPatch {
  const input = record(value)
  const unitsInput = record(input.units)
  const autoFillInput = record(input.autoFillVitals)
  const patch: ClinicalPreferencesPatch = {}
  const units: Partial<ClinicalUnits> = {}

  const height = unitsInput.height ?? input.heightUnit
  if (height === "cm" || height === "in") units.height = height
  const weight = unitsInput.weight ?? input.weightUnit
  if (weight === "kg" || weight === "lb") units.weight = weight
  const temperature = unitsInput.temperature ?? input.temperatureUnit
  if (temperature === "C" || temperature === "F") units.temperature = temperature
  const etco2 = unitsInput.etco2 ?? input.etco2Unit
  if (etco2 === "mmHg" || etco2 === "kPa") units.etco2 = etco2
  const cvp = unitsInput.cvp ?? input.cvpUnit
  if (cvp === "cmH2O" || cvp === "mmHg") units.cvp = cvp
  if (Object.keys(units).length) patch.units = units

  const monitoring = input.defaultMonitoring
  if (monitoring === "standard" || monitoring === "advanced") {
    patch.defaultMonitoring = monitoring
  }

  const enabled = autoFillInput.enabled ?? input.autoFillVitals
  const includeBloodPressure = autoFillInput.includeBloodPressure ?? input.autoFillBP
  const backfillOnReopen = autoFillInput.backfillOnReopen ?? input.autoFillBackground ?? input.autoFillBg
  if (
    typeof enabled === "boolean"
    || typeof includeBloodPressure === "boolean"
    || typeof backfillOnReopen === "boolean"
  ) {
    patch.autoFillVitals = {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(typeof includeBloodPressure === "boolean" ? { includeBloodPressure } : {}),
      ...(typeof backfillOnReopen === "boolean" ? { backfillOnReopen } : {}),
    }
  }

  const drugs = favourites(input.intraopFavouriteDrugs)
  if (drugs) patch.intraopFavouriteDrugs = drugs
  const infusions = favourites(input.intraopFavouriteInfusions)
  if (infusions) patch.intraopFavouriteInfusions = infusions

  const namesInput = record(input.bulgarianNames)
  const names: Partial<BulgarianNameSwitches> = {}
  for (const key of BULGARIAN_NAME_SWITCH_KEYS) {
    if (typeof namesInput[key] === "boolean") names[key] = namesInput[key]
  }
  if (Object.keys(names).length) patch.bulgarianNames = names
  if (typeof input.vitalEpisodeAutoLog === "boolean") patch.vitalEpisodeAutoLog = input.vitalEpisodeAutoLog
  const groupsInput = record(input.automationGroups)
  const groups: UserAutomationSwitches = {}
  for (const key of USER_AUTOMATION_SWITCHES) {
    if (typeof groupsInput[key] === "boolean") groups[key] = groupsInput[key]
  }
  if (Object.keys(groups).length) patch.automationGroups = groups
  const skin = input.energyKnobSkin
  if (skin === "A" || skin === "B" || skin === "C") patch.energyKnobSkin = skin
  if (input.airwayScreen === "smart" || input.airwayScreen === "legacy") patch.airwayScreen = input.airwayScreen
  if (input.vascularScreen === "smart" || input.vascularScreen === "legacy") patch.vascularScreen = input.vascularScreen
  return patch
}

export function normalizeClinicalPreferences(value: unknown): ClinicalPreferences {
  const patch = parseClinicalPreferencesPatch(value)
  return {
    clinicalPreferencesVersion: CLINICAL_PREFERENCES_VERSION,
    units: { ...DEFAULT_CLINICAL_PREFERENCES.units, ...patch.units },
    defaultMonitoring: patch.defaultMonitoring ?? DEFAULT_CLINICAL_PREFERENCES.defaultMonitoring,
    autoFillVitals: normalizeAutoFillVitalsPreferences({
      ...DEFAULT_CLINICAL_PREFERENCES.autoFillVitals,
      ...patch.autoFillVitals,
    }),
    intraopFavouriteDrugs: patch.intraopFavouriteDrugs ?? [],
    intraopFavouriteInfusions: patch.intraopFavouriteInfusions ?? [],
    bulgarianNames: { ...NO_BULGARIAN_NAMES, ...patch.bulgarianNames },
    vitalEpisodeAutoLog: patch.vitalEpisodeAutoLog ?? DEFAULT_CLINICAL_PREFERENCES.vitalEpisodeAutoLog,
    // Only the groups switched off are kept; on is the default and needs no entry.
    automationGroups: Object.fromEntries(Object.entries(patch.automationGroups ?? {}).filter(([, on]) => on === false)) as UserAutomationSwitches,
    energyKnobSkin: patch.energyKnobSkin ?? DEFAULT_CLINICAL_PREFERENCES.energyKnobSkin,
    airwayScreen: patch.airwayScreen ?? DEFAULT_CLINICAL_PREFERENCES.airwayScreen,
    vascularScreen: patch.vascularScreen ?? DEFAULT_CLINICAL_PREFERENCES.vascularScreen,
  }
}

// Server values win. Device values only fill fields that have never been
// stored on the account, allowing a one-time import of existing local choices.
export function mergeClinicalPreferences(
  serverValue: unknown,
  deviceValue: unknown,
): ClinicalPreferences {
  const server = parseClinicalPreferencesPatch(serverValue)
  const device = parseClinicalPreferencesPatch(deviceValue)
  return normalizeClinicalPreferences({
    units: { ...device.units, ...server.units },
    defaultMonitoring: server.defaultMonitoring ?? device.defaultMonitoring,
    autoFillVitals: { ...device.autoFillVitals, ...server.autoFillVitals },
    intraopFavouriteDrugs:
      server.intraopFavouriteDrugs ?? device.intraopFavouriteDrugs,
    intraopFavouriteInfusions:
      server.intraopFavouriteInfusions ?? device.intraopFavouriteInfusions,
    bulgarianNames: { ...device.bulgarianNames, ...server.bulgarianNames },
    vitalEpisodeAutoLog: server.vitalEpisodeAutoLog ?? device.vitalEpisodeAutoLog,
    automationGroups: { ...device.automationGroups, ...server.automationGroups },
    energyKnobSkin: server.energyKnobSkin ?? device.energyKnobSkin,
    airwayScreen: server.airwayScreen ?? device.airwayScreen,
    vascularScreen: server.vascularScreen ?? device.vascularScreen,
  })
}

export function applyClinicalPreferencesPatch(
  currentValue: unknown,
  patchValue: unknown,
): ClinicalPreferences {
  const current = normalizeClinicalPreferences(currentValue)
  const patch = parseClinicalPreferencesPatch(patchValue)
  return normalizeClinicalPreferences({
    ...current,
    ...patch,
    units: { ...current.units, ...patch.units },
    autoFillVitals: { ...current.autoFillVitals, ...patch.autoFillVitals },
    bulgarianNames: { ...current.bulgarianNames, ...patch.bulgarianNames },
    automationGroups: { ...current.automationGroups, ...patch.automationGroups },
  })
}

export function combineClinicalPreferencesPatches(
  ...values: unknown[]
): ClinicalPreferencesPatch {
  const combined: ClinicalPreferencesPatch = {}
  for (const value of values) {
    const patch = parseClinicalPreferencesPatch(value)
    if (patch.units) {
      combined.units = { ...combined.units, ...patch.units }
    }
    if (patch.defaultMonitoring) {
      combined.defaultMonitoring = patch.defaultMonitoring
    }
    if (patch.autoFillVitals) {
      combined.autoFillVitals = {
        ...combined.autoFillVitals,
        ...patch.autoFillVitals,
      }
    }
    if (patch.intraopFavouriteDrugs !== undefined) {
      combined.intraopFavouriteDrugs = patch.intraopFavouriteDrugs
    }
    if (patch.intraopFavouriteInfusions !== undefined) {
      combined.intraopFavouriteInfusions = patch.intraopFavouriteInfusions
    }
    if (patch.bulgarianNames) {
      combined.bulgarianNames = { ...combined.bulgarianNames, ...patch.bulgarianNames }
    }
    if (patch.vitalEpisodeAutoLog !== undefined) {
      combined.vitalEpisodeAutoLog = patch.vitalEpisodeAutoLog
    }
    if (patch.automationGroups) {
      combined.automationGroups = { ...combined.automationGroups, ...patch.automationGroups }
    }
    if (patch.energyKnobSkin) {
      combined.energyKnobSkin = patch.energyKnobSkin
    }
    if (patch.airwayScreen) {
      combined.airwayScreen = patch.airwayScreen
    }
    if (patch.vascularScreen) {
      combined.vascularScreen = patch.vascularScreen
    }
  }
  return combined
}
