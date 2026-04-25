// =============================
// Renderer / DOM references
// =============================
const cubeEl = document.getElementById('cube');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');

const SIZE = 84;
const GAP = 4;
const STEP = SIZE + GAP;
const HALF = SIZE / 2;
const TURN_TIME = 340;
const LABEL_DISTANCE = STEP * 2.05;

document.documentElement.style.setProperty('--cubie-size', `${SIZE}px`);

let cubies = [];
let turning = false;
let activePreview = null;
let moveHistory = [];

let timerStart = null;
let timerElapsed = 0;
let timerInterval = null;

let rotateX = -28;
let rotateY = 38;
let rotateZ = 0;

let viewMatrix = identityMatrix();
let dragStartMatrix = identityMatrix();

let dragging = false;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeCurrentX = 0;
let swipeCurrentY = 0;
let viewStartX = rotateX;
let viewStartY = rotateY;

const moves = {
  U:  { axis: 'y', layer: 1, angle: -90 },
  Ui: { axis: 'y', layer: 1, angle: 90 },
  D:  { axis: 'y', layer: -1, angle: 90 },
  Di: { axis: 'y', layer: -1, angle: -90 },
  R:  { axis: 'x', layer: 1, angle: -90 },
  Ri: { axis: 'x', layer: 1, angle: 90 },
  L:  { axis: 'x', layer: -1, angle: 90 },
  Li: { axis: 'x', layer: -1, angle: -90 },
  F:  { axis: 'z', layer: 1, angle: 90 },
  Fi: { axis: 'z', layer: 1, angle: -90 },
  B:  { axis: 'z', layer: -1, angle: -90 },
  Bi: { axis: 'z', layer: -1, angle: 90 },
  M:  { axis: 'x', layer: 0, angle: 90 },
  Mi: { axis: 'x', layer: 0, angle: -90 },
  E:  { axis: 'y', layer: 0, angle: 90 },
  Ei: { axis: 'y', layer: 0, angle: -90 },
  S:  { axis: 'z', layer: 0, angle: 90 },
  Si: { axis: 'z', layer: 0, angle: -90 }
};

// =============================
// Matrix / view utilities
// =============================
function identityMatrix() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ];
}

function multiplyMatrix(a, b) {
  const result = identityMatrix();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      result[r][c] =
        a[r][0] * b[0][c] +
        a[r][1] * b[1][c] +
        a[r][2] * b[2][c];
    }
  }
  return result;
}

function rotationMatrix(axis, degrees) {
  const rad = degrees * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);

  if (axis === 'x') {
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c]
    ];
  }

  if (axis === 'y') {
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c]
    ];
  }

  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1]
  ];
}

function applyMatrixToPoint(matrix, point) {
  return {
    x: matrix[0][0] * point.x + matrix[0][1] * point.y + matrix[0][2] * point.z,
    y: matrix[1][0] * point.x + matrix[1][1] * point.y + matrix[1][2] * point.z,
    z: matrix[2][0] * point.x + matrix[2][1] * point.y + matrix[2][2] * point.z
  };
}

function matrixToCss(matrix) {
  return `matrix3d(${matrix[0][0]},${matrix[1][0]},${matrix[2][0]},0,${matrix[0][1]},${matrix[1][1]},${matrix[2][1]},0,${matrix[0][2]},${matrix[1][2]},${matrix[2][2]},0,0,0,0,1)`;
}

function setViewFromEuler(x, y, z = 0) {
  const mx = rotationMatrix('x', x);
  const my = rotationMatrix('y', y);
  const mz = rotationMatrix('z', z);
  viewMatrix = multiplyMatrix(mz, multiplyMatrix(mx, my));
  rotateX = x;
  rotateY = y;
  rotateZ = z;
}

function updateCubeRotation() {
  cubeEl.style.setProperty('--view-transform', matrixToCss(viewMatrix));
}

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

// =============================
// Timer
// =============================
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateTimerDisplay() {
  const current = timerStart ? timerElapsed + Date.now() - timerStart : timerElapsed;
  timerEl.textContent = formatTime(current);
}

function startTimer() {
  if (timerStart) return;
  timerStart = Date.now();
  timerInterval = window.setInterval(updateTimerDisplay, 250);
  updateTimerDisplay();
}

function stopTimer() {
  if (!timerStart) return;
  timerElapsed += Date.now() - timerStart;
  timerStart = null;
  window.clearInterval(timerInterval);
  timerInterval = null;
  updateTimerDisplay();
}

