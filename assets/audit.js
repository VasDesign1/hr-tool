// Audit log helper — append-only history of every write across the app.
//
// One entry per action. Reads are restricted by Firestore rules to staff (admin/viewer)
// OR to the contractor whose data was affected (`targetUser` field).
//
// Schema:
//   auditLog/{autoId}
//     who:        { uid, name, email, role }
//     action:     "timeEntry.edit" | "leaveRequest.approve" | "user.role" | ...
//     targetType: "timeEntry" | "leaveRequest" | "user" | "timeEditRequest" | "announcement"
//     targetId:   "<doc id>"      // optional
//     targetUser: "<uid>"          // optional, for filtering — the affected contractor
//     before:     { ... }          // optional snapshot of selected fields
//     after:      { ... }          // optional snapshot of selected fields
//     note:       "Optional human-readable note"
//     at:         serverTimestamp()
//
// Usage:
//   import { logAudit } from "../assets/audit.js";
//   await logAudit({ profile }, { action: "timeEntry.edit", targetType: "timeEntry", targetId, targetUser: uid, before, after });
//
// All fields except `action` are optional. Failures are swallowed (audit must never block a real write).

import { db } from "./firebase-init.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function logAudit({ profile, user }, payload) {
  if (!payload?.action) return;
  try {
    const uid = profile?.uid || user?.uid || "";
    await addDoc(collection(db, "auditLog"), {
      who: {
        uid,
        name:  profile?.name  || "",
        email: profile?.email || "",
        role:  profile?.role  || ""
      },
      action:     payload.action,
      targetType: payload.targetType || null,
      targetId:   payload.targetId || null,
      targetUser: payload.targetUser || null,
      before:     payload.before || null,
      after:      payload.after || null,
      note:       payload.note  || null,
      at:         serverTimestamp()
    });
  } catch (e) {
    console.error("audit log failed:", e);
  }
}

// Pretty-print an action key like "timeEntry.edit" → "Time entry — edit"
export function fmtAuditAction(action) {
  if (!action) return "—";
  const [type, op] = String(action).split(".");
  const typeLabel = ({
    timeEntry:        "Time entry",
    leaveRequest:     "Leave request",
    user:             "User",
    timeEditRequest:  "Fix request",
    announcement:     "Announcement",
    accrual:          "Accrual"
  })[type] || type;
  const opLabel = (op || "").replace(/[A-Z]/g, c => " " + c.toLowerCase());
  return `${typeLabel} — ${opLabel}`;
}
