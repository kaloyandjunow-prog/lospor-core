/**
 * Default drug colours by group, after the ISO 26825 user-applied syringe
 * label colours (10.8.0) -- the colours an anaesthetist already reads on the
 * syringes. A hospital's own colours (drug-colors.ts, set in Status) win over
 * these; groups the standard does not colour keep the bundled colour.
 *
 *   Induction agents: yellow          Benzodiazepines and sedatives: orange
 *   Opioids: blue                     Neuromuscular blockers: fluorescent red
 *   Neuromuscular reversal: red/white Vasopressors: violet
 *   Hypotensive agents: violet/white  Local anaesthetics: grey
 *   Anticholinergics: green           Antiemetics: salmon
 *
 * Striped labels are drawn as the lighter tint of their colour.
 */
export const ISO_26825_GROUP_COLORS: Readonly<Record<string, string>> = Object.freeze({
  "Intravenous hypnotics / general anesthetics": "#eab308",
  "Sedatives / anxiolytics / alpha-2 agonists": "#f97316",
  "Opioid analgesics": "#38bdf8",
  "Neuromuscular blocking drugs": "#ef4444",
  "Neuromuscular reversal / anticholinergics": "#f87171",
  "Vasoactive drugs - vasopressors / vasoconstrictors": "#8b5cf6",
  "Vasoactive drugs - inotropes / inodilators": "#a78bfa",
  "Vasoactive drugs - antihypertensives / vasodilators": "#c4b5fd",
  "Local/regional anesthetics": "#9ca3af",
  "Antiemetics / prokinetics": "#fa8072",
})

/** The ISO 26825 colour of a drug group, or null when the standard gives none. */
export function isoDrugGroupColor(group: string | null | undefined): string | null {
  return group ? ISO_26825_GROUP_COLORS[group] ?? null : null
}

/**
 * A second running item of the same group is told apart by a lighter or
 * darker shade of the group's colour (index 0 is the colour itself).
 */
export function shadeForSameGroup(hex: string, index: number): string {
  if (index <= 0) return hex
  const value = Number.parseInt(hex.slice(1), 16)
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  const lighter = index % 2 === 1
  const amount = Math.min(0.6, 0.25 * Math.ceil(index / 2))
  const target = lighter ? 255 : 0
  return `#${channels.map(channel => Math.round(channel + (target - channel) * amount).toString(16).padStart(2, "0")).join("")}`
}
