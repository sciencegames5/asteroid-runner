// ====== CONFIG ======
const CANVAS_W = 480;
const CANVAS_H = 720;

const PLAYER_SIZE = 32;
const PLAYER_SPEED = 220; // px/s

const ASTEROID_MIN_SIZE = 20;
const ASTEROID_MAX_SIZE = 60;
const ASTEROID_MIN_SPEED = 120;
const ASTEROID_MAX_SPEED = 260;

const ASTEROID_SPAWN_INTERVAL_START = 0.9; // seconds
const ASTEROID_SPAWN_INTERVAL_MIN = 0.25;  // faster over time

// ====== GET ELEMENTS ======
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const msgEl = document.getElementById("message");

const joystickArea = document.getElementById("joystickArea");
const joystickDot = document.getElementById("joystickDot");
const startBtn = document.getElementById("startBtn");

// ====== GAME STATE ======
let running = false;
let gameOver = false;
let lastTime = 0;
let elapsedSurvival = 0; // seconds alive
let spawnTimer = 0;
let spawnInterval = ASTEROID_SPAWN_INTERVAL_START;

const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  a: false,
  d: false,
  w: false,
  s: false,
};

const player = {
  x: CANVAS_W / 2,
  y: CANVAS_H - 100,
  size: PLAYER_SIZE,
};

let asteroids = [];

// ====== TOUCH / JOYSTICK STATE ======
let touchActive = false;
let touchVX = 0;
let touchVY = 0;
const MAX_DRAG_DIST = 50; // pixels = full speed

