type DraftPickRosterFields = {
  roster_id?: number | null;
  draft_slot?: number | null;
  picked_by?: string | null;
};

type DraftRosterMapFields = {
  slot_to_roster_id?: Record<string, number | string | null | undefined> | null;
};

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveDraftPickRosterId(
  pick: DraftPickRosterFields,
  draft: DraftRosterMapFields,
  ownerToRosterId: Map<string, number> = new Map()
): number | null {
  const directRosterId = positiveInteger(pick.roster_id);
  if (directRosterId != null) return directRosterId;

  const slotRosterId = positiveInteger(
    draft.slot_to_roster_id?.[String(pick.draft_slot ?? "")]
  );
  if (slotRosterId != null) return slotRosterId;

  const pickedBy = typeof pick.picked_by === "string" ? pick.picked_by : "";
  return ownerToRosterId.get(pickedBy) ?? null;
}