function resetTimer() {
  timerStart = null;
  timerElapsed = 0;
  window.clearInterval(timerInterval);
  timerInterval = null;
  updateTimerDisplay();
}

// =============================
// Renderer
// =============================
function setStatus(text) {
  statusEl.textContent = text;
}

function getFaceTransform(face, depth) {
  return {
    U: `rotateX(90deg) translateZ(${depth}px)`,
    D: `rotateX(-90deg) translateZ(${depth}px)`,
    L: `rotateY(-90deg) translateZ(${depth}px)`,
    R: `rotateY(90deg) translateZ(${depth}px)`,
    F: `translateZ(${depth}px)`,
    B: `rotateY(180deg) translateZ(${depth}px)`
  }[face];
}

function createFacelet(face, colorClass = face) {
  const div = document.createElement('div');
  div.className = `facelet ${colorClass}`;
  const depth = colorClass === 'inner' ? HALF : HALF + 2;
  div.style.transform = getFaceTransform(face, depth);
  if (colorClass !== 'inner') div.dataset.face = face;
  return div;
}

function createCubie(x, y, z) {
  const el = document.createElement('div');
  el.className = 'cubie';

  const cubie = {
    id: cubies.length,
    x,
    y,
    z,
    el,
    stickers: {}
  };

  el.dataset.cubieId = cubie.id;

  if (y === 1) cubie.stickers.U = 'U';
  if (y === -1) cubie.stickers.D = 'D';
  if (x === -1) cubie.stickers.L = 'L';
  if (x === 1) cubie.stickers.R = 'R';
  if (z === 1) cubie.stickers.F = 'F';
  if (z === -1) cubie.stickers.B = 'B';

  buildCubie(cubie);
  updateCubieTransform(cubie);
  cubeEl.appendChild(el);
  cubies.push(cubie);
}

function buildCubie(cubie) {
  cubie.el.innerHTML = '';

  ['U', 'D', 'L', 'R', 'F', 'B'].forEach(face => {
    cubie.el.appendChild(createFacelet(face, 'inner'));
  });

  Object.entries(cubie.stickers).forEach(([face, color]) => {
    const facelet = createFacelet(face, color);
    facelet.dataset.cubieId = cubie.id;
    cubie.el.appendChild(facelet);
  });
}

function updateCubieTransform(cubie) {
  cubie.el.style.transform = `translate3d(${cubie.x * STEP}px, ${-cubie.y * STEP}px, ${cubie.z * STEP}px)`;
}

function faceMeaning(face) {
  return {
    U: 'up',
    D: 'down',
    L: 'left',
    R: 'right',
    F: 'front',
    B: 'back'
  }[face];
}

function addDirectionLabels() {
  const labels = [
    ['U', 0, -LABEL_DISTANCE, 0],
    ['D', 0, LABEL_DISTANCE, 0],
    ['L', -LABEL_DISTANCE, 0, 0],
    ['R', LABEL_DISTANCE, 0, 0],
    ['F', 0, 0, LABEL_DISTANCE],
    ['B', 0, 0, -LABEL_DISTANCE]
  ];

  labels.forEach(([name, x, y, z]) => {
    const label = document.createElement('div');
    label.className = 'direction-label';
    label.innerHTML = `${name}<small>${faceMeaning(name)}</small>`;
    label.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
    cubeEl.appendChild(label);
  });
}

function initCube() {
  cubeEl.innerHTML = '';
  cubies = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        createCubie(x, y, z);
      }
    }
  }

  addDirectionLabels();
  setStatus('Solved!');
}

function setButtonsDisabled(disabled) {
  document.querySelectorAll('button').forEach(button => {
    button.disabled = disabled;
  });
}

// =============================
// MoveEngine: cubie coordinates and sticker rotation
// =============================
function vectorToFace(x, y, z) {
  if (x === 1) return 'R';
  if (x === -1) return 'L';
  if (y === 1) return 'U';
  if (y === -1) return 'D';
  if (z === 1) return 'F';
  if (z === -1) return 'B';
  return null;
}

function faceToVector(face) {
  return {
    R: { x: 1, y: 0, z: 0 },
    L: { x: -1, y: 0, z: 0 },
    U: { x: 0, y: 1, z: 0 },
    D: { x: 0, y: -1, z: 0 },
    F: { x: 0, y: 0, z: 1 },
    B: { x: 0, y: 0, z: -1 }
  }[face];
}

