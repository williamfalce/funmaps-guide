// "Send back to rep": an admin returns an entry to the sales rep with a note
// explaining what to change, instead of silently deleting it. Shared by
// banners, sponsorships, deals and listings. Not an endpoint (leading "_").
//
//  - A new entry that was never approved -> status "needs_changes". It stays
//    hidden from travelers; the rep edits it, which resubmits it as "pending".
//  - Proposed changes to a live entry -> changesSentBack: true. The approved
//    version stays live; the rep edits the proposal, which resubmits it.
// The note (reviewNote) stays on the entry so the admin can see what was asked
// when it comes back, and is cleared once the entry or changes are approved.

const REVIEW_FIELDS = ["reviewNote", "reviewNoteBy", "reviewNoteAt", "changesSentBack"];

function isUnapproved(status) {
  return status === "pending" || status === "needs_changes";
}

function sendBack(existing, note, auth) {
  const text = String(note || "").trim().slice(0, 1000);
  if (!text) return { error: "Write a note telling the rep what to change" };
  const record = { ...existing, reviewNote: text, reviewNoteBy: auth.name, reviewNoteAt: Date.now() };
  if (isUnapproved(existing.status)) {
    record.status = "needs_changes";
    delete record.changesSentBack;
    return { record };
  }
  if (existing.pendingChanges) {
    record.changesSentBack = true;
    return { record };
  }
  return { error: "Nothing on this entry is waiting for review" };
}

function clearReview(record) {
  for (const f of REVIEW_FIELDS) delete record[f];
  return record;
}

module.exports = { REVIEW_FIELDS, isUnapproved, sendBack, clearReview };
