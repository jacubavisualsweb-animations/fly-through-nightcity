const canvas = document.querySelector("#city");
const context = canvas.getContext("2d");
const startButton = document.querySelector("#start-button");
const startLabel = document.querySelector("#start-label");
const pauseButton = document.querySelector("#pause-button");
const speedButton = document.querySelector("#speed-button");
const pauseOverlay = document.querySelector("#pause-overlay");
const velocityReadout = document.querySelector("#velocity");
const altitudeReadout = document.querySelector("#altitude");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const experience = document.querySelector(".experience");
const keys = new Set();
const palette = ["#ff75b5", "#48d9ff", "#ffba68", "#a989ff", "#6ef0cf"];
const flight = {
  active: false,
  paused: false,
  speed: 1,
  targetX: 0,
  cameraX: 0,
  distance: 0,
  lastFrame: 0,
  width: 0,
  height: 0,
  ratio: 1,
  stars: [],
  buildings: [],
  traffic: [],
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function makeBuilding(side, z) {
  const width = randomBetween(5, 11);
  const depth = randomBetween(8, 15);
  const height = randomBetween(11, 33);
  const streetEdge = 9 + randomBetween(0, 4);
  return {
    side,
    x: side * (streetEdge + width / 2),
    z,
    width,
    depth,
    height,
    color: palette[Math.floor(Math.random() * palette.length)],
    seed: Math.random(),
  };
}

function resetWorld() {
  flight.buildings = [];
  for (const side of [-1, 1]) {
    for (let index = 0; index < 17; index += 1) {
      flight.buildings.push(makeBuilding(side, 14 + index * 8));
    }
  }
  flight.stars = Array.from({ length: 150 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.44,
    radius: randomBetween(0.35, 1.5),
    alpha: randomBetween(0.22, 0.85),
    phase: Math.random() * Math.PI * 2,
  }));
  flight.traffic = Array.from({ length: 7 }, (_, index) => ({
    side: index % 2 ? 1 : -1,
    z: 15 + index * 18,
    color: palette[index % palette.length],
    offset: randomBetween(0.5, 2.5),
  }));
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  flight.width = bounds.width;
  flight.height = bounds.height;
  flight.ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(flight.width * flight.ratio);
  canvas.height = Math.round(flight.height * flight.ratio);
  context.setTransform(flight.ratio, 0, 0, flight.ratio, 0, 0);
}

function project(x, y, z) {
  const focalLength = flight.width * 0.88;
  const scale = focalLength / Math.max(1, z);
  const horizon = flight.height * 0.405;
  const cameraHeight = 5;
  return {
    x: flight.width / 2 + (x - flight.cameraX) * scale,
    y: horizon + (cameraHeight - y) * scale,
    scale,
  };
}

function drawSky(time) {
  const { width, height } = flight;
  const horizon = height * 0.405;
  const sky = context.createLinearGradient(0, 0, 0, horizon * 1.4);
  sky.addColorStop(0, "#080b1b");
  sky.addColorStop(0.62, "#211539");
  sky.addColorStop(1, "#9a3e72");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width * 0.67, horizon * 0.94, 1, width * 0.67, horizon * 0.94, width * 0.48);
  glow.addColorStop(0, "rgba(255, 112, 171, 0.25)");
  glow.addColorStop(1, "rgba(255, 112, 171, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, horizon * 1.7);

  for (const star of flight.stars) {
    const twinkle = reducedMotion.matches ? 1 : 0.7 + Math.sin(time * 0.001 + star.phase) * 0.3;
    context.globalAlpha = star.alpha * twinkle;
    context.fillStyle = "#e9e9ff";
    context.fillRect(star.x * width, star.y * height, star.radius, star.radius);
  }
  context.globalAlpha = 1;

  context.fillStyle = "rgba(235, 113, 173, 0.12)";
  context.fillRect(0, horizon, width, height - horizon);
}

