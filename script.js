const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const nextFruitEl = document.getElementById("nextFruit");
const toastEl = document.getElementById("toast");
const gameOverEl = document.getElementById("gameOver");
const restartBtn = document.getElementById("restartBtn");
const restartInlineBtn = document.getElementById("restartInlineBtn");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const WALL = 14;
const TOP_LINE = 118;
const DROP_Y = 74;
const GRAVITY = 0.26;
const RESTITUTION = 0.24;
const AIR = 0.996;
const SPAWN_TYPES = [0, 1, 2, 3];
const STORAGE_KEY = "durian-merge-best";

const FRUITS = [
  { name: "榴莲粒", radius: 22, color: "#bedf68", accent: "#7fb636", emoji: "✨", score: 10 },
  { name: "榴莲球", radius: 28, color: "#b0d457", accent: "#74a924", emoji: "🌱", score: 20 },
  { name: "青榴莲", radius: 35, color: "#a1c843", accent: "#678f18", emoji: "🥝", score: 40 },
  { name: "奶香榴莲", radius: 43, color: "#97bb3f", accent: "#5e8213", emoji: "🥑", score: 80 },
  { name: "金枕榴莲", radius: 52, color: "#d8ba42", accent: "#98811c", emoji: "💛", score: 160 },
  { name: "猫山王", radius: 62, color: "#f0c945", accent: "#b58919", emoji: "👑", score: 320 },
  { name: "爆香榴莲", radius: 74, color: "#e3aa34", accent: "#9e6710", emoji: "🔥", score: 640 },
  { name: "榴莲霸王", radius: 88, color: "#d88b2d", accent: "#8d4f0a", emoji: "🌟", score: 1280 },
  { name: "宇宙大榴莲", radius: 104, color: "#c46a1f", accent: "#723306", emoji: "💥", score: 2560 },
];

let fruits = [];
let particles = [];
let score = 0;
let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
let nextType = pickSpawnType();
let pointerX = WIDTH / 2;
let pendingDrop = false;
let lastDropAt = 0;
let overLineMs = 0;
let gameOver = false;
let toastTimer = 0;
let audioCtx;

bestEl.textContent = String(best);
updateNextPreview();

function pickSpawnType() {
  return SPAWN_TYPES[Math.floor(Math.random() * SPAWN_TYPES.length)];
}

function createFruit(type, x, y) {
  const spec = FRUITS[type];
  return {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    r: spec.radius,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.06,
    bornAt: performance.now(),
    merged: false,
  };
}

function updateNextPreview() {
  const spec = FRUITS[nextType];
  nextFruitEl.style.background = `radial-gradient(circle at 32% 28%, #fff4be, ${spec.color} 45%, ${spec.accent} 100%)`;
  nextFruitEl.dataset.emoji = spec.emoji;
  nextFruitEl.title = spec.name;
}

function clampPointer(clientX) {
  const rect = canvas.getBoundingClientRect();
  const scaledX = ((clientX - rect.left) / rect.width) * WIDTH;
  const safeRadius = FRUITS[nextType].radius + WALL + 2;
  pointerX = Math.min(WIDTH - safeRadius, Math.max(safeRadius, scaledX));
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 900);
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone({ freq = 440, duration = 0.14, type = "triangle", gain = 0.05, glide = 0 }) {
  if (!audioCtx) {
    return;
  }
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, now);
  filter.Q.setValueAtTime(1.2, now);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glide) {
    osc.frequency.exponentialRampToValueAtTime(freq + glide, now + duration);
  }
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter);
  filter.connect(amp);
  amp.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playDropSound() {
  playTone({ freq: 410, duration: 0.08, type: "triangle", gain: 0.035, glide: 30 });
}

function playBounceSound(speed) {
  const volume = Math.min(0.03, 0.008 + speed * 0.0006);
  playTone({ freq: 580 + speed * 1.6, duration: 0.05, type: "sine", gain: volume });
}

function playMergeSound(level) {
  playTone({ freq: 430 + level * 42, duration: 0.11, type: "triangle", gain: 0.048, glide: 90 });
  playTone({ freq: 650 + level * 35, duration: 0.16, type: "sine", gain: 0.026, glide: -40 });
}

