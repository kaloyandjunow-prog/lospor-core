import { calculateRcukPediatricResuscitation } from "./pediatric-calculators"
import type { LogEvent } from "./intraop-types"

/**
 * A shock from the defibrillator (10.1.0): its time, its energy and whether it
 * was synchronised. Each shock is its own event; repeated shocks are repeated
 * events.
 *
 * The range is the same at every age, 1 to 360 J in steps of 1 J. Children
 * with a recorded weight get the energy prefilled from the paediatric
 * reference (RCUK 2025: 4 J/kg, from the 5th shock 8 J/kg, never above
 * 360 J); adults, and children without a weight, start empty. Synchronisation
 * is never prefilled.
 */

export const DEFIBRILLATION_MIN_J = 1
export const DEFIBRILLATION_MAX_J = 360
export const DEFIBRILLATION_STEP_J = 1

/** Under 18 years: a child for the paediatric reference. */
const ADULT_FROM_DAYS = Math.round(18 * 365.25)

export function isValidDefibrillationEnergy(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= DEFIBRILLATION_MIN_J && value <= DEFIBRILLATION_MAX_J
}

export function clampDefibrillationEnergy(value: number): number {
  return Math.min(DEFIBRILLATION_MAX_J, Math.max(DEFIBRILLATION_MIN_J, Math.round(value)))
}

/** Which shock this would be: the shocks already charted before `at`, plus one. */
export function defibrillationShockNumber(log: LogEvent[], at?: string): number {
  const limit = at ? Date.parse(at) : Number.POSITIVE_INFINITY
  return log.filter(event => event.type === "defibrillation" && Date.parse(event.ts) <= limit).length + 1
}

/** The energy to prefill, or null when the sheet starts empty (adults, or no weight). */
export function defibrillationPrefillJoules(input: {
  ageDays: number | null | undefined
  weightKg: number | null | undefined
  shockNumber: number
}): number | null {
  if (input.ageDays == null || input.ageDays >= ADULT_FROM_DAYS) return null
  if (input.weightKg == null || !(input.weightKg > 0)) return null
  const reference = calculateRcukPediatricResuscitation({ weightKg: input.weightKg })
  if (!reference.available) return null
  const joules = input.shockNumber >= 5 ? reference.value.escalatedShockJoules : reference.value.shockJoules
  return clampDefibrillationEnergy(joules)
}

/** The event one saved shock writes. */
export function defibrillationEvent(input: {
  id: string
  ts: string
  energyJ: number
  synchronized: boolean
  recordedAt?: string
}): LogEvent {
  return {
    id: input.id,
    ts: input.ts,
    type: "defibrillation",
    label: input.synchronized ? "Cardioversion" : "Defibrillation",
    color: "#f59e0b",
    energyJ: clampDefibrillationEnergy(input.energyJ),
    synchronized: input.synchronized,
    ...(input.recordedAt ? { recordedAt: input.recordedAt } : {}),
  }
}
