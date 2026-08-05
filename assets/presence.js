// Presence & activity monitoring (Security feature) — contractor side.
//
// Completely silent while running: the ONLY thing a contractor ever sees is the
// one-time browser-permission dialog. Everything else is written straight to
// Firestore for the admin Security page.
//
// While the contractor is clocked in AND Security is toggled ON (settings/security):
//   • Heartbeat — presence/{uid}.lastSeenAt refreshed every 60s (and on focus/online).
//     If heartbeats stop (tab closed, laptop asleep), admin sees the gap.
//   • Idle detection — Chrome/Edge IdleDetector watches SYSTEM-WIDE mouse/keyboard
//     and screen lock. After `thresholdMinutes` of no input anywhere on the
//     computer, an awaySegment opens; when input resumes it closes.
//     Declared breaks are NOT counted as away (they're already visible as breaks).
//   • Offline gap recovery — on next load, a gap since the last heartbeat while
//     clocked in is back-filled as an 'offline' awaySegment (skipped when another
//     of the contractor's devices was alive during the gap).
//
// SINGLE-WRITER RULE (fixes double counting): only ONE browser context per
// contractor may record at a time. Election happens in the presence doc itself
// (writerId/writerAt) so it works ACROSS devices and browsers, not just tabs:
//   - Each heartbeat, the tab reads presence/{uid}. If the current writer's
//     writerAt is fresh (<3 min) and isn't us, we stay completely silent.
//   - If the writer goes dark (device slept / closed), the next tab that beats
//     takes over, closes any away segments the dead writer left open, and
//     carries on. A localStorage election still picks one tab per browser first.
//
// Firestore:
//   settings/security     { enabled, thresholdMinutes }           (admin-written)
//   presence/{uid}        { state, tracking, entryId, lastSeenAt, awaySince,
//                           writerId, writerAt, name }
//   awaySegments/{autoId} { uid, date, entryId, startUTC, endUTC, minutes, reason, open }
//     reason: 'idle' (no input) | 'locked' (screen locked) | 'offline' (app closed / asleep)

import { db } from "./firebase-init.js";
import { melDateKey } from "./time.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs,
  onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const HEARTBEAT_MS = 60_000;
const OWNER_STALE_MS = 90_000;      // same-browser tab election
const WRITER_STALE_MS = 3 * 60_000; // cross-device writer election
const SWEEP_MS = 5 * 60_000;        // how often the writer sweeps stuck segments

let user = null, profile = null;
let cfg = { enabled: false, thresholdMinutes: 2 };
let cfgLoaded = false, userLoaded = false;

let clockedIn = false, entryId = null, onBreak = false, clockInMs = null;
let started = false;
let recovered = false;
let amWriter = false;
let lastBeatAt = 0, lastSweepAt = 0;
let beatBusy = false;
let tracking = "ok";            // ok | no-permission | unsupported | error
let detector = null;
let detectorAbort = null;
let detectorThresholdMin = null;
let hbTimer = null;
let dialogShownThisLoad = false;
let openingSeg = false;

const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
const ownerKey = () => `vh_presence_owner_${user.uid}`;
const beatKey  = () => `vh_presence_beat_${user.uid}`;
const segKey   = () => `vh_presence_openseg_${user.uid}`;
const presenceRef = () => doc(db, "presence", user.uid);

// ---------------------------------------------------------------- entry point
export function initPresence(u, p) {
  user = u; profile = p;

  onSnapshot(doc(db, "settings", "security"), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    const prevThreshold = cfg.thresholdMinutes;
    cfg = {
      enabled: !!d.enabled,
      thresholdMinutes: Math.max(1, Number(d.thresholdMinutes) || 2)
    };
    cfgLoaded = true;
    if (started && cfg.enabled && cfg.thresholdMinutes !== prevThreshold) restartDetector();
    evaluate();
  }, (e) => console.error("presence settings:", e));

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    const wasOnBreak = onBreak;
    clockedIn = !!d.currentEntryId;
    entryId   = d.currentEntryId || null;
    onBreak   = !!d.currentBreakStartAt;
    clockInMs = d.clockedInAt?.toMillis?.() || null;
    userLoaded = true;
    // Break just started → an idle segment shouldn't run through a declared break.
    if (started && !wasOnBreak && onBreak) {
      closeSegment(d.currentBreakStartAt?.toMillis?.() || Date.now()).catch(() => {});
    }
    evaluate();
  }, (e) => console.error("presence user:", e));
}

// ------------------------------------------------------------------- control
function evaluate() {
  if (!cfgLoaded || !userLoaded) return;
  const shouldRun = cfg.enabled && clockedIn;
  if (shouldRun && !started) startTracking();
  else if (!shouldRun && started) stopTracking();
}

async function startTracking() {
  started = true;
  await beat(true);   // claim (or defer) writership before anything else

  hbTimer = setInterval(() => beat(), HEARTBEAT_MS);
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  document.addEventListener("visibilitychange", onVisible);

  setupIdleDetection();
}

