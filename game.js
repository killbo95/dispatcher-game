const $ = (id) => document.getElementById(id);

const nameInput = $("nameInput");
const roleInput = $("roleInput");
const roomInput = $("roomInput");
const startBtn = $("startBtn");
const muteBtn = $("muteBtn");
const endBtn = $("endBtn");
const voiceNotesBtn = $("voiceNotesBtn");
const reportBtn = $("reportBtn");
const markAssistBtn = $("markAssistBtn");

const connectionStatus = $("connectionStatus");
const playerStatus = $("playerStatus");
const voiceStatus = $("voiceStatus");
const roundStatus = $("roundStatus");
const panicStatus = $("panicStatus");
const missionStatus = $("missionStatus");

const dispatcherPanel = $("dispatcherPanel");
const victimPanel = $("victimPanel");

const severityButtons = $("severityButtons");
const supportButtons = $("supportButtons");
const locationButtons = $("locationButtons");

const feed = $("feed");
const chatInput = $("chatInput");
const sendChat = $("sendChat");
const transcriptFeed = $("transcriptFeed");
const responseHints = $("responseHints");

const reportPanel = $("reportPanel");
const reportText = $("reportText");

const dispatcherMap = $("dispatcherMap");
const mapLegend = $("mapLegend");
const mapCtx = dispatcherMap.getContext("2d");

const miniModal = $("miniModal");
const victimGame = $("victimGame");
const gameHud = $("gameHud");
const gameCtx = victimGame.getContext("2d");

const remoteAudio = $("remoteAudio");

let peer = null;
let dataConn = null;
let mediaCall = null;
let localStream = null;
let remoteStream = null;
let isMuted = false;
let voiceNotesActive = false;
let recognition = null;
let connectTimer = null;
let emergencyTimer = null;
let emergencyAudioCtx = null;
let miniPopupTimer = null;
let miniModalActive = false;

let myName = "Player";
let myRole = "dispatcher";
let roomCode = "";
let localPeerId = "";
let remotePeerId = "";

let panicLevel = 40;
let missionCompleteAnnounced = false;
const keys = new Set();

const mission = {
  victimWins: 0,
  dispatcherAssists: 0,
};

const timeline = [];

const severities = ["Level 1 Calm", "Level 2 Alert", "Level 3 Critical", "Level 4 Extreme", "Level 5 Collapse"];
const supportActions = [
  "Medical support is being dispatched",
  "Fire team is moving to your floor",
  "Police support is securing the route",
  "Stay with me, you are not alone",
  "Rescue team ETA is under 3 minutes"
];
const locationCards = [
  "Location: Floor 3, north stairwell",
  "Hazard: Heavy smoke in corridor",
  "Medical: Minor injury, breathing OK",
  "Status: With one child, moving slowly"
];

const mapState = {
  severity: 1,
  supportTag: "calm",
  victimX: 0.2,
  victimY: 0.75,
  hazards: [],
};

const mini = {
  active: false,
  round: 1,
  duration: 15,
  timeLeft: 15,
  player: { x: 70, y: 120, r: 11, speed: 220 },
  obstacles: [],
  spawnTimer: 0,
  failed: false,
};

function sanitizeRoom(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
}

function setStatus() {
  connectionStatus.textContent = peer ? `Connected as ${localPeerId}` : "Disconnected";
  playerStatus.textContent = `Role: ${myRole || "-"} | Name: ${myName || "-"}`;
  voiceStatus.textContent = localStream ? `Voice: ${isMuted ? "Muted" : "Live"}` : "Voice: Off";
}

function updateMissionStatus() {
  missionStatus.textContent = `Mission: Victim ${mission.victimWins}/3 | Dispatch ${mission.dispatcherAssists}/3`;
  if (!missionCompleteAnnounced && mission.victimWins >= 3 && mission.dispatcherAssists >= 3) {
    missionCompleteAnnounced = true;
    roundStatus.textContent = "Mission Complete";
    logFeed("Mission", "System", "Mission complete. Both sides reached 3 objectives.");
    sendPayload({ kind: "mission-complete" });
    stopMiniSchedule();
  }
}

