// Auth state router — every protected page imports this.
// On load: if not signed in → /login.html. If role mismatch → kick to correct view.
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const BASE = location.pathname.includes("/hr-tool/") ? "/hr-tool/" : "/";

export function pathTo(rel) {
  return BASE + rel.replace(/^\//, "");
}

export async function requireRole(expected) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        location.replace(pathTo("login.html"));
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        alert("Your account has not been set up by an admin yet. Signing you out.");
        await signOut(auth);
        location.replace(pathTo("login.html"));
        return;
      }
      const profile = snap.data();
      if (!profile.active) {
        alert("Your account is deactivated. Contact your admin.");
        await signOut(auth);
        location.replace(pathTo("login.html"));
        return;
      }
      if (expected && profile.role !== expected) {
        const target = profile.role === "admin" ? "admin/index.html" : "app/index.html";
        location.replace(pathTo(target));
        return;
      }
      resolve({ user, profile });
    });
  });
}

export async function logout() {
  await signOut(auth);
  location.replace(pathTo("login.html"));
}