async function stopTracking() {
  started = false;
  clearInterval(hbTimer); hbTimer = null;
  window.removeEventListener("focus", onWake);
  window.removeEventListener("online", onWake);
  document.removeEventListener("visibilitychange", onVisible);
  if (detectorAbort) { detectorAbort.abort(); detectorAbort = null; detector = null; }
  try { await closeSegment(Date.now()); } catch {}
  if (amWriter) {
    amWriter = false;
    // Release writership so another device can take over instantly.
    presenceWrite({
      state: clockedIn ? "active" : "off",
      awaySince: null, writerId: null, writerAt: null
    }).catch(() => {});
  }
}

function onWake() { beat(); }
function onVisible() { if (document.visibilityState === "visible") beat(); }

// Same-browser tab election (cheap first gate; cross-device election is in beat()).
function isLeader() {
  try {
    const rec = JSON.parse(localStorage.getItem(ownerKey()) || "null");
    if (!rec || rec.id === TAB_ID || (Date.now() - rec.t) > OWNER_STALE_MS) {
      localStorage.setItem(ownerKey(), JSON.stringify({ id: TAB_ID, t: Date.now() }));
      return true;
    }
    return false;
  } catch { return true; }
}

// ------------------------------------------- heartbeat + cross-device election
async function beat(force = false) {
  if (!started || beatBusy || !isLeader()) return;
  if (!force && Date.now() - lastBeatAt < 20_000) return; // debounce focus bursts
  beatBusy = true;
  lastBeatAt = Date.now();
  try {
    const pSnap = await getDoc(presenceRef());
    const p = pSnap.exists() ? pSnap.data() : {};
    const writerAtMs = p.writerAt?.toMillis?.() || 0;
    const writerFresh = writerAtMs && (Date.now() - writerAtMs) < WRITER_STALE_MS;
    const wasWriter = amWriter;
    amWriter = !p.writerId || p.writerId === TAB_ID || !writerFresh;

    if (amWriter) {
      if (!recovered) {
        recovered = true;
        const closedAny = await sweepOrphans();
        if (!closedAny) await backfillOfflineGap(p);
        lastSweepAt = Date.now();
      } else if (!wasWriter || Date.now() - lastSweepAt > SWEEP_MS) {
        await sweepOrphans();
        lastSweepAt = Date.now();
      }
      await presenceWrite({
        lastSeenAt: serverTimestamp(),
        writerId: TAB_ID,
        writerAt: serverTimestamp()
      });
    } else {
      // Another device/browser is actively recording — stay completely silent
      // so nothing double-counts. Drop any local open segment claim; the real
      // writer (or a future sweep) owns segment lifecycle now.
      try { localStorage.removeItem(segKey()); } catch {}
    }
    try { localStorage.setItem(beatKey(), String(Date.now())); } catch {}
  } catch (e) {
    console.error("presence beat:", e);
  }
  beatBusy = false;
}

function currentState() {
  if (!clockedIn) return "off";
  if (onBreak) return "break";
  if (readOpenSeg()) return "away";
  return "active";
}

async function presenceWrite(extra) {
  await setDoc(presenceRef(), {
    uid: user.uid,
    name: profile.name || profile.email || "",
    state: currentState(),
    tracking,
    entryId,
    updatedAt: serverTimestamp(),
    ...extra
  }, { merge: true });
}

// ------------------------------------------------------------ idle detection
async function setupIdleDetection() {
  if (!("IdleDetector" in window)) {
    tracking = "unsupported";
    return;
  }
  let perm = "prompt";
  try { perm = (await navigator.permissions.query({ name: "idle-detection" })).state; } catch {}
  if (perm === "granted") return startDetector();
  if (perm === "denied") { tracking = "no-permission"; return; }
  // Needs a user gesture → one-time dialog; its button click is the gesture.
  showPermissionDialog();
}

async function startDetector() {
  try {
    if (detectorAbort) detectorAbort.abort();
    detectorAbort = new AbortController();
    detectorThresholdMin = cfg.thresholdMinutes;
    detector = new IdleDetector();
    detector.addEventListener("change", () => {
      if (!amWriter || !started) return;   // non-writers never record anything
      const locked = detector.screenState === "locked";
      const idle = detector.userState === "idle" || locked;
      if (idle && clockedIn && !onBreak) {
        // The idle event fires AFTER the threshold has already elapsed, so the
        // away period really started `threshold` ago. Screen lock fires instantly.
        const startMs = locked && detector.userState !== "idle"
          ? Date.now()
          : Date.now() - cfg.thresholdMinutes * 60_000;
        openSegment(locked ? "locked" : "idle", startMs).catch((e) => console.error("presence open:", e));
      } else if (!idle) {
        closeSegment(Date.now()).catch((e) => console.error("presence close:", e));
      }
    });
    await detector.start({
      threshold: Math.max(60_000, cfg.thresholdMinutes * 60_000),
      signal: detectorAbort.signal
    });
    tracking = "ok";
    // If a previous page load left a local open segment but the user is
    // clearly back at the machine, close it now.
    if (amWriter && readOpenSeg() && detector.userState === "active" && detector.screenState !== "locked") {
      closeSegment(Date.now()).catch(() => {});
    }
  } catch (e) {
    console.error("presence detector:", e);
    tracking = "error";
  }
}