function logTimeline(type, text) {
  timeline.push({ at: new Date().toLocaleTimeString(), type, text });
  if (timeline.length > 180) timeline.shift();
}

function logFeed(type, author, text) {
  const item = document.createElement("div");
  item.className = "feedItem";
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  item.innerHTML = `<small>${time} | ${type} | ${author}</small>${escapeHtml(text)}`;
  feed.prepend(item);
  logTimeline(type, `${author}: ${text}`);
}

function logTranscript(who, text) {
  const row = document.createElement("div");
  row.textContent = `${new Date().toLocaleTimeString()} | ${who}: ${text}`;
  transcriptFeed.prepend(row);
  while (transcriptFeed.childNodes.length > 18) transcriptFeed.removeChild(transcriptFeed.lastChild);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendPayload(payload) {
  if (!dataConn || !dataConn.open) return;
  dataConn.send(payload);
}

function setPanicLevel(next, reason = "") {
  panicLevel = Math.max(0, Math.min(100, Math.round(next)));
  panicStatus.textContent = `Panic: ${panicLevel}${reason ? ` (${reason})` : ""}`;
  panicStatus.style.borderColor = panicLevel < 35 ? "#1f5a44" : panicLevel < 70 ? "#7a5a2d" : "#7c2839";
  if (myRole === "victim") sendPayload({ kind: "panic-update", value: panicLevel, reason });
}

function supportTagFromText(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("medical") || t.includes("injury")) return "medical";
  if (t.includes("fire") || t.includes("smoke")) return "fire";
  if (t.includes("police") || t.includes("secure")) return "police";
  if (t.includes("rescue") || t.includes("eta")) return "rescue";
  return "calm";
}

function buildResponseSuggestions(tag, supportText) {
  const byTag = {
    medical: ["Medical: Minor injury, breathing OK", "I can see my hands shaking; guide my breathing so I stay calm."],
    fire: ["Hazard: Heavy smoke in corridor", "I can smell heavy smoke near the hallway; tell me my next safest move."],
    police: ["Status: Door secured, waiting for route", "I can see people near the exit; help me choose the safer route."],
    rescue: ["Location: Floor 3, north stairwell", "I am next to a stairwell; stay with me until help arrives."],
    calm: ["Status: I am breathing slower now", "I can hear you. Repeat the steps one by one."]
  };
  const lines = byTag[tag] || byTag.calm;
  return [`Support received: ${supportText}`, ...lines.slice(0, 3)];
}