function spawnParticles(x, y, color) {
  for (let i = 0; i < 12; i += 1) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 4.2,
      vy: (Math.random() - 0.5) * 4.2 - 1.3,
      life: 1,
      color,
      size: 4 + Math.random() * 6,
    });
  }
}

function dropFruit() {
  if (gameOver) {
    return;
  }
  const now = performance.now();
  if (now - lastDropAt < 320) {
    return;
  }
  const fruit = createFruit(nextType, pointerX, DROP_Y);
  fruits.push(fruit);
  playDropSound();
  lastDropAt = now;
  nextType = pickSpawnType();
  updateNextPreview();
}

function mergeFruit(a, b) {
  if (a.type !== b.type || a.merged || b.merged || a.type >= FRUITS.length - 1) {
    return false;
  }
  a.merged = true;
  b.merged = true;
  const mergedType = a.type + 1;
  const x = (a.x + b.x) * 0.5;
  const y = (a.y + b.y) * 0.5;
  const merged = createFruit(mergedType, x, y);
  merged.vx = (a.vx + b.vx) * 0.12;
  merged.vy = Math.min(-2.2, (a.vy + b.vy) * 0.08 - 1.2);
  fruits.push(merged);
  score += FRUITS[mergedType].score;
  best = Math.max(best, score);
  localStorage.setItem(STORAGE_KEY, String(best));
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  playMergeSound(mergedType);
  spawnParticles(x, y, FRUITS[mergedType].color);
  showToast(`${FRUITS[mergedType].name} 合成成功`);
  return true;
}

function resolvePhysics() {
  for (const fruit of fruits) {
    fruit.vy += GRAVITY;
    fruit.vx *= AIR;
    fruit.vy *= 0.999;
    fruit.x += fruit.vx;
    fruit.y += fruit.vy;
    fruit.rotation += fruit.spin;

    const minX = WALL + fruit.r;
    const maxX = WIDTH - WALL - fruit.r;
    if (fruit.x < minX) {
      fruit.x = minX;
      fruit.vx *= -0.72;
      playBounceSound(Math.abs(fruit.vx) + Math.abs(fruit.vy));
    } else if (fruit.x > maxX) {
      fruit.x = maxX;
      fruit.vx *= -0.72;
      playBounceSound(Math.abs(fruit.vx) + Math.abs(fruit.vy));
    }

    const floorY = HEIGHT - WALL - fruit.r;
    if (fruit.y > floorY) {
      fruit.y = floorY;
      if (Math.abs(fruit.vy) > 1.2) {
        playBounceSound(Math.abs(fruit.vy));
      }
      fruit.vy *= -RESTITUTION;
      fruit.vx *= 0.985;
      if (Math.abs(fruit.vy) < 0.32) {
        fruit.vy = 0;
      }
    }
  }

  for (let i = 0; i < fruits.length; i += 1) {
    const a = fruits[i];
    for (let j = i + 1; j < fruits.length; j += 1) {
      const b = fruits[j];
      if (a.merged || b.merged) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = a.r + b.r;
      if (dist >= minDist) {
        continue;
      }
      const overlap = minDist - dist;
      const nx = dx / dist;
      const ny = dy / dist;

      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const separating = rvx * nx + rvy * ny;
      if (separating < 0) {
        const impulse = (-(1 + 0.22) * separating) / 2;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }

      const mature = performance.now() - a.bornAt > 90 && performance.now() - b.bornAt > 90;
      if (a.type === b.type && mature && overlap > Math.min(a.r, b.r) * 0.22) {
        mergeFruit(a, b);
      }
    }
  }

  fruits = fruits.filter((fruit) => !fruit.merged);
}

function updateParticles() {
  particles = particles.filter((p) => p.life > 0.02);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.vx *= 0.98;
    p.life *= 0.94;
  }
}

