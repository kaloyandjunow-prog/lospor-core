import { AUTOMATION_GROUPS, type AutomationGroup } from "../intraop-automation"
import { clinicalDisplayLabel } from "../display"
import { SUGGESTION_CARDS } from "./catalogue"
import type { TimerKind } from "./timers"

/**
 * Every automation the hospital can switch on its own (10.2.0), one line each,
 * under the group it belongs to. A group off in Status switches all of its
 * automations off; with the group on, an automation is on unless Status has
 * switched it off (IntraopAutomationSettings.disabled). A new automation is
 * added here, and nowhere else needs to know it exists to list it.
 */
export type AutomationDef = {
  id: string
  group: AutomationGroup
  en: string
  bg: string
  detailEn: string
  detailBg: string
}

type Pair = readonly [string, string]
const def = (id: string, group: AutomationGroup, name: Pair, detail: Pair): AutomationDef =>
  ({ id, group, en: name[0], bg: name[1], detailEn: detail[0], detailBg: detail[1] })

/* ---------- treatment cards: one per card, named by the complication it follows ---------- */

export const cardAutomationId = (complication: string) => `card:${complication}`

const CARDS: AutomationDef[] = SUGGESTION_CARDS.map(card => {
  const names = card.complications
  const en = names.join(" / ")
  const bg = names.map(name => clinicalDisplayLabel("complication", name, "bg")).join(" / ")
  return def(cardAutomationId(names[0]!), "treatmentSuggestions", [en, bg], card.kind === "checklist"
    ? ["A checklist of steps after this complication.", "Списък със стъпки след това усложнение."]
    : ["Doses to treat it, prefilled for this patient.", "Дози за лечение, попълнени за този пациент."])
})

/* ---------- questions after a rescue drug, fluid or shock ---------- */

export const reverseAutomationId = (rule: string) => `reverse:${rule}`

const REVERSE: AutomationDef[] = ([
  ["lipid", ["Lipid emulsion", "Липидна емулсия"], ["Asks whether this is LAST.", "Пита дали е ЛАСТ."]],
  ["dantrolene", ["Dantrolene", "Дантролен"], ["Asks whether this is malignant hyperthermia.", "Пита дали е малигнена хипертермия."]],
  ["adenosine", ["Adenosine", "Аденозин"], ["Asks whether this is a supraventricular arrhythmia.", "Пита дали е суправентрикуларна аритмия."]],
  ["unsynchronisedShock", ["Unsynchronised shock", "Несинхронизиран шок"], ["Asks whether this is ventricular fibrillation, ventricular tachycardia or a cardiac arrest.", "Пита дали е камерно мъждене, камерна тахикардия или сърдечен арест."]],
  ["synchronisedShock", ["Synchronised shock", "Синхронизиран шок"], ["Asks whether this is atrial fibrillation, a supraventricular arrhythmia or ventricular tachycardia.", "Пита дали е предсърдно мъждене, суправентрикуларна аритмия или камерна тахикардия."]],
  ["massiveTransfusion", ["Massive transfusion", "Масивно кръвопреливане"], ["Asks whether this is a massive haemorrhage after the fourth red-cell unit within an hour.", "Пита дали е масивен кръвоизлив след четвъртата единица еритроцити за един час."]],
  ["rescueSugammadex", ["Sugammadex as a rescue", "Сугамадекс като спасително лекарство"], ["Asks whether this is CICO (can't intubate, can't oxygenate) when 16 mg/kg or more is given.", "Пита дали е CICO (не може да се интубира, не може да се оксигенира) при доза 16 mg/kg или повече."]],
  ["arrestAdrenaline", ["Adrenaline in arrest doses", "Адреналин в дози за арест"], ["Asks whether this is a cardiac arrest.", "Пита дали е сърдечен арест."]],
  ["calciumInsulin", ["Calcium or insulin with glucose", "Калций или инсулин с глюкоза"], ["Asks whether this is hyperkalaemia.", "Пита дали е хиперкалиемия."]],
  ["secondUterotonic", ["A second uterotonic", "Втори утеротоник"], ["Asks whether this is a massive haemorrhage.", "Пита дали е масивен кръвоизлив."]],
  ["antidote", ["Naloxone or flumazenil", "Налоксон или флумазенил"], ["Asks whether this is a drug overdose or delayed emergence.", "Пита дали е предозиране на лекарство или забавено събуждане."]],
  ["amiodarone", ["Amiodarone", "Амиодарон"], ["Asks whether this is atrial fibrillation or ventricular tachycardia.", "Пита дали е предсърдно мъждене или камерна тахикардия."]],
  ["salbutamol", ["Salbutamol", "Салбутамол"], ["Asks whether this is bronchospasm.", "Пита дали е бронхоспазъм."]],
] as const).map(([rule, name, detail]) => def(reverseAutomationId(rule), "reverseQuestions", name, detail))

