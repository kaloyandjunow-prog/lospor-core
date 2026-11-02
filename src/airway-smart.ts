import { AIRWAY_DEVICES, AIRWAY_TOOLS } from "./catalog/airway-management"
import {
  airwayToolsFromEntries,
  legacyFieldsFromEntries,
  replaceAirwayDevice,
  type AirwayDeviceEntry,
  type AirwayExchangeReason,
} from "./airway-device-entries"
import { calcEquipment, type EquipmentInput } from "./equipment"
import {
  DLT_SIDES,
  DLT_SIZES,
  DLT_TYPES,
  ENDOBRONCHIAL_SIZES,
  ETT_SIZES,
  LMA_SIZES,
  type AirwayDeviceCompletenessInput,
} from "./intraop-domain"

/**
 * Smart selection, the airway tab that opens on what is in place (10.2.0).
 *
 * Everything that decides what the tab offers lives here, so the web app and
 * the phone cannot drift: which devices come first for the technique, the
 * size and cuff suggested for this patient (the same numbers as the equipment
 * card), what each device asks, and how a device and its time are written to
 * the case. The screens only draw it.
 */

export type AirwayPatient = Pick<EquipmentInput, "clinicalMode" | "age" | "ageYears" | "weightKg" | "heightCm" | "sex" | "bmi" | "preterm">

/* ---------- which devices come first ---------- */

export type AirwayChoices = {
  /** The devices offered first, as big cards. */
  main: string[]
  /** Every other device, behind "More devices". */
  other: string[]
  /** Whether "No airway intervention" is offered (regional or local only). */
  noIntervention: boolean
}

const DEVICE_CODES = AIRWAY_DEVICES.map(([code]) => code)

/** The devices for the technique: general anaesthesia leads with the tube, the mask and the LMA; sedation with what keeps the airway open; regional or local alone with none. */
export function airwayChoices(techniques: readonly string[]): AirwayChoices {
  const has = (prefix: string) => techniques.some(technique => technique === prefix || technique.startsWith(`${prefix}_`))
  const general = has("GENERAL") || techniques.length === 0
  const main = general
    ? ["ORAL_ETT", "LMA", "FACE_MASK"]
    : has("SEDATION")
      ? ["FACE_MASK", "NPA", "OPA"]
      : ["FACE_MASK"]
  return { main, other: DEVICE_CODES.filter(code => !main.includes(code)), noIntervention: !general && !has("SEDATION") }
}

/* ---------- what is suggested for this patient ---------- */

const firstNumber = (text: string | undefined): number | null => {
  const match = text?.match(/\d+(?:[.,]\d+)?/)
  return match ? Number(match[0].replace(",", ".")) : null
}

/** The nearest size on the list that is not above the suggestion. */
const nearest = (sizes: readonly number[], size: number): number => [...sizes].reverse().find(item => item <= size) ?? sizes[0]!

/**
 * The size and cuff to start from, from the equipment card's own guidance, so
 * the two never disagree. Under 2 years (or without an age) the tube size is
 * left for the clinician, as the card does.
 */
export function suggestedAirwayDetails(device: string, patient: AirwayPatient): AirwayDeviceCompletenessInput {
  const items = calcEquipment({ ...patient }).flatMap(category => category.items)
  const ett = items.find(item => item.label === "ETT size")
  const lma = items.find(item => item.label === "LMA size")
  if (device === "ORAL_ETT" || device === "NASAL_ETT") {
    const size = firstNumber(ett?.value)
    if (size == null || /manual|required/i.test(ett?.value ?? "")) return {}
    return device === "ORAL_ETT" ? { oralTubeSize: nearest(ETT_SIZES, size), oralCuffed: true } : { nasalTubeSize: nearest(ETT_SIZES, size), nasalCuffed: true }
  }
  if (device === "LMA") {
    const size = firstNumber(lma?.value)
    return size == null || /required/i.test(lma?.value ?? "") ? {} : { lmaSize: nearest(LMA_SIZES, size) }
  }
  return {}
}

/* ---------- what each device asks ---------- */