function updateGameOver(delta) {
  const isDanger = fruits.some((fruit) => fruit.y - fruit.r < TOP_LINE && Math.abs(fruit.vy) < 0.9);
  overLineMs = isDanger ? overLineMs + delta : Math.max(0, overLineMs - delta * 2.6);
  if (overLineMs > 1300 && !gameOver) {
    gameOver = true;
    gameOverEl.classList.remove("hidden");
    showToast("锅里真的装不下了");
  }
}

function drawFruit(fruit) {
  const spec = FRUITS[fruit.type];
  ctx.save();
  ctx.translate(fruit.x, fruit.y);
  ctx.rotate(fruit.rotation);

  const gradient = ctx.createRadialGradient(-fruit.r * 0.35, -fruit.r * 0.42, fruit.r * 0.18, 0, 0, fruit.r * 1.05);
  gradient.addColorStop(0, "#fff5bf");
  gradient.addColorStop(0.38, spec.color);
  gradient.addColorStop(1, spec.accent);

  ctx.beginPath();
  ctx.arc(0, 0, fruit.r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(88, 50, 4, 0.22)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  const spikes = Math.max(18, Math.floor(fruit.r * 0.7));
  ctx.strokeStyle = "rgba(68, 48, 8, 0.22)";
  ctx.lineWidth = Math.max(1.2, fruit.r * 0.05);
  for (let i = 0; i < spikes; i += 1) {
    const angle = (Math.PI * 2 * i) / spikes;
    const px = Math.cos(angle) * fruit.r * 0.8;
    const py = Math.sin(angle) * fruit.r * 0.8;
    ctx.beginPath();
    ctx.moveTo(px * 0.72, py * 0.72);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(68, 48, 8, 0.12)";
  for (let ring = 0.35; ring < 0.92; ring += 0.18) {
    ctx.beginPath();
    ctx.arc(0, 0, fruit.r * ring, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 247, 214, 0.92)";
  ctx.font = `${Math.max(16, fruit.r * 0.42)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.emoji, 0, 1);
  ctx.restore();
}

function drawGhost() {
  if (gameOver) {
    return;
  }
  const spec = FRUITS[nextType];
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = "rgba(96, 64, 12, 0.42)";
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(pointerX, 32);
  ctx.lineTo(pointerX, HEIGHT - 32);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255, 255, 255, 0.42)";
  ctx.beginPath();
  ctx.arc(pointerX, DROP_Y, spec.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawScene() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  for (let i = 0; i < 7; i += 1) {
    const y = 90 + i * 92;
    ctx.fillRect(20, y, WIDTH - 40, 2);
  }
  ctx.restore();

  drawGhost();
  for (const fruit of fruits) {
    drawFruit(fruit);
  }
  drawParticles();
}

let lastTime = performance.now();
function loop(now) {
  const delta = Math.min(32, now - lastTime);
  lastTime = now;
  if (!gameOver) {
    resolvePhysics();
    updateParticles();
    updateGameOver(delta);
  } else {
    updateParticles();
  }
  drawScene();
  requestAnimationFrame(loop);
}

function resetGame() {
  fruits = [];
  particles = [];
  score = 0;
  overLineMs = 0;
  gameOver = false;
  lastDropAt = 0;
  nextType = pickSpawnType();
  pointerX = WIDTH / 2;
  scoreEl.textContent = "0";
  updateNextPreview();
  gameOverEl.classList.add("hidden");
  showToast("新鲜开榴，开局顺利");
}

canvas.addEventListener("pointermove", (event) => {
  clampPointer(event.clientX);
});

canvas.addEventListener("pointerdown", (event) => {
  ensureAudio();
  clampPointer(event.clientX);
  pendingDrop = true;
});

canvas.addEventListener("pointerup", (event) => {
  clampPointer(event.clientX);
  if (pendingDrop) {
    dropFruit();
  }
  pendingDrop = false;
});

canvas.addEventListener("pointerleave", () => {
  pendingDrop = false;
});

canvas.addEventListener("click", () => {
  ensureAudio();
});

restartBtn.addEventListener("click", resetGame);
restartInlineBtn.addEventListener("click", resetGame);

resetGame();
requestAnimationFrame(loop);
