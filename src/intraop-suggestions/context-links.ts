import { AIRWAY_DEVICES } from "../catalog/airway-management"
import { CLINICAL_EVENT_CATS } from "../catalog/intraop-events"
import { canonicalTechnique } from "../intraop-domain"
import { normalizeAdministrationRoute } from "../clinical-rule-vocabulary"
import { airwayClinicalEvent } from "../airway-smart"
import type { IntraopEventOps } from "../intraop-timetable-edit"
import type { LogEvent } from "../intraop-types"
import { automationEnabled, type IntraopAutomationSettings, type UserAutomationSwitches } from "../intraop-automation"
import { CONTEXT_LINK_IDS, AUTOMATIONS } from "./automations"
import { drugClasses } from "./context"
import { TECHNIQUE_LEAVES, TECHNIQUE_SIDES, techniqueHasSide, tciTechniqueForModel, type TechniqueSide } from "../technique-smart"

/** The first six induction agents in the catalogue. Midazolam and fentanyl are
 * deliberately not part of this link: they are common adjuncts, not a signal
 * that the case's anaesthetic technique is missing. */
export const INDUCTION_AGENT_NAMES = Object.freeze([
  "Propofol", "Etomidate", "Ketamine", "Esketamine", "Thiopental", "Methohexital",
] as const)

// The catalogue has historically carried thiopental under two display aliases.
// Keep those aliases accepted as signals without exposing duplicate choices in
// the suggestion catalogue.
const INDUCTION_AGENT_ALIASES = Object.freeze(["Thiopentone", "Thiopental / Thiopentone"])

export type ContextLinkKind = "route" | "induction" | "event-technique" | "side" | "tci" | "volatile" | "airway" | "extubation" | "technique-event"

export type ContextLinkChoice = {
  value: string
  label: string
  labelBg: string
}

export type ContextLinkItem = {
  type: "context"
  automationId: string
  key: string
  kind: ContextLinkKind
  source: LogEvent
  titleEn: string
  titleBg: string
  promptEn: string
  promptBg: string
  detailEn: string
  detailBg: string
  suggestedAt: string
  techniques: readonly string[]
  techniqueSides: Record<string, TechniqueSide>
  techniqueChoices: readonly ContextLinkChoice[]
  airwayChoices: readonly ContextLinkChoice[]
  airwayDevices: readonly string[]
  airwayDeviceEntries: readonly Record<string, unknown>[]
  timeZone?: string | null
  techniqueCode?: string
  eventLabel?: string
}

export type ContextLinkContext = {
  settings: IntraopAutomationSettings
  user?: UserAutomationSwitches | null
  techniques: readonly string[]
  techniqueSides?: Record<string, TechniqueSide>
  airwayDevices?: readonly string[]
  airwayDeviceEntries?: readonly Record<string, unknown>[]
  timeZone?: string | null
  now: Date | string | number
}

export type ContextLinkAnswer =
  | { type: "dismiss" }
  | { type: "no" }
  | { type: "complete" }
  | { type: "technique"; code: string; side?: TechniqueSide; at?: string }
  | { type: "side"; side: TechniqueSide }
  | { type: "event"; at?: string }
  | { type: "induction"; code: string; airwayDevice?: string; at?: string }