export type AirwayAsk =
  | { field: keyof AirwayDeviceCompletenessInput; kind: "size"; values: readonly number[] }
  | { field: keyof AirwayDeviceCompletenessInput; kind: "cuff" }
  | { field: keyof AirwayDeviceCompletenessInput; kind: "choice"; values: readonly string[] }

/** The questions the panel asks for a device, in order; none for a mask or an airway adjunct. */
export function airwayAsks(device: string): AirwayAsk[] {
  switch (device) {
    case "ORAL_ETT": return [{ field: "oralTubeSize", kind: "size", values: ETT_SIZES }, { field: "oralCuffed", kind: "cuff" }]
    case "NASAL_ETT": return [{ field: "nasalTubeSize", kind: "size", values: ETT_SIZES }, { field: "nasalCuffed", kind: "cuff" }]
    case "LMA": return [{ field: "lmaSize", kind: "size", values: LMA_SIZES }]
    case "DOUBLE_LUMEN_TUBE": return [{ field: "dltType", kind: "choice", values: DLT_TYPES }, { field: "dltSide", kind: "choice", values: DLT_SIDES }, { field: "dltSize", kind: "size", values: DLT_SIZES }]
    case "ENDOBRONCHIAL_TUBE": return [{ field: "endobronchialSize", kind: "size", values: ENDOBRONCHIAL_SIZES }]
    default: return []
  }
}

/** Whether the tools that help place a device ("How") are asked for it. */
export const airwayAsksHow = (device: string) => ["ORAL_ETT", "NASAL_ETT", "LMA", "DOUBLE_LUMEN_TUBE", "ENDOBRONCHIAL_TUBE"].includes(device)

export const AIRWAY_HOW_CODES: readonly string[] = AIRWAY_TOOLS.map(([code]) => code)

/** Tools worth putting first for this patient: a difficult airway on the preop record leads with video laryngoscopy and fibreoptic. */
export function airwayHowOrder(difficultAirway: boolean): string[] {
  const first = difficultAirway ? ["VIDEO_LARY", "FOB", "AWAKE"] : []
  return [...first, ...AIRWAY_HOW_CODES.filter(code => !first.includes(code))]
}

/* ---------- when ---------- */

export type AirwayTimeChoice = "start" | "now" | "pick" | "timeline"

/** The instant a device went in: the start of anaesthesia, now, a time typed, or the timeline cell it was opened from. */
export function resolveAirwayTime(choice: AirwayTimeChoice, context: { startedAt: string | null; now: string; picked?: string | null }): string {
  if (choice === "start") return context.startedAt ?? context.now
  if (choice === "now") return context.now
  return context.picked && Number.isFinite(Date.parse(context.picked)) ? new Date(context.picked).toISOString() : context.now
}

/* ---------- writing it to the case ---------- */

export type AirwayAdd = {
  id: string
  device: string
  details: AirwayDeviceCompletenessInput
  insertedAt: string
  instruments?: readonly string[]
  /** The device being taken out, with why. */
  replaces?: { id: string; reason: AirwayExchangeReason } | null
}

/** The list with the device added; a replaced one stays on it, marked failed or replaced at that time. */
export function addAirwayDevice(entries: readonly AirwayDeviceEntry[], add: AirwayAdd): AirwayDeviceEntry[] {
  const next: Omit<AirwayDeviceEntry, "status" | "reason"> = {
    id: add.id,
    device: add.device,
    details: add.details,
    insertedAt: add.insertedAt,
    ...(add.instruments && add.instruments.length > 0 ? { instruments: [...new Set(add.instruments)] } : {}),
  }
  if (add.replaces) return replaceAirwayDevice(entries, add.replaces.id, next, add.replaces.reason)
  return [...entries, { ...next, status: "in_use" }]
}

/**
 * Everything a save writes for this list: the list itself, the old per-kind
 * fields for readers that know only them, and the case-level tools (kept, and
 * joined by the tools used for any device).
 */
export function airwayRecordFields(entries: readonly AirwayDeviceEntry[], currentTools: readonly string[] = []): Record<string, unknown> {
  return {
    airwayDeviceEntries: entries,
    ...legacyFieldsFromEntries(entries),
    airwayTools: [...new Set([...currentTools, ...airwayToolsFromEntries(entries)])],
  }
}