function restartDetector() {
  if (detectorThresholdMin !== cfg.thresholdMinutes && detectorAbort) startDetector();
}

// -------------------------------------------------------------- away segments
function readOpenSeg() {
  try { return JSON.parse(localStorage.getItem(segKey()) || "null"); } catch { return null; }
}

async function openSegment(reason, startMs) {
  if (!amWriter || !isLeader() || openingSeg || readOpenSeg()) return;
  openingSeg = true;
  try {
    const ref = await addDoc(collection(db, "awaySegments"), {
      uid: user.uid,
      date: melDateKey(new Date(startMs)),
      entryId,
      startUTC: Timestamp.fromMillis(startMs),
      endUTC: null, minutes: null,
      reason, open: true,
      createdAt: serverTimestamp()
    });
    try { localStorage.setItem(segKey(), JSON.stringify({ id: ref.id, startMs, reason })); } catch {}
    await presenceWrite({ state: "away", awaySince: Timestamp.fromMillis(startMs) });
  } finally {
    openingSeg = false;
  }
}

async function closeSegment(endMs) {
  const seg = readOpenSeg();
  if (!seg || !amWriter || !isLeader()) return;
  const minutes = Math.max(0, (endMs - seg.startMs) / 60_000);
  await updateDoc(doc(db, "awaySegments", seg.id), {
    endUTC: Timestamp.fromMillis(Math.max(endMs, seg.startMs)),
    minutes, open: false
  });
  try { localStorage.removeItem(segKey()); } catch {}
  await presenceWrite({ state: currentState(), awaySince: null });
}

// The writer closes any open segments it doesn't own — segments left behind by
// a device that locked/slept/closed mid-away. Returns how many it closed.
async function sweepOrphans() {
  const localId = readOpenSeg()?.id || null;
  const snap = await getDocs(query(
    collection(db, "awaySegments"),
    where("uid", "==", user.uid), where("open", "==", true)
  ));
  let closed = 0;
  for (const d of snap.docs) {
    if (d.id === localId) continue;
    const s = d.data();
    const startMs = s.startUTC?.toMillis?.() ?? Date.now();
    let endMs = Date.now();
    if (s.entryId && s.entryId !== entryId) {
      // Belongs to an already-finished shift → cap at that shift's clock-out.
      try {
        const out = (await getDoc(doc(db, "timeEntries", s.entryId))).data()?.clockOutUTC?.toMillis?.();
        if (out) endMs = out;
      } catch {}
    }
    await updateDoc(d.ref, {
      endUTC: Timestamp.fromMillis(Math.max(endMs, startMs)),
      minutes: Math.max(0, (endMs - startMs) / 60_000),
      open: false, recovered: true
    });
    closed++;
  }
  return closed;
}

// Back-fill the offline gap since this browser's last heartbeat — but only the
// part of the gap where no other device of this contractor was alive either.
async function backfillOfflineGap(p) {
  if (!clockedIn || !clockInMs) return;
  const lastBeat = Number(localStorage.getItem(beatKey()) || 0);
  if (!lastBeat) return;
  const otherAliveMs = p?.lastSeenAt?.toMillis?.() || 0;
  const gapStart = Math.max(lastBeat, clockInMs, otherAliveMs);
  const gapMin = (Date.now() - gapStart) / 60_000;
  if (gapMin < cfg.thresholdMinutes) return;
  await addDoc(collection(db, "awaySegments"), {
    uid: user.uid,
    date: melDateKey(new Date(gapStart)),
    entryId,
    startUTC: Timestamp.fromMillis(gapStart),
    endUTC: Timestamp.fromMillis(Date.now()),
    minutes: gapMin,
    reason: "offline", open: false,
    createdAt: serverTimestamp()
  });
}

// -------------------------------------------------- one-time permission dialog
function showPermissionDialog() {
  if (dialogShownThisLoad) return;
  dialogShownThisLoad = true;
  tracking = "no-permission"; // until granted

  const wrap = document.createElement("div");
  wrap.className = "presence-backdrop";
  wrap.innerHTML = `
    <div class="presence-modal">
      <h3>One-time browser permission</h3>
      <p>Vic Air HR Portal records shift attendance while you're clocked in.
         Your browser needs a one-time permission for this on this computer.</p>
      <p>Click <b>Continue</b>, then choose <b>Allow</b> on the browser message.</p>
      <div class="row-btns">
        <button class="ghost" data-act="later">Not now</button>
        <button data-act="go">Continue</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelector('[data-act="later"]').addEventListener("click", () => wrap.remove());
  wrap.querySelector('[data-act="go"]').addEventListener("click", async () => {
    try {
      const res = await IdleDetector.requestPermission(); // needs this click's gesture
      if (res === "granted") { await startDetector(); }
      else { tracking = "no-permission"; }
    } catch (e) { console.error("presence permission:", e); tracking = "no-permission"; }
    wrap.remove();
  });
}
