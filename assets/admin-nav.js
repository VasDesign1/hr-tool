// Admin shell: sidebar nav + footer user. Pages mount it after requireRole resolves.
import { logout } from "./auth-router.js";

const ICONS = {
  dashboard:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>`,
  users:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  timesheets: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  leave:      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>`,
  analytics:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 17l4-4 4 4 6-6"/></svg>`,
  logout:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
};

export function renderAdminNav(profile, currentPage) {
  const pages = [
    { id: "dashboard",  label: "Dashboard",  href: "index.html" },
    { id: "users",      label: "Team",       href: "users.html" },
    { id: "timesheets", label: "Timesheets", href: "timesheets.html" },
    { id: "leave",      label: "Leave",      href: "leave.html" },
    { id: "analytics",  label: "Analytics",  href: "analytics.html" },
  ];

  const initials = getInitials(profile.name || profile.email);

  const linksHtml = pages.map(p => `
    <a class="${p.id === currentPage ? "active" : ""}" href="${p.href}">
      ${ICONS[p.id]}<span>${p.label}</span>
    </a>
  `).join("");

  // Find or create app-shell
  let shell = document.querySelector(".app-shell");
  if (!shell) {
    // Wrap existing body content
    shell = document.createElement("div");
    shell.className = "app-shell";
    const existingMain = document.querySelector("main");
    if (existingMain) {
      document.body.insertBefore(shell, existingMain);
      shell.appendChild(makeSidebar());
      const mainWrap = document.createElement("div");
      mainWrap.className = "main";
      shell.appendChild(mainWrap);
      mainWrap.appendChild(existingMain);
      existingMain.className = ""; // drop default main styling, .main wrapper handles it
    }
  }

  function makeSidebar() {
    const sb = document.createElement("aside");
    sb.className = "sidebar";
    sb.innerHTML = `
      <div class="brand">
        <div class="logo">V</div>
        <div class="name">Vic Air<small>HR Portal</small></div>
      </div>
      <nav class="side-nav">
        <div class="label">Workspace</div>
        ${linksHtml}
      </nav>
      <div class="footer-user">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div class="who">
          <div class="name">${escapeHtml(profile.name || profile.email || "Admin")}</div>
          <div class="role">Administrator</div>
        </div>
        <button id="logoutBtn" title="Sign out">${ICONS.logout}</button>
      </div>
    `;
    return sb;
  }

  // Hide any old topbar header
  const topbar = document.querySelector("header.topbar");
  if (topbar) topbar.style.display = "none";

  // Attach logout
  setTimeout(() => {
    const btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", logout);
  }, 0);
}

export function getInitials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
