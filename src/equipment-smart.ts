import type { EquipmentCategory, EquipmentItem } from "./equipment"

/**
 * Smart selection for the Equipment tab (10.2.0): the calculator list as a set-up checklist.
 *
 * Every item can be ticked as ready. The airway devices (the tube and the LMA) can then be marked in
 * use, which writes the device to the Airway record with the size the card suggests. The urinary
 * catheter and the NGT write their flag on the case with the first tap, and the flag is the tick, so
 * it reaches the research export with its concept. Everything else is a plain checklist item.
 *
 * Which item does what lives here so the web app and the phone cannot drift.
 */

export type EquipmentTarget =
  | { kind: "airway"; device: "ORAL_ETT" | "LMA" }
  | { kind: "flag"; field: "urinaryCatheter" | "stomachTube" }

/** The calculator item labels that write to the case. */
const TARGETS: Readonly<Record<string, EquipmentTarget>> = Object.freeze({
  "ETT size": { kind: "airway", device: "ORAL_ETT" },
  "LMA size": { kind: "airway", device: "LMA" },
  "Urinary catheter": { kind: "flag", field: "urinaryCatheter" },
  "NGT": { kind: "flag", field: "stomachTube" },
})

export const equipmentTarget = (label: string): EquipmentTarget | null => TARGETS[label] ?? null

/** The calculator leaves a size to the clinician in these words; such an item cannot be written for them. */
export const equipmentNeedsChoice = (value: string): boolean => /manual|measure|select|calculate|required|prepare a curved/i.test(value)

/** The six items shown as the glance grid, in the order a clinician reaches for them. */
export const EQUIPMENT_GLANCE: readonly string[] = Object.freeze(["ETT size", "ETT depth (lip)", "LMA size", "Laryngoscope", "Guedel OPA", "Suction catheter"])

export const equipmentItemKey = (category: string, label: string): string => `${category}|${label}`

export type EquipmentGroup = { cat: string; color?: string; items: EquipmentItem[]; difficultAirway: boolean }

/** The groups in screen order: the difficult-airway group first when the exam calls for it, and the glance items taken out of Airway. */
export function equipmentGroups(categories: readonly EquipmentCategory[]): EquipmentGroup[] {
  const groups = categories.map(category => ({
    cat: category.cat,
    color: category.color,
    difficultAirway: category.cat === "Difficult Airway",
    items: category.cat === "Airway" ? category.items.filter(item => !EQUIPMENT_GLANCE.includes(item.label)) : [...category.items],
  })).filter(group => group.items.length > 0)
  return [...groups.filter(group => group.difficultAirway), ...groups.filter(group => !group.difficultAirway)]
}

export type EquipmentFlagState = { urinaryCatheter: boolean; stomachTube: boolean }

/**
 * Whether an item shows as done from the record itself: a flag item when its flag is set, an airway
 * item when that device is in use. Anything else is only ticked on the device.
 */
export function equipmentRecordState(label: string, record: { flags: EquipmentFlagState; airwayInUse: readonly string[] }): "in_use" | null {
  const target = equipmentTarget(label)
  if (!target) return null
  if (target.kind === "flag") return record.flags[target.field] ? "in_use" : null
  return record.airwayInUse.includes(target.device) ? "in_use" : null
}

/** The monitoring list with a flag item set or cleared. */
export function toggleEquipmentFlag(monitoring: readonly string[], field: "urinaryCatheter" | "stomachTube"): string[] {
  return monitoring.includes(field) ? monitoring.filter(item => item !== field) : [...monitoring, field]
}

/** What a tap on an item does, given what the item is and where it stands. */
export function equipmentTapAction(label: string, state: { ready: boolean; inUse: boolean }): "ready" | "unready" | "use" | "flag" | "unflag" | "none" {
  const target = equipmentTarget(label)
  if (target?.kind === "flag") return state.inUse ? "unflag" : "flag"
  if (target?.kind === "airway") {
    if (state.inUse) return "none"
    return state.ready ? "use" : "ready"
  }
  return state.ready ? "unready" : "ready"
}