function rotateVector(vec, axis, angle) {
  const positive = angle > 0;
  const { x, y, z } = vec;

  if (axis === 'x') {
    return positive ? { x, y: z, z: -y } : { x, y: -z, z: y };
  }

  if (axis === 'y') {
    return positive ? { x: z, y, z: -x } : { x: -z, y, z: x };
  }

  return positive ? { x: y, y: -x, z } : { x: -y, y: x, z };
}

function rotatePointForProjection(point, axis, angle) {
  return rotateVector(point, axis, angle);
}

function rotateCoords(cubie, axis, angle) {
  const next = rotateVector({ x: cubie.x, y: cubie.y, z: cubie.z }, axis, angle);
  cubie.x = next.x;
  cubie.y = next.y;
  cubie.z = next.z;
}

function rotateStickers(cubie, axis, angle) {
  const nextStickers = {};

  Object.entries(cubie.stickers).forEach(([face, color]) => {
    const oldVector = faceToVector(face);
    const newVector = rotateVector(oldVector, axis, angle);
    const newFace = vectorToFace(newVector.x, newVector.y, newVector.z);
    nextStickers[newFace] = color;
  });

  cubie.stickers = nextStickers;
}

function projectPoint(point) {
  const cssPoint = {
    x: point.x * STEP,
    y: -point.y * STEP,
    z: point.z * STEP
  };

  return applyMatrixToPoint(viewMatrix, cssPoint);
}

function getStickerPoint(face, cubie) {
  const normal = faceToVector(face);
  return {
    x: cubie.x + normal.x * 0.48,
    y: cubie.y + normal.y * 0.48,
    z: cubie.z + normal.z * 0.48
  };
}

function getFaceAxis(face) {
  return {
    U: 'y',
    D: 'y',
    L: 'x',
    R: 'x',
    F: 'z',
    B: 'z'
  }[face];
}

