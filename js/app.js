import * as THREE from 'three';
import {
  QS, STILL, MOBILE, renderer, scene, camera, buildWorld, resize, updateWorld, dressFloor,
  SHELF_FRONT, rowY, X0, X1, Z0, Z1, floorMesh, board, yearBayZ, syncYearBayZ,
  paintSummaryBoard, scrollSummaryBoard, setSummaryBoardLabels,
} from './world.js';
import {
  YEAR_FLOORS, FLOOR, placeWallBooks, pdfUrl, formatSize, bookId,
  setGradeTable, getGradeTable, setBookColorMode, colorForYear, gradeForYear, LEVEL_LABELS, LEVEL_FALLBACK,
  LEVEL_COLORS, gradeOf, yearDetailOf, studentRow, yearResults,
  collectAllYears, rebuildYearFloors,
} from './books.js';
import { createCat, DEFAULT_FUR } from './cat.js';

const FUR_KEY = 'dse6a-cat-fur';
const FUR_OPTIONS = [
  { id: 'black', hex: '#1e1a21', label: '墨黑' },
  { id: 'cream', hex: '#e8d4b0', label: '奶油' },
  { id: 'orange', hex: '#d4834a', label: '橘貓' },
  { id: 'gray', hex: '#8a858c', label: '灰貓' },
  { id: 'white', hex: '#f2efe8', label: '白貓' },
  { id: 'chocolate', hex: '#5c3a2e', label: '朱古力' },
  { id: 'peach', hex: '#e8a882', label: '桃斑' },
  { id: 'mint', hex: '#7a9e8e', label: '薄荷' },
  { id: 'lavender', hex: '#9a8ab8', label: '淡紫' },
  { id: 'navy', hex: '#2a3a5c', label: '深藍' },
];
function loadFur() {
  const saved = localStorage.getItem(FUR_KEY);
  if (saved && FUR_OPTIONS.some((o) => o.hex === saved)) return saved;
  return DEFAULT_FUR;
}
function saveFur(hex) {
  localStorage.setItem(FUR_KEY, hex);
}
function applyFur(hex) {
  const h = hex || loadFur();
  saveFur(h);
  if (cat?.setFur) cat.setFur(h);
  syncFurSwatches(h);
}
function syncFurSwatches(hex) {
  const root = $('furSwatches');
  if (!root) return;
  root.querySelectorAll('button[data-fur]').forEach((btn) => {
    btn.setAttribute('aria-checked', btn.dataset.fur === hex ? 'true' : 'false');
  });
}
function buildFurSwatches() {
  const root = $('furSwatches');
  if (!root) return;
  const cur = loadFur();
  root.innerHTML = FUR_OPTIONS.map((o) => (
    `<button type="button" role="radio" data-fur="${o.hex}" title="${o.label}" aria-label="${o.label}" aria-checked="${o.hex === cur ? 'true' : 'false'}" style="--fur:${o.hex}"></button>`
  )).join('');
  root.onclick = (e) => {
    const btn = e.target.closest('[data-fur]');
    if (!btn) return;
    applyFur(btn.dataset.fur);
  };
}

const $ = (id) => document.getElementById(id);
const V3 = (...a) => new THREE.Vector3(...a);
const lerpAngle = (a, b, k) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * k;
const canvasEl = renderer.domElement;

/* Spots */
const ENTRANCE = V3(0.12, 0, 2.55);
const BOARD_STOP = V3(-0.35, 0, 1.2);
const HALL_X = 0.15;
const STAIRS = V3(0.1, 0, Z0 + 1.2);
const BOUNDS = { x0: X0 + 0.55, x1: X1 - 1.35, z0: Z0 + 1.4, z1: Z1 - 1.2 };
const shelfStop = (year = currentYear) => V3(X1 - 1.25, 0, yearBayZ(year) + 0.05);
const catSeat = (year = currentYear) => V3(SHELF_FRONT + 0.24, rowY(3) + 0.003, yearBayZ(year) - 0.3);

let catalog = { meta: {}, items: [] };
let mode = 'teacher';
let studentId = null;
let currentYear = YEAR_FLOORS[0].key;
let state = 'gate';
let busy = false;
let bookMeshes = [];
let selected = null;
let cat = null;
let travelCam = null;
let snapNext = true;
let view = QS.get('cam') === 'third' ? 'third' : 'first';

