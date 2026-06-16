// Shared admin top-bar nav. Pages mount it after requireRole resolves.
import { logout } from "./auth-router.js";

export function renderAdminNav(profile, currentPage) {
  const pages = [
    { id: "dashboard",  label: "Dashboard",  href: "index.html"     },
    { id: "users",      label: "Users",      href: "users.html"     },
    { id: "timesheets", label: "Timesheets", href: "timesheets.html"},
  ];

  const linksHtml = pages.map(p => {
    const active = p.id === currentPage ? "active" : "";
    return `<a class="nav-link ${active}" href="${p.href}">${p.label}</a>`;
  }).join("");

  const header = document.querySelector("header.topbar");
  header.innerHTML = `
    <div class="nav-left">
      <h1>HR Tool · Admin</h1>
      <nav class="admin-nav">${linksHtml}</nav>
    </div>
    <div class="nav-right">
      <span class="who">${escapeHtml(profile.name || profile.email || "Admin")}</span>
      <button class="ghost" id="logoutBtn">Sign out</button>
    </div>
  `;
  document.getElementById("logoutBtn").addEventListener("click", logout);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
