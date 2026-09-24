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

  // Restore setup-page choices so Create/Join actually carry into the game.
  setIfPresent("nameInput", savedName);
  setIfPresent("roleInput", savedRole);
  setIfPresent("roomInput", params.get("room") || savedRoom);

  if (mode === "create" && $("roomInput")) {
    $("roomInput").readOnly = true;
  }

  // Automatically continue from the dedicated Create/Join pages.
  // This removes the confusing second setup screen.
  if (mode === "create" || mode === "join") {
    const action = mode === "create" ? $("createRoomBtn") : $("joinRoomBtn");
    if (action) {
      setTimeout(() => {
        if (!action.disabled) action.click();
      }, 250);
    }
  }

  // Make the solo screen feel like a live incident rather than a static panel.
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
        </div>
      `;
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

  // Improve speech output: avoid queued-up voices and select a natural English voice.
  if ("speechSynthesis" in window) {
    const originalSpeak = window.speakAI;
    if (typeof originalSpeak === "function") {
      window.speakAI = (text) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        utterance.voice =
          voices.find(v => /^en(-|_)/i.test(v.lang) && /Google|Samantha|Microsoft|Alex/i.test(v.name)) ||
          voices.find(v => /^en(-|_)/i.test(v.lang)) ||
          null;
        utterance.rate = 0.98;
        utterance.pitch = 1.02;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
      };
    }
  }

  // Enter sends chat everywhere; Escape closes the report when it is visible.
  const chat = $("chatInput");
  if (chat) {
    chat.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        $("sendChat")?.click();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      $("reportPanel")?.classList.add("hidden");
    }
  });

  // Add a visible live-incident indicator for solo play.
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
})();