const none: IntraopEventOps = { add: [], update: [], remove: [] }
const iso = (value: Date | string | number) => new Date(value).toISOString()
const validIso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value))
const canonicalName = (value: string | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")

const copyFor = (id: string) => AUTOMATIONS.find(item => item.id === id) ?? {
  id, group: "reminders" as const, en: id, bg: id, detailEn: "", detailBg: "",
}

const choices = (codes: readonly string[]): ContextLinkChoice[] => codes.flatMap(code => {
  const hit = TECHNIQUE_LEAVES.find(item => item.code === code)
  return hit ? [{ value: hit.code, label: hit.label, labelBg: hit.labelBg }] : []
})

const exact = (predicate: (code: string, ancestors: readonly string[]) => boolean): ContextLinkChoice[] =>
  choices(TECHNIQUE_LEAVES.filter(item => predicate(item.code, item.ancestors)).map(item => item.code))

const generalChoices = () => exact(code => code.startsWith("GENERAL_"))
const sedationChoices = () => exact(code => code.startsWith("SEDATION_"))
const epiduralChoices = () => exact((code, ancestors) => ancestors.includes("EPIDURAL") || ancestors.includes("CSE") || code === "DPE")
const spinalChoices = () => exact((code, ancestors) => ancestors.includes("SPINAL") || ancestors.includes("CSE") || code === "DPE")
const blockChoices = () => exact((_code, ancestors) => ancestors.includes("PERIPHERAL"))

const airwayChoices = (): ContextLinkChoice[] => AIRWAY_DEVICES.map(([value, label, labelBg]) => ({ value, label, labelBg }))

const eventColor = (label: string): string =>
  CLINICAL_EVENT_CATS.flatMap(category => category.events).find(event => event.label === label)?.color ?? "#64748b"

const hasExactTechnique = (techniques: readonly string[], predicate: (code: string) => boolean) =>
  techniques.some(technique => predicate(canonicalTechnique(technique)))

const hasGeneralOrSedation = (techniques: readonly string[]) => techniques.some(technique => {
  const code = canonicalTechnique(technique)
  return code.startsWith("GENERAL_") || code.startsWith("SEDATION_")
})

const hasLabel = (log: readonly LogEvent[], label: string): boolean =>
  log.some(event => event.type === "clinical_event" && event.label === label)

const answerExists = (log: readonly LogEvent[], automationId: string, sourceId: string): boolean =>
  log.some(event => event.type === "prompt_answer"
    && event.answerKind === automationId
    && event.answerFor === sourceId
    && (event.answer === "done" || event.answer === "dismissed"))

const contextSource = (id: string, ts: string): LogEvent => ({ id, ts, type: "prompt_answer" })

function item(
  automationId: string,
  kind: ContextLinkKind,
  source: LogEvent,
  context: ContextLinkContext,
  prompt: [string, string],
  options: { techniqueChoices?: ContextLinkChoice[]; techniqueCode?: string; eventLabel?: string } = {},
): ContextLinkItem {
  const copy = copyFor(automationId)
  return {
    type: "context", automationId, kind, source,
    key: `${automationId}:${source.id}`,
    titleEn: copy.en, titleBg: copy.bg,
    promptEn: prompt[0], promptBg: prompt[1], detailEn: copy.detailEn, detailBg: copy.detailBg,
    suggestedAt: source.ts,
    techniques: context.techniques,
    techniqueSides: context.techniqueSides ?? {},
    techniqueChoices: options.techniqueChoices ?? [],
    airwayChoices: airwayChoices(),
    airwayDevices: context.airwayDevices ?? [],
    airwayDeviceEntries: context.airwayDeviceEntries ?? [],
    timeZone: context.timeZone ?? null,
    ...(options.techniqueCode ? { techniqueCode: options.techniqueCode } : {}),
    ...(options.eventLabel ? { eventLabel: options.eventLabel } : {}),
  }
}

const firstPending = (log: readonly LogEvent[], automationId: string, events: readonly LogEvent[]): LogEvent | undefined =>
  events.find(event => !answerExists(log, automationId, event.id))

const isInductionAgent = (event: LogEvent): boolean =>
  event.type === "drug"
  && (event.category == null || event.category.toLowerCase() === "induction")
  && [...INDUCTION_AGENT_NAMES, ...INDUCTION_AGENT_ALIASES].some(name => canonicalName(name) === canonicalName(event.name))

const routeSources = (log: readonly LogEvent[], route: string): LogEvent[] => log.filter(event =>
  (event.type === "drug" || event.type === "infusion_start")
  && drugClasses(event).has("localAnaesthetic")
  && normalizeAdministrationRoute(event.drugRoute ?? "") === route,
)

/** Build the contextual links that turn an existing chart action into the
 * missing exact technique, side, event or airway record. */
export function contextLinkSuggestions(log: readonly LogEvent[], context: ContextLinkContext): ContextLinkItem[] {
  const result: ContextLinkItem[] = []
  const lineOn = (id: string) => automationEnabled(context.settings, "reminders", id, context.user)
  const addRoute = (route: "EPIDURAL" | "PERINEURAL" | "INTRATHECAL", automationId: string, prompt: [string, string], choicesForRoute: () => ContextLinkChoice[], eventLabel: string, techniquePresent: (code: string) => boolean) => {
    if (!lineOn(automationId) || hasLabel(log, eventLabel) || hasExactTechnique(context.techniques, techniquePresent)) return
    const source = firstPending(log, automationId, routeSources(log, route))
    if (!source) return
    result.push(item(automationId, "route", source, context, prompt, { techniqueChoices: choicesForRoute(), eventLabel }))
  }

  addRoute("EPIDURAL", CONTEXT_LINK_IDS.epiduralLocalAnaesthetic,
    ["Was an epidural placed during this procedure?", "Поставена ли е епидурална анестезия по време на тази процедура?"],
    epiduralChoices, "Epidural in", code => code.startsWith("EPIDURAL_") || code.startsWith("CSE") || code === "DPE")
  addRoute("PERINEURAL", CONTEXT_LINK_IDS.perineuralLocalAnaesthetic,
    ["Was a peripheral block done during this procedure?", "Извършен ли е периферен блок по време на тази процедура?"],
    blockChoices, "Block done", code => code.startsWith("BLOCK_"))
  addRoute("INTRATHECAL", CONTEXT_LINK_IDS.intrathecalLocalAnaesthetic,
    ["Was a spinal placed during this procedure?", "Поставена ли е спинална анестезия по време на тази процедура?"],
    spinalChoices, "Spinal in", code => code.startsWith("SPINAL") || code.startsWith("CSE") || code === "DPE")

  const inductionMissing = !hasGeneralOrSedation(context.techniques)
    && lineOn(CONTEXT_LINK_IDS.inductionAgent)
  const inductionSource = inductionMissing ? firstPending(log, CONTEXT_LINK_IDS.inductionAgent, log.filter(isInductionAgent)) : undefined
  if (inductionSource) {
    result.push(item(CONTEXT_LINK_IDS.inductionAgent, "induction", inductionSource, context,
      [`${inductionSource.name ?? "Induction agent"}: which exact technique?`, `${inductionSource.name ?? "Индукционен медикамент"}: коя е точната техника?`],
      { techniqueChoices: [...sedationChoices(), ...generalChoices()] }))
  }

  const eventLink = (label: string, automationId: string, prompt: [string, string], choicesForEvent: () => ContextLinkChoice[]) => {
    if (!lineOn(automationId) || hasExactTechnique(context.techniques, code => {
      if (label === "Epidural in") return code.startsWith("EPIDURAL_") || code.startsWith("CSE") || code === "DPE"
      if (label === "Spinal in" || label === "CSE") return code.startsWith("SPINAL") || code.startsWith("CSE") || code === "DPE"
      return code.startsWith("BLOCK_")
    })) return
    const source = firstPending(log, automationId, log.filter(event => event.type === "clinical_event" && (label === "Block done" ? event.label === label : event.label === label || (label === "Spinal in" && event.label === "CSE"))))
    if (source) result.push(item(automationId, "event-technique", source, context, prompt, { techniqueChoices: choicesForEvent(), eventLabel: label }))
  }
  eventLink("Epidural in", CONTEXT_LINK_IDS.epiduralEventTechnique,
    ["Which exact epidural technique was used?", "Коя точна епидурална техника беше използвана?"], epiduralChoices)
  eventLink("Spinal in", CONTEXT_LINK_IDS.spinalEventTechnique,
    ["Which exact spinal technique was used?", "Коя точна спинална техника беше използвана?"], spinalChoices)
  eventLink("Block done", CONTEXT_LINK_IDS.blockEventTechnique,
    ["Which exact block technique and side was used?", "Коя точна блокова техника и коя страна бяха използвани?"], blockChoices)

  if (lineOn(CONTEXT_LINK_IDS.perineuralSide)) {
    const missing = context.techniques.find(code => canonicalTechnique(code).startsWith("BLOCK_") && techniqueHasSide(canonicalTechnique(code)) && !context.techniqueSides?.[code])
    if (missing) {
      const source = contextSource(`technique-side:${missing}`, iso(context.now))
      if (!answerExists(log, CONTEXT_LINK_IDS.perineuralSide, source.id)) {
        const hit = TECHNIQUE_LEAVES.find(item => item.code === canonicalTechnique(missing))
        result.push(item(CONTEXT_LINK_IDS.perineuralSide, "side", source, context,
          [`${hit?.label ?? missing}: which side?`, `${hit?.labelBg ?? missing}: коя страна?`], { techniqueCode: canonicalTechnique(missing) }))
      }
    }
  }

  const tci = lineOn(CONTEXT_LINK_IDS.tciTechnique)
    ? firstPending(log, CONTEXT_LINK_IDS.tciTechnique, log.filter(event => event.type === "infusion_start" && tciTechniqueForModel(event.tciModel) != null))
    : undefined
  if (tci && !hasExactTechnique(context.techniques, code => code === "GENERAL_TCI")) {
    result.push(item(CONTEXT_LINK_IDS.tciTechnique, "tci", tci, context,
      ["Which exact TCI technique should be recorded?", "Коя точна TCI техника да се запише?"], { techniqueChoices: choices(["GENERAL_TCI"]) }))
  }

  const volatile = !hasGeneralOrSedation(context.techniques) && lineOn(CONTEXT_LINK_IDS.volatileTechnique)
    ? firstPending(log, CONTEXT_LINK_IDS.volatileTechnique, log.filter(event => event.type === "agent_start"))
    : undefined
  if (volatile) result.push(item(CONTEXT_LINK_IDS.volatileTechnique, "volatile", volatile, context,
    ["Which exact general anaesthesia technique is this?", "Коя точна техника на обща анестезия е това?"], { techniqueChoices: generalChoices() }))

  const airwayEvent = log.find(event => event.type === "clinical_event" && ["Intubated", "Reintubation", "LMA in", "DLT placed", "Mask vent"].includes(event.label ?? ""))
  const structuredAirway = (context.airwayDevices ?? []).length > 0 || (context.airwayDeviceEntries ?? []).length > 0
  if (!hasGeneralOrSedation(context.techniques) && !inductionSource && !volatile && (airwayEvent || structuredAirway) && lineOn(CONTEXT_LINK_IDS.airwayTechnique)) {
    const source = firstPending(log, CONTEXT_LINK_IDS.airwayTechnique, airwayEvent ? [airwayEvent] : [contextSource("airway-record", iso(context.now))])
    if (source) result.push(item(CONTEXT_LINK_IDS.airwayTechnique, "airway", source, context,
      ["Which exact sedation or general technique applies?", "Коя точна техника на седация или обща анестезия се прилага?"], { techniqueChoices: [...sedationChoices(), ...generalChoices()] }))
  }

  if (lineOn(CONTEXT_LINK_IDS.extubationAirway)) {
    const extubated = log.find(event => event.type === "clinical_event" && event.label === "Extubated")
    const hasAirwayRecord = log.some(event => event.type === "clinical_event" && ["Intubated", "Reintubation", "LMA in", "DLT placed", "Mask vent"].includes(event.label ?? "")) || structuredAirway
    if (extubated && !hasAirwayRecord) {
      const source = firstPending(log, CONTEXT_LINK_IDS.extubationAirway, [extubated])
      if (source) result.push(item(CONTEXT_LINK_IDS.extubationAirway, "extubation", source, context,
        ["Complete the airway record for this extubation?", "Да се попълни ли записът за дихателния път за тази екстубация?"]))
    }
  }

  if (lineOn(CONTEXT_LINK_IDS.techniqueEvent)) {
    for (const code of context.techniques.map(canonicalTechnique)) {
      if (!(code.startsWith("EPIDURAL_") || code.startsWith("SPINAL") || code.startsWith("CSE") || code === "DPE" || code.startsWith("BLOCK_"))) continue
      const label = code.startsWith("BLOCK_") ? "Block done" : code.startsWith("EPIDURAL_") || code.startsWith("DPE") ? "Epidural in" : code.startsWith("CSE") ? "CSE" : "Spinal in"
      if (hasLabel(log, label)) continue
      const source = contextSource(`technique-event:${code}`, iso(context.now))
      if (answerExists(log, CONTEXT_LINK_IDS.techniqueEvent, source.id)) continue
      const hit = TECHNIQUE_LEAVES.find(item => item.code === code)
      result.push(item(CONTEXT_LINK_IDS.techniqueEvent, "technique-event", source, context,
        [`${hit?.label ?? code}: record the ${label.toLowerCase()} event?`, `${hit?.labelBg ?? code}: да се запише ли събитието „${label}"?`], { techniqueChoices: choices([code]), techniqueCode: code, eventLabel: label }))
      break
    }
  }

  return result.sort((a, b) => Date.parse(a.source.ts) - Date.parse(b.source.ts))
}

function promptAnswer(item: ContextLinkItem, answer: "done" | "dismissed", value: string, now: string): LogEvent {
  return {
    id: `context-answer-${item.automationId.replace(/[^a-z0-9]+/gi, "-")}-${item.source.id.replace(/[^a-z0-9]+/gi, "-")}`,
    ts: now,
    type: "prompt_answer",
    answerKind: item.automationId,
    answerFor: item.source.id,
    answer,
    value,
    suggestion: item.automationId,
    recordedAt: now,
  }
}

function techniquePatch(item: ContextLinkItem, code: string, side?: TechniqueSide): Record<string, unknown> {
  const techniques = [...new Set([...item.techniques, code])]
  const sides = { ...item.techniqueSides }
  if (side && techniqueHasSide(code)) sides[code] = side
  return { techniques, ...(Object.keys(sides).length > 0 ? { techniqueSides: sides } : {}) }
}

function selectedTechnique(item: ContextLinkItem, code: string): boolean {
  return item.techniqueChoices.some(choice => choice.value === code)
}

/** Turn a context-link answer into the same atomic event/patch operation used
 * by the ordinary airway, vascular and technique screens. */
export function contextLinkAnswerOps(item: ContextLinkItem, answer: ContextLinkAnswer, now: Date | string | number): IntraopEventOps {
  const recordedAt = iso(now)
  if (answer.type === "dismiss") return { ...none, add: [promptAnswer(item, "dismissed", "dismissed", recordedAt)] }
  if (answer.type === "no") return { ...none, add: [promptAnswer(item, "done", "no", recordedAt)] }
  if (answer.type === "complete") return { ...none, add: [promptAnswer(item, "done", "complete", recordedAt)] }

  if (answer.type === "side") {
    const code = item.techniqueCode
    if (!code || !techniqueHasSide(code) || !TECHNIQUE_SIDES.includes(answer.side)) return none
    const patch = techniquePatch(item, code, answer.side)
    return { ...none, add: [{ ...promptAnswer(item, "done", `side:${answer.side}`, recordedAt), intraopPatch: patch }] }
  }

  if (answer.type === "event") {
    if (!item.eventLabel || !item.techniqueCode) return none
    const at = validIso(answer.at) ? new Date(answer.at).toISOString() : item.suggestedAt
    const patch = techniquePatch(item, item.techniqueCode)
    return {
      ...none,
      add: [
        { id: `context-event-${item.automationId}-${item.source.id}`, ts: at, type: "clinical_event", label: item.eventLabel, color: eventColor(item.eventLabel), suggestion: item.automationId, recordedAt, intraopPatch: patch },
        promptAnswer(item, "done", `event:${at}`, recordedAt),
      ],
    }
  }

  if (answer.type === "technique") {
    if (!selectedTechnique(item, answer.code)) return none
    const side = answer.side
    if (techniqueHasSide(answer.code) && !side) return none
    if (side && !TECHNIQUE_SIDES.includes(side)) return none
    const at = validIso(answer.at) ? new Date(answer.at).toISOString() : item.suggestedAt
    const patch = techniquePatch(item, answer.code, side)
    const add: LogEvent[] = [{ ...promptAnswer(item, "done", `technique:${answer.code}${side ? `:${side}` : ""}`, recordedAt), intraopPatch: patch }]
    const update: LogEvent[] = []
    if (item.eventLabel && item.source.type === "clinical_event") {
      // The event-technique link qualifies the clinical event that already
      // triggered it. Adding a second event made the chart show two identical
      // blocks. Keep the original id and label; the prompt answer carries the
      // structured technique patch.
      update.push({ ...item.source, ts: at, suggestion: item.automationId, recordedAt })
    } else if (item.eventLabel) {
      add.unshift({ id: `context-event-${item.automationId}-${item.source.id}`, ts: at, type: "clinical_event", label: item.eventLabel, color: eventColor(item.eventLabel), suggestion: item.automationId, recordedAt })
    }
    return { ...none, add, update }
  }

  if (answer.type === "induction") {
    if (!selectedTechnique(item, answer.code)) return none
    const at = validIso(answer.at) ? new Date(answer.at).toISOString() : item.suggestedAt
    const patch = techniquePatch(item, answer.code)
    const add: LogEvent[] = []
    const inductionLabel = answer.code.startsWith("SEDATION_") ? "Sedation started" : "Induction"
    let fullPatch: Record<string, unknown> = { ...patch }
    if (answer.airwayDevice) {
      if (!item.airwayChoices.some(choice => choice.value === answer.airwayDevice)) return none
      const entry = { id: `context-airway-${item.source.id}`, device: answer.airwayDevice, details: {}, insertedAt: at, status: "in_use" }
      fullPatch = {
        ...fullPatch,
        airwayDevices: [...new Set([...item.airwayDevices, answer.airwayDevice])],
        airwayDeviceEntries: [...item.airwayDeviceEntries, entry],
      }
    }
    add.push({ id: `context-induction-${item.source.id}`, ts: at, type: "clinical_event", label: inductionLabel, color: eventColor(inductionLabel), suggestion: item.automationId, recordedAt, intraopPatch: fullPatch })
    if (answer.airwayDevice) {
      const eventLabel = answer.airwayDevice === "FACE_MASK" ? "Mask vent" : airwayClinicalEvent(answer.airwayDevice, { priorTrachealTube: item.airwayDevices.some(device => device === "ORAL_ETT" || device === "NASAL_ETT") })
      if (eventLabel) add.push({ id: `context-airway-event-${item.source.id}`, ts: at, type: "clinical_event", label: eventLabel, color: eventColor(eventLabel), suggestion: item.automationId, recordedAt })
    }
    add.push(promptAnswer(item, "done", `induction:${answer.code}${answer.airwayDevice ? `:${answer.airwayDevice}` : ""}`, recordedAt))
    return { ...none, add }
  }

  return none
}

export const contextLinkDismissOps = (item: ContextLinkItem, now: Date | string | number): IntraopEventOps =>
  contextLinkAnswerOps(item, { type: "dismiss" }, now)

export function contextLinkText(item: ContextLinkItem, locale: "en" | "bg"): string {
  const title = locale === "bg" ? item.titleBg : item.titleEn
  const prompt = locale === "bg" ? item.promptBg : item.promptEn
  return `${title}: ${prompt}`
}