const bookGroup = new THREE.Group();
scene.add(bookGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const lookNow = new THREE.Vector3();
const keys = new Set();
let freeNav = false; // after hop-down from shelf seat
const moveVel = new THREE.Vector3(); // horizontal free-roam velocity (m/s)
let camYawSmooth = 0.1; // camera follow yaw (angle-lerped, free-nav only)
const MOVE_MAX = 3.05;
const MOVE_ACCEL = 14;   // ~0.2s toward full speed
const MOVE_DECEL = 12;   // ~0.22s to stop
const MOVE_STOP_EPS = 0.05;

const sleep = (ms) => new Promise((r) => setTimeout(r, STILL ? 0 : ms));
function fade(on, ms = 500) {
  const f = $('fade');
  if (STILL) { f.style.transition = 'none'; f.classList.toggle('on', on); return Promise.resolve(); }
  f.style.transitionDuration = `${ms}ms`;
  f.classList.toggle('on', on);
  return sleep(ms + 40);
}
function setState(s) {
  state = s;
  document.body.dataset.state = s;
  document.body.classList.remove('library');
  const yt = $('yearTable');
  const br = $('bookRail');
  if (yt) yt.hidden = true;
  if (br) br.hidden = true;
  syncMoveHint();
}
function toast(color, title, sub = '') {
  const el = $('toast');
  el.innerHTML = `<i style="background:${color}"></i><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
function syncMoveHint() {
  const move = $('moveHint');
  if (move) {
    const ok = state === 'intro' || state === 'roam' || (state === 'shelf' && freeNav);
    move.hidden = !ok;
  }
}

/* ---------- camera follow ---------- */
function followPose(p = cat?.pos || ENTRANCE, yaw = cat?.yaw ?? 0.1) {
  const fwd = V3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = V3(-fwd.z, 0, fwd.x);
  if (view === 'third') {
    camPos.copy(p).addScaledVector(fwd, -1.85).addScaledVector(right, 0.12); camPos.y = 0.82;
    camLook.copy(p).addScaledVector(fwd, 5); camLook.y = 0.26;
  } else {
    camPos.copy(p).addScaledVector(fwd, -3.4).addScaledVector(right, 0.18); camPos.y = 1.42;
    camLook.copy(p).addScaledVector(fwd, 5); camLook.y = 0.95;
  }
}
function signPose() {
  // Face the left-wall 總表
  camPos.set(0.35, 1.55, -1.6);
  camLook.set(X0 + 0.4, 1.7, -2.2);
}
function shelfPose() {
  const portrait = camera.aspect < 0.9;
  const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // Match hyeok framing so mid shelves (row 1–3) stay on screen; books live on row 2 first.
  const yMin = 0.76, yMax = 2.98;
  const needH = (yMax - yMin) / (portrait ? 0.8 : 0.86);
  const needW = 1.05;
  let dist = Math.max(needH / (2 * vt), needW / (2 * vt * camera.aspect));
  let cy = (yMin + yMax) / 2 - (portrait ? 0.04 : 0.02);
  if (bookMeshes.length) {
    let sum = 0;
    for (const m of bookMeshes) sum += m.position.y;
    const avgY = sum / bookMeshes.length;
    // Bias toward books without leaving the bay frame (sparse student shelves stay readable).
    cy = Math.min(yMax - 0.35, Math.max(yMin + 0.35, cy * 0.45 + avgY * 0.55));
  }
  if (portrait) { dist = 1.45; cy = bookMeshes.length ? Math.min(1.65, Math.max(1.25, cy)) : 1.45; }
  const z = yearBayZ(currentYear);
  const mine = bookMeshes.find((m) => String(m.userData?.item?.year) === String(currentYear));
  if (mine) cy = THREE.MathUtils.clamp(mine.position.y, yMin + 0.25, yMax - 0.25);
  camPos.set(SHELF_FRONT - dist, cy + 0.05, z);
  camLook.set(SHELF_FRONT, cy, z);
}
const holdCam = () => {};
const introCam = () => followPose(ENTRANCE, 0.1);
const hallCam = (z) => () => { camPos.set(HALL_X + 0.1, 1.45, z + 2.6); camLook.set(0, 0.55, z - 4); };

function isFreeRoamCam() {
  return freeNav && (state === 'intro' || state === 'roam' || state === 'shelf' || state === 'book');
}
function targetPose() {
  if (state === 'gate') { followPose(ENTRANCE, 0.1); return; }
  if (state === 'sign') { signPose(); return; }
  if (state === 'intro') { followPose(freeNav ? cat.pos : ENTRANCE, freeNav ? camYawSmooth : 0.1); return; }
  if (state === 'travel' && travelCam) { travelCam(); return; }
  if (state === 'shelf' || state === 'book') {
    if (freeNav) followPose(cat.pos, camYawSmooth);
    else shelfPose();
    return;
  }
  if (state === 'roam') { followPose(cat.pos, camYawSmooth); return; }
  followPose();
}
function updateCamera(dt) {
  camera.fov = camera.aspect < 0.9 ? 62 : 50;
  camera.updateProjectionMatrix();
  if (state === 'book' && !freeNav) return;
  // Smooth the yaw used for followPose so quick cat turns don't whip the camera.
  if (cat) {
    if (snapNext || STILL) camYawSmooth = cat.yaw;
    else if (isFreeRoamCam()) {
      const yawK = 1 - Math.exp(-dt * 3.0);
      camYawSmooth = lerpAngle(camYawSmooth, cat.yaw, yawK);
    }
  }
  targetPose();
  const roam = isFreeRoamCam();
  const rate = state === 'shelf' && !freeNav ? 3 : roam ? 3.4 : 4.5;
  const k = snapNext || STILL ? 1 : 1 - Math.exp(-dt * rate);
  camera.position.lerp(camPos, k);
  lookNow.lerp(camLook, k);
  if (snapNext || STILL) { camera.position.copy(camPos); lookNow.copy(camLook); snapNext = false; }
  camera.lookAt(lookNow);
}

/* ---------- catalog / shelf ---------- */
function filteredItems(year = currentYear) {
  let list = catalog.items.filter((i) => i.year === year);
  if (mode === 'student' && studentId) list = list.filter((i) => i.student_id === studentId);
  return list;
}
function itemsForStudentAllYears(sid) {
  return catalog.items.filter((i) => i.student_id === sid);
}
/** One book per year for the wall: student's own, or teacher representative (prefer 01). */
function wallItems() {
  const out = [];
  for (const f of YEAR_FLOORS) {
    let list = catalog.items.filter((i) => i.year === f.year);
    if (mode === 'student' && studentId) {
      list = list.filter((i) => i.student_id === studentId);
      if (list[0]) out.push(list[0]);
      continue;
    }
    list = [...list].sort((a, b) => a.student_id.localeCompare(b.student_id));
    const pick = list.find((i) => i.student_id === '01') || list[0];
    if (pick) out.push(pick);
  }
  return out;
}
function clearBooks() {
  while (bookGroup.children.length) {
    const m = bookGroup.children.pop();
    m.geometry?.dispose?.();
    if (Array.isArray(m.material)) m.material.forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    else m.material?.dispose?.();
  }
  bookMeshes = [];
}
function yearColor(year = currentYear) {
  return colorForYear(year) || FLOOR[year]?.color || LEVEL_FALLBACK;
}
function yearGradeLabel(year = currentYear) {
  const g = gradeForYear(year);
  return g ? (LEVEL_LABELS[g] || g) : '—';
}
function floorOf(year = currentYear) {
  const y = String(year);
  return FLOOR[y] || { key: y, year: y, name: y, title: `DSE ${y}`, color: yearColor(y) };
}
function syncFloorChrome() {
  const floor = floorOf(currentYear);
  const accent = yearColor(currentYear);
  const nHere = bookMeshes.filter((m) => String(m.userData?.item?.year) === String(currentYear)).length;
  dressFloor(floor.year, accent, nHere, yearBayZ(currentYear));
  $('floorBtn').style.setProperty('--fcd', accent);
  $('floorBtn').innerHTML = `<b>${floor.name}</b><small>${yearGradeLabel(currentYear)}</small>`;
  const who = mode === 'student' ? `學號 ${studentId}` : '教師代表冊';
  const nWall = bookMeshes.length;
  $('shelfHint').textContent = nWall
    ? `${who} · ${floor.year} · 左牆排名 · 右牆 ${nWall} 本錯題簿`
    : '暫時未有錯題簿 · 左牆仍可睇排名';
}
function itemForYear(year) {
  const y = String(year);
  return wallItems().find((i) => String(i.year) === y) || null;
}

/** Paint left-wall corridor 總表 from current mode / grades. */
function refreshSummaryBoard({ keepScroll = false } = {}) {
  const title = '年份總表';
  const subtitle = mode === 'student'
    ? `學號 ${studentId} · 撳年份睇排名（唔含錯題簿）`
    : '教師 · 撳年份睇班排名（唔含錯題簿）';
  const rows = YEAR_FLOORS.map((f) => {
    const y = String(f.year);
    const item = itemForYear(y);
    const median = gradeForYear(y);
    const medLab = median ? (LEVEL_LABELS[median] || median) : '—';
    const mine = mode === 'student' && studentId ? gradeOf(studentId, y) : null;
    const mineLab = mine ? (LEVEL_LABELS[mine] || mine) : null;
    const rank = mode === 'student' && studentId ? rankOfStudent(y, studentId) : null;
    const accent = mode === 'student' && mine
      ? (LEVEL_COLORS[mine] || LEVEL_FALLBACK)
      : colorForYear(y);
    return {
      year: y,
      you: mineLab,
      rank,
      median: medLab,
      hasPdf: !!item, // kept for panel button only; not shown as board primary
      accent,
    };
  });
  setSummaryBoardLabels(title, subtitle);
  const scrollY = keepScroll ? (board.scroll || 0) : 0;
  paintSummaryBoard(title, subtitle, rows, scrollY);
}

function selectYear(year, { openPdf = false, openStats = false, travelTo = false } = {}) {
  const y = String(year);
  currentYear = y;
  syncFloorChrome();
  refreshSummaryBoard();
  snapNext = true;
  const item = itemForYear(y);
  if (openPdf && item) {
    closeDesk();
    openPdfViewer(item);
    return Promise.resolve();
  }
  if (openStats || (!openPdf && !travelTo)) {
    openYearResults(y, item);
    return Promise.resolve();
  }
  if (travelTo) return goFloor(y);
  toast(yearColor(y), `${y}`, '左牆＝排名 · 右牆書／「去錯題簿」開簿');
  return Promise.resolve();
}

function rebuildShelf() {
  setBookColorMode(mode === 'student' ? 'student' : 'median');
  clearBooks();
  bookMeshes = placeWallBooks(wallItems(), bookGroup);
  syncFloorChrome();
  refreshSummaryBoard();
  closeDesk();
}

/* ---------- travel ---------- */
function hallPath(from, to) {
  const dz = to.z - from.z, s = Math.sign(dz) || 1;
  if (Math.abs(dz) < 1.6) return [from.clone(), from.clone().lerp(to, 0.5), to.clone()];
  return [from.clone(), V3(HALL_X, 0, from.z + s * 0.7), V3(HALL_X, 0, to.z - s * 0.9), to.clone()];
}
function walkPath(pts, secs) {
  const len = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(0)), false, 'centripetal', 0.3).getLength();
  return cat.walk(pts, Math.min(4.4, Math.max(2.4, len / Math.max(0.35, secs))));
}

async function startFollow() {
  if (state !== 'intro' || busy) return;
  freeNav = false;
  keys.clear();
  setState('walk');
  await cat.walk([cat.pos.clone(), V3(0.15, 0, 1.9), BOARD_STOP], 2.2);
  cat.face(1.1);
  setState('sign');
  await sleep(320);
  openFloorSheet();
}

async function travel(dest) {
  if (busy) return;
  busy = true;
  freeNav = false;
  keys.clear();
  closeSheet();
  closeDesk();
  hideTip();
  const toFloor = dest.kind === 'shelf' ? dest.floor : null;
  const toStop = dest.kind === 'shelf' ? shelfStop(toFloor || currentYear) : ENTRANCE;
  const from = state;
  setState('travel');

  travelCam = holdCam;
  cat.sitTarget = 0;
  if ((from === 'shelf' || from === 'book' || from === 'roam') && cat.pos.y > 0.2) {
    await cat.hop(V3(X1 - 1.2, 0, cat.pos.z), 480);
  }

  // All years live on one continuous wall — walk the hall, no floor fade.
  if (dest.kind === 'intro') {
    travelCam = introCam;
    if (from === 'shelf' || from === 'book' || from === 'roam') snapNext = true;
  } else {
    travelCam = hallCam(toStop.z);
    if (toFloor) {
      currentYear = toFloor;
      if (!bookMeshes.length) rebuildShelf();
      else syncFloorChrome();
    }
  }

  await walkPath(hallPath(cat.pos, toStop), 1.45);
  travelCam = null;

  if (dest.kind === 'shelf') {
    cat.face(-Math.PI / 2);
    await sleep(180);
    const floor = floorOf(currentYear);
    toast(yearColor(currentYear), floor.name, `到咗 · 左牆睇排名 · 右牆書＝錯題簿`);
    if (MOBILE) {
      // Phone: stay on the floor for tap-to-walk.
      freeNav = true;
      cat.sitTarget = 0;
      cat.lookTarget = 0;
      cat.set({ pos: shelfStop(), yaw: -Math.PI / 2, sit: 0, look: 0 });
      setState('roam');
      snapNext = true;
    } else {
      freeNav = false;
      setState('shelf');
      await cat.hop(catSeat(), 580);
      cat.face(Math.PI / 2);
      cat.sitTarget = 1;
      cat.lookTarget = 0;
    }
  } else {
    cat.face(0.1);
    cat.lookTarget = 1;
    setState('intro');
    toast('#86afd8', '大堂', '跟着貓咪 · 或自由行');
  }
  busy = false;
}

function goFloor(key) {
  const near = (state === 'shelf' || state === 'roam') && currentYear === key
    && Math.abs(cat.pos.z - yearBayZ(key)) < 0.85 && !busy;
  if (near && !freeNav) { closeSheet(); return Promise.resolve(); }
  if (near && freeNav && Math.abs(cat.pos.z - yearBayZ(key)) < 0.45) {
    closeSheet();
    syncFloorChrome();
    return Promise.resolve();
  }
  return travel({ kind: 'shelf', floor: key });
}
function goLobby() {
  if (state === 'intro' || state === 'gate' || state === 'walk') return;
  if (busy) return;
  travel({ kind: 'intro' });
}


/* ---------- UI sheets / desk / pdf ---------- */
function openFloorSheet() {
  const el = $('sheet');
  const rows = YEAR_FLOORS.map((f) => {
    const n = filteredItems(f.year).length;
    const here = f.key === currentYear && (state === 'shelf' || state === 'roam' || state === 'book') ? ' here' : '';
    const empty = n === 0 ? ' empty' : '';
    const accent = yearColor(f.year);
    const gl = yearGradeLabel(f.year);
    return `<button type="button" class="book${here}${empty}" data-year="${f.key}" style="--fc:${accent}">
      <b>${f.name}</b><span>${f.title}</span><em>${gl}${n ? ' · ' + n + ' 本' : ' · 空'}</em>
    </button>`;
  }).join('');
  const whoLine = mode === 'student'
    ? `學號 <b>${studentId}</b>：左牆＝排名；右牆書＝錯題簿`
    : '教師模式：左牆＝班排名；右牆書＝錯題簿';
  el.innerHTML = `
    <div class="grab"></div>
    <header>
      <div><h2>揀年份（沿牆）</h2><p>${whoLine}</p></div>
      <button type="button" class="x" id="sheetClose">✕</button>
    </header>
    <div class="modechip">
      <button type="button" data-act="relobby">返大堂</button>
      <button type="button" data-act="relogin">切換身份</button>
    </div>
    <div class="tower">${rows}<div class="plate"></div></div>`;
  el.classList.add('show');
}
function closeSheet() { $('sheet').classList.remove('show'); }

function gradeChip(g) {
  const label = LEVEL_LABELS[g] || g || '—';
  const fc = (g && LEVEL_COLORS[g]) || LEVEL_FALLBACK;
  return `<span class="chip" style="--fc:${fc}">${label}</span>`;
}

/** 1-based class rank for a student in that year (by grade order); null if absent. */
function rankOfStudent(year, sid) {
  if (sid == null) return null;
  const id = String(sid).padStart(2, '0');
  const roster = yearResults(year).roster || [];
  const idx = roster.findIndex((r) => r.id === id);
  return idx >= 0 ? idx + 1 : null;
}

function openYearResults(year, item = null) {
  const y = String(year);
  selected = item || itemForYear(y);
  freeNav = false;
  currentYear = y;
  syncFloorChrome();
  const accent = yearColor(y);
  const res = yearResults(y);
  const gl = res.median ? (LEVEL_LABELS[res.median] || res.median) : '—';
  const desk = $('desk');
  const myRank = mode === 'student' && studentId ? rankOfStudent(y, studentId) : null;

  let youBlock = '';
  if (mode === 'student' && studentId) {
    const mine = gradeOf(studentId, y);
    const mineDetail = yearDetailOf(studentId, y);
    const row = studentRow(studentId);
    youBlock = `
      <div class="d-you">
        <div class="d-you-lab">你嘅排名（學號 ${studentId}${row?.name ? ' · ' + row.name : ''}）</div>
        <div class="d-you-row">
          <div><span class="d-k">名次</span><b class="d-rank">${myRank != null ? `#${myRank} / ${res.n || '—'}` : '未上榜'}</b></div>
          <div><span class="d-k">呢年等級</span>${gradeChip(mine)}${mineDetail ? `<em class="d-score">${mineDetail}</em>` : ''}</div>
          <div><span class="d-k">整體預測</span>${gradeChip(row?.pred)}</div>
        </div>
      </div>`;
  }

  const countOrder = ['5**', '5*', '5', '4', '3', '2', '1'];
  const dist = countOrder
    .filter((g) => res.counts[g])
    .map((g) => `<span class="d-dist-i" style="--fc:${LEVEL_COLORS[g]}">${LEVEL_LABELS[g]} ×${res.counts[g]}</span>`)
    .join('');

  const rosterHtml = res.roster.length
    ? `<ul class="d-roster">${res.roster.map((r, i) => {
        const me = mode === 'student' && studentId && r.id === String(studentId).padStart(2, '0');
        return `<li class="${me ? 'me' : ''}">
          <span class="d-sid">#${i + 1}</span>
          <span class="d-name">${r.id} · ${r.name}</span>
          ${gradeChip(r.grade)}
          <span class="d-score">${r.detail || ''}</span>
        </li>`;
      }).join('')}</ul>`
    : '<p class="d-meta">呢年未有班排名資料。</p>';

  // Ranking first; 錯題簿 is a follow-up option (not part of 總表 itself).
  const book = selected;
  let bookBlock;
  if (book) {
    const url = pdfUrl(book);
    bookBlock = `
      <div class="d-book-next">
        <p class="d-meta">睇完排名之後，可以去呢年嘅錯題簿（右牆書亦都開到）。</p>
        <div class="d-actions">
          <button type="button" id="openPdf">去錯題簿</button>
          <a class="ghost" href="${url}" target="_blank" rel="noopener">新分頁開簿</a>
          <button type="button" class="ghost" id="deskBack">關閉</button>
        </div>
      </div>`;
  } else {
    bookBlock = `
      <div class="d-book-next">
        <p class="d-meta">呢年未有錯題簿 PDF · 只可以睇排名。</p>
        <div class="d-actions">
          <button type="button" id="openPdf" disabled title="未有錯題簿">去錯題簿（未有）</button>
          <button type="button" class="ghost" id="deskBack">關閉</button>
        </div>
      </div>`;
  }

  desk.innerHTML = `
    <div class="d-top">
      <p class="d-eyebrow"><span class="chip" style="--fc:${accent}">${y}</span>
        <span class="chip" style="--fc:${accent}">班中位 ${gl}</span> 年份排名</p>
      <button type="button" class="x" id="deskClose">✕</button>
    </div>
    <h2>${y} · 班排名</h2>
    <p class="d-meta">${res.n ? `共 ${res.n} 人上榜` : '未有班紀錄'} · 左牆總表只顯示排名；錯題簿請用下方按鈕或右牆書</p>
    ${youBlock}
    <div class="d-median-big" style="--fc:${accent}">
      <span>班中位</span><b>${gl}</b>
    </div>
    ${dist ? `<div class="d-dist">${dist}</div>` : ''}
    <h3 class="d-sub">全班排名（高 → 低）</h3>
    ${rosterHtml}
    ${bookBlock}`;
  desk.classList.add('show');
  setState('book');
}

function openDesk(item) {
  openYearResults(item.year, item);
}
function closeDesk() {
  $('desk').classList.remove('show');
  selected = null;
  if (state === 'book') setState('shelf');
}
function openPdfViewer(item) {
  const url = pdfUrl(item);
  $('rSub').textContent = `${item.class} · ${item.year}`;
  $('rTitle').textContent = `學號 ${item.student_id} 錯題簿`;
  $('rOut').href = url;
  $('rWait').hidden = false;
  const frame = $('rFrame');
  frame.onload = () => { $('rWait').hidden = true; };
  frame.src = url;
  $('reader').hidden = false;
}
function closePdfViewer() {
  $('reader').hidden = true;
  $('rFrame').src = 'about:blank';
}

/* ---------- picking ---------- */
function aim(e) {
  const rect = canvasEl.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}
function pickBook(e) {
  aim(e);
  const hits = raycaster.intersectObjects(bookMeshes, false);
  return hits[0]?.object || null;
}
/** Book or 班中位 plate on the wall. */
function pickWall(e) {
  aim(e);
  // Prefer live bookMeshes (right-wall books); fall back to group children.
  const targets = (bookMeshes && bookMeshes.length)
    ? bookMeshes
    : bookGroup.children.filter((o) => o.userData?.item || o.userData?.perfPlate);
  const hits = raycaster.intersectObjects(targets, true);
  const obj = hits[0]?.object;
  if (!obj) return null;
  const root = obj.userData?.item ? obj : (obj.parent?.userData?.item ? obj.parent : obj);
  if (root.userData?.item) {
    return { kind: 'book', item: root.userData.item, year: String(root.userData.item.year), mesh: root };
  }
  if (obj.userData?.perfPlate || root.userData?.perfPlate) {
    const plate = obj.userData?.perfPlate ? obj : root;
    const year = String(plate.userData.year);
    const book = bookMeshes.find((m) => String(m.userData?.item?.year) === year);
    return { kind: 'plate', item: book?.userData?.item || null, year, mesh: plate };
  }
  return null;
}

/** Nearest right-wall book in front of the cat/player. */
function nearestOpenableBook() {
  if (!bookMeshes.length) return null;
  if ((state === 'shelf' || state === 'book') && !freeNav) {
    const m = bookMeshes.find((b) => String(b.userData?.item?.year) === String(currentYear));
    return m?.userData?.item || null;
  }
  if (!cat) return null;
  if (!(state === 'roam' || state === 'intro' || (state === 'shelf' && freeNav))) return null;
  const yaw = cat.yaw || 0;
  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);
  let best = null;
  let bestScore = Infinity;
  for (const m of bookMeshes) {
    const item = m.userData?.item;
    if (!item) continue;
    const dx = m.position.x - cat.pos.x;
    const dz = m.position.z - cat.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 2.8) continue;
    if (Math.abs(dz) > 1.35) continue;
    if (cat.pos.x < SHELF_FRONT - 3.2) continue;
    const dot = (fwdX * dx + fwdZ * dz) / (dist || 1e-6);
    if (dot < -0.2 && Math.abs(dz) > 0.6) continue;
    const score = dist - (dot > 0.2 ? 0.35 : 0) - (Math.abs(dz) < 0.55 ? 0.25 : 0);
    if (score < bestScore) { bestScore = score; best = item; }
  }
  return best;
}

function openNearestBookPdf() {
  if (busy) return false;
  if (!$('reader').hidden) return false;
  if ($('gate') && !$('gate').hidden) return false;
  const item = nearestOpenableBook();
  if (!item) return false;
  currentYear = String(item.year);
  syncFloorChrome();
  closeDesk();
  closeSheet();
  openPdfViewer(item);
  toast(yearColor(item.year), `${item.year} 錯題簿`, `學號 ${item.student_id} · Enter／撳書開 PDF`);
  return true;
}

let nearHintItemId = null;
function updateNearBookHint() {
  const hint = $('moveHint');
  if (!hint) return;
  const play = state === 'roam' || state === 'shelf' || state === 'book' || state === 'intro';
  if (!play || busy || !$('reader').hidden) {
    if (nearHintItemId) { hint.hidden = true; nearHintItemId = null; }
    return;
  }
  // Keep WASD tip when exploring; overlay Enter when a book is in reach.
  const item = nearestOpenableBook();
  if (!item) {
    if (nearHintItemId) {
      nearHintItemId = null;
      if (state === 'roam' || (state === 'shelf' && freeNav) || (state === 'intro' && freeNav)) {
        hint.hidden = false;
        hint.innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或箭咀移動 · 撳地板行過去';
      } else {
        hint.hidden = true;
      }
    }
    return;
  }
  const id = bookId(item);
  if (id === nearHintItemId && !hint.hidden) return;
  nearHintItemId = id;
  hint.hidden = false;
  hint.innerHTML = `<kbd>Enter</kbd> 開 ${item.year} 錯題簿`;
  const bar = $('shelfHint');
  if (bar && (state === 'shelf' || state === 'roam' || state === 'book')) {
    bar.textContent = `近右牆 ${item.year} 錯題簿 · Enter／撳書開 PDF · 左牆睇排名`;
  }
}
function pickFloor(e) {
  if (!floorMesh) return null;
  aim(e);
  const hit = raycaster.intersectObject(floorMesh, false)[0];
  return hit?.point || null;
}

function handleBoardPick(by) {
  if (!by) return false;
  if (by.scroll) {
    scrollSummaryBoard(by.scroll * (board.rowH || 100));
    return true;
  }
  if (by.year) {
    selectYear(by.year, { openStats: true });
    return true;
  }
  return false;
}
function pickBoard(e) {
  if (!board.group) return false;
  aim(e);
  return raycaster.intersectObject(board.group, true).length > 0;
}
/** Hit left-wall 總表 → { year, hasPdf } | { scroll: ±1 } | null. */
function pickBoardYear(e) {
  if (!board.group) return null;
  aim(e);
  const target = board.face || board.group;
  const hits = raycaster.intersectObject(target, true);
  const hit = hits[0];
  if (!hit) return null;
  const H = board.canvasH || board.canvas?.height || 2110;
  const W = board.canvas?.width || 1024;
  if (!hit.uv) return { year: null, hasPdf: false };
  const px = hit.uv.x * W;
  const py = (1 - hit.uv.y) * H; // canvas flipY
  for (const b of board.scrollBtns || []) {
    if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) {
      return { scroll: b.dir, year: null, hasPdf: false };
    }
  }
  const rows = board.rows || [];
  for (const r of rows) {
    if (py >= r.y0 && py <= r.y1) return { year: r.year, hasPdf: r.hasPdf };
  }
  return { year: null, hasPdf: false };
}
function overCat(e) {
  if (!cat || busy) return false;
  if (!(state === 'sign' || state === 'shelf' || state === 'intro' || state === 'roam')) return false;
  aim(e);
  return raycaster.intersectObject(cat.root, true).length > 0;
}
function showTip(e, item) {
  const tip = $('tip');
  const mineG = gradeOf(item.student_id, item.year);
  const mineLab = mineG ? (LEVEL_LABELS[mineG] || mineG) : '—';
  tip.innerHTML = `<b>學號 ${item.student_id} · ${item.year}</b><span>撳開 PDF · 你嘅等級 ${mineLab} · 班中位 ${yearGradeLabel(item.year)}</span>`;
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 220)}px`;
  tip.style.top = `${Math.min(e.clientY + 14, innerHeight - 70)}px`;
  tip.classList.add('show');
}
function hideTip() { $('tip').classList.remove('show'); }

/* ---------- free movement ---------- */
function clampPos(p) {
  p.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, p.x));
  p.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, p.z));
  p.y = 0;
  return p;
}
function canFreeMove() {
  return !busy && (state === 'intro' || state === 'roam' || (state === 'shelf' && freeNav));
}
async function ensureOnFloor() {
  if (cat.pos.y > 0.15 || cat.sit > 0.4) {
    clearMoveVel();
    cat.sitTarget = 0;
    await cat.hop(shelfStop().clone(), 480);
    freeNav = true;
    if (state === 'shelf' || state === 'book') setState('roam');
  }
}
function clearMoveVel() {
  moveVel.set(0, 0, 0);
}
function applyFreeMove(dt) {
  if (!canFreeMove() || cat.path || cat.hopState) {
    clearMoveVel();
    return;
  }
  let dx = 0, dz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  const hasInput = Math.abs(dx) >= 0.05 || Math.abs(dz) >= 0.05;

  const desired = V3(0, 0, 0);
  if (hasInput) {
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-8) fwd.normalize();
    else fwd.set(0, 0, -1);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() > 1e-8) right.normalize();
    else right.set(1, 0, 0);
    desired.copy(fwd).multiplyScalar(-dz).addScaledVector(right, dx);
    if (desired.lengthSq() > 1e-6) desired.normalize().multiplyScalar(MOVE_MAX);
    else desired.set(0, 0, 0);
  }

  const resp = hasInput ? MOVE_ACCEL : MOVE_DECEL;
  const k = 1 - Math.exp(-dt * resp);
  moveVel.x += (desired.x - moveVel.x) * k;
  moveVel.z += (desired.z - moveVel.z) * k;
  moveVel.y = 0;

  const speed = Math.hypot(moveVel.x, moveVel.z);
  if (speed < MOVE_STOP_EPS) {
    clearMoveVel();
    if (cat.moving && !cat.path) cat.moving = false;
    return;
  }

  const prevX = cat.pos.x;
  const prevZ = cat.pos.z;
  const next = cat.pos.clone().addScaledVector(moveVel, dt);
  clampPos(next);
  // Kill velocity into walls so stops don't feel sticky/jittery
  if (Math.abs(next.x - (prevX + moveVel.x * dt)) > 1e-5) moveVel.x = 0;
  if (Math.abs(next.z - (prevZ + moveVel.z * dt)) > 1e-5) moveVel.z = 0;
  cat.root.position.copy(next);

  // Face actual velocity; avoid yaw snaps when nearly stopped (handled by STOP_EPS above)
  cat.yawTarget = Math.atan2(-moveVel.x, -moveVel.z);
  cat.moving = true;
  cat.phase += (speed * dt) / 0.16;
  freeNav = true;
}
async function walkToPoint(pt) {
  if (busy || !canFreeMove()) return;
  clearMoveVel();
  keys.clear();
  if (cat.pos.y > 0.15) await ensureOnFloor();
  const target = clampPos(pt.clone().setY(0));
  const mid = cat.pos.clone().lerp(target, 0.5);
  mid.x = THREE.MathUtils.clamp(mid.x, BOUNDS.x0, BOUNDS.x1);
  await cat.walk([cat.pos.clone(), mid, target], 2.5);
}

