const nameInput = document.getElementById("nameInput");
const roleInput = document.getElementById("roleInput");
const roomInput = document.getElementById("roomInput");
const startBtn = document.getElementById("startBtn");
const muteBtn = document.getElementById("muteBtn");
const endBtn = document.getElementById("endBtn");

const connectionStatus = document.getElementById("connectionStatus");
const playerStatus = document.getElementById("playerStatus");
const voiceStatus = document.getElementById("voiceStatus");
const roundStatus = document.getElementById("roundStatus");

const dispatcherPanel = document.getElementById("dispatcherPanel");
const victimPanel = document.getElementById("victimPanel");

const severityButtons = document.getElementById("severityButtons");
const actionButtons = document.getElementById("actionButtons");
const supportButtons = document.getElementById("supportButtons");
const dispatcherText = document.getElementById("dispatcherText");
const sendDispatcherText = document.getElementById("sendDispatcherText");

const feed = document.getElementById("feed");
const chatInput = document.getElementById("chatInput");
const sendChat = document.getElementById("sendChat");

const ideaSearch = document.getElementById("ideaSearch");
const ideaBook = document.getElementById("ideaBook");
const ideaCount = document.getElementById("ideaCount");

const remoteAudio = document.getElementById("remoteAudio");

let peer = null;
let dataConn = null;
let mediaCall = null;
let localStream = null;
let remoteStream = null;
let isMuted = false;

let myName = "Player";
let myRole = "dispatcher";
let roomCode = "";
let localPeerId = "";
let remotePeerId = "";
let connectTimer = null;

const severities = ["Level 1 Calm", "Level 2 Alert", "Level 3 Critical", "Level 4 Extreme", "Level 5 Collapse"];

const dispatcherActions = [
  "Tell me what you can see",
  "Move to nearest safe exit",
  "Stay low and avoid smoke",
  "Use the wall to guide movement",
  "Keep your phone line open"
];

const supportActions = [
  "Medical support is being dispatched",
  "Fire team is moving to your floor",
  "Police support is securing the route",
  "Stay with me, you are not alone",
  "Rescue team ETA is under 3 minutes"
];

function sanitizeRoom(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
}

function setStatus() {
  connectionStatus.textContent = peer ? `Connected as ${localPeerId}` : "Disconnected";
  playerStatus.textContent = `Role: ${myRole || "-"} | Name: ${myName || "-"}`;
  voiceStatus.textContent = localStream ? `Voice: ${isMuted ? "Muted" : "Live"}` : "Voice: Off";
}

function logFeed(type, author, text) {
  const item = document.createElement("div");
  item.className = "feedItem";
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  item.innerHTML = `<small>${time} | ${type} | ${author}</small>${escapeHtml(text)}`;
  feed.prepend(item);
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
  if (!dataConn || !dataConn.open) {
    logFeed("System", "Game", "No data link yet. Wait for both players to connect.");
    return;
  }
  dataConn.send(payload);
}

function configureRoleUI() {
  const isDispatcher = myRole === "dispatcher";

  dispatcherPanel.classList.toggle("hidden", !isDispatcher);
  victimPanel.classList.toggle("hidden", isDispatcher);

  const dispatcherControls = dispatcherPanel.querySelectorAll("button, textarea");
  dispatcherControls.forEach((el) => {
    el.disabled = !isDispatcher;
  });

  ideaSearch.disabled = isDispatcher;
  roundStatus.textContent = isDispatcher ? "Round: Dispatching" : "Round: Following Dispatch";
}

function setupDispatcherButtons() {
  severityButtons.innerHTML = "";
  actionButtons.innerHTML = "";
  supportButtons.innerHTML = "";

  severities.forEach((label, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const message = `Dispatcher sets incident to ${label}.`;
      roundStatus.textContent = `Round: ${label}`;
      logFeed("Dispatch", myName, message);
      sendPayload({ kind: "dispatch", text: message, score: idx + 1 });
    });
    severityButtons.appendChild(btn);
  });

  dispatcherActions.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const message = `Dispatcher command: ${label}`;
      logFeed("Dispatch", myName, message);
      sendPayload({ kind: "dispatch", text: message });
    });
    actionButtons.appendChild(btn);
  });

  supportActions.forEach((label) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      const message = `Dispatch support: ${label}`;
      logFeed("Support", myName, message);
      roundStatus.textContent = `Round: Support sent`;
      sendPayload({ kind: "support", text: message });
    });
    supportButtons.appendChild(btn);
  });
}

