// Announcements helper — renders a top-of-page banner stack on contractor pages.
// Admin posts/edit/deletes; contractors see & dismiss. Storage:
//   announcements/{id}   { message, severity, startAt, expiresAt, createdBy }
//   users/{uid}.dismissedAnnouncements: [id]

import { db } from "./firebase-init.js";
import {
  collection, query, where, onSnapshot, doc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Mount a banner area at the top of <main> for any signed-in contractor.
// Returns an unsubscribe function.
export function mountAnnouncementBanners(user, profile) {
  // Insert a banner host as the first child of <main>
  const main = document.querySelector("main, .simple-shell");
  if (!main) return () => {};
  let host = document.getElementById("announcementBanners");
  if (!host) {
    host = document.createElement("div");
    host.id = "announcementBanners";
    main.insertBefore(host, main.firstChild);
  }

  const nowMs = () => Date.now();

  // Live: any change to announcements re-renders the stack.
  const unsub = onSnapshot(collection(db, "announcements"), (snap) => {
    const items = [];
    snap.forEach(d => {
      const a = { id: d.id, ...d.data() };
      // Skip paused — admin keeps the record but contractors don't see it
      if (a.paused) return;
      // Filter active (started + not expired)
      const startsAt  = a.startAt?.toMillis?.()  ?? 0;
      const expiresAt = a.expiresAt?.toMillis?.() ?? Infinity;
      if (nowMs() < startsAt || nowMs() > expiresAt) return;
      // Skip dismissed
      const dismissed = profile.dismissedAnnouncements || [];
      if (dismissed.includes(a.id)) return;
      items.push(a);
    });
    items.sort((a, b) => (b.startAt?.toMillis?.() || 0) - (a.startAt?.toMillis?.() || 0));

    if (items.length === 0) { host.innerHTML = ""; return; }
    host.innerHTML = items.map(a => `
      <div class="announcement ${a.severity || "info"}" data-id="${a.id}">
        <div class="ann-icon">${a.severity === "alert" ? "⚠" : a.severity === "warn" ? "⚠" : "ℹ"}</div>
        <div class="ann-body">${escapeHtml(a.message)}</div>
        <button class="ann-dismiss" data-id="${a.id}" title="Dismiss">×</button>
      </div>
    `).join("");

    host.querySelectorAll(".ann-dismiss").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        try {
          await updateDoc(doc(db, "users", user.uid), { dismissedAnnouncements: arrayUnion(id) });
          profile.dismissedAnnouncements = [...(profile.dismissedAnnouncements || []), id];
          btn.closest(".announcement").remove();
        } catch (e) {
          console.error("dismiss announcement:", e);
        }
      });
    });
  });
  return unsub;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