/* ---------- questions from the readings ---------- */

export const readingAutomationId = (kind: string) => `reading:${kind}`

const READINGS: AutomationDef[] = ([
  ["hypoxaemia", ["Low SpO₂", "Ниска SpO₂"], ["Asks about hypoxia when SpO₂ is below 90 %.", "Пита за хипоксия при SpO₂ под 90 %."]],
  ["hypercapnia", ["High EtCO₂", "Висок EtCO₂"], ["Asks about hypercarbia when EtCO₂ is above 60 mmHg.", "Пита за хиперкапния при EtCO₂ над 60 mmHg."]],
  ["hypothermia", ["Low temperature", "Ниска температура"], ["Asks about hypothermia below 36 °C.", "Пита за хипотермия под 36 °C."]],
  ["nearZero", ["EtCO₂ near zero", "EtCO₂ близо до нула"], ["Asks what happened when the curve falls away.", "Пита какво се е случило, когато кривата изчезне."]],
  ["mh", ["The malignant hyperthermia pattern", "Картина на малигнена хипертермия"], ["Asks when EtCO₂, heart rate and temperature rise together.", "Пита, когато EtCO₂, пулсът и температурата растат заедно."]],
  ["residualBlock", ["Residual neuromuscular block", "Остатъчен нервно-мускулен блок"], ["Asks from the train-of-four.", "Пита по четворния сигнал (TOF)."]],
  ["reverseBeforeExtubation", ["Reversal before extubation", "Реверсия преди екстубация"], ["Asks whether to reverse before the tube comes out.", "Пита дали да се направи реверсия преди изваждане на тръбата."]],
] as const).map(([kind, name, detail]) => def(readingAutomationId(kind), "readingQuestions", name, detail))

/* ---------- questions from the laboratory results ---------- */

export const labAutomationId = (kind: string) => `lab:${kind}`

const LABS: AutomationDef[] = ([
  ["hyperkalaemia", ["High potassium", "Висок калий"]],
  ["hypokalaemia", ["Low potassium", "Нисък калий"]],
  ["hypoglycaemia", ["Low glucose", "Ниска глюкоза"]],
  ["hyperglycaemia", ["High glucose", "Висока глюкоза"]],
  ["hypocalcaemia", ["Low calcium", "Нисък калций"]],
  ["hyponatraemia", ["Low sodium", "Нисък натрий"]],
  ["hypernatraemia", ["High sodium", "Висок натрий"]],
  ["haemorrhage", ["Falling haemoglobin", "Спадащ хемоглобин"]],
  ["lowFibrinogen", ["Low fibrinogen", "Нисък фибриноген"]],
  ["troponin", ["Raised troponin", "Повишен тропонин"]],
] as const).map(([kind, name]) => def(labAutomationId(kind), "labQuestions", name,
  ["Asks whether to log the complication when the result is outside its limits.", "Пита дали да запише усложнението, когато резултатът е извън границите."]))

/* ---------- reminders and warnings ---------- */

export const REMINDER_IDS = {
  ponv: "reminder:ponv",
  glucose: "reminder:glucose",
  latex: "reminder:latex",
  mhHistory: "reminder:mhHistory",
  localAnaestheticMax: "reminder:localAnaestheticMax",
} as const

const REMINDERS: AutomationDef[] = [
  def(REMINDER_IDS.ponv, "reminders", ["Postoperative nausea and vomiting", "Постоперативно гадене и повръщане"], ["Reminds about prophylaxis for a high risk score.", "Напомня за профилактика при висок рисков скор."]),
  def(REMINDER_IDS.glucose, "reminders", ["Glucose check", "Проверка на глюкозата"], ["Reminds a diabetic patient's glucose is due.", "Напомня, че глюкозата на пациент с диабет е дължима."]),
  def(REMINDER_IDS.latex, "reminders", ["Latex allergy banner", "Лента за алергия към латекс"], ["A banner over the record for a latex allergy.", "Лента над записа при алергия към латекс."]),
  def(REMINDER_IDS.mhHistory, "reminders", ["Malignant hyperthermia history", "Анамнеза за малигнена хипертермия"], ["Asks before a volatile agent or suxamethonium.", "Пита преди инхалационен анестетик или суксаметоний."]),
  def(REMINDER_IDS.localAnaestheticMax, "reminders", ["Local anaesthetic maximum", "Максимална доза локален анестетик"], ["Shows the total and the maximum when a dose goes over.", "Показва общото и максимума, когато дозата ги надвиши."]),
]