// ====== INPUT HANDLERS (KEYBOARD) ======
window.addEventListener("keydown", (e) => {
  if (keys.hasOwnProperty(e.key)) {
    keys[e.key] = true;
  }
  // Spacebar to start / restart
  if (e.code === "Space") {
    if (!running) {
      startGame();
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (keys.hasOwnProperty(e.key)) {
    keys[e.key] = false;
  }
});

// ====== TOUCH / JOYSTICK HANDLERS ======

// helper to move the visual dot
function updateJoystickDot(dx, dy) {
  if (!joystickDot) return;
  joystickDot.style.left = `calc(50% + ${dx}px)`;
  joystickDot.style.top  = `calc(50% + ${dy}px)`;
}

function handleMoveTouch(clientX, clientY) {
  if (!joystickArea) return;
  const rect = joystickArea.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const dx = clientX - cx;
  const dy = clientY - cy;

  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const max = MAX_DRAG_DIST;
  const clampedDist = Math.min(dist, max);
  const scale = clampedDist / dist;

  const ndx = dx * scale;
  const ndy = dy * scale;

  // visual feedback
  updateJoystickDot(ndx, ndy);

  // convert to movement -1..1
  touchVX = ndx / max;
  touchVY = ndy / max;
}

if (joystickArea) {
  // touch start
  joystickArea.addEventListener("touchstart", (e) => {
    e.preventDefault();
    touchActive = true;
    const t = e.touches[0];
    handleMoveTouch(t.clientX, t.clientY);
  }, { passive: false });

  // touch move
  joystickArea.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const t = e.touches[0];
    handleMoveTouch(t.clientX, t.clientY);
  }, { passive: false });

  // touch end
  joystickArea.addEventListener("touchend", (e) => {
    e.preventDefault();
    touchActive = false;
    touchVX = 0;
    touchVY = 0;
    updateJoystickDot(0,0);
  }, { passive: false });

  // mouse down (for trackpads/Chromebooks)
  joystickArea.addEventListener("mousedown", (e) => {
    e.preventDefault();
    touchActive = true;
    handleMoveTouch(e.clientX, e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    if (!touchActive) return;
    handleMoveTouch(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    if (!touchActive) return;
    touchActive = false;
    touchVX = 0;
    touchVY = 0;
    updateJoystickDot(0,0);
  });
}

// START button for iPad (no keyboard needed)
if (startBtn) {
  startBtn.addEventListener("click", () => {
    if (!running) {
      startGame();
    }
  });
}

// ====== CORE GAME FUNCTIONS ======
function startGame() {
  running = true;
  gameOver = false;
  elapsedSurvival = 0;
  spawnTimer = 0;
  spawnInterval = ASTEROID_SPAWN_INTERVAL_START;
  lastTime = performance.now();

  player.x = CANVAS_W / 2;
  player.y = CANVAS_H - 100;

  asteroids = [];

  hideMessage();
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  gameOver = true;
  showMessage(
    "💥 GAME OVER 💥\n" +
    `Survival Time: ${elapsedSurvival.toFixed(1)}s\n\n` +
    "Press SPACE or TAP START to try again"
  );
}

function loop(timestamp) {
  if (!running) return;

  const dt = (timestamp - lastTime) / 1000; // seconds since last frame
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

function update(dt) {
  // 1. Time / score
  elapsedSurvival += dt;
  scoreEl.textContent = elapsedSurvival.toFixed(1);

  // 2. Difficulty ramp
  const difficultyFactor = 1 - Math.min(elapsedSurvival / 60, 0.8); // down to ~20%
  spawnInterval =
    ASTEROID_SPAWN_INTERVAL_MIN +
    (ASTEROID_SPAWN_INTERVAL_START - ASTEROID_SPAWN_INTERVAL_MIN) *
      difficultyFactor;

  // 3. Player movement
  let vx = 0;
  let vy = 0;

  // keyboard
  if (keys.ArrowLeft || keys.a) vx -= 1;
  if (keys.ArrowRight || keys.d) vx += 1;
  if (keys.ArrowUp || keys.w) vy -= 1;
  if (keys.ArrowDown || keys.s) vy += 1;

  // joystick / touch
  vx += touchVX;
  vy += touchVY;

  // normalize diagonal so it's not faster
  if (vx !== 0 && vy !== 0) {
    const inv = 1 / Math.sqrt(2);
    vx *= inv;
    vy *= inv;
  }

  player.x += vx * PLAYER_SPEED * dt;
  player.y += vy * PLAYER_SPEED * dt;

  // clamp inside canvas
  const half = player.size / 2;
  if (player.x < half) player.x = half;
  if (player.x > CANVAS_W - half) player.x = CANVAS_W - half;
  if (player.y < half) player.y = half;
  if (player.y > CANVAS_H - half) player.y = CANVAS_H - half;

  // 4. Spawn asteroids
  spawnTimer += dt;
  if (spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    spawnAsteroid();
  }

  // 5. Move asteroids
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    a.y += a.speed * dt;

    // remove if offscreen
    if (a.y - a.size / 2 > CANVAS_H + 60) {
      asteroids.splice(i, 1);
    }
  }

  // 6. Collision check
  for (let i = 0; i < asteroids.length; i++) {
    if (isColliding(player, asteroids[i])) {
      endGame();
      break;
    }
  }
}

// ====== SPAWN LOGIC ======
function spawnAsteroid() {
  const size =
    ASTEROID_MIN_SIZE +
    Math.random() * (ASTEROID_MAX_SIZE - ASTEROID_MIN_SIZE);

  const x = size / 2 + Math.random() * (CANVAS_W - size);
  const y = -size; // start above screen

  const speed =
    ASTEROID_MIN_SPEED +
    Math.random() * (ASTEROID_MAX_SPEED - ASTEROID_MIN_SPEED);

  asteroids.push({
    x,
    y,
    size,
    speed,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() * 2 - 1) * 2, // -2 to 2 rad/s
  });
}

// ====== COLLISION ======
function isColliding(p, a) {
  // Use simple circle-circle hitbox
  const dx = p.x - a.x;
  const dy = p.y - a.y;
  const distSq = dx * dx + dy * dy;
  const radiusP = p.size * 0.45;
  const radiusA = a.size * 0.5;
  const rSum = radiusP + radiusA;
  return distSq < rSum * rSum;
}

// ====== DRAW ======
function draw() {
  // clear
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // background stars
  drawStarfield();

  // player
  drawPlayer();

  // asteroids
  asteroids.forEach((a) => drawAsteroid(a));
}

function drawStarfield() {
  ctx.fillStyle = "#fff";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 127 + (elapsedSurvival * 60 * (i % 5))) % CANVAS_W;
    const sy = (i * 233 + (elapsedSurvival * 40 * (i % 7))) % CANVAS_H;
    const r = (i % 3 === 0) ? 2 : 1;
    ctx.globalAlpha = 0.3 + (i % 5) * 0.15;
    ctx.fillRect(sx, sy, r, r);
  }
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const { x, y, size } = player;

  ctx.save();
  ctx.shadowColor = "#00fff2";
  ctx.shadowBlur = 15;

  // ship body (triangle)
  ctx.fillStyle = "#00fff2";
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.6);             // nose
  ctx.lineTo(x - size * 0.4, y + size * 0.5); // left wing
  ctx.lineTo(x + size * 0.4, y + size * 0.5); // right wing
  ctx.closePath();
  ctx.fill();

  // cockpit
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#002a3a";
  ctx.beginPath();
  ctx.ellipse(x, y, size * 0.15, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // thruster flame
  const flameLen = 10 + Math.sin(performance.now() / 50) * 4;
  ctx.fillStyle = "#ff6b00";
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.5);
  ctx.lineTo(x - size * 0.12, y + size * 0.5 + flameLen);
  ctx.lineTo(x + size * 0.12, y + size * 0.5 + flameLen);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawAsteroid(a) {
  ctx.save();
  ctx.translate(a.x, a.y);
  a.angle += a.spin * (1 / 60); // slight spin

  ctx.rotate(a.angle);

  // asteroid body
  const grd = ctx.createRadialGradient(0, 0, a.size * 0.1, 0, 0, a.size * 0.6);
  grd.addColorStop(0, "#5a524a");
  grd.addColorStop(1, "#2a211a");

  ctx.fillStyle = grd;
  ctx.beginPath();
  roughRockShapePath(ctx, a.size * 0.5);
  ctx.fill();

  // outline highlight
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();

  ctx.restore();
}

// creates a lumpy rock-ish outline
function roughRockShapePath(ctx, radius) {
  const points = 10;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const rJitter = radius * (0.7 + Math.random() * 0.4);
    const px = Math.cos(angle) * rJitter;
    const py = Math.sin(angle) * rJitter;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ====== MESSAGE HELPERS ======
function showMessage(text) {
  msgEl.textContent = text;
  msgEl.classList.remove("hidden");
}

function hideMessage() {
  msgEl.classList.add("hidden");
}

// ====== INITIAL MESSAGE ======
showMessage(
  "🚀 ASTEROID RUNNER 🚀\n" +
  "Move:  Joystick (touch) or WASD/Arrows\n" +
  "Goal:  Don't get hit.\n\n" +
  "Press SPACE or TAP START"
);
