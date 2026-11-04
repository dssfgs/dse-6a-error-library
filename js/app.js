import * as THREE from 'three';
import {
  QS, STILL, MOBILE, renderer, scene, camera, buildWorld, resize, updateWorld, dressFloor,
  SHELF_FRONT, rowY, X0, X1, Z0, Z1, floorMesh, board, yearBayZ, FEAT_Z,
} from './world.js';
import {
  YEAR_FLOORS, FLOOR, placeWallBooks, pdfUrl, formatSize, bookId,
  setGradeTable, setBookColorMode, colorForYear, gradeForYear, LEVEL_LABELS, LEVEL_FALLBACK,
  LEVEL_COLORS, gradeOf, yearDetailOf, studentRow, yearResults, RIGHT_SHELF_Z,
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
  const lib = s === 'shelf' || s === 'book' || s === 'roam';
  document.body.classList.toggle('library', lib);
  const yt = $('yearTable');
  const br = $('bookRail');
  if (yt) yt.hidden = !lib;
  if (br) br.hidden = !lib;
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
  camPos.set(0.55, 1.45, 3.2);
  camLook.set(-1.15, 1.1, 0.7);
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
  if (portrait) { dist = 1.55; cy = bookMeshes.length ? Math.min(1.7, Math.max(1.2, cy)) : 1.45; }
  const mine = bookMeshes.find((m) => String(m.userData?.item?.year) === String(currentYear));
  const z = mine?.userData?.bayZ ?? mine?.position?.z ?? RIGHT_SHELF_Z;
  if (mine) cy = THREE.MathUtils.clamp(mine.position.y, yMin + 0.25, yMax - 0.25);
  // Pull back a bit so left/right HTML panels frame the 3D shelf.
  dist = Math.max(dist, portrait ? 1.7 : 2.15);
  camPos.set(SHELF_FRONT - dist, cy + 0.08, z);
  camLook.set(SHELF_FRONT, cy, z);
}
const holdCam = () => {};
const introCam = () => followPose(ENTRANCE, 0.1);
const hallCam = (z) => () => { camPos.set(HALL_X + 0.1, 1.45, z + 2.6); camLook.set(0, 0.55, z - 4); };

