const $ = (id) => document.getElementById(id);

const nameInput = $("nameInput");
const roleInput = $("roleInput");
const roomInput = $("roomInput");
const mainMenu = $("mainMenu");
const lobbyPanel = $("lobbyPanel");
const createTile = $("createTile");
const joinTile = $("joinTile");
const browseTile = $("browseTile");
const soloTile = $("soloTile");
const backMenuBtn = $("backMenuBtn");
const openLobbyList = $("openLobbyList");
const lobbyPanelTitle = $("lobbyPanelTitle");
const lobbyPanelHint = $("lobbyPanelHint");
const createRoomBtn = $("createRoomBtn");
const joinRoomBtn = $("joinRoomBtn");
const lobbyStatus = $("lobbyStatus");
const muteBtn = $("muteBtn");
const endBtn = $("endBtn");
const voiceNotesBtn = $("voiceNotesBtn");
const reportBtn = $("reportBtn");
const markAssistBtn = $("markAssistBtn");
const forceMiniBtn = $("forceMiniBtn");

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
let lobbyPeer = null;
let lobbyConn = null;
let lobbyMode = null;
let mediaCall = null;
let localStream = null;
let remoteStream = null;
let isMuted = false;
let voiceNotesActive = false;
let recognition = null;
let connectTimer = null;
let emergencyTimer = null;
let emergencyAudioCtx = null;
let miniInterval = null;
let soloAiActive = false;
let soloAiTimer = null;
let soloAiScenario = null;

const scoreState = {
  score: 0,
  callsHandled: 0,
  correctActions: 0,
  mistakes: 0,
  responseSeconds: [],
  currentCall: null,
  callStartedAt: 0,
  shiftStartedAt: Date.now(),
};

const RANDOM_CALLS = [
  { type: "Medical", title: "Medical emergency", location: "Al Noor School, east entrance", detail: "A student has collapsed and needs medical assistance.", severity: 3, target: "medical" },
  { type: "Fire", title: "Smoke reported", location: "Harbor Heights, Floor 6", detail: "A caller reports heavy smoke near a hallway.", severity: 4, target: "fire" },
  { type: "Traffic", title: "Road collision", location: "Airport Road, Junction 4", detail: "Two vehicles are blocking a lane after a collision.", severity: 3, target: "police" },
  { type: "Rescue", title: "Person trapped", location: "Central Mall, service corridor", detail: "A caller is stuck behind a blocked service door.", severity: 4, target: "rescue" },
  { type: "Missing Person", title: "Missing child", location: "Riverside Park, north gate", detail: "A parent reports that their child is missing near the north gate.", severity: 2, target: "police" },
];

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

const MINI_INTERVAL_MS = 45000;

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
  connectionStatus.textContent = peer ? `Connected as ${localPeerId}` : soloAiActive ? "Solo AI Connected" : "Disconnected";
  playerStatus.textContent = `Role: ${myRole || "-"} | Name: ${myName || "-"}`;
  voiceStatus.textContent = localStream ? `Voice: ${isMuted ? "Muted" : "Live"}` : soloAiActive ? "Voice: AI Ready" : "Voice: Off";
}

function scoreAction(points, label) {
  scoreState.score = Math.max(0, scoreState.score + points);
  if (points > 0) scoreState.correctActions += 1;
  if (points < 0) scoreState.mistakes += 1;
  logFeed("Score", "System", label + " " + (points >= 0 ? "+" : "") + points + " points. Score: " + scoreState.score);
}

function rankForScore(score) {
  if (score >= 500) return "Elite Dispatcher";
  if (score >= 350) return "Senior Dispatcher";
  if (score >= 200) return "Dispatcher";
  return "Rookie Dispatcher";
}

function nextRandomCall(force = false) {
  if (myRole !== "dispatcher" || soloAiActive) return;
  if (scoreState.currentCall && !force) return;
  const call = RANDOM_CALLS[Math.floor(Math.random() * RANDOM_CALLS.length)];
  scoreState.currentCall = call;
  scoreState.callStartedAt = Date.now();
  mapState.severity = call.severity;
  mapState.supportTag = call.target;
  randomHazards(call.severity);
  parseLocationToMap(call.location);
  mapLegend.textContent = "Incoming " + call.type + ": " + call.location;
  roundStatus.textContent = "INCOMING: " + call.title;
  logFeed("Incoming Call", "911", call.title + " — " + call.location + ". " + call.detail);
}

