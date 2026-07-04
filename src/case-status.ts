// Canonical case-status label text (EN + BG) — the single source of truth
// for the 7 case lifecycle states. Colors/styling and which subset of
// statuses a given screen displays remain app-owned (lospor-mobile uses hex
// colors for React Native, lospor-app uses Tailwind classes for its web
// badge, and web's CaseSummary only ever shows 4 of the 7 states by design).
export type CaseStatus =
  | "DRAFT"
  | "IN_CONSULTATION"
  | "AWAITING_ALLOCATION"
  | "IN_PROGRESS"
  | "AWAITING_POSTOP"
  | "AWAITING_REVIEW"
  | "COMPLETE"

export const CASE_STATUS_LABELS: Record<CaseStatus, { en: string; bg: string }> = {
  DRAFT:                { en: "Draft",               bg: "Чернова" },
  IN_CONSULTATION:      { en: "In consultation",     bg: "На консултация" },
  AWAITING_ALLOCATION:  { en: "Awaiting allocation", bg: "Изчаква разпределение" },
  IN_PROGRESS:          { en: "In theatre",          bg: "В операционна" },
  AWAITING_POSTOP:      { en: "Awaiting postop",     bg: "Изчаква следоперативен преглед" },
  AWAITING_REVIEW:      { en: "Awaiting review",     bg: "Изчаква преглед" },
  COMPLETE:             { en: "Case finished",       bg: "Случаят е завършен" },
}