function drawRoad() {
  const horizon = flight.height * 0.405;
  const center = flight.width / 2 - flight.cameraX * flight.width * 0.88 / 26;
  context.fillStyle = "#10101e";
  context.beginPath();
  context.moveTo(center - 2, horizon);
  context.lineTo(center + 2, horizon);
  context.lineTo(flight.width * 1.32, flight.height);
  context.lineTo(-flight.width * 0.32, flight.height);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(255, 102, 171, 0.28)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(center - 2, horizon);
  context.lineTo(-flight.width * 0.32, flight.height);
  context.moveTo(center + 2, horizon);
  context.lineTo(flight.width * 1.32, flight.height);
  context.stroke();

  const phase = (flight.distance * 0.055) % 1;
  for (let index = 0; index < 12; index += 1) {
    const progress = (index / 12 + phase) % 1;
    const perspective = progress * progress;
    const y = horizon + perspective * (flight.height - horizon);
    const halfWidth = 2 + perspective * flight.width * 0.65;
    const lineWidth = 1 + perspective * 2;
    context.fillStyle = `rgba(99, 174, 255, ${0.08 + perspective * 0.3})`;
    context.fillRect(center - halfWidth, y, lineWidth, 2 + perspective * 5);
    context.fillRect(center + halfWidth - lineWidth, y, lineWidth, 2 + perspective * 5);
  }

  const ground = context.createLinearGradient(0, horizon, 0, flight.height);
  ground.addColorStop(0, "rgba(22, 17, 37, 0)");
  ground.addColorStop(1, "rgba(5, 7, 15, 0.84)");
  context.fillStyle = ground;
  context.fillRect(0, horizon, flight.width, flight.height - horizon);
}

function drawBuilding(building, time) {
  const { x, z, width, depth, height, side, color, seed } = building;
  const near = z;
  const far = z + depth;
  const left = x - width / 2;
  const right = x + width / 2;
  const frontBottomLeft = project(left, 0, near);
  const frontBottomRight = project(right, 0, near);
  const frontTopLeft = project(left, height, near);
  const frontTopRight = project(right, height, near);
  const backTop = project(side < 0 ? right : left, height, far);
  const backBottom = project(side < 0 ? right : left, 0, far);

  context.fillStyle = "#0e1020";
  context.beginPath();
  context.moveTo(frontTopLeft.x, frontTopLeft.y);
  context.lineTo(backTop.x, backTop.y);
  context.lineTo(backBottom.x, backBottom.y);
  context.lineTo(side < 0 ? frontBottomRight.x : frontBottomLeft.x, side < 0 ? frontBottomRight.y : frontBottomLeft.y);
  context.closePath();
  context.fill();

  context.fillStyle = seed > 0.5 ? "#111426" : "#151326";
  context.beginPath();
  context.moveTo(frontTopLeft.x, frontTopLeft.y);
  context.lineTo(frontTopRight.x, frontTopRight.y);
  context.lineTo(frontBottomRight.x, frontBottomRight.y);
  context.lineTo(frontBottomLeft.x, frontBottomLeft.y);
  context.closePath();
  context.fill();

  context.globalAlpha = 0.62;
  context.strokeStyle = color;
  context.lineWidth = Math.max(0.7, frontTopLeft.scale * 0.045);
  context.beginPath();
  context.moveTo(frontTopLeft.x, frontTopLeft.y);
  context.lineTo(frontTopRight.x, frontTopRight.y);
  context.stroke();
  context.globalAlpha = 1;

  const columns = Math.max(2, Math.floor(width / 1.8));
  const rows = Math.max(3, Math.floor(height / 2.8));
  const windowWidth = (frontBottomRight.x - frontBottomLeft.x) / (columns * 3.2);
  const windowHeight = (frontBottomLeft.y - frontTopLeft.y) / (rows * 3.4);
  const reveal = Math.min(1, (110 - z) / 22);
  if (reveal <= 0 || windowWidth < 0.45 || windowHeight < 0.45) return;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lit = ((row * 17 + column * 13 + Math.floor(seed * 100)) % 7) < 3;
      if (!lit) continue;
      const u = (column + 0.5) / columns;
      const v = row / rows;
      const px = frontBottomLeft.x + (frontBottomRight.x - frontBottomLeft.x) * u;
      const py = frontBottomLeft.y + (frontTopLeft.y - frontBottomLeft.y) * v;
      const flicker = 0.76 + Math.sin(time * 0.002 + seed * 12 + row * column) * 0.18;
      context.globalAlpha = Math.max(0, reveal) * flicker;
      context.fillStyle = (row + column) % 9 === 0 ? color : "#ffd58e";
      context.fillRect(px - windowWidth / 2, py - windowHeight / 2, windowWidth, windowHeight);
    }
  }
  context.globalAlpha = 1;
}

