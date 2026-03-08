/*
  AI Developer Upgrader
  - Treats each run as a dev sprint
  - Adds features progressively
  - Rebalances values and writes release notes
*/

const fs = require("fs");
const path = require("path");

const root = __dirname;
const configPath = path.join(root, "game.config.js");
const memoryPath = path.join(root, "ai-memory.json");

function loadConfig() {
  delete require.cache[require.resolve(configPath)];
  const src = fs.readFileSync(configPath, "utf8");
  const match = src.match(/const GAME_CONFIG = (\{[\s\S]*?\});/);
  if (!match) throw new Error("GAME_CONFIG object not found.");
  return Function(`"use strict"; return (${match[1]});`)();
}

function loadMemory() {
  if (!fs.existsSync(memoryPath)) {
    return { aiVersion: 1, upgrades: 0, sprintLog: [] };
  }

  try {
    return JSON.parse(fs.readFileSync(memoryPath, "utf8"));
  } catch {
    return { aiVersion: 1, upgrades: 0, sprintLog: [] };
  }
}

function saveMemory(mem) {
  fs.writeFileSync(memoryPath, `${JSON.stringify(mem, null, 2)}\n`, "utf8");
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function maybeUnlockFeature(config, memory) {
  const roadmap = [
    { key: "hazards", note: "Added enemy hazards for actual fail-state pressure." },
    { key: "dash", note: "Added dash movement for tactical repositioning." },
    { key: "combo", note: "Added combo scoring to reward consistent orb pickups." },
    { key: "trail", note: "Added player motion trail for stronger feedback." },
    { key: "orbitDrone", note: "Added orbit drone that intercepts hazards." },
  ];

  const next = roadmap.find((item) => !config.features[item.key]);
  if (next) {
    config.features[next.key] = true;
    return next.note;
  }

  return "No new feature left; focused on balancing and polish.";
}

function tuneBalance(config, memory) {
  config.player.speed = clamp(config.player.speed + 8, 220, 360);
  config.economy.targetScore = clamp(config.economy.targetScore + 40, 180, 1400);
  config.economy.orbValue = clamp(config.economy.orbValue + 1, 8, 40);

  config.world.hue = (config.world.hue + 15) % 360;
  config.world.gridStep = clamp(config.world.gridStep - 1, 24, 52);
  config.world.pulse = clamp(Number((config.world.pulse + 0.04).toFixed(2)), 0.45, 1.8);

  if (memory.upgrades % 2 === 0) {
    config.player.maxHp = clamp(config.player.maxHp + 1, 3, 8);
  }
}

function writeConfig(config) {
  const text = `const GAME_CONFIG = ${JSON.stringify(config, null, 2)};\n\nwindow.GAME_CONFIG = GAME_CONFIG;\n`;
  fs.writeFileSync(configPath, text, "utf8");
}

function run() {
  const config = loadConfig();
  const memory = loadMemory();

  memory.aiVersion += 1;
  memory.upgrades += 1;
  config.version += 1;
  config.aiName = `AutoDev AI v${memory.aiVersion}`;

  const featureNote = maybeUnlockFeature(config, memory);
  tuneBalance(config, memory);

  const note = `v${config.version}: ${featureNote} Balance tuned (speed=${config.player.speed}, target=${config.economy.targetScore}, orb=${config.economy.orbValue}).`;
  config.devNotes = Array.isArray(config.devNotes) ? config.devNotes : [];
  config.devNotes.push(note);
  config.devNotes = config.devNotes.slice(-12);

  memory.sprintLog.push({
    at: new Date().toISOString(),
    gameVersion: config.version,
    aiVersion: memory.aiVersion,
    note,
  });
  memory.sprintLog = memory.sprintLog.slice(-30);

  writeConfig(config);
  saveMemory(memory);

  console.log("AI developer sprint complete.");
  console.log(`Game version: ${config.version}`);
  console.log(`AI version: ${memory.aiVersion}`);
  console.log(note);
}

run();