function getDirectMove(face, cubie, dx, dy) {
  const dragLength = Math.hypot(dx, dy);
  if (dragLength < 1) return null;

  const startPoint = getStickerPoint(face, cubie);
  const startScreen = projectPoint(startPoint);
  const candidates = [];

  ['x', 'y', 'z'].forEach(axis => {
    [90, -90].forEach(angle => {
      const smallAngle = angle > 0 ? 18 : -18;
      const endPoint = rotatePointForProjection(startPoint, axis, smallAngle);
      const endScreen = projectPoint(endPoint);
      const vx = endScreen.x - startScreen.x;
      const vy = endScreen.y - startScreen.y;
      const moveLength = Math.hypot(vx, vy);
      if (moveLength < 0.5) return;

      const score = (dx * vx + dy * vy) / (dragLength * moveLength);
      const touchedFaceAxis = getFaceAxis(face);
      const faceBias = axis === touchedFaceAxis ? 0.035 : 0;

      candidates.push({
        axis,
        layer: cubie[axis],
        angle,
        previewVector: { x: vx, y: vy, degrees: smallAngle },
        clickedFace: face,
        score: score + faceBias
      });
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score > 0.28 ? best : null;
}

function createLayerPreview(moveData) {
  const selected = cubies.filter(cubie => cubie[moveData.axis] === moveData.layer);
  selected.forEach(cubie => cubie.el.classList.add('preview-selected'));

  const group = document.createElement('div');
  group.className = 'layer-group previewing';
  cubeEl.appendChild(group);

  selected.forEach(cubie => group.appendChild(cubie.el));

  activePreview = {
    ...moveData,
    selected,
    group,
    currentAngle: 0
  };

  setButtonsDisabled(true);
}

function updateLayerPreview(angle) {
  if (!activePreview) return;
  activePreview.currentAngle = angle;
  activePreview.group.style.transform = `rotate${activePreview.axis.toUpperCase()}(${angle}deg)`;
}

function getPreviewAngle(moveData, dx, dy) {
  if (!moveData.previewVector) {
    const fallback = Math.min(90, Math.hypot(dx, dy) * 0.75);
    return Math.sign(moveData.angle) * fallback;
  }

  const vx = moveData.previewVector.x;
  const vy = moveData.previewVector.y;
  const sampleDegrees = Math.abs(moveData.previewVector.degrees || 18);
  const vectorLength = Math.hypot(vx, vy);
  if (vectorLength < 0.001) return 0;

  const ux = vx / vectorLength;
  const uy = vy / vectorLength;
  const signedPixels = dx * ux + dy * uy;
  const pixelsPerDegree = vectorLength / sampleDegrees;
  const rawDegrees = signedPixels / pixelsPerDegree;
  const clamped = Math.max(0, Math.min(96, rawDegrees));

  return Math.sign(moveData.angle) * clamped;
}

function finishLayerPreview(shouldCommit) {
  if (!activePreview) return;

  const preview = activePreview;
  activePreview = null;
  turning = true;
  preview.group.classList.remove('previewing');

  const targetAngle = shouldCommit ? preview.angle : 0;
  preview.group.style.transform = `rotate${preview.axis.toUpperCase()}(${targetAngle}deg)`;

  window.setTimeout(() => {
    preview.selected.forEach(cubie => {
      cubie.el.classList.remove('preview-selected');
      cubeEl.appendChild(cubie.el);

      if (shouldCommit) {
        rotateCoords(cubie, preview.axis, preview.angle);
        rotateStickers(cubie, preview.axis, preview.angle);
        buildCubie(cubie);
      }

      updateCubieTransform(cubie);
    });

    if (shouldCommit) {
      moveHistory.push({ axis: preview.axis, layer: preview.layer, angle: preview.angle });
      startTimer();
    }

    preview.group.remove();
    turning = false;
    setButtonsDisabled(false);
    finishGameStatus();
  }, TURN_TIME + 30);
}

function rotateLayer({ axis, layer, angle }, options = {}) {
  const shouldRecord = options.record !== false;
  turning = true;
  setButtonsDisabled(true);
  setStatus('Turning...');

  const selected = cubies.filter(cubie => cubie[axis] === layer);
  const group = document.createElement('div');
  group.className = 'layer-group';
  cubeEl.appendChild(group);

  selected.forEach(cubie => group.appendChild(cubie.el));

  requestAnimationFrame(() => {
    group.style.transform = `rotate${axis.toUpperCase()}(${angle}deg)`;
  });

  window.setTimeout(() => {
    selected.forEach(cubie => {
      cubeEl.appendChild(cubie.el);
      rotateCoords(cubie, axis, angle);
      rotateStickers(cubie, axis, angle);
      buildCubie(cubie);
      updateCubieTransform(cubie);
    });

    if (shouldRecord) {
      moveHistory.push({ axis, layer, angle });
      startTimer();
    }

    group.remove();
    turning = false;
    setButtonsDisabled(false);
    finishGameStatus();
  }, TURN_TIME + 30);
}

function applyMove({ axis, layer, angle }) {
  const selected = cubies.filter(cubie => cubie[axis] === layer);
  selected.forEach(cubie => {
    rotateCoords(cubie, axis, angle);
    rotateStickers(cubie, axis, angle);
    buildCubie(cubie);
    updateCubieTransform(cubie);
  });
}

function move(name, instant = false) {
  if (turning && !instant) return;
  const moveData = moves[name];
  if (!moveData) return;

  if (instant) {
    applyMove(moveData);
    return;
  }

  rotateLayer(moveData);
}

function isSolved() {
  const solved = {
    U: new Set(),
    D: new Set(),
    L: new Set(),
    R: new Set(),
    F: new Set(),
    B: new Set()
  };

  cubies.forEach(cubie => {
    Object.entries(cubie.stickers).forEach(([face, color]) => {
      solved[face].add(color);
    });
  });

  return Object.values(solved).every(set => set.size === 1);
}

function finishGameStatus() {
  if (isSolved()) {
    stopTimer();
    setStatus('Solved!');
  } else {
    setStatus('Keep going!');
  }
}

function scramble() {
  if (turning) return;
  resetCube(false);

  const names = Object.keys(moves);
  for (let i = 0; i < 28; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    move(name, true);
  }

  moveHistory = [];
  resetTimer();
  startTimer();
  setStatus('Scrambled!');
}

function resetCube(resetClock = true) {
  if (turning) return;
  initCube();
  moveHistory = [];
  if (resetClock) resetTimer();
}

function undoMove() {
  if (turning || activePreview || moveHistory.length === 0) return;
  const last = moveHistory.pop();
  rotateLayer({ axis: last.axis, layer: last.layer, angle: -last.angle }, { record: false });
}

// =============================
// ViewController
// =============================
function animateViewTo(nextX, nextY, label = 'View changed', nextZ = rotateZ) {
  if (turning) return;
  cubeEl.classList.add('view-animating');
  setViewFromEuler(nextX, nextY, nextZ);
  updateCubeRotation();
  setStatus(label);

  window.setTimeout(() => {
    cubeEl.classList.remove('view-animating');
  }, 500);
}

function rotateViewZ(delta) {
  viewMatrix = multiplyMatrix(rotationMatrix('z', delta), viewMatrix);
  rotateZ += delta;
  cubeEl.classList.add('view-animating');
  updateCubeRotation();
  setStatus(`View Z: ${delta > 0 ? 'clockwise' : 'counterclockwise'}`);
  window.setTimeout(() => cubeEl.classList.remove('view-animating'), 500);
}

function rotateViewStep(direction) {
  if (turning) return;

  let axis = 'y';
  let delta = 0;

  if (direction === 'left') {
    axis = 'y';
    delta = 90;
    rotateY += 90;
  }

  if (direction === 'right') {
    axis = 'y';
    delta = -90;
    rotateY -= 90;
  }

  if (direction === 'up') {
    axis = 'x';
    delta = -90;
    rotateX -= 90;
  }

  if (direction === 'down') {
    axis = 'x';
    delta = 90;
    rotateX += 90;
  }

  cubeEl.classList.add('view-animating');
  viewMatrix = multiplyMatrix(rotationMatrix(axis, delta), viewMatrix);
  updateCubeRotation();
  setStatus(`View ${direction}: X ${Math.round(normalizeAngle(rotateX))}°, Y ${Math.round(normalizeAngle(rotateY))}°`);
  window.setTimeout(() => cubeEl.classList.remove('view-animating'), 500);
}

function changeView(direction) {
  const views = {
    front: { x: -28, y: 38, z: 0 },
    back: { x: -28, y: 218, z: 0 },
    left: { x: -28, y: -52, z: 0 },
    right: { x: -28, y: 128, z: 0 },
    up: { x: -78, y: 38, z: 0 },
    down: { x: 42, y: 38, z: 0 }
  };

  const view = views[direction];
  if (!view) return;
  animateViewTo(view.x, view.y, `View: ${direction}`, view.z);
}

function snapView() {
  if (turning) return;

  const presets = [
    ['front', { x: -28, y: 38, z: 0 }],
    ['back', { x: -28, y: 218, z: 0 }],
    ['left', { x: -28, y: -52, z: 0 }],
    ['right', { x: -28, y: 128, z: 0 }],
    ['up', { x: -78, y: 38, z: 0 }],
    ['down', { x: 42, y: 38, z: 0 }]
  ];

  let best = presets[0];
  let bestScore = -Infinity;

  presets.forEach(([name, view]) => {
    const mx = rotationMatrix('x', view.x);
    const my = rotationMatrix('y', view.y);
    const mz = rotationMatrix('z', view.z);
    const matrix = multiplyMatrix(mz, multiplyMatrix(mx, my));
    const score =
      viewMatrix[0][0] * matrix[0][0] + viewMatrix[0][1] * matrix[0][1] + viewMatrix[0][2] * matrix[0][2] +
      viewMatrix[1][0] * matrix[1][0] + viewMatrix[1][1] * matrix[1][1] + viewMatrix[1][2] * matrix[1][2] +
      viewMatrix[2][0] * matrix[2][0] + viewMatrix[2][1] * matrix[2][1] + viewMatrix[2][2] * matrix[2][2];

    if (score > bestScore) {
      bestScore = score;
      best = [name, view];
    }
  });

  const [name, view] = best;
  animateViewTo(view.x, view.y, `Snapped view: ${name}`, view.z);
}

// =============================
// GestureController
// =============================
function getCubieFromElement(element) {
  const cubieEl = element.closest('.cubie');
  if (!cubieEl) return null;
  return cubies.find(cubie => String(cubie.id) === cubieEl.dataset.cubieId);
}

function setupDragSpin() {
  const scene = document.getElementById('scene');
  const gestureHint = document.getElementById('gestureHint');
  let stickerGesture = null;

  function getPoint(event) {
    if (event.touches && event.touches.length) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }

    if (event.changedTouches && event.changedTouches.length) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }

    return { x: event.clientX, y: event.clientY };
  }

  function startDrag(event) {
    if (turning) return;
    event.preventDefault();

    const point = getPoint(event);
    const targetFace = event.target.dataset.face;
    const targetCubie = getCubieFromElement(event.target);
    const isTouch = event.type.startsWith('touch');
    const isLeftMouse = event.button === 0;
    const isRightMouse = event.button === 2;
    const clickedSticker = targetFace && targetCubie;
    const wantsViewControl = event.shiftKey || isRightMouse || !clickedSticker;
    const wantsLayerControl = clickedSticker && (isTouch || (isLeftMouse && !event.shiftKey));

    if (wantsLayerControl) {
      stickerGesture = {
        face: targetFace,
        cubieId: targetCubie.id,
        startX: point.x,
        startY: point.y
      };
      gestureHint.textContent = `Sticker: swipe ${targetFace}, release to turn`;
      return;
    }

    if (!wantsViewControl && !isTouch) {
      gestureHint.textContent = 'Drag the background, right-drag, or Shift-drag to rotate the view';
      return;
    }

    dragging = true;
    cubeEl.classList.add('dragging');
    swipeStartX = point.x;
    swipeStartY = point.y;
    swipeCurrentX = point.x;
    swipeCurrentY = point.y;
    viewStartX = rotateX;
    viewStartY = rotateY;
    dragStartMatrix = viewMatrix.map(row => [...row]);
    gestureHint.textContent = 'View control: drag to rotate';
  }

  function drag(event) {
    if (turning) return;
    const point = getPoint(event);

    if (stickerGesture) {
      event.preventDefault();
      const dx = point.x - stickerGesture.startX;
      const dy = point.y - stickerGesture.startY;
      const distance = Math.hypot(dx, dy);
      const cubie = cubies.find(c => c.id === stickerGesture.cubieId);
      if (!cubie) return;

      if (!activePreview && distance > 14) {
        const moveData = getDirectMove(stickerGesture.face, cubie, dx, dy);
        if (moveData) createLayerPreview(moveData);
      }

      if (activePreview) {
        const angle = getPreviewAngle(activePreview, dx, dy);
        updateLayerPreview(angle);
        const directionText = `${activePreview.axis.toUpperCase()} layer ${activePreview.layer}`;
        gestureHint.textContent = `Preview: ${directionText} ${Math.round(angle)}°`;
      }

      return;
    }

    if (!dragging) return;
    event.preventDefault();

    swipeCurrentX = point.x;
    swipeCurrentY = point.y;
    const dx = swipeCurrentX - swipeStartX;
    const dy = swipeCurrentY - swipeStartY;

    const yaw = -dx * 0.55;
    const pitch = dy * 0.55;
    const dragRotation = multiplyMatrix(rotationMatrix('x', pitch), rotationMatrix('y', yaw));
    viewMatrix = multiplyMatrix(dragRotation, dragStartMatrix);
    rotateX = viewStartX + pitch;
    rotateY = viewStartY + yaw;
    updateCubeRotation();

    gestureHint.textContent = `Trackball view: yaw ${Math.round(yaw)}°, pitch ${Math.round(pitch)}°`;
  }

  function endDrag(event) {
    const point = getPoint(event);

    if (stickerGesture) {
      const dx = point.x - stickerGesture.startX;
      const dy = point.y - stickerGesture.startY;
      const distance = Math.hypot(dx, dy);

      if (activePreview) {
        const commit = Math.abs(activePreview.currentAngle) >= 42 && distance > 34;
        gestureHint.textContent = commit ? 'Layer snaps to 90°' : 'Layer springs back';
        finishLayerPreview(commit);
      } else {
        gestureHint.textContent = 'Sticker swipe: too short';
      }

      stickerGesture = null;
      window.setTimeout(() => {
        if (!turning) gestureHint.textContent = 'Ready';
      }, 520);
      return;
    }

    if (!dragging) return;
    dragging = false;
    cubeEl.classList.remove('dragging');

    window.setTimeout(() => {
      if (!turning) gestureHint.textContent = 'Ready';
    }, 520);
  }

  scene.addEventListener('contextmenu', event => event.preventDefault());
  scene.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', drag);
  window.addEventListener('mouseup', endDrag);

  scene.addEventListener('touchstart', startDrag, { passive: false });
  window.addEventListener('touchmove', drag, { passive: false });
  window.addEventListener('touchend', endDrag);
}

// =============================
// Boot
// =============================
setViewFromEuler(rotateX, rotateY, rotateZ);
updateCubeRotation();
setupDragSpin();
initCube();
resetTimer();