/* ---------- follow-ups after a treatment ---------- */

export const TIMER_FAMILIES = ["arrest", "lipid", "anaphylaxis", "dantrolene", "tourniquet"] as const
export type TimerFamily = typeof TIMER_FAMILIES[number]

const TIMER_FAMILY: Record<TimerKind, TimerFamily> = {
  arrestRhythmCheck: "arrest", arrestAdrenaline: "arrest", arrestAmiodarone: "arrest",
  lastRepeatBolus: "lipid", lastDoubleInfusion: "lipid", lastMaximum: "lipid",
  anaphylaxisInfusion: "anaphylaxis",
  dantroleneRepeat: "dantrolene", dantroleneMaximum: "dantrolene",
  tourniquetWarning: "tourniquet", tourniquetLimit: "tourniquet", tourniquetStillOn: "tourniquet",
}

export const timerAutomationId = (kind: TimerKind) => `timer:${TIMER_FAMILY[kind]}`

const TIMERS: AutomationDef[] = [
  def("timer:arrest", "timers", ["Cardiac arrest", "Сърдечен арест"], ["The 2-minute rhythm check, adrenaline and amiodarone.", "Проверка на ритъма на 2 минути, адреналин и амиодарон."]),
  def("timer:lipid", "timers", ["Lipid emulsion (LAST)", "Липидна емулсия (ЛАСТ)"], ["A repeat bolus, the infusion and the maximum.", "Повторен болус, инфузия и максимум."]),
  def("timer:anaphylaxis", "timers", ["Anaphylaxis", "Анафилаксия"], ["The adrenaline infusion after repeated boluses.", "Адреналинова инфузия след повторени болуси."]),
  def("timer:dantrolene", "timers", ["Dantrolene", "Дантролен"], ["Repeat after 10 minutes, and the 10 mg/kg note.", "Повторение след 10 минути и бележка при 10 mg/kg."]),
  def("timer:tourniquet", "timers", ["Tourniquet", "Турникет"], ["A warning, the limit and a tourniquet still on.", "Предупреждение, граница и турникет, който още е надут."]),
]

/* ---------- monitoring suggestions on the Monitoring tab ---------- */

const MONITORING: AutomationDef[] = [
  def("monitor:etco2Monitor", "reminders", ["Suggest capnography", "Предлагане на капнография"], ["After an airway device is placed.", "След поставяне на дихателно устройство."]),
  def("monitor:invasiveBP", "reminders", ["Suggest invasive pressure", "Предлагане на инвазивно налягане"], ["After an arterial line is charted.", "След отбелязване на артериална линия."]),
  def("monitor:cvpMonitor", "reminders", ["Suggest CVP", "Предлагане на ЦВН"], ["After a central line is charted.", "След отбелязване на централна линия."]),
  def("monitor:tofMonitor", "reminders", ["Suggest neuromuscular monitoring", "Предлагане на невромускулен мониторинг"], ["After a neuromuscular blocker is given.", "След прилагане на мускулен релаксант."]),
  def("monitor:bis", "reminders", ["Suggest depth of anaesthesia", "Предлагане на дълбочина на анестезията"], ["For TIVA.", "При ТИВА."]),
  def("monitor:tempMonitor", "reminders", ["Suggest temperature", "Предлагане на температура"], ["After 30 minutes of general anaesthesia.", "След 30 минути обща анестезия."]),
  def("monitor:urinaryCatheter", "reminders", ["Suggest urine output", "Предлагане на диуреза"], ["When a urinary catheter is charted.", "Когато е отбелязан уринарен катетър."]),
]

/** Every automation, in the order the Status page lists them: by group, then as defined. */
export const AUTOMATIONS: readonly AutomationDef[] = Object.freeze(
  AUTOMATION_GROUPS.flatMap(group => [...CARDS, ...REVERSE, ...READINGS, ...LABS, ...REMINDERS, ...MONITORING, ...TIMERS].filter(item => item.group === group)),
)

export const AUTOMATION_IDS: ReadonlySet<string> = new Set(AUTOMATIONS.map(item => item.id))