function drawTraffic() {
  for (const car of flight.traffic) {
    const position = project(car.side * car.offset, 0.18, car.z);
    const size = Math.max(1, position.scale * 0.11);
    const gradient = context.createRadialGradient(position.x, position.y, 0, position.x, position.y, size * 5);
    gradient.addColorStop(0, car.color);
    gradient.addColorStop(1, "rgba(255, 100, 170, 0)");
    context.fillStyle = gradient;
    context.fillRect(position.x - size * 5, position.y - size * 5, size * 10, size * 10);
    context.fillStyle = car.color;
    context.fillRect(position.x - size, position.y, size * 2, Math.max(1, size * 0.6));
  }
}

function update(delta) {
  if (!flight.active || flight.paused || reducedMotion.matches) return;
  const seconds = Math.min(delta, 50) / 1000;
  const movement = 26 * flight.speed * seconds;
  flight.distance += movement;
  flight.cameraX += (flight.targetX - flight.cameraX) * Math.min(1, seconds * 2.7);

  for (const building of flight.buildings) {
    building.z -= movement;
    if (building.z < 5) {
      building.z += 136;
      const replacement = makeBuilding(building.side, building.z);
      Object.assign(building, replacement);
    }
  }
  for (const car of flight.traffic) {
    car.z -= movement * 1.6;
    if (car.z < 7) car.z += 126;
  }
}

function render(time = 0) {
  const delta = flight.lastFrame ? time - flight.lastFrame : 16;
  flight.lastFrame = time;
  update(delta);
  context.clearRect(0, 0, flight.width, flight.height);
  drawSky(time);
  drawRoad();
  const buildings = [...flight.buildings].sort((a, b) => b.z - a.z);
  for (const building of buildings) drawBuilding(building, time);
  drawTraffic();
  requestAnimationFrame(render);
}

function setPaused(paused) {
  flight.paused = paused;
  pauseOverlay.classList.toggle("is-visible", paused);
  pauseOverlay.setAttribute("aria-hidden", String(!paused));
  pauseButton.setAttribute("aria-label", paused ? "Resume flight" : "Pause flight");
  pauseButton.title = paused ? "Resume flight" : "Pause flight";
  document.querySelector(".pause-icon").textContent = paused ? "▶" : "Ⅱ";
}

function toggleFlight() {
  if (!flight.active) {
    flight.active = true;
    experience.classList.add("is-flying");
    pauseButton.disabled = false;
    setPaused(false);
    startLabel.textContent = "FLIGHT IN PROGRESS";
    startButton.querySelector(".play-icon").textContent = "✓";
    startButton.disabled = true;
    startButton.setAttribute("aria-label", "Flight in progress");
  } else {
    setPaused(!flight.paused);
  }
}

startButton.addEventListener("click", toggleFlight);
pauseButton.addEventListener("click", () => setPaused(!flight.paused));
speedButton.addEventListener("click", () => {
  flight.speed = flight.speed === 1 ? 1.5 : flight.speed === 1.5 ? 2 : 1;
  speedButton.textContent = `×${flight.speed}`;
  velocityReadout.textContent = String(Math.round(68 * flight.speed)).padStart(3, "0");
});

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", " ", "a", "d", "A", "D"].includes(event.key)) event.preventDefault();
  keys.add(event.key.toLowerCase());
  if (event.code === "Space" && !event.repeat) toggleFlight();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
window.addEventListener("pointermove", (event) => {
  flight.targetX = ((event.clientX / window.innerWidth) - 0.5) * 9;
});
window.addEventListener("resize", resize);
reducedMotion.addEventListener?.("change", (event) => {
  if (event.matches && flight.active) setPaused(true);
});

function steerFromKeys() {
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  if (left !== right) flight.targetX = Math.max(-4.5, Math.min(4.5, flight.targetX + (left ? -0.08 : 0.08)));
  if (keys.has("arrowup") || keys.has("w")) flight.targetX *= 0.96;
  if (flight.active && !flight.paused) {
    const altitude = 420 + Math.round(Math.abs(flight.cameraX) * 18);
    altitudeReadout.textContent = String(altitude).padStart(4, "0");
  }
  requestAnimationFrame(steerFromKeys);
}

resize();
resetWorld();
requestAnimationFrame(render);
requestAnimationFrame(steerFromKeys);