function renderResponseHints(items) {
  responseHints.innerHTML = "";
  items.forEach((line) => {
    const row = document.createElement("div");
    row.className = "feedItem";
    row.innerHTML = `<small>Hint</small>${escapeHtml(line)}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Send";
    btn.disabled = myRole !== "victim";
    btn.addEventListener("click", () => {
      logFeed("Hint", myName, line);
      sendPayload({ kind: "victim-line", text: line });
    });

    row.appendChild(btn);
    responseHints.appendChild(row);
  });
}

function configureRoleUI() {
  const isDispatcher = myRole === "dispatcher";
  dispatcherPanel.classList.toggle("hidden", !isDispatcher);
  victimPanel.classList.toggle("hidden", isDispatcher);
  markAssistBtn.disabled = !isDispatcher;
  roundStatus.textContent = isDispatcher ? "Round: Dispatching" : "Round: Survival";
}

function stopMiniSchedule() {
  if (miniPopupTimer) {
    clearTimeout(miniPopupTimer);
    miniPopupTimer = null;
  }
}

function scheduleMiniPopup() {
  scheduleMiniPopup();
  if (myRole !== "victim" || mission.victimWins >= 3 || missionCompleteAnnounced) return;
  const delay = 30000;
  miniPopupTimer = setTimeout(() => {
    openMiniModal();
  }, delay);
}


function openMiniModal() {
  if (myRole !== "victim" || mission.victimWins >= 3 || missionCompleteAnnounced) return;
  miniModalActive = true;
  miniModal.classList.remove("hidden");
  miniModal.setAttribute("aria-hidden", "false");
  const nextRound = Math.min(3, mission.victimWins + 1);
  resetMiniRound(nextRound);
}

function closeMiniModal() {
  miniModalActive = false;
  miniModal.classList.add("hidden");
  miniModal.setAttribute("aria-hidden", "true");
  mini.active = false;
  scheduleMiniPopup();
}

function randomHazards(level) {
  const n = Math.min(10, 2 + level);
  mapState.hazards = Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random() }));
}

function drawDispatcherMap() {
  const w = dispatcherMap.width;
  const h = dispatcherMap.height;
  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = "#0b1422";
  mapCtx.fillRect(0, 0, w, h);

  mapCtx.strokeStyle = "rgba(110,140,190,0.25)";
  for (let x = 0; x <= w; x += 38) {
    mapCtx.beginPath(); mapCtx.moveTo(x, 0); mapCtx.lineTo(x, h); mapCtx.stroke();
  }
  for (let y = 0; y <= h; y += 32) {
    mapCtx.beginPath(); mapCtx.moveTo(0, y); mapCtx.lineTo(w, y); mapCtx.stroke();
  }

  mapState.hazards.forEach((hz) => {
    mapCtx.beginPath();
    mapCtx.fillStyle = "rgba(255,90,115,0.9)";
    mapCtx.arc(hz.x * w, hz.y * h, 6, 0, Math.PI * 2);
    mapCtx.fill();
  });

  mapCtx.beginPath();
  mapCtx.fillStyle = "#79d0ff";
  mapCtx.arc(mapState.victimX * w, mapState.victimY * h, 7, 0, Math.PI * 2);
  mapCtx.fill();

  mapCtx.fillStyle = "#cde2ff";
  mapCtx.font = "12px Segoe UI";
  mapCtx.fillText(`Severity ${mapState.severity} | Support ${mapState.supportTag}`, 10, 16);
}

function parseLocationToMap(text) {
  const chars = Array.from(text || "").map((c) => c.charCodeAt(0));
  const s = chars.reduce((a, b) => a + b, 0) || 30;
  mapState.victimX = ((s % 100) / 100) * 0.8 + 0.1;
  mapState.victimY = (((s * 7) % 100) / 100) * 0.8 + 0.1;
}

function startEmergencyBeep() {
  if (emergencyTimer || myRole !== "dispatcher") return;
  if (!emergencyAudioCtx) emergencyAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

  emergencyTimer = setInterval(() => {
    const o = emergencyAudioCtx.createOscillator();
    const g = emergencyAudioCtx.createGain();
    o.type = "square";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g).connect(emergencyAudioCtx.destination);
    o.start();
    setTimeout(() => o.stop(), 130);
  }, 700);

  logFeed("Alert", "System", "Emergency beeps active: victim critical.");
}

function stopEmergencyBeep() {
  if (!emergencyTimer) return;
  clearInterval(emergencyTimer);
  emergencyTimer = null;
  logFeed("Alert", "System", "Emergency beeps stopped.");
}

function forceVictimMicDown() {
  if (myRole !== "victim") return;
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => { t.enabled = false; });
  }
  voiceStatus.textContent = "Voice: Down (Critical)";
  muteBtn.disabled = true;
  sendPayload({ kind: "victim-critical", active: true });
}

function recoverVictimMic() {
  if (myRole !== "victim") return;
  if (localStream) {
    localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
  }
  muteBtn.disabled = false;
  setStatus();
  sendPayload({ kind: "victim-critical", active: false });
}

function resetMiniRound(round) {
  mini.active = true;
  mini.failed = false;
  mini.round = round;
  mini.duration = 12 + round * 2;
  mini.timeLeft = mini.duration;
  mini.player.x = 70;
  mini.player.y = victimGame.height / 2;
  mini.obstacles = [];
  mini.spawnTimer = 0;
  gameHud.textContent = `Round ${round} | Time ${mini.timeLeft.toFixed(1)}s`;
}

function handleMiniFail() {
  mini.active = false;
  mini.failed = true;
  gameHud.textContent = `Round ${mini.round} failed. Mic down...`;
  setPanicLevel(panicLevel + 20, "Collision");
  forceVictimMicDown();
  closeMiniModal();
  setTimeout(() => {
    recoverVictimMic();
  }, 7000);
}

function handleMiniWin() {
  mini.active = false;
  mission.victimWins = Math.min(3, mission.victimWins + 1);
  sendPayload({ kind: "victim-round-win", value: mission.victimWins });
  updateMissionStatus();
  gameHud.textContent = `Round ${mini.round} complete.`;
  closeMiniModal();
  if (mission.victimWins >= 3) {
    gameHud.textContent = "Victim objective complete (3/3).";
  }
}

function updateMini(dt) {
  if (myRole !== "victim" || !mini.active || !miniModalActive || mission.victimWins >= 3) return;

  const up = keys.has("w") || keys.has("arrowup");
  const down = keys.has("s") || keys.has("arrowdown");
  const left = keys.has("a") || keys.has("arrowleft");
  const right = keys.has("d") || keys.has("arrowright");

  const vx = (right ? 1 : 0) - (left ? 1 : 0);
  const vy = (down ? 1 : 0) - (up ? 1 : 0);
  const mag = Math.hypot(vx, vy) || 1;

  mini.player.x += (vx / mag) * mini.player.speed * dt;
  mini.player.y += (vy / mag) * mini.player.speed * dt;

  mini.player.x = Math.max(mini.player.r, Math.min(victimGame.width - mini.player.r, mini.player.x));
  mini.player.y = Math.max(mini.player.r, Math.min(victimGame.height - mini.player.r, mini.player.y));

  mini.spawnTimer -= dt;
  if (mini.spawnTimer <= 0) {
    mini.spawnTimer = Math.max(0.28, 0.75 - mini.round * 0.08);
    mini.obstacles.push({
      x: victimGame.width + 20,
      y: 20 + Math.random() * (victimGame.height - 40),
      r: 8 + Math.random() * 8,
      vx: 110 + mini.round * 35 + Math.random() * 50,
    });
  }

  mini.obstacles.forEach((o) => { o.x -= o.vx * dt; });
  mini.obstacles = mini.obstacles.filter((o) => o.x > -40);

  for (const o of mini.obstacles) {
    if (Math.hypot(o.x - mini.player.x, o.y - mini.player.y) < o.r + mini.player.r) {
      handleMiniFail();
      return;
    }
  }

  mini.timeLeft -= dt;
  gameHud.textContent = `Round ${mini.round} | Time ${Math.max(0, mini.timeLeft).toFixed(1)}s`;
  if (mini.timeLeft <= 0) handleMiniWin();
}

function drawMini() {
  const w = victimGame.width;
  const h = victimGame.height;
  gameCtx.clearRect(0, 0, w, h);
  gameCtx.fillStyle = "#091321";
  gameCtx.fillRect(0, 0, w, h);

  for (let x = 0; x <= w; x += 35) {
    gameCtx.strokeStyle = "rgba(95,130,180,0.18)";
    gameCtx.beginPath(); gameCtx.moveTo(x, 0); gameCtx.lineTo(x, h); gameCtx.stroke();
  }

  mini.obstacles.forEach((o) => {
    gameCtx.beginPath();
    gameCtx.fillStyle = "#ff6a84";
    gameCtx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    gameCtx.fill();
  });

  gameCtx.beginPath();
  gameCtx.fillStyle = "#79d8ff";
  gameCtx.arc(mini.player.x, mini.player.y, mini.player.r, 0, Math.PI * 2);
  gameCtx.fill();
}

function setupDispatcherControls() {
  severityButtons.innerHTML = "";
  supportButtons.innerHTML = "";

  severities.forEach((label, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      mapState.severity = idx + 1;
      randomHazards(mapState.severity);
      roundStatus.textContent = `Round: ${label}`;
      logFeed("Dispatch", myName, `Incident set to ${label}`);
      sendPayload({ kind: "dispatch", text: `Incident ${label}`, score: idx + 1 });
    });
    severityButtons.appendChild(b);
  });

  supportActions.forEach((line) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = line;
    b.addEventListener("click", () => {
      const tag = supportTagFromText(line);
      mapState.supportTag = tag;
      logFeed("Support", myName, line);
      sendPayload({ kind: "support", text: line, tag });

      const buttons = Array.from(supportButtons.querySelectorAll("button"));
      buttons.forEach((x) => x.disabled = true);
      let left = 12;
      b.textContent = `Sent (${left}s)`;
      const t = setInterval(() => {
        left -= 1;
        b.textContent = left > 0 ? `Sent (${left}s)` : line;
        if (left <= 0) {
          clearInterval(t);
          buttons.forEach((x) => x.disabled = myRole !== "dispatcher");
        }
      }, 1000);
    });
    supportButtons.appendChild(b);
  });

  markAssistBtn.addEventListener("click", () => {
    if (myRole !== "dispatcher") return;
    mission.dispatcherAssists = Math.min(3, mission.dispatcherAssists + 1);
    sendPayload({ kind: "dispatch-assist", value: mission.dispatcherAssists });
    logFeed("Mission", myName, "Dispatch assist marked complete.");
    updateMissionStatus();
  });
}

function setupLocationCards() {
  locationButtons.innerHTML = "";
  locationCards.forEach((line) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = line;
    b.addEventListener("click", () => {
      logFeed("Location", myName, line);
      parseLocationToMap(line);
      sendPayload({ kind: "location", text: line });
    });
    locationButtons.appendChild(b);
  });
}

function setupVoiceNotes() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceNotesBtn.disabled = true;
    return;
  }

  recognition = new SR();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      if (!ev.results[i].isFinal) continue;
      const text = ev.results[i][0].transcript.trim();
      if (!text) continue;
            logTranscript(myName, text);
      logFeed("Voice Note", myName, text);
      sendPayload({ kind: "transcript", text });
    }
  };

  recognition.onend = () => {
    if (voiceNotesActive) {
      try { recognition.start(); } catch {}
    }
  };
}

function toggleVoiceNotes() {
  if (!recognition) return;
  if (!voiceNotesActive) {
    voiceNotesActive = true;
    voiceNotesBtn.textContent = "Stop Voice Notes";
    try { recognition.start(); } catch {}
  } else {
    voiceNotesActive = false;
    voiceNotesBtn.textContent = "Start Voice Notes";
    recognition.stop();
  }
}

function bindDataConnection(conn) {
  dataConn = conn;

  conn.on("open", () => {
    logFeed("System", "Game", "Data channel connected.");
    sendPayload({ kind: "intro", text: `${myName} joined as ${myRole}.` });
    sendPayload({ kind: "mission-sync", victimWins: mission.victimWins, dispatcherAssists: mission.dispatcherAssists });
  });

  conn.on("data", (payload) => {
    if (!payload || typeof payload !== "object") return;

    if (payload.kind === "intro") {
      logFeed("Intro", "Peer", payload.text);
      return;
    }

    if (payload.kind === "dispatch") {
      mapState.severity = payload.score || mapState.severity;
      randomHazards(mapState.severity);
      logFeed("Dispatch", "Peer", payload.text);
      if (myRole === "victim" && payload.score) setPanicLevel(panicLevel + payload.score * 8, `Severity +${payload.score}`);
      return;
    }

    if (payload.kind === "support") {
      mapState.supportTag = payload.tag || supportTagFromText(payload.text);
      logFeed("Support", "Peer", payload.text);
      if (myRole === "victim") {
        setPanicLevel(panicLevel - 15, "Support active");
        renderResponseHints(buildResponseSuggestions(mapState.supportTag, payload.text));
      }
      return;
    }

    if (payload.kind === "location") {
      parseLocationToMap(payload.text);
      mapLegend.textContent = `Latest location: ${payload.text}`;
      logFeed("Location", "Peer", payload.text);
      return;
    }

    if (payload.kind === "transcript") {
      logTranscript("Peer", payload.text);
      logFeed("Voice Note", "Peer", payload.text);
      return;
    }

    if (payload.kind === "panic-update") {
      if (myRole === "dispatcher") panicStatus.textContent = `Peer Panic: ${payload.value}`;
      return;
    }

    if (payload.kind === "victim-critical") {
      if (myRole === "dispatcher") {
        if (payload.active) startEmergencyBeep();
        else stopEmergencyBeep();
      }
      return;
    }

    if (payload.kind === "victim-round-win") {
      mission.victimWins = Math.max(mission.victimWins, payload.value || 0);
      updateMissionStatus();
      return;
    }

    if (payload.kind === "dispatch-assist") {
      mission.dispatcherAssists = Math.max(mission.dispatcherAssists, payload.value || 0);
      updateMissionStatus();
      return;
    }

    if (payload.kind === "mission-sync") {
      mission.victimWins = Math.max(mission.victimWins, payload.victimWins || 0);
      mission.dispatcherAssists = Math.max(mission.dispatcherAssists, payload.dispatcherAssists || 0);
      updateMissionStatus();
      return;
    }

    if (payload.kind === "mission-complete") {
      roundStatus.textContent = "Mission Complete";
      logFeed("Mission", "Peer", "Mission complete confirmed.");
      missionCompleteAnnounced = true;
      scheduleMiniPopup();
      return;
    }

    if (payload.kind === "victim-line") {
      logFeed("Victim", "Peer", payload.text);
      return;
    }

    if (payload.kind === "chat") {
      logFeed("Chat", "Peer", payload.text);
    }
  });
}

function placeCall() {
  if (!peer || !localStream) return;
  if (!dataConn || !dataConn.open) {
    const outgoing = peer.connect(remotePeerId, { reliable: true });
    bindDataConnection(outgoing);
  }
  if (!mediaCall) {
    mediaCall = peer.call(remotePeerId, localStream);
    attachCallHandlers(mediaCall);
  }
}

function attachCallHandlers(call) {
  if (!call) return;
  call.on("stream", (stream) => {
    remoteStream = stream;
    remoteAudio.srcObject = stream;
    logFeed("Voice", "Game", "Remote voice stream connected.");
  });
}

async function setupVoice() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  setStatus();
}

function clearConnectLoop() {
  if (connectTimer) {
    clearInterval(connectTimer);
    connectTimer = null;
  }
}

function startConnectLoop() {
  clearConnectLoop();
  connectTimer = setInterval(() => {
    if (!peer || peer.destroyed) return;
    if (dataConn && dataConn.open && mediaCall) {
      clearConnectLoop();
      return;
    }
    placeCall();
  }, 2200);
}

function buildReport() {
  const latest = timeline.slice(-20).reverse();
  const lines = [
    "=== MISSION REPORT ===",
    `Role: ${myRole}`,
    `Victim rounds complete: ${mission.victimWins}/3`,
    `Dispatcher assists complete: ${mission.dispatcherAssists}/3`,
    `Final panic level: ${panicLevel}`,
    `Mission complete: ${mission.victimWins >= 3 && mission.dispatcherAssists >= 3 ? "YES" : "NO"}`,
    "",
    "=== TIMELINE ===",
    ...latest.map((x) => `- ${x.at} | ${x.type} | ${x.text}`),
  ];
  return lines.join("\n");
}

function showReport() {
  reportText.textContent = buildReport();
  reportPanel.classList.remove("hidden");
}

function teardown() {
  clearConnectLoop();
  stopEmergencyBeep();
  scheduleMiniPopup();
  miniModalActive = false;
  miniModal.classList.add("hidden");

  if (voiceNotesActive && recognition) {
    voiceNotesActive = false;
    recognition.stop();
    voiceNotesBtn.textContent = "Start Voice Notes";
  }

  if (mediaCall) mediaCall.close();
  if (dataConn) dataConn.close();
  if (peer) peer.destroy();

  if (localStream) localStream.getTracks().forEach((t) => t.stop());

  mediaCall = null;
  dataConn = null;
  peer = null;
  localStream = null;
  remoteStream = null;
  remoteAudio.srcObject = null;

  muteBtn.disabled = true;
  endBtn.disabled = true;
  reportBtn.disabled = true;
  voiceNotesBtn.disabled = true;
  startBtn.disabled = false;
  connectionStatus.textContent = "Disconnected";
  voiceStatus.textContent = "Voice: Off";
}

async function joinSession() {
  myName = (nameInput.value || "Player").trim().slice(0, 24) || "Player";
  myRole = roleInput.value;
  roomCode = sanitizeRoom(roomInput.value);
  if (!roomCode) return;

  localPeerId = `${roomCode}-${myRole}`;
  remotePeerId = `${roomCode}-${myRole === "dispatcher" ? "victim" : "dispatcher"}`;

  startBtn.disabled = true;
  muteBtn.disabled = false;
  endBtn.disabled = false;
  reportBtn.disabled = false;
  voiceNotesBtn.disabled = false;

  mission.victimWins = 0;
  mission.dispatcherAssists = 0;
  missionCompleteAnnounced = false;
    updateMissionStatus();
  setPanicLevel(40);

  configureRoleUI();
  renderResponseHints(["Wait for dispatch support to see auto suggestions."]);
  randomHazards(1);

  mini.active = false;
  miniModalActive = false;
  miniModal.classList.add("hidden");
  scheduleMiniPopup();

  try {
    await setupVoice();
  } catch {
    startBtn.disabled = false;
    muteBtn.disabled = true;
    endBtn.disabled = true;
    return;
  }

  peer = new Peer(localPeerId, { host: "0.peerjs.com", secure: true, port: 443, debug: 1 });

  peer.on("open", (id) => {
    connectionStatus.textContent = `Connected as ${id}`;
    logFeed("System", "Game", `Joined room ${roomCode}. Waiting for ${remotePeerId}...`);
    startConnectLoop();
  });

  peer.on("connection", bindDataConnection);

  peer.on("call", (incomingCall) => {
    mediaCall = incomingCall;
    incomingCall.answer(localStream);
    attachCallHandlers(incomingCall);
  });
}

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

startBtn.addEventListener("click", joinSession);
endBtn.addEventListener("click", () => { showReport(); teardown(); });
reportBtn.addEventListener("click", showReport);
voiceNotesBtn.addEventListener("click", toggleVoiceNotes);

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => { track.enabled = !isMuted; });
  muteBtn.textContent = isMuted ? "Unmute Mic" : "Mute Mic";
  setStatus();
  if (!isMuted && !recognition) {
      }
});

sendChat.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  logFeed("Chat", myName, text);
  sendPayload({ kind: "chat", text });
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat.click();
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  updateMini(dt);
  drawMini();
  drawDispatcherMap();
  requestAnimationFrame(loop);
}

setupDispatcherControls();
setupLocationCards();
setupVoiceNotes();
configureRoleUI();
renderResponseHints(["Wait for dispatch support to see auto suggestions."]);
updateMissionStatus();
setPanicLevel(40);
setStatus();
logFeed("System", "Game", "Pick role + room code, then press Start / Join Session.");
requestAnimationFrame(loop);