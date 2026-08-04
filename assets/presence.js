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
//   • Offline gap recovery — on next page load, any gap since the last heartbeat
//     while clocked in is back-filled as an 'offline' awaySegment. So closing the
//     tab or shutting the laptop still counts as away. No loopholes.
//
// Firestore:
//   settings/security     { enabled, thresholdMinutes }           (admin-written)
//   presence/{uid}        { state, tracking, entryId, lastSeenAt, awaySince, name }
//   awaySegments/{autoId} { uid, date, entryId, startUTC, endUTC, minutes, reason, open }
//     reason: 'idle' (no input) | 'locked' (screen locked) | 'offline' (app closed / asleep)
//
// Multi-tab safe: a lightweight localStorage leader election makes sure only one
// open tab writes heartbeats/segments, so nothing double-counts.

import { db } from "./firebase-init.js";
import { melDateKey } from "./time.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs,
  onSnapshot, Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const HEARTBEAT_MS = 60_000;
const OWNER_STALE_MS = 90_000;

let user = null, profile = null;
let cfg = { enabled: false, thresholdMinutes: 2 };
let cfgLoaded = false, userLoaded = false;

let clockedIn = false, entryId = null, onBreak = false, clockInMs = null;
let started = false;
let recovered = false;
let tracking = "ok";            // ok | no-permission | unsupported | error
let detectorAbort = null;
let detectorThresholdMin = null;
let hbTimer = null;
let dialogShownThisLoad = false;

const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
const ownerKey = () => `vh_presence_owner_${user.uid}`;
const beatKey  = () => `vh_presence_beat_${user.uid}`;
const segKey   = () => `vh_presence_openseg_${user.uid}`;

// ---------------------------------------------------------------- entry point
export function initPresence(u, p) {
  user = u; profile = p;

  onSnapshot(doc(db, "settings", "security"), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    const prevEnabled = cfg.enabled, prevThreshold = cfg.thresholdMinutes;
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
  try { if (isLeader() && !recovered) { recovered = true; await recoverGaps(); } } catch (e) { console.error("presence recover:", e); }

  beat();
  hbTimer = setInterval(beat, HEARTBEAT_MS);
  window.addEventListener("focus", beat);
  window.addEventListener("online", beat);
  document.addEventListener("visibilitychange", onVisible);

  setupIdleDetection();
}

async function stopTracking() {
  started = false;
  clearInterval(hbTimer); hbTimer = null;
  window.removeEventListener("focus", beat);
  window.removeEventListener("online", beat);
  document.removeEventListener("visibilitychange", onVisible);
  if (detectorAbort) { detectorAbort.abort(); detectorAbort = null; }
  try { await closeSegment(Date.now()); } catch {}
  if (isLeader()) {
    presenceWrite({ state: clockedIn ? "active" : "off", awaySince: null }).catch(() => {});
  }
}

function onVisible() { if (document.visibilityState === "visible") beat(); }

// Single-writer election so multiple open tabs don't double-log.
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

// ----------------------------------------------------------------- heartbeat
function beat() {
  if (!started || !isLeader()) return;
  try { localStorage.setItem(beatKey(), String(Date.now())); } catch {}
  presenceWrite({ lastSeenAt: serverTimestamp() }).catch((e) => console.error("presence beat:", e));
}

function currentState() {
  if (!clockedIn) return "off";
  if (onBreak) return "break";
  if (readOpenSeg()) return "away";
  return "active";
}

async function presenceWrite(extra) {
  await setDoc(doc(db, "presence", user.uid), {
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
    beat();
    return;
  }
  let perm = "prompt";
  try { perm = (await navigator.permissions.query({ name: "idle-detection" })).state; } catch {}
  if (perm === "granted") return startDetector();
  if (perm === "denied") { tracking = "no-permission"; beat(); return; }
  // Needs a user gesture → one-time dialog; its button click is the gesture.
  showPermissionDialog();
}

async function startDetector() {
  try {
    if (detectorAbort) detectorAbort.abort();
    detectorAbort = new AbortController();
    detectorThresholdMin = cfg.thresholdMinutes;
    const detector = new IdleDetector();
    detector.addEventListener("change", () => {
      const locked = detector.screenState === "locked";
      const idle = detector.userState === "idle" || locked;
      if (idle && started && clockedIn && !onBreak) {
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
    beat();
  } catch (e) {
    console.error("presence detector:", e);
    tracking = "error";
    beat();
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
  if (!isLeader() || readOpenSeg()) return;
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
}

async function closeSegment(endMs) {
  const seg = readOpenSeg();
  if (!seg || !isLeader()) return;
  const minutes = Math.max(0, (endMs - seg.startMs) / 60_000);
  await updateDoc(doc(db, "awaySegments", seg.id), {
    endUTC: Timestamp.fromMillis(Math.max(endMs, seg.startMs)),
    minutes, open: false
  });
  try { localStorage.removeItem(segKey()); } catch {}
  await presenceWrite({ state: currentState(), awaySince: null });
}

// On load: close segments a dead tab left open, and back-fill the offline gap
// since the last heartbeat. Any untracked minute while clocked in counts as away.
async function recoverGaps() {
  const snap = await getDocs(query(
    collection(db, "awaySegments"),
    where("uid", "==", user.uid), where("open", "==", true)
  ));
  let closedStale = false;
  for (const d of snap.docs) {
    const s = d.data();
    let endMs = Date.now();
    if (s.entryId && s.entryId !== entryId) {
      // Segment belongs to an already-finished shift → cap it at that clock-out.
      try {
        const out = (await getDoc(doc(db, "timeEntries", s.entryId))).data()?.clockOutUTC?.toMillis?.();
        if (out) endMs = out;
      } catch {}
    }
    const startMs = s.startUTC?.toMillis?.() ?? endMs;
    await updateDoc(d.ref, {
      endUTC: Timestamp.fromMillis(Math.max(endMs, startMs)),
      minutes: Math.max(0, (endMs - startMs) / 60_000),
      open: false, recovered: true
    });
    closedStale = true;
  }
  try { localStorage.removeItem(segKey()); } catch {}

  if (closedStale || !clockedIn || !clockInMs) return;
  const lastBeat = Number(localStorage.getItem(beatKey()) || 0);
  if (!lastBeat) return;
  const gapStart = Math.max(lastBeat, clockInMs);
  const gapMin = (Date.now() - gapStart) / 60_000;
  if (gapMin >= cfg.thresholdMinutes) {
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
}

// -------------------------------------------------- one-time permission dialog
function showPermissionDialog() {
  if (dialogShownThisLoad) return;
  dialogShownThisLoad = true;
  tracking = "no-permission"; // until granted
  beat();

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
      else { tracking = "no-permission"; beat(); }
    } catch (e) { console.error("presence permission:", e); tracking = "no-permission"; beat(); }
    wrap.remove();
  });
}