/* ---------- pet ---------- */
let petting = null;
function petBurst() {
  cat.pet(0.45);
  cat.jiggle();
  toast('#e0745a', '喵～', '摸摸頭');
}

/* ---------- gate ---------- */
function beginPlay() {
  $('gate').hidden = true;
  freeNav = false;
  keys.clear();
  applyFur(loadFur());
  cat.set({ pos: ENTRANCE, yaw: 0.1, sit: 0, look: 1 });
  rebuildShelf();
  setState('intro');
  snapNext = true;
  toast(yearColor(currentYear), '歡迎', '左牆睇排名 · 右牆／排名後入錯題簿');
}
function enterAsStudent(raw) {
  const sid = String(raw || '').trim().padStart(2, '0');
  if (!/^\d{2}$/.test(sid) || +sid < 1 || +sid > 22) {
    $('gateErr').textContent = '請輸入 01 至 22 嘅學號';
    return;
  }
  const mine = itemsForStudentAllYears(sid);
  $('gateErr').textContent = mine.length ? '' : `學號 ${sid} 暫時未有個人 PDF（仍可進入空架）`;
  mode = 'student';
  studentId = sid;
  $('whoBtn').textContent = `學號 ${sid}`;
  const years = [...new Set(mine.map((i) => i.year))].sort();
  currentYear = years.at(-1) || currentYear;
  beginPlay();
}
function enterAsTeacher() {
  mode = 'teacher';
  studentId = null;
  $('gateErr').textContent = '';
  $('whoBtn').textContent = '教師';
  beginPlay();
}
function showGate() {
  closePdfViewer();
  closeDesk();
  closeSheet();
  freeNav = false;
  keys.clear();
  cat?.stop?.();
  $('gate').hidden = false;
  setState('gate');
  cat?.set({ pos: ENTRANCE, yaw: 0.1, sit: 0, look: 1 });
  snapNext = true;
}

