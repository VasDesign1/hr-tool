// Comments on leave requests — sub-collection helper.
//
// Both the request owner (contractor) and staff (admin/viewer) can read.
// Owner and admin can post. Viewer cannot (Firestore rules enforce this).
//
// Schema:
//   leaveRequests/{rid}/comments/{cid}
//     text:    "free text"
//     byUid:   "<uid>"
//     byName:  "Display name"
//     byRole:  "admin" | "contractor" | "viewer"
//     at:      serverTimestamp()
//
// Unread tracking is local-only (per-browser, in localStorage). Good enough
// without burning Firestore writes on every modal open.

import { db } from "./firebase-init.js";
import {
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export function subscribeToComments(requestId, callback) {
  return onSnapshot(
    query(collection(db, "leaveRequests", requestId, "comments"), orderBy("at", "asc")),
    (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      callback(items);
    },
    (err) => console.error("leave comments sub:", err)
  );
}

export async function addLeaveComment(requestId, { profile, user }, text) {
  const t = (text || "").trim();
  if (!t) return null;
  return addDoc(collection(db, "leaveRequests", requestId, "comments"), {
    text:   t,
    byUid:  user?.uid || profile?.uid || "",
    byName: profile?.name || profile?.email || "",
    byRole: profile?.role || "contractor",
    at:     serverTimestamp()
  });
}

export function renderCommentsThread(comments, currentUid) {
  if (!comments || comments.length === 0) {
    return `<div class="thread-empty">No comments yet. Start the conversation below.</div>`;
  }
  return `<div class="comments-thread">${comments.map(c => {
    const mine = c.byUid === currentUid;
    const when = c.at?.toDate?.()?.toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne", hour12: false
    }) || "just now";
    const sideClass = mine ? "mine" : "theirs";
    const roleClass = c.byRole === "admin" ? "by-admin"
                    : c.byRole === "viewer" ? "by-viewer"
                    : "by-contractor";
    const roleTag = c.byRole === "admin" ? `<span class="role-tag">ADMIN</span>` : "";
    return `<div class="comment ${sideClass} ${roleClass}">
      <div class="comment-head">
        <strong>${escapeHtml(c.byName || "—")}</strong>${roleTag}
        <span class="comment-when">${when}</span>
      </div>
      <div class="comment-body">${escapeHtml(c.text).replace(/\n/g, "<br>")}</div>
    </div>`;
  }).join("")}</div>`;
}

// ---- Local-only unread tracking ----
const seenKey = (uid) => `lr_comments_seen_${uid || "anon"}`;

function readSeen(uid) {
  try { return JSON.parse(localStorage.getItem(seenKey(uid)) || "{}"); }
  catch { return {}; }
}

function writeSeen(uid, obj) {
  try { localStorage.setItem(seenKey(uid), JSON.stringify(obj)); } catch {}
}

export function getLastSeenMs(myUid, requestId) {
  return Number(readSeen(myUid)[requestId]) || 0;
}

export function markRequestSeen(myUid, requestId) {
  const all = readSeen(myUid);
  all[requestId] = Date.now();
  writeSeen(myUid, all);
}

// Count comments not written by me, newer than my lastSeen.
export function countUnread(comments, myUid, lastSeenMs) {
  if (!comments?.length) return 0;
  return comments.reduce((n, c) => {
    if (c.byUid === myUid) return n;
    const t = c.at?.toMillis?.() || 0;
    return t > (lastSeenMs || 0) ? n + 1 : n;
  }, 0);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
