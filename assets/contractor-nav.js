// Updates badge counts on the contractor's top nav (Leave + Timesheets).
import { db } from "./firebase-init.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function refreshContractorBadges(uid) {
  if (!uid) return;
  try {
    const [leaveSnap, editSnap] = await Promise.all([
      getDocs(query(collection(db, "leaveRequests"), where("uid", "==", uid), where("status", "==", "pending"))),
      getDocs(query(collection(db, "timeEditRequests"), where("uid", "==", uid), where("status", "==", "pending")))
    ]);
    setBadge("leave",      leaveSnap.size, leaveSnap.size > 0);
    setBadge("timesheets", editSnap.size,  editSnap.size  > 0);
  } catch (e) { console.error("contractor nav badges:", e); }
}

function setBadge(pageId, count, pulse) {
  document.querySelectorAll(`.simple-nav a[data-page="${pageId}"]`).forEach(a => {
    let badge = a.querySelector(".nav-badge");
    if (count <= 0) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-badge" + (pulse ? "" : " muted");
      a.appendChild(badge);
    }
    badge.textContent = count;
  });
}