/* ---------- events ---------- */
let downAt = null;
function onPointerMove(e) {
  if (petting) {
    const d = Math.hypot(e.clientX - petting.lx, e.clientY - petting.ly);
    petting.lx = e.clientX; petting.ly = e.clientY; petting.dist += d;
    if (d > 2) cat.pet(0.08);
    return;
  }
  if (e.pointerType === 'touch') return;
  if (overCat(e)) {
    canvasEl.style.cursor = 'pointer';
    hideTip();
    return;
  }
  if ((state === 'shelf' || state === 'roam' || state === 'book' || state === 'intro' || state === 'sign') && !busy) {
    const by = pickBoardYear(e);
    if (by && by.year) {
      const tip = $('tip');
      tip.innerHTML = `<b>${by.year} 排名</b><span>撳睇班排名${by.hasPdf ? ' · 之後可去錯題簿' : ''}</span>`;
      tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 220)}px`;
      tip.style.top = `${Math.min(e.clientY + 14, innerHeight - 80)}px`;
      tip.classList.add('show');
      canvasEl.style.cursor = 'pointer';
      return;
    }
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) {
      showTip(e, hit.item);
      canvasEl.style.cursor = 'pointer';
      return;
    }
    hideTip();
    if (state === 'intro' || state === 'sign') {
      canvasEl.style.cursor = pickBoard(e) ? 'pointer' : 'default';
      return;
    }
    canvasEl.style.cursor = 'default';
    return;
  }
  if ((state === 'intro' || state === 'sign') && !busy) {
    canvasEl.style.cursor = pickBoard(e) ? 'pointer' : 'default';
    return;
  }
  hideTip();
  canvasEl.style.cursor = 'default';
}
function onPointerDown(e) {
  downAt = { x: e.clientX, y: e.clientY };
  if (overCat(e)) {
    petting = { lx: e.clientX, ly: e.clientY, dist: 0 };
    canvasEl.setPointerCapture(e.pointerId);
  }
}
async function onPointerUp(e) {
  if (petting) {
    const tap = petting.dist < 8;
    petting = null;
    if (tap) petBurst();
    return;
  }
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) return;
  if (state === 'intro' && !busy) {
    const by = pickBoardYear(e);
    if (by?.scroll) { handleBoardPick(by); return; }
    if (by?.year) { await selectYear(by.year, { openStats: true }); return; }
    if (pickBoard(e)) { await startFollow(); return; }
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) {
      currentYear = String(hit.item.year); syncFloorChrome(); closeDesk(); openPdfViewer(hit.item); return;
    }
    const pt = pickFloor(e);
    if (pt) { freeNav = true; await walkToPoint(pt); return; }
    await startFollow();
    return;
  }
  if (state === 'sign' && !busy) {
    const by = pickBoardYear(e);
    if (by?.scroll) { handleBoardPick(by); return; }
    if (by?.year) { closeSheet(); await selectYear(by.year, { openStats: true }); return; }
    if ($('sheet').classList.contains('show')) return;
    openFloorSheet();
    return;
  }
  if ((state === 'roam' || (state === 'shelf' && freeNav)) && !busy) {
    const by = pickBoardYear(e);
    if (by?.scroll) { handleBoardPick(by); return; }
    if (by?.year) { await selectYear(by.year, { openStats: true }); return; }
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) {
      currentYear = String(hit.item.year);
      syncFloorChrome();
      refreshSummaryBoard({ keepScroll: true });
      closeDesk();
      openPdfViewer(hit.item);
      return;
    }
    const pt = pickFloor(e);
    if (pt) await walkToPoint(pt);
    return;
  }
  if (state === 'shelf' && !busy) {
    const by = pickBoardYear(e);
    if (by?.scroll) { handleBoardPick(by); return; }
    if (by?.year) { await selectYear(by.year, { openStats: true }); return; }
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) {
      currentYear = String(hit.item.year);
      syncFloorChrome();
      refreshSummaryBoard({ keepScroll: true });
      closeDesk();
      openPdfViewer(hit.item);
    }
  }
}


function bindUi() {
  buildFurSwatches();
  applyFur(loadFur());
  $('enterStudent').onclick = () => enterAsStudent($('sidInput').value);
  $('enterTeacher').onclick = () => enterAsTeacher();
  $('sidInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterAsStudent($('sidInput').value);
  });
  $('floorBtn').onclick = () => { if (!busy) openFloorSheet(); };
  $('otherFloor').onclick = () => { if (!busy) openFloorSheet(); };
  $('lobbyBtn').onclick = () => goLobby();
  $('whoBtn').onclick = () => showGate();
  $('hint').onclick = () => startFollow();
  $('rClose').onclick = () => closePdfViewer();
  $('exploreBtn')?.addEventListener('click', async () => {
    if (busy) return;
    if (state === 'shelf' || state === 'book') {
      await ensureOnFloor();
      freeNav = true;
      setState('roam');
      toast('#86afd8', '自由行', 'WASD／箭咀／撳地板 · 行快咗');
    }
  });
  $('sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheetClose') {
      closeSheet();
      if (state === 'sign') goLobby();
      return;
    }
    const y = e.target.closest('[data-year]')?.dataset.year;
    if (y) { closeSheet(); selectYear(y, { openStats: true }); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'relobby') { closeSheet(); goLobby(); return; }
    if (act === 'relogin') { closeSheet(); showGate(); }
  });
  $('desk').addEventListener('click', (e) => {
    if (e.target.id === 'deskClose' || e.target.id === 'deskBack') { closeDesk(); return; }
    if (e.target.id === 'openPdf' && selected) openPdfViewer(selected);
  });
  // In-world 總表 scroll: wheel / drag so every year is reachable.
  let boardDrag = null;
  const boardPlay = () => state === 'intro' || state === 'roam' || state === 'shelf' || state === 'sign' || state === 'book';
  canvasEl.addEventListener('wheel', (e) => {
    if (busy || !boardPlay()) return;
    aim(e);
    if (!(board.face && raycaster.intersectObject(board.face, true).length)) return;
    e.preventDefault();
    scrollSummaryBoard(e.deltaY * 0.85);
  }, { passive: false });
  canvasEl.addEventListener('pointermove', (e) => {
    if (boardDrag && !petting) {
      const dy = e.clientY - boardDrag.y;
      if (Math.abs(dy) > 4) {
        boardDrag.y = e.clientY;
        boardDrag.scrolled = true;
        scrollSummaryBoard(-dy * 2.2);
      }
    }
    onPointerMove(e);
  });
  canvasEl.addEventListener('pointerdown', (e) => {
    onPointerDown(e);
    if (petting || busy || !boardPlay()) return;
    if (pickBoard(e)) boardDrag = { y: e.clientY, scrolled: false };
  });
  canvasEl.addEventListener('pointerup', async (e) => {
    const dragged = boardDrag?.scrolled;
    boardDrag = null;
    if (dragged) { downAt = null; return; }
    await onPointerUp(e);
  });

  canvasEl.addEventListener('pointercancel', () => { petting = null; });
  addEventListener('resize', () => { resize(); snapNext = true; });
  addEventListener('keydown', async (e) => {
    if (e.target.matches?.('input,textarea')) return;
    if (e.key === 'Escape') {
      if (!$('reader').hidden) { closePdfViewer(); return; }
      if ($('sheet').classList.contains('show')) { closeSheet(); if (state === 'sign') goLobby(); return; }
      if ($('desk').classList.contains('show')) { closeDesk(); return; }
    }
    if (e.key === 'Enter') {
      if ($('desk').classList.contains('show') && selected) {
        e.preventDefault();
        openPdfViewer(selected);
        return;
      }
      if (openNearestBookPdf()) {
        e.preventDefault();
        return;
      }
    }
    const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (moveKeys.includes(e.code)) {
      e.preventDefault();
      if (busy) return;
      if (state === 'shelf' || state === 'book') {
        if (!freeNav) {
          await ensureOnFloor();
          freeNav = true;
          setState('roam');
        }
      }
      if (state === 'intro' || state === 'roam' || (state === 'shelf' && freeNav)) {
        freeNav = true;
        keys.add(e.code);
      }
    }
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
}

/* ---------- loop ---------- */
const clock = new THREE.Clock();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = STILL ? 2 : clock.getElapsedTime();
  applyFreeMove(dt);
  cat.update(STILL ? 0.016 : dt, t);
  updateCamera(STILL ? 1 : dt);
  updateNearBookHint();
  updateWorld();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

async function boot() {
  buildWorld();
  resize();
  cat = createCat(scene, STILL, loadFur());
  cat.set({ pos: ENTRANCE, yaw: 0.1, sit: 0, look: 1 });
  bindUi();
  try {
    const gRes = await fetch('data/student-year-grades.json', { cache: 'no-store' });
    if (gRes.ok) {
      setGradeTable(await gRes.json());
      console.info('[library] student-year-grades loaded');
    } else {
      console.warn('[library] grades fetch', gRes.status);
    }
  } catch (err) {
    console.warn('[library] grades unavailable', err);
  }
  try {
    const res = await fetch('catalog.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    catalog = await res.json();
    if (!catalog.items) catalog = { meta: {}, items: catalog };
    const sample = catalog.items[0];
    if (sample) {
      const probe = await fetch(pdfUrl(sample), { method: 'HEAD' });
      console.info('[library] catalog', catalog.meta?.count ?? catalog.items.length, 'sample HEAD', probe.status, pdfUrl(sample));
    }
  } catch (err) {
    console.error(err);
    toast('#e0745a', '目錄讀取失敗', String(err.message || err));
  }
  // Ensure left 總表 / floor list includes every year in grades + catalog (e.g. 2022).
  const allYears = collectAllYears(catalog, getGradeTable());
  rebuildYearFloors(allYears);
  syncYearBayZ(allYears);
  if (!FLOOR[currentYear] && YEAR_FLOORS[0]) currentYear = YEAR_FLOORS[0].key;
  console.info('[library] years', allYears.join(', '));
  dressFloor(floorOf(currentYear).year, yearColor(currentYear), 0);
  setState('gate');
  snapNext = true;
  updateCamera(1);
  $('loading').classList.add('hide');
  requestAnimationFrame((n) => { last = n; loop(n); });
}

boot();