function targetPose() {
  if (state === 'gate') { followPose(ENTRANCE, 0.1); return; }
  if (state === 'sign') { signPose(); return; }
  if (state === 'intro') { followPose(freeNav ? cat.pos : ENTRANCE, freeNav ? cat.yaw : 0.1); return; }
  if (state === 'travel' && travelCam) { travelCam(); return; }
  if (state === 'shelf' || state === 'book') {
    if (freeNav) followPose(cat.pos, cat.yaw);
    else shelfPose();
    return;
  }
  if (state === 'roam') { followPose(cat.pos, cat.yaw); return; }
  followPose();
}
function updateCamera(dt) {
  camera.fov = camera.aspect < 0.9 ? 62 : 50;
  camera.updateProjectionMatrix();
  if (state === 'book' && !freeNav) return;
  targetPose();
  const k = snapNext || STILL ? 1 : 1 - Math.exp(-dt * (state === 'shelf' && !freeNav ? 3 : 4.5));
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
function syncFloorChrome() {
  const floor = FLOOR[currentYear];
  const accent = yearColor(currentYear);
  const nHere = bookMeshes.filter((m) => String(m.userData?.item?.year) === String(currentYear)).length;
  dressFloor(floor.year, accent, nHere, RIGHT_SHELF_Z);
  $('floorBtn').style.setProperty('--fcd', accent);
  $('floorBtn').innerHTML = `<b>${floor.name}</b><small>${yearGradeLabel(currentYear)}</small>`;
  const who = mode === 'student' ? `學號 ${studentId}` : '教師代表冊';
  const nWall = bookMeshes.length;
  $('shelfHint').textContent = nWall
    ? `${who} · 已選 ${floor.year} · 左邊總表 · 右邊 ${nWall} 本可撳`
    : '暫時未有錯題簿 · 左邊總表仍可睇成績';
}
function itemForYear(year) {
  const y = String(year);
  return wallItems().find((i) => String(i.year) === y) || null;
}

function colorForItemSafe(item) {
  const g = mode === 'student'
    ? gradeOf(item.student_id, item.year)
    : gradeForYear(item.year);
  if (g && LEVEL_COLORS[g]) return LEVEL_COLORS[g];
  return colorForYear(item.year) || LEVEL_FALLBACK;
}

function renderYearTable() {
  const list = $('ytList');
  const who = $('ytWho');
  if (!list) return;
  if (who) who.textContent = mode === 'student' ? `學號 ${studentId}` : '教師（班中位書色）';
  list.innerHTML = YEAR_FLOORS.map((f) => {
    const y = String(f.year);
    const item = itemForYear(y);
    const median = gradeForYear(y);
    const medLab = median ? (LEVEL_LABELS[median] || median) : '—';
    const mine = mode === 'student' && studentId ? gradeOf(studentId, y) : null;
    const mineLab = mine ? (LEVEL_LABELS[mine] || mine) : null;
    const accent = mode === 'student' && mine
      ? (LEVEL_COLORS[mine] || LEVEL_FALLBACK)
      : colorForYear(y);
    const on = y === String(currentYear) ? ' on' : '';
    const status = item ? '有 PDF' : '無 PDF';
    const meta = mode === 'student'
      ? `你 <b>${mineLab || '—'}</b> · 班中位 <b>${medLab}</b> · ${status}`
      : `班中位 <b>${medLab}</b> · ${status}`;
    return `<li class="yt-row${on}" data-year="${y}" style="--fc:${accent}">
      <button type="button" class="yt-main" data-select-year="${y}">
        <span class="yt-year">${y}</span>
        <span class="yt-meta">${meta}</span>
      </button>
      <span class="yt-acts">
        <button type="button" data-year-pdf="${y}" ${item ? '' : 'disabled'}>開 PDF</button>
        <button type="button" class="ghost" data-year-stats="${y}">成績</button>
      </span>
    </li>`;
  }).join('');
}

function renderBookRail() {
  const list = $('brList');
  const hint = $('brHint');
  if (!list) return;
  const items = wallItems();
  if (hint) hint.textContent = items.length ? '撳書脊開 PDF' : '暫時未有冊';
  if (!items.length) {
    list.innerHTML = '<p class="br-empty">呢個身份暫時未有錯題簿 PDF。<br>左邊總表仍可睇班中位／成績。</p>';
    return;
  }
  list.innerHTML = items.map((item) => {
    const y = String(item.year);
    const g = mode === 'student'
      ? (gradeOf(item.student_id, y) || gradeForYear(y))
      : gradeForYear(y);
    const fc = colorForItemSafe(item);
    const gl = g ? (LEVEL_LABELS[g] || g) : '—';
    const on = y === String(currentYear) ? ' on' : '';
    return `<button type="button" class="br-card${on}" data-open-year="${y}" style="--fc:${fc}">
      <span class="br-spine">${y}<br>${gl}</span>
      <span class="br-body">
        <b>${y} 錯題簿</b>
        <span>學號 ${item.student_id} · ${item.pages || '?'} 頁 · 撳開 PDF</span>
      </span>
    </button>`;
  }).join('');
}

function refreshLibraryPanels() {
  renderYearTable();
  renderBookRail();
}

function selectYear(year, { openPdf = false, openStats = false } = {}) {
  const y = String(year);
  currentYear = y;
  syncFloorChrome();
  refreshLibraryPanels();
  snapNext = true;
  const item = itemForYear(y);
  if (openPdf && item) {
    closeDesk();
    openPdfViewer(item);
    return;
  }
  if (openStats) {
    openYearResults(y, item);
    return;
  }
  toast(yearColor(y), `${y}`, item ? '右邊撳書開 PDF · 或撳「成績」' : '呢年未有 PDF · 可撳「成績」睇班表現');
}

function rebuildShelf() {
  setBookColorMode(mode === 'student' ? 'student' : 'median');
  clearBooks();
  bookMeshes = placeWallBooks(wallItems(), bookGroup);
  syncFloorChrome();
  refreshLibraryPanels();
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
    const floor = FLOOR[currentYear];
    toast(yearColor(currentYear), floor.name, `到咗 · Enter／撳書開 PDF · 撳牌睇成績`);
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
    ? `學號 <b>${studentId}</b>：牆上每年一本你嘅冊；書色＝你嗰年等級（唔係班中位）`
    : '教師模式：牆上每年一本代表冊（優先學號 01）；書色＝班中位；學生登入先跟個人等級';
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

function openYearResults(year, item = null) {
  const y = String(year);
  selected = item;
  freeNav = false;
  currentYear = y;
  syncFloorChrome();
  const accent = yearColor(y);
  const res = yearResults(y);
  const gl = res.median ? (LEVEL_LABELS[res.median] || res.median) : '—';
  const desk = $('desk');

  let youBlock = '';
  if (mode === 'student' && studentId) {
    const mine = gradeOf(studentId, y);
    const mineDetail = yearDetailOf(studentId, y);
    const row = studentRow(studentId);
    const pred = row?.pred ? (LEVEL_LABELS[row.pred] || row.pred) : '—';
    youBlock = `
      <div class="d-you">
        <div class="d-you-lab">你（學號 ${studentId}${row?.name ? ' · ' + row.name : ''}）</div>
        <div class="d-you-row">
          <div><span class="d-k">呢年</span>${gradeChip(mine)}${mineDetail ? `<em class="d-score">${mineDetail}</em>` : ''}</div>
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
    ? `<ul class="d-roster">${res.roster.map((r) => {
        const me = mode === 'student' && studentId && r.id === String(studentId).padStart(2, '0');
        return `<li class="${me ? 'me' : ''}">
          <span class="d-sid">${r.id}</span>
          <span class="d-name">${r.name}</span>
          ${gradeChip(r.grade)}
          <span class="d-score">${r.detail || ''}</span>
        </li>`;
      }).join('')}</ul>`
    : '<p class="d-meta">呢年未有班成績資料。</p>';

  let pdfBlock = '';
  if (item) {
    const url = pdfUrl(item);
    pdfBlock = `
      <p class="d-meta">錯題簿：學號 ${item.student_id} · ${item.pages || '?'} 頁 · ${formatSize(item.size || 0)}</p>
      <div class="d-actions">
        <button type="button" id="openPdf">開 PDF</button>
        <a class="ghost" href="${url}" target="_blank" rel="noopener">新分頁</a>
        <button type="button" class="ghost" id="deskBack">關閉</button>
      </div>`;
  } else {
    pdfBlock = `
      <p class="d-meta">呢個年份架上空嘅（未有錯題簿 PDF）。</p>
      <div class="d-actions">
        <button type="button" class="ghost" id="deskBack">關閉</button>
      </div>`;
  }

  desk.innerHTML = `
    <div class="d-top">
      <p class="d-eyebrow"><span class="chip" style="--fc:${accent}">${y}</span>
        <span class="chip" style="--fc:${accent}">班中位 ${gl}</span> 成績詳情</p>
      <button type="button" class="x" id="deskClose">✕</button>
    </div>
    <h2>${y} · 班中位 ${gl}</h2>
    <p class="d-meta">${res.n ? `班有 ${res.n} 人有呢年紀錄` : '未有班紀錄'} · 牌＝班中位；書色＝學生個人等級（教師睇中位）</p>
    ${youBlock}
    <div class="d-median-big" style="--fc:${accent}">
      <span>班中位</span><b>${gl}</b>
    </div>
    ${dist ? `<div class="d-dist">${dist}</div>` : ''}
    <h3 class="d-sub">全班呢年</h3>
    ${rosterHtml}
    ${pdfBlock}`;
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
  const targets = bookGroup.children.filter((o) => o.userData?.item || o.userData?.perfPlate);
  const hits = raycaster.intersectObjects(targets, false);
  const obj = hits[0]?.object;
  if (!obj) return null;
  if (obj.userData?.item) {
    return { kind: 'book', item: obj.userData.item, year: String(obj.userData.item.year), mesh: obj };
  }
  if (obj.userData?.perfPlate) {
    const year = String(obj.userData.year);
    const book = bookMeshes.find((m) => String(m.userData?.item?.year) === year);
    return { kind: 'plate', item: book?.userData?.item || null, year, mesh: obj };
  }
  return null;
}

/** Selected / nearest right-shelf book the player can open (PDF). */
function nearestOpenableBook() {
  if (!bookMeshes.length) return null;
  if (state === 'shelf' || state === 'book' || state === 'roam') {
    const cur = bookMeshes.find((b) => String(b.userData?.item?.year) === String(currentYear));
    if (cur?.userData?.item) return cur.userData.item;
  }
  if (!cat) return bookMeshes[0]?.userData?.item || null;
  let best = null;
  let bestScore = Infinity;
  for (const m of bookMeshes) {
    const item = m.userData?.item;
    if (!item) continue;
    const dist = Math.hypot(m.position.x - cat.pos.x, m.position.z - cat.pos.z);
    if (dist > 3.2) continue;
    if (dist < bestScore) {
      bestScore = dist;
      best = item;
    }
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
    bar.textContent = `已選 ${item.year} · Enter／右邊撳書開 PDF · 總表「成績」睇詳情`;
  }
}
function pickFloor(e) {
  if (!floorMesh) return null;
  aim(e);
  const hit = raycaster.intersectObject(floorMesh, false)[0];
  return hit?.point || null;
}
function pickBoard(e) {
  if (!board.group) return false;
  aim(e);
  return raycaster.intersectObject(board.group, true).length > 0;
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
    cat.sitTarget = 0;
    await cat.hop(shelfStop().clone(), 480);
    freeNav = true;
    if (state === 'shelf' || state === 'book') setState('roam');
  }
}
function applyFreeMove(dt) {
  if (!canFreeMove() || cat.path || cat.hopState) return;
  let dx = 0, dz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (Math.abs(dx) < 0.05 && Math.abs(dz) < 0.05) {
    if (cat.moving && !cat.path) cat.moving = false;
    return;
  }
  // camera-relative
  const yaw = cat.yaw;
  // move in world XZ relative to camera look on XZ
  const camYaw = Math.atan2(
    camera.position.x - (lookNow.x || cat.pos.x),
    camera.position.z - (lookNow.z || cat.pos.z)
  );
  // Actually use camera forward projected
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const dir = fwd.multiplyScalar(-dz).add(right.multiplyScalar(dx));
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();
  const speed = 2.95;
  const next = cat.pos.clone().addScaledVector(dir, speed * dt);
  clampPos(next);
  cat.root.position.copy(next);
  cat.yawTarget = Math.atan2(-dir.x, -dir.z);
  cat.moving = true;
  cat.phase += (speed * dt) / 0.16;
  freeNav = true;
}
async function walkToPoint(pt) {
  if (busy || !canFreeMove()) return;
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
  rebuildShelf();
  // Place cat in front of the compact right shelf; skip hallway year crawl.
  const seat = V3(SHELF_FRONT - 1.35, 0, RIGHT_SHELF_Z);
  cat.set({ pos: seat, yaw: Math.PI / 2, sit: 0.2, look: 0.4 });
  cat.face?.(Math.PI / 2);
  setState('shelf');
  snapNext = true;
  toast(yearColor(currentYear), '歡迎', '左邊總表揀年份 · 右邊撳書開 PDF');
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
  document.body.classList.remove('library');
  const yt = $('yearTable');
  const br = $('bookRail');
  if (yt) yt.hidden = true;
  if (br) br.hidden = true;
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
  if ((state === 'shelf' || state === 'roam' || state === 'book') && !busy) {
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) showTip(e, hit.item);
    else if (hit?.kind === 'plate' && hit.year) {
      const tip = $('tip');
      tip.innerHTML = `<b>${hit.year} 班成績</b><span>班中位 ${yearGradeLabel(hit.year)} · 撳牌睇詳情</span>`;
      tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 220)}px`;
      tip.style.top = `${Math.min(e.clientY + 14, innerHeight - 80)}px`;
      tip.classList.add('show');
    } else hideTip();
    canvasEl.style.cursor = hit ? 'pointer' : 'default';
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
    if (pickBoard(e)) { await startFollow(); return; }
    // tap floor → walk there (free)
    const pt = pickFloor(e);
    if (pt) { freeNav = true; await walkToPoint(pt); return; }
    await startFollow();
    return;
  }
  if (state === 'sign' && !busy) {
    if ($('sheet').classList.contains('show')) return;
    openFloorSheet();
    return;
  }
  if ((state === 'roam' || (state === 'shelf' && freeNav)) && !busy) {
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) {
      currentYear = String(hit.item.year);
      syncFloorChrome();
      closeDesk();
      openPdfViewer(hit.item);
      return;
    }
    if (hit?.kind === 'plate') {
      openYearResults(hit.year, hit.item);
      return;
    }
    const pt = pickFloor(e);
    if (pt) await walkToPoint(pt);
    return;
  }
  if (state === 'shelf' && !busy) {
    const hit = pickWall(e);
    if (hit?.kind === 'book' && hit.item) {
      currentYear = String(hit.item.year);
      syncFloorChrome();
      closeDesk();
      openPdfViewer(hit.item);
      return;
    }
    if (hit?.kind === 'plate') openYearResults(hit.year, hit.item);
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
  $('floorBtn').onclick = () => { if (!busy) { $('yearTable')?.scrollIntoView?.({ block: 'nearest' }); toast(yearColor(currentYear), '年份總表', '用左邊總表揀年份'); } };
  $('otherFloor').onclick = () => { if (!busy) toast(yearColor(currentYear), '年份總表', '用左邊列表'); };
  $('lobbyBtn').onclick = () => goLobby();
  $('whoBtn').onclick = () => showGate();
  $('hint').onclick = () => { if (state === 'intro') beginPlay(); };
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
  $('yearTable')?.addEventListener('click', (e) => {
    const pdfY = e.target.closest('[data-year-pdf]')?.dataset.yearPdf;
    if (pdfY) { selectYear(pdfY, { openPdf: true }); return; }
    const stY = e.target.closest('[data-year-stats]')?.dataset.yearStats;
    if (stY) { selectYear(stY, { openStats: true }); return; }
    const sel = e.target.closest('[data-select-year]')?.dataset.selectYear
      || e.target.closest('[data-year]')?.dataset.year;
    if (sel) selectYear(sel);
  });
  $('bookRail')?.addEventListener('click', (e) => {
    const y = e.target.closest('[data-open-year]')?.dataset.openYear;
    if (!y) return;
    selectYear(y, { openPdf: true });
  });
  $('sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheetClose') {
      closeSheet();
      if (state === 'sign') goLobby();
      return;
    }
    const y = e.target.closest('[data-year]')?.dataset.year;
    if (y) { closeSheet(); selectYear(y); setState('shelf'); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'relobby') { closeSheet(); showGate(); }
    if (act === 'relogin') { closeSheet(); showGate(); }
  });
  $('desk').addEventListener('click', (e) => {
    if (e.target.id === 'deskClose' || e.target.id === 'deskBack') { closeDesk(); return; }
    if (e.target.id === 'openPdf' && selected) openPdfViewer(selected);
  });
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointerup', onPointerUp);
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
  dressFloor(FLOOR[currentYear].year, yearColor(currentYear), 0);
  setState('gate');
  snapNext = true;
  updateCamera(1);
  $('loading').classList.add('hide');
  requestAnimationFrame((n) => { last = n; loop(n); });
}

boot();