function resolveRandomCall(actionTag) {
  const call = scoreState.currentCall;
  if (!call || myRole !== "dispatcher") return;
  const elapsed = Math.max(1, Math.round((Date.now() - scoreState.callStartedAt) / 1000));
  scoreState.responseSeconds.push(elapsed);
  const correct = actionTag === call.target;
  if (correct) {
    const speedBonus = Math.max(0, 40 - elapsed * 2);
    scoreAction(60 + speedBonus, "Correct " + call.type + " response");
    logFeed("Call Resolved", "System", "Good dispatch. Response time: " + elapsed + "s.");
    scoreState.callsHandled += 1;
  } else {
    scoreAction(-25, "Wrong support for " + call.type);
    logFeed("Call Warning", "System", "That response did not match the emergency. Match the support to the incident.");
  }
  scoreState.currentCall = null;
  setTimeout(() => nextRandomCall(), 1800);
}

function updateMissionStatus() {
  missionStatus.textContent = `Mission: Victim ${mission.victimWins}/3 | Dispatch ${mission.dispatcherAssists}/3`;
  if (!missionCompleteAnnounced && mission.victimWins >= 3 && mission.dispatcherAssists >= 3) {
    missionCompleteAnnounced = true;
    roundStatus.textContent = "Mission Complete";
    logFeed("Mission", "System", "Mission complete. Both sides reached 3 objectives.");
    sendPayload({ kind: "mission-complete" });
    stopMiniSchedule();
    stopSoloAI();
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
  item.innerHTML = `<small>${time} | ${type} | ${escapeHtml(author)}</small>${escapeHtml(text)}`;
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
    .replace(/"/g, "&quot;")
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
  if (myRole === "victim" && !soloAiActive) sendPayload({ kind: "panic-update", value: panicLevel, reason });
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
    btn.disabled = myRole !== "victim" || soloAiActive;
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
  forceMiniBtn.disabled = !isDispatcher || soloAiActive;
  roundStatus.textContent = soloAiActive ? "Round: AI Dispatch" : isDispatcher ? "Round: Dispatching" : "Round: Survival";
}

function stopMiniSchedule() {
  if (miniInterval) {
    clearInterval(miniInterval);
    miniInterval = null;
  }
}

function startMiniSchedule() {
  stopMiniSchedule();
  if (myRole !== "victim" || missionCompleteAnnounced) return;
  miniInterval = setInterval(() => {
    if (myRole !== "victim" || mission.victimWins >= 3 || missionCompleteAnnounced) return;
    if (!mini.active) openMiniModal();
  }, MINI_INTERVAL_MS);
}

function openMiniModal() {
  if (myRole !== "victim" || mission.victimWins >= 3 || missionCompleteAnnounced) return;
  mini.active = true;
  miniModal.classList.remove("hidden");
  miniModal.setAttribute("aria-hidden", "false");
  const nextRound = Math.min(3, mission.victimWins + 1);
  resetMiniRound(nextRound);
}

function closeMiniModal() {
  mini.active = false;
  miniModal.classList.add("hidden");
  miniModal.setAttribute("aria-hidden", "true");
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
  if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = false; });
  voiceStatus.textContent = "Voice: Down (Critical)";
  muteBtn.disabled = true;
  sendPayload({ kind: "victim-critical", active: true });
}

function recoverVictimMic() {
  if (myRole !== "victim") return;
  if (localStream) localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
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
  setTimeout(() => recoverVictimMic(), 6500);
}

function handleMiniWin() {
  mini.active = false;
  mission.victimWins = Math.min(3, mission.victimWins + 1);
  sendPayload({ kind: "victim-round-win", value: mission.victimWins });
  updateMissionStatus();
  gameHud.textContent = `Round ${mini.round} complete.`;
  closeMiniModal();
  if (mission.victimWins >= 3) gameHud.textContent = "Victim objective complete (3/3).";
}

