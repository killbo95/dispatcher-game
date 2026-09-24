(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode");
  const savedName = sessionStorage.getItem("dispatcherName");
  const savedRole = sessionStorage.getItem("dispatcherRole");
  const savedRoom = sessionStorage.getItem("dispatcherRoom");

  function setIfPresent(id, value) {
    const el = $(id);
    if (el && value) el.value = value;
  }

  setIfPresent("nameInput", savedName);
  setIfPresent("roleInput", savedRole);
  setIfPresent("roomInput", params.get("room") || savedRoom);

  if (mode === "create" && $("roomInput")) $("roomInput").readOnly = true;

  if (mode === "create" || mode === "join") {
    const action = mode === "create" ? $("createRoomBtn") : $("joinRoomBtn");
    if (action) setTimeout(() => { if (!action.disabled) action.click(); }, 250);
  }

  if (mode === "solo") {
    const panel = $("lobbyPanel");
    if (panel) {
      const tools = document.createElement("div");
      tools.className = "soloQuickActions";
      tools.innerHTML = `
        <div class="controlGroup">
          <h3>Quick Dispatch</h3>
          <div class="buttonRow">
            <button type="button" data-ai="stay">Tell caller to stay calm</button>
            <button type="button" data-ai="route">Give a safe route</button>
            <button type="button" data-ai="medical">Send medical help</button>
            <button type="button" data-ai="rescue">Send rescue</button>
          </div>
        </div>`;
      panel.appendChild(tools);
      const messages = {
        stay: "Stay calm. I am here with you. Tell me exactly what you can see.",
        route: "Move toward the safer route and stay away from the smoke.",
        medical: "Medical support is being dispatched. Keep breathing slowly and stay with me.",
        rescue: "Rescue is on the way. Stay where you are unless I give you a safer route."
      };
      tools.querySelectorAll("[data-ai]").forEach((button) => {
        button.addEventListener("click", () => {
          const text = messages[button.dataset.ai];
          const chat = $("chatInput");
          if (chat && $("sendChat")) {
            chat.value = text;
            $("sendChat").click();
          } else if (typeof window.soloAIReact === "function") {
            window.soloAIReact("chat", text);
          }
        });
      });
    }
  }

  if (mode === "solo") {
    const header = document.querySelector(".topbar");
    if (header && !document.getElementById("liveAiBadge")) {
      const badge = document.createElement("div");
      badge.id = "liveAiBadge";
      badge.className = "badge aiLiveBadge";
      badge.textContent = "AI CALLER LIVE";
      header.appendChild(badge);
    }
  }

  if ("speechSynthesis" in window && typeof window.speakAI === "function") {
    window.speakAI = (text) => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      utterance.voice =
        voices.find(v => /^en(-|_)/i.test(v.lang) && /Google|Samantha|Microsoft|Alex/i.test(v.name)) ||
        voices.find(v => /^en(-|_)/i.test(v.lang)) || null;
      utterance.rate = 0.98;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    };
  }

  const chat = $("chatInput");
  if (chat) chat.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); $("sendChat")?.click(); }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("reportPanel")?.classList.add("hidden");
  });

  const style = document.createElement("style");
  style.textContent = `
    .lobbyGrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin:22px 0; }
    .lobbyChoice { text-align:left; min-height:130px; display:flex; flex-direction:column; gap:10px; padding:18px; border:1px solid rgba(120,160,210,.25); border-radius:14px; cursor:pointer; }
    .lobbyChoice strong { font-size:1.05rem; }
    .lobbyChoice span { opacity:.78; line-height:1.45; }
    .lobbyChoice:hover { transform:translateY(-2px); }
    .soloQuickActions { margin-top:18px; padding-top:4px; }
    .incomingCallCard { margin:0 0 14px; padding:14px; border:1px solid rgba(255,105,130,.45); border-radius:14px; background:rgba(120,20,45,.16); box-shadow:0 0 22px rgba(255,70,100,.08); }
    .incomingCallCard strong { display:block; margin-bottom:6px; text-transform:uppercase; letter-spacing:.08em; }
    #scoreStatus { font-weight:700; }
    .dispatcher.card:has(.incomingCallCard:not(.hidden)) { border-color:rgba(255,105,130,.4); }

    .aiLiveBadge { animation:aiPulse 1.6s ease-in-out infinite; }
    @keyframes aiPulse { 50% { opacity:.55; } }
    @media (max-width:700px) {
      .status { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .status button { width:100%; }
      canvas { max-width:100%; height:auto; }
      .lobbyGrid { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
})();