export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ ok: true, game: "Class Wars", multiplayer: "ready", maxPlayersPerRoom: 150 });
    }
    const match = url.pathname.match(/^\/room\/([A-Za-z0-9_-]{3,12})\/?$/);
    if (!match) return new Response("Class Wars room endpoint. Use /room/ROOMCODE", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return Response.json({ game: "Class Wars", room: match[1], instruction: "Connect using WebSocket." }, { status: 426 });
    }
    const id = env.GAME_ROOMS.idFromName(match[1].toUpperCase());
    return env.GAME_ROOMS.get(id).fetch(request);
  }
};

const W = 900, H = 620, COLS = 30, ROWS = 20, MAX_PLAYERS = 150;
const COLORS = ["#c8ff54","#5bbcff","#ff5b9d","#b78bff","#ffb84d","#48e0b3","#ff7557","#f2f3ff"];
const EVENTS = [
  "⚠️ RESOURCE RUSH! Control points are worth double for a moment!",
  "🌀 MAP GLITCH! The chaos has increased.",
  "📦 SUPPLY DROP! New power-ups appeared.",
  "☄️ CHEESE METEOR! Nobody knows why, but keep moving.",
  "🤝 ALLIANCE WINDOW! Make a deal before the next fight."
];
const random = (a,b) => Math.random() * (b-a) + a;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.players = new Map();
    this.tiles = Array.from({length: COLS*ROWS}, () => ({team:-1}));
    this.powerups = [];
    this.sockets = new Map();
    this.lastEvent = Date.now();
    this.lastPowerup = Date.now();
    this.lastBroadcast = 0;
    this.broadcastQueued = false;
    this.roundStarted = Date.now();
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    let data;
    try { data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)); }
    catch { return; }
    const attachment = ws.deserializeAttachment() || {};
    if (data.type === "join") {
      if (this.players.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({type:"error",message:"This room is full (150 players)."}));
        ws.close(1008, "Room full");
        return;
      }
      if (attachment.id && this.players.has(attachment.id)) return;
      const id = crypto.randomUUID();
      const p = {
        id, name: String(data.name || "Player").replace(/[<>]/g,"").slice(0,16) || "Player",
        x: random(50,W-50), y: random(50,H-50), team: this.players.size % COLORS.length,
        score: 0, speed: 2.8, lastMove: Date.now(), lastBonk: 0
      };
      this.players.set(id,p);
      this.sockets.set(id,ws);
      ws.serializeAttachment({id});
      this.sendEvent(p.name + " joined the chaos.");
      this.sendState();
      return;
    }
    const p = this.players.get(attachment.id);
    if (!p) return;
    if (data.type === "move") {
      const now = Date.now();
      if (now - p.lastMove < 55) return;
      const x = Number(data.x), y = Number(data.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const dx = x-p.x, dy = y-p.y, distance = Math.hypot(dx,dy);
      const allowed = Math.min(42, Math.max(10, (now-p.lastMove)*0.16));
      if (distance > allowed) {
        const scale = allowed / distance;
        p.x = clamp(p.x + dx*scale, 8, W-8);
        p.y = clamp(p.y + dy*scale, 8, H-8);
      } else {
        p.x = clamp(x, 8, W-8); p.y = clamp(y, 8, H-8);
      }
      p.lastMove = now;
      this.claim(p);
      this.collectPowerup(p);
      this.queueBroadcast();
    } else if (data.type === "bonk") {
      const now = Date.now();
      if (now-p.lastBonk < 900) return;
      p.lastBonk = now;
      let target = null, best = 76;
      for (const other of this.players.values()) {
        if (other.id === p.id) continue;
        const d = Math.hypot(other.x-p.x,other.y-p.y);
        if (d < best) { best=d; target=other; }
      }
      if (target) {
        target.x=random(35,W-35); target.y=random(35,H-35);
        p.score += 5;
        this.claim(p);
        this.sendEvent("BONK! " + p.name + " launched " + target.name + " into orbit. +5 territory");
      } else this.sendEvent(p.name + " bonked the air. The air lost.");
      this.sendState();
    }
  }

  webSocketClose(ws) {
    this.removeSocket(ws);
  }
  webSocketError(ws) {
    this.removeSocket(ws);
  }
  removeSocket(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.id) {
      const p = this.players.get(a.id);
      if (p) this.sendEvent(p.name + " left the room.");
      this.players.delete(a.id);
      this.sockets.delete(a.id);
      this.sendState();
    }
  }

  claim(p) {
    const c = clamp(Math.floor(p.x/(W/COLS)),0,COLS-1);
    const r = clamp(Math.floor(p.y/(H/ROWS)),0,ROWS-1);
    const tile = this.tiles[r*COLS+c];
    if (tile.team !== p.team) { tile.team=p.team; p.score++; }
  }

  collectPowerup(p) {
    for (let i=this.powerups.length-1;i>=0;i--) {
      const pu=this.powerups[i];
      if (Math.hypot(p.x-pu.x,p.y-pu.y)<20) {
        if (pu.kind===0) { p.score+=8; this.sendEvent(p.name+" grabbed a territory boost! +8"); }
        else if (pu.kind===1) { p.score+=3; this.sendEvent(p.name+" grabbed a speed spark! +3"); }
        else {
          const target=[...this.players.values()].filter(o=>o.id!==p.id).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
          if(target){target.x=random(35,W-35);target.y=random(35,H-35);p.score+=4;this.sendEvent(p.name+" used a chaos bomb on "+target.name+"!");}
        }
        this.powerups.splice(i,1);
      }
    }
  }

  queueBroadcast() {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    setTimeout(() => { this.broadcastQueued=false; this.sendState(); }, 100);
  }

  sendEvent(text) {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(JSON.stringify({type:"event",text})); } catch {}
    }
  }

  sendState() {
    const now=Date.now();
    if (now-this.lastEvent>28000) {
      this.lastEvent=now;
      this.sendEvent(EVENTS[Math.floor(Math.random()*EVENTS.length)]);
    }
    if (now-this.lastPowerup>8500 && this.powerups.length<12) {
      this.lastPowerup=now;
      this.powerups.push({x:random(30,W-30),y:random(30,H-30),kind:Math.floor(Math.random()*3)});
    }
    const players=[...this.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,team:p.team,score:p.score}));
    const tiles=this.tiles, powerups=this.powerups;
    for (const [id,ws] of this.sockets) {
      try { ws.send(JSON.stringify({type:"state",you:id,players,tiles,powerups,roundStarted:this.roundStarted})); }
      catch { this.sockets.delete(id); this.players.delete(id); }
    }
  }
}