function updateMini(dt) {
  if (myRole !== "victim" || !mini.active || mission.victimWins >= 3) return;

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
      if (soloAiActive) soloAIReact("severity", label);
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
      resolveRandomCall(tag);
      logFeed("Support", myName, line);
      sendPayload({ kind: "support", text: line, tag });
      if (soloAiActive) soloAIReact("support", line);

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
    if (soloAiActive) soloAIReact("assist", mission.dispatcherAssists);
  });

  forceMiniBtn.addEventListener("click", () => {
    if (myRole !== "dispatcher" || soloAiActive) return;
    logFeed("Dispatch", myName, "Forced victim mini-game.");
    sendPayload({ kind: "force-mini" });
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
      if (soloAiActive) soloAIReact("voice", text);
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

function speakAI(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.02;
  utterance.pitch = 1.05;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}

const SOLO_SCENARIOS = [
  {
    id: "north-stairwell",
    title: "North Stairwell",
    intro: "Dispatcher, do you copy? I am Alex. I am trapped near the north stairwell. Smoke is coming through the corridor.",
    timer: [
      "The smoke is getting thicker. I can still see the stairwell sign.",
      "I hear an alarm below me. I need one clear instruction.",
      "There is a door ahead and the hallway is getting harder to see."
    ],
    route: "I can see the stairwell now. Tell me if I should move or stay where I am.",
    success: "I made it closer to the safe route. Keep talking to me."
  },
  {
    id: "parking-garage",
    title: "Parking Garage",
    intro: "Dispatcher, this is Alex. I am in the lower parking garage. I cannot tell which ramp leads outside.",
    timer: [
      "I hear vehicles moving somewhere nearby. The visibility is poor.",
      "My phone is at low battery. Please keep your instructions short.",
      "I found two ramps. One has brighter lights, but I do not know which is safer."
    ],
    route: "I am near the ramp now. Give me the safest direction and I will follow it.",
    success: "Okay, I found a clearer path. I am staying with your instructions."
  },
  {
    id: "mall-service-corridor",
    title: "Service Corridor",
    intro: "Dispatcher, I need help. I am Alex, stuck in a service corridor behind the main shops. I can hear an alarm.",
    timer: [
      "The alarm just changed. I think something is happening closer to me.",
      "I found a marked exit, but there is a blocked section between us.",
      "I can hear people on the other side of a door. I need to know what to do."
    ],
    route: "I found the marked exit. I will move carefully and stay away from the blocked area.",
    success: "Your instructions worked. I am in a safer position now."
  }
];

function startSoloAI() {
  stopSoloAI();
  soloAiActive = true;
  myRole = "dispatcher";
  myName = (nameInput.value || "Dispatcher").trim().slice(0, 24) || "Dispatcher";
  mission.victimWins = 0;
  mission.dispatcherAssists = 0;
  missionCompleteAnnounced = false;
  panicLevel = 48;

  const scenario = SOLO_SCENARIOS[Math.floor(Math.random() * SOLO_SCENARIOS.length)];
  soloAiScenario = {
    turn: 0,
    pressure: 0,
    name: "Alex",
    lastPrompt: "",
    respondedTo: new Set(),
    scenario,
    phase: 0,
    supportCount: 0,
    routeGiven: false,
    calmCount: 0,
    lastActionAt: Date.now()
  };

  configureRoleUI();
  updateMissionStatus();
  setStatus();
  renderResponseHints([]);
  randomHazards(2);
  mapLegend.textContent = `AI incident: ${scenario.title}`;
  roundStatus.textContent = "Round: AI Dispatch";
  setLobbyStatus(`AI caller online — incident: ${scenario.title}. Use chat, Voice Notes, or the dispatch controls.`, "success");
  logFeed("Incident", "System", `New AI emergency: ${scenario.title}`);
  logFeed("AI Caller", "Alex", scenario.intro);
  speakAI(scenario.intro);
  scheduleSoloAI(3200);
}

function stopSoloAI() {
  soloAiActive = false;
  if (soloAiTimer) {
    clearTimeout(soloAiTimer);
    soloAiTimer = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  soloAiScenario = null;
}

function scheduleSoloAI(delay = 3200) {
  if (!soloAiActive) return;
  if (soloAiTimer) clearTimeout(soloAiTimer);
  soloAiTimer = setTimeout(() => {
    if (!soloAiActive || !soloAiScenario) return;
    soloAIReact("timer", "");
  }, delay);
}

function soloAIReply(text) {
  if (!soloAiActive || !text) return;
  logTranscript("AI Caller", text);
  logFeed("AI Caller", "Alex", text);
  speakAI(text);
}

function soloAIReact(type, text) {
  if (!soloAiActive || !soloAiScenario) return;
  const s = soloAiScenario;
  s.turn += 1;
  s.lastActionAt = Date.now();
  const lower = (text || "").toLowerCase();

  if (type === "timer") {
    s.phase = Math.min(s.phase + 1, s.scenario.timer.length - 1);
    const line = s.scenario.timer[s.phase];
    soloAIReply(line);
    setPanicLevel(Math.min(100, panicLevel + (s.phase >= 2 ? 9 : 6)), "AI pressure");

    if (panicLevel >= 82) {
      startEmergencyBeep();
      soloAIReply("I am starting to panic. Please give me one simple instruction now.");
    } else if (s.phase === s.scenario.timer.length - 1 && !s.routeGiven) {
      soloAIReply(s.scenario.route);
    }

    scheduleSoloAI(panicLevel >= 80 ? 3800 : 5600);
    return;
  }

  if (type === "severity") {
    s.pressure += 1;
    mapState.severity = Math.max(mapState.severity, Number((text.match(/\d+/) || [1])[0]));
    setPanicLevel(Math.min(100, panicLevel + 4 + s.pressure), "Severity response");

    if (mapState.severity >= 4) {
      soloAIReply("That is critical. I need reassurance and a safe route out. Please keep your next instruction short.");
    } else if (mapState.severity >= 3) {
      soloAIReply("Understood. I can handle this, but the situation is getting worse. What is my next move?");
    } else {
      soloAIReply("Okay. I understand the situation. Keep monitoring me and tell me what to do.");
    }
    scheduleSoloAI(5000);
    return;
  }

  if (type === "support") {
    const tag = supportTagFromText(text);
    s.supportCount += 1;
    mapState.supportTag = tag;
    setPanicLevel(Math.max(10, panicLevel - 16), "Support received");

    const replies = {
      medical: "Thank you. I am not badly hurt, but I am shaken. Stay with me while I move.",
      fire: "I see the smoke. I will keep away from it and move only when you tell me the route.",
      police: "Understood. I will stay out of the open area and wait for the safe route.",
      rescue: "Okay, I can hear that help is coming. I will stay focused on your instructions.",
      calm: "That helps. I can focus again. Tell me exactly what you want me to do."
    };
    soloAIReply(replies[tag] || replies.calm);
    if (s.supportCount >= 2 && !s.routeGiven) {
      soloAIReply(s.scenario.route);
    }
    scheduleSoloAI(5200);
    return;
  }

  if (type === "assist") {
    setPanicLevel(Math.max(8, panicLevel - 11), "Assist confirmed");
    if (mission.dispatcherAssists >= 1 && mission.dispatcherAssists < 3) {
      s.routeGiven = true;
      soloAIReply(s.scenario.success);
      mapState.victimX = Math.min(0.9, mapState.victimX + 0.12);
      mapState.victimY = Math.max(0.1, mapState.victimY - 0.08);
    }
    if (mission.dispatcherAssists >= 3) {
      mission.victimWins = 3;
      updateMissionStatus();
      soloAIReply("I can see the rescue team now. We made it out. Mission complete.");
      stopEmergencyBeep();
      return;
    }
    scheduleSoloAI(4800);
    return;
  }

  if (type === "voice" || type === "chat") {
    const calming = /stay|calm|breathe|wait|listen|with me|do not panic|don't panic/.test(lower);
    const route = /exit|stairs|stairwell|move|route|door|ramp|left|right|north|south|east|west|away/.test(lower);
    const rescue = /rescue|fire|police|medical|ambulance|help is coming|support/.test(lower);

    if (calming) {
      s.calmCount += 1;
      setPanicLevel(Math.max(8, panicLevel - 12), "Dispatcher response");
      soloAIReply(s.calmCount >= 2 ? "I am calmer now. I can follow your instructions." : "Okay. I hear you. I am staying calm and listening.");
    } else if (route) {
      s.routeGiven = true;
      setPanicLevel(Math.max(8, panicLevel - 9), "Route given");
      mapState.victimX = Math.min(0.9, mapState.victimX + 0.06);
      soloAIReply("Got it. I will move carefully toward that route and tell you if anything changes.");
      if (s.turn % 2 === 0) soloAIReply("I found the route you described. I am moving now.");
    } else if (rescue) {
      setPanicLevel(Math.max(12, panicLevel - 8), "Help confirmed");
      soloAIReply("Understood. I will stay in a safe position until help reaches me.");
    } else {
      setPanicLevel(Math.min(100, panicLevel + 3), "Unclear instruction");
      soloAIReply("I heard you, but I need a clearer instruction. Tell me one action and one direction.");
    }

    if (panicLevel <= 15 && s.routeGiven) {
      mission.dispatcherAssists = Math.min(3, mission.dispatcherAssists + 1);
      updateMissionStatus();
    }
    if (panicLevel >= 88) startEmergencyBeep();
    scheduleSoloAI(panicLevel >= 80 ? 4000 : 6000);
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

    if (payload.kind === "intro") { logFeed("Intro", "Peer", payload.text); return; }

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

    if (payload.kind === "transcript") { logTranscript("Peer", payload.text); logFeed("Voice Note", "Peer", payload.text); return; }

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
      stopMiniSchedule();
      return;
    }

    if (payload.kind === "force-mini") {
      if (myRole === "victim") {
        logFeed("Dispatch", "Peer", "Mini-game forced.");
        openMiniModal();
      }
      return;
    }

    if (payload.kind === "victim-line") { logFeed("Victim", "Peer", payload.text); return; }

    if (payload.kind === "chat") { logFeed("Chat", "Peer", payload.text); }
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
  const avgResponse = scoreState.responseSeconds.length
    ? (scoreState.responseSeconds.reduce((a, b) => a + b, 0) / scoreState.responseSeconds.length).toFixed(1)
    : "—";
  const lines = [
    "=== MISSION REPORT ===",
    `Role: ${myRole}`,
    `Victim rounds complete: ${mission.victimWins}/3`,
    `Dispatcher assists complete: ${mission.dispatcherAssists}/3`,
    `Final panic level: ${panicLevel}`,
    `Dispatcher score: ${scoreState.score}`,
    `Calls handled: ${scoreState.callsHandled}`,
    `Correct actions: ${scoreState.correctActions}`,
    `Mistakes: ${scoreState.mistakes}`,
    `Average response time: ${avgResponse}s`,
    `Rank: ${rankForScore(scoreState.score)}`,
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
  stopMiniSchedule();
  stopSoloAI();
  mini.active = false;
  miniModal.classList.add("hidden");

  if (voiceNotesActive && recognition) {
    voiceNotesActive = false;
    recognition.stop();
    voiceNotesBtn.textContent = "Start Voice Notes";
  }

  if (mediaCall) mediaCall.close();
  if (dataConn) dataConn.close();
  if (peer) peer.destroy();
  closeLobby();

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
  resetLobbyButtons();
  roomInput.disabled = false;
  roleInput.disabled = false;
  nameInput.disabled = false;
  connectionStatus.textContent = "Disconnected";
  voiceStatus.textContent = "Voice: Off";
  setLobbyStatus("Not connected");
}

function showMainMenu() {
  if (mainMenu) mainMenu.classList.remove("hidden");
  if (lobbyPanel) lobbyPanel.classList.add("hidden");
}

function showLobbyPanel(mode) {
  if (mainMenu) mainMenu.classList.add("hidden");
  lobbyPanel.classList.remove("hidden");
  const create = mode === "create";
  const browse = mode === "browse";
  lobbyPanelTitle.textContent = create ? "Create a Room" : browse ? "Available Lobbies" : "Join a Room";
  lobbyPanelHint.textContent = create ? "Choose your name and role, then create a room." : browse ? "Public lobby discovery needs a room registry service." : "Enter the room code shared by the host.";
  createRoomBtn.style.display = create ? "" : "none";
  joinRoomBtn.style.display = create || browse ? "none" : "";
  nameInput.parentElement.style.display = browse ? "none" : "";
  roleInput.parentElement.style.display = browse ? "none" : "";
  roomInput.parentElement.style.display = browse ? "none" : "";
  if (create && !roomInput.value) roomInput.value = makeRoomCode();
  roomInput.readOnly = create;
}

function renderOpenLobbies() {
  if (!openLobbyList) return;
  openLobbyList.innerHTML = '<span class="muted">No public lobbies yet.</span>';
}

function setLobbyStatus(text, tone = "normal") {
  lobbyStatus.textContent = `Lobby: ${text}`;
  lobbyStatus.style.color = tone === "error" ? "var(--danger)" : tone === "success" ? "#7ee2ad" : "var(--accent)";
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function resetLobbyButtons() {
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
}

function closeLobby() {
  if (lobbyConn) { try { lobbyConn.close(); } catch {} }
  if (lobbyPeer) { try { lobbyPeer.destroy(); } catch {} }
  lobbyConn = null;
  lobbyPeer = null;
  lobbyMode = null;
}

function launchGamePeer() {
  localPeerId = `${roomCode}-${myRole}`;
  remotePeerId = `${roomCode}-${myRole === "dispatcher" ? "victim" : "dispatcher"}`;
  peer = new Peer(localPeerId, { host: "0.peerjs.com", secure: true, port: 443, debug: 1 });

  peer.on("open", (id) => {
    connectionStatus.textContent = `Connected as ${id}`;
    logFeed("System", "Game", `Joined room ${roomCode}. Waiting for ${remotePeerId}...`);
    startConnectLoop();
  });

  peer.on("error", (err) => {
    logFeed("System", "Lobby", `Game connection error: ${err.message || "unknown error"}`);
    setLobbyStatus("Game connection failed. Check the room code and try again.", "error");
    teardown();
  });

  peer.on("connection", bindDataConnection);
  peer.on("call", (incomingCall) => {
    mediaCall = incomingCall;
    incomingCall.answer(localStream);
    attachCallHandlers(incomingCall);
  });
}

async function prepareGame() {
  myName = (nameInput.value || "Player").trim().slice(0, 24) || "Player";
  myRole = roleInput.value;
  roomCode = sanitizeRoom(roomInput.value).toUpperCase();

  if (!roomCode) {
    setLobbyStatus("Enter a room code.", "error");
    return false;
  }

  mission.victimWins = 0;
  mission.dispatcherAssists = 0;
  missionCompleteAnnounced = false;
  updateMissionStatus();
  setPanicLevel(40);
  configureRoleUI();
  renderResponseHints(["Wait for dispatch support to see auto suggestions."]);
  randomHazards(1);
  mini.active = false;
  miniModal.classList.add("hidden");
  startMiniSchedule();

  try {
    await setupVoice();
  } catch {
    setLobbyStatus("Microphone permission is required for voice mode.", "error");
    return false;
  }

  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  roomInput.disabled = true;
  roleInput.disabled = true;
  nameInput.disabled = true;
  muteBtn.disabled = false;
  endBtn.disabled = false;
  reportBtn.disabled = false;
  voiceNotesBtn.disabled = false;
  return true;
}

async function createRoom() {
  if (!roomInput.value.trim()) roomInput.value = makeRoomCode();
  if (!(await prepareGame())) return;
  lobbyMode = "host";
  lobbyPeer = new Peer(`dispatcher-lobby-${roomCode}`, { host: "0.peerjs.com", secure: true, port: 443, debug: 1 });

  lobbyPeer.on("open", () => {
    setLobbyStatus(`Room ${roomCode} created. Share this code with the other player.`, "success");
    logFeed("Lobby", myName, `Created room ${roomCode} as ${myRole}. Waiting for the other player...`);
  });

  lobbyPeer.on("connection", (conn) => {
    if (lobbyConn) {
      conn.on("open", () => conn.send({ kind: "lobby-busy" }));
      return;
    }
    lobbyConn = conn;
    conn.on("open", () => {
      conn.send({ kind: "lobby-info", hostRole: myRole, hostName: myName, roomCode });
      setLobbyStatus("Player connected. Checking roles...", "success");
    });
    conn.on("data", (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.kind === "lobby-ready") {
        if (payload.role === myRole) {
          conn.send({ kind: "lobby-reject", reason: "That role is already taken. Choose the other role." });
          setLobbyStatus("Both players cannot use the same role.", "error");
          return;
        }
        conn.send({ kind: "lobby-start", hostRole: myRole, guestRole: payload.role });
        setLobbyStatus("Both players ready. Starting game...", "success");
        setTimeout(() => { closeLobby(); launchGamePeer(); }, 500);
      }
    });
    conn.on("close", () => {
      lobbyConn = null;
      setLobbyStatus("Player left. Waiting for another player...");
    });
  });

  lobbyPeer.on("error", (err) => {
    setLobbyStatus(`Could not create room: ${err.message || "room unavailable"}`, "error");
    closeLobby();
    resetLobbyButtons();
  });
}

async function joinRoom() {
  if (!(await prepareGame())) return;
  lobbyMode = "guest";
  const hostId = `dispatcher-lobby-${roomCode}`;
  lobbyPeer = new Peer({ host: "0.peerjs.com", secure: true, port: 443, debug: 1 });

  lobbyPeer.on("open", () => {
    lobbyConn = lobbyPeer.connect(hostId, { reliable: true });
    lobbyConn.on("open", () => {
      setLobbyStatus(`Connected to room ${roomCode}. Waiting for host...`, "success");
      lobbyConn.send({ kind: "lobby-ready", role: myRole, name: myName });
      logFeed("Lobby", myName, `Joined room ${roomCode}.`);
    });
    lobbyConn.on("data", (payload) => {
      if (!payload || typeof payload !== "object") return;
      if (payload.kind === "lobby-info") {
        if (payload.hostRole === myRole) {
          lobbyConn.send({ kind: "lobby-reject", reason: "That role is already taken. Choose the other role." });
          setLobbyStatus("That role is already taken. Choose the other role.", "error");
          return;
        }
        lobbyConn.send({ kind: "lobby-ready", role: myRole, name: myName });
      }
      if (payload.kind === "lobby-reject") {
        setLobbyStatus(payload.reason || "The host rejected the join.", "error");
        teardown();
      }
      if (payload.kind === "lobby-start") {
        setLobbyStatus("Both players ready. Starting game...", "success");
        setTimeout(() => { closeLobby(); launchGamePeer(); }, 500);
      }
    });
    lobbyConn.on("close", () => {
      setLobbyStatus("The host closed the room.", "error");
      resetLobbyButtons();
    });
  });

  lobbyPeer.on("error", () => {
    setLobbyStatus("Could not join room. Make sure the code is correct and the host is online.", "error");
    closeLobby();
    resetLobbyButtons();
  });
}

function openInitialMode() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  if (mode === "create" || mode === "join" || mode === "browse" || mode === "solo") {
    showLobbyPanel(mode);
  } else {
    showLobbyPanel("join");
  }

  if (mode === "solo") {
    lobbyPanelTitle.textContent = "Solo Mode";
    lobbyPanelHint.textContent = "You are the dispatcher. An AI caller will react to your instructions in real time.";
    createRoomBtn.style.display = "none";
    joinRoomBtn.style.display = "none";
    nameInput.parentElement.style.display = "";
    roleInput.parentElement.style.display = "none";
    roomInput.parentElement.style.display = "none";
    nameInput.value = nameInput.value || "Dispatcher";
    startSoloAI();
  }

  if (mode === "browse") {
    setLobbyStatus("No public lobbies yet. Public discovery needs a room registry service.");
  }
}

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
endBtn.addEventListener("click", () => { showReport(); teardown(); });
reportBtn.addEventListener("click", showReport);
voiceNotesBtn.addEventListener("click", toggleVoiceNotes);
backMenuBtn.addEventListener("click", () => { window.location.href = "./index.html"; });

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => { track.enabled = !isMuted; });
  muteBtn.textContent = isMuted ? "Unmute Mic" : "Mute Mic";
  setStatus();
});

sendChat.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  logFeed("Chat", myName, text);
  sendPayload({ kind: "chat", text });
  if (soloAiActive) soloAIReact("chat", text);
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

if (dispatcherMap) {
  dispatcherMap.addEventListener("click", () => {
    if (myRole === "dispatcher" && !soloAiActive && !scoreState.currentCall) nextRandomCall(true);
  });
}
setupVoiceNotes();
configureRoleUI();
renderResponseHints(["Wait for dispatch support to see auto suggestions."]);
updateMissionStatus();
setPanicLevel(40);
setStatus();
logFeed("System", "Game", "Choose your role and room code, then create or join the room.");
requestAnimationFrame(loop);
openInitialMode();
setTimeout(() => nextRandomCall(), 2500);