function buildVictimIdeas() {
  const openers = [
    "I can hear",
    "I can smell",
    "I can see",
    "My hands feel",
    "My chest feels",
    "I am next to",
    "There is",
    "I just noticed",
    "I think",
    "I need"
  ];
  const situations = [
    "heavy smoke near the hallway",
    "a locked door with a hot handle",
    "people shouting from downstairs",
    "glass and debris by the exit",
    "water rising around my ankles",
    "sparks near the electrical panel",
    "a child hiding under a desk",
    "sirens outside the building",
    "a narrow path behind a storage shelf",
    "my phone battery dropping fast"
  ];
  const requests = [
    "tell me my next safest move",
    "should I stay or relocate now",
    "guide my breathing so I stay calm",
    "help me protect someone beside me",
    "count down while I move",
    "confirm if this route sounds safe",
    "repeat the steps one by one",
    "send responders to my floor",
    "help me choose between two exits",
    "stay with me until help arrives"
  ];

  const ideas = [];
  for (let a = 0; a < openers.length; a += 1) {
    for (let b = 0; b < situations.length; b += 1) {
      for (let c = 0; c < requests.length; c += 1) {
        ideas.push(`${openers[a]} ${situations[b]}; ${requests[c]}.`);
      }
    }
  }
  return ideas;
}

const victimIdeas = buildVictimIdeas();

