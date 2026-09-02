/**
 * Turn what the clinician ticked into an ordinary case edit.
 *
 * This is the only bridge between an import and the record, and it is
 * deliberately narrow. What comes out is a plain patch against canonical field
 * names — the same shape the clinician's own typing produces — so it travels
 * the ordinary case-edit route, hits the ordinary validation, and lands in the
 * ordinary audit trail as their edit. No import-specific write path exists,
 * which is why an import can never generate a conflict, and therefore why no
 * conflict UI is needed on the two clients that have none.
 *
 * Built once here rather than twice in the clients. The last time a
 * calculation lived separately in web and mobile the two drifted and a running
 * infusion read 0 mL on one of them; a review that accepted different things
 * depending on which screen you used would be the same failure with worse
 * consequences.
 *
 * The selection arriving from a client is not trusted. It is a list of keys,
 * and the server re-derives the plan and checks each one against it — a key
 * the plan does not offer is refused rather than applied.
 */

import type { EhrLabValue, EhrTagValue } from "./ehr-import"
import type { EhrReviewItem, EhrReviewPlan } from "./ehr-import-review"

export type EhrApplyRefusal = {
  itemKey: string
  reason:
    /** Not in this plan at all. */
    | "unknown"
    /** Refused on an earlier import; a refusal is not undone by ticking it. */
    | "declined"
    /** The case already says this; there is nothing to write. */
    | "unchanged"
    /**
     * An age whose acceptance would imply a change of clinical mode.
     *
     * Refused rather than written even when explicitly ticked. The clinician
     * changes mode themselves, and the plan is then rebuilt — at which point
     * the age is an ordinary proposal. Making the order structural is the
     * point: it leaves no sequence of clicks that writes an age into a case
     * whose mode disagrees with it.
     */
    | "needs-mode-decision"
}

export type EhrApplyResult = {
  /** A patch by canonical field name, exactly as the clinician's own edit. */
  patch: Record<string, unknown>
  /** Keys that were written, for recording what this import contributed. */
  appliedKeys: string[]
  refused: EhrApplyRefusal[]
}

const SELECTABLE: Record<EhrReviewItem["state"], EhrApplyRefusal["reason"] | null> = {
  preselected: null,
  // A deliberate reach past the default is allowed: the clinician has seen
  // their own value beside the proposal, or has opened the collapsed older
  // results, and chosen.
  conflict: null,
  superseded: null,
  declined: "declined",
  unchanged: "unchanged",
  "needs-mode-decision": "needs-mode-decision",
}

function existingList(current: unknown): unknown[] {
  return Array.isArray(current) ? [...current] : []
}

export function applyEhrSelections(input: {
  plan: EhrReviewPlan
  /** The keys the clinician ticked. */
  selectedKeys: Iterable<string>
  /** The case as it stands, by canonical field name. */
  current: Record<string, unknown>
}): EhrApplyResult {
  const byKey = new Map(input.plan.items.map(item => [item.itemKey, item]))
  const patch: Record<string, unknown> = {}
  const appliedKeys: string[] = []
  const refused: EhrApplyRefusal[] = []

  // Lists are rebuilt from what the case already holds, so accepting an
  // imported diagnosis never drops one the clinician typed — and their items
  // keep whatever provenance they arrived with.
  const lists = new Map<string, unknown[]>()

  for (const itemKey of new Set(input.selectedKeys)) {
    const item = byKey.get(itemKey)
    if (!item) { refused.push({ itemKey, reason: "unknown" }); continue }

    const objection = SELECTABLE[item.state]
    if (objection) { refused.push({ itemKey, reason: objection }); continue }

    const proposed = item.proposed
    if (proposed && typeof proposed === "object") {
      if (!lists.has(item.field)) lists.set(item.field, existingList(input.current[item.field]))
      lists.get(item.field)!.push(proposed as EhrTagValue | EhrLabValue)
    } else {
      patch[item.field] = proposed
    }
    appliedKeys.push(itemKey)
  }

  for (const [field, value] of lists) patch[field] = value

  return { patch, appliedKeys, refused }
}