function renderIdeaBook(filterText = "") {
  const lower = filterText.trim().toLowerCase();
  const visibleIdeas = lower ? victimIdeas.filter((line) => line.toLowerCase().includes(lower)) : victimIdeas;

  ideaCount.textContent = `Showing ${visibleIdeas.length} of ${victimIdeas.length} ideas`;
  ideaBook.innerHTML = "";

  visibleIdeas.slice(0, 300).forEach((line, idx) => {
    const row = document.createElement("div");
    row.className = "ideaItem";

    const text = document.createElement("div");
    text.textContent = `${idx + 1}. ${line}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Send";
    btn.disabled = myRole !== "victim";
    btn.addEventListener("click", () => {
      const payload = { kind: "victim-line", text: line };
      logFeed("Victim Book", myName, line);
      sendPayload(payload);
    });

    row.appendChild(text);
    row.appendChild(btn);
    ideaBook.appendChild(row);
  });

  if (visibleIdeas.length > 300) {
    const notice = document.createElement("p");
    notice.className = "muted";
    notice.textContent = "Showing first 300 matching ideas for performance. Refine search to narrow more.";
    ideaBook.appendChild(notice);
  }
}

function bindDataConnection(conn) {
  dataConn = conn;

  conn.on("open", () => {
    logFeed("System", "Game", "Data channel connected.");
    sendPayload({ kind: "intro", text: `${myName} joined as ${myRole}.` });
  });

  conn.on("data", (payload) => {
    if (!payload || typeof payload !== "object") return;

    if (payload.kind === "intro") {
      logFeed("Intro", "Peer", payload.text);
      return;
    }

    if (payload.kind === "dispatch") {
      logFeed("Dispatch", "Peer", payload.text);
      if (payload.score) roundStatus.textContent = `Round: ${payload.text.replace("Dispatcher sets incident to ", "")}`;
      return;
    }

    if (payload.kind === "support") {
      logFeed("Support", "Peer", payload.text);
      if (myRole === "victim") {
        roundStatus.textContent = `Round: Support active`;
      }
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

  conn.on("close", () => {
    logFeed("System", "Game", "Data channel closed.");
  });

  conn.on("error", (err) => {
    logFeed("Error", "Data", err.message || "Data connection error");
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

  call.on("close", () => {
    logFeed("Voice", "Game", "Voice call closed.");
    mediaCall = null;
    remoteStream = null;
    remoteAudio.srcObject = null;
  });

  call.on("error", (err) => {
    logFeed("Error", "Voice", err.message || "Voice call error");
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

function teardown() {
  clearConnectLoop();

  if (mediaCall) {
    mediaCall.close();
    mediaCall = null;
  }

  if (dataConn) {
    dataConn.close();
    dataConn = null;
  }

  if (peer) {
    peer.destroy();
    peer = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  remoteStream = null;
  remoteAudio.srcObject = null;

  muteBtn.disabled = true;
  endBtn.disabled = true;
  startBtn.disabled = false;
  roundStatus.textContent = "Round: Waiting";
  connectionStatus.textContent = "Disconnected";
  voiceStatus.textContent = "Voice: Off";
}

async function joinSession() {
  myName = (nameInput.value || "Player").trim().slice(0, 24) || "Player";
  myRole = roleInput.value;
  roomCode = sanitizeRoom(roomInput.value);

  if (!roomCode) {
    logFeed("System", "Game", "Room code must include letters or numbers.");
    return;
  }

  localPeerId = `${roomCode}-${myRole}`;
  remotePeerId = `${roomCode}-${myRole === "dispatcher" ? "victim" : "dispatcher"}`;

  startBtn.disabled = true;
  muteBtn.disabled = false;
  endBtn.disabled = false;

  configureRoleUI();
  setStatus();
  renderIdeaBook(ideaSearch.value);

  try {
    await setupVoice();
  } catch {
    logFeed("Error", "Mic", "Microphone access is required for voice chat.");
    startBtn.disabled = false;
    muteBtn.disabled = true;
    endBtn.disabled = true;
    return;
  }

  peer = new Peer(localPeerId, {
    host: "0.peerjs.com",
    secure: true,
    port: 443,
    debug: 1
  });

  peer.on("open", (id) => {
    connectionStatus.textContent = `Connected as ${id}`;
    logFeed("System", "Game", `Joined room ${roomCode}. Waiting for ${remotePeerId}...`);
    startConnectLoop();
  });

  peer.on("connection", (conn) => {
    bindDataConnection(conn);
  });

  peer.on("call", (incomingCall) => {
    mediaCall = incomingCall;
    incomingCall.answer(localStream);
    attachCallHandlers(incomingCall);
  });

  peer.on("error", (err) => {
    logFeed("Error", "Peer", err.message || "Peer connection error");
    if ((err.type || "").includes("unavailable-id")) {
      logFeed("System", "Game", `Role ${myRole} is already active in room ${roomCode}. Try another room.`);
    }
  });

  peer.on("disconnected", () => {
    logFeed("System", "Game", "Peer disconnected. Attempting reconnect...");
  });
}

startBtn.addEventListener("click", joinSession);
endBtn.addEventListener("click", teardown);

muteBtn.addEventListener("click", () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });
  muteBtn.textContent = isMuted ? "Unmute Mic" : "Mute Mic";
  setStatus();
});

sendChat.addEventListener("click", () => {
  const text = chatInput.value.trim();
  if (!text) return;
  logFeed("Chat", myName, text);
  sendPayload({ kind: "chat", text });
  chatInput.value = "";
});

sendDispatcherText.addEventListener("click", () => {
  const text = dispatcherText.value.trim();
  if (!text) return;
  const payloadText = `Dispatcher custom: ${text}`;
  logFeed("Dispatch", myName, payloadText);
  sendPayload({ kind: "dispatch", text: payloadText });
  dispatcherText.value = "";
});

ideaSearch.addEventListener("input", () => {
  renderIdeaBook(ideaSearch.value);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat.click();
});

setupDispatcherButtons();
configureRoleUI();
renderIdeaBook();
setStatus();
logFeed("System", "Game", "Pick role + room code, then press Start / Join Session.");