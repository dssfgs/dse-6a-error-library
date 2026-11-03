import * as THREE from 'three';
import {
  renderer, scene, camera, buildWorld, resize, updateWorld, dressFloor,
  FEAT_Z, SHELF_FRONT, rowY, MOBILE,
} from './world.js';
import {
  YEAR_FLOORS, FLOOR, placeYearBooks, pdfUrl, formatSize, bookId,
} from './books.js';

const $ = (id) => document.getElementById(id);
const V3 = (...a) => new THREE.Vector3(...a);

let catalog = { meta: {}, items: [] };
let mode = 'teacher'; // 'teacher' | 'student'
let studentId = null;
let currentYear = YEAR_FLOORS[0].key;
let state = 'gate';
let busy = false;
let bookMeshes = [];
let selected = null;
const bookGroup = new THREE.Group();
scene.add(bookGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const camPos = V3(0, 1.55, 5.2);
const camLook = V3(0, 1.4, 0);
const lobbyPos = V3(0, 1.55, 5.2);
const lobbyLook = V3(0, 1.5, 3.5);
const shelfPos = V3(SHELF_FRONT - 2.1, 1.55, FEAT_Z + 0.05);
const shelfLook = V3(SHELF_FRONT, 1.45, FEAT_Z);

function setState(s) {
  state = s;
  document.body.dataset.state = s;
}

function toast(color, title, sub = '') {
  const el = $('toast');
  el.innerHTML = `<i style="background:${color}"></i><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function fade(on) {
  $('fade').classList.toggle('on', !!on);
}

function filteredItems(year = currentYear) {
  let list = catalog.items.filter((i) => i.year === year);
  if (mode === 'student' && studentId) list = list.filter((i) => i.student_id === studentId);
  return list;
}

function itemsForStudentAllYears(sid) {
  return catalog.items.filter((i) => i.student_id === sid);
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

function rebuildShelf() {
  clearBooks();
  const floor = FLOOR[currentYear];
  const items = filteredItems();
  dressFloor(floor.year, floor.color, items.length);
  bookMeshes = placeYearBooks(items, floor.color, bookGroup);
  $('floorBtn').style.setProperty('--fcd', floor.color);
  $('floorBtn').innerHTML = `<b>${floor.name}</b><small>年份</small>`;
  const who = mode === 'student' ? `學號 ${studentId}` : '全班';
  $('shelfHint').textContent = items.length
    ? `${floor.year} · ${who} · ${items.length} 本`
    : `${floor.year} · 暫時未有錯題簿`;
  closeDesk();
}

async function goLobby() {
  if (busy) return;
  busy = true;
  closeSheet();
  closeDesk();
  fade(true);
  await sleep(280);
  camPos.copy(lobbyPos);
  camLook.copy(lobbyLook);
  setState('lobby');
  fade(false);
  busy = false;
  toast('#86afd8', '大堂', '開年份書架開始');
}

async function goShelf(yearKey) {
  if (busy) return;
  busy = true;
  closeSheet();
  currentYear = yearKey;
  fade(true);
  await sleep(260);
  rebuildShelf();
  camPos.copy(shelfPos);
  camLook.copy(shelfLook);
  setState('shelf');
  fade(false);
  busy = false;
  const floor = FLOOR[yearKey];
  toast(floor.color, floor.name, floor.title);
}

function openFloorSheet() {
  const el = $('sheet');
  const rows = YEAR_FLOORS.map((f) => {
    const n = filteredItems(f.year).length;
    const here = f.key === currentYear ? ' here' : '';
    const empty = n === 0 ? ' empty' : '';
    return `<button type="button" class="book${here}${empty}" data-year="${f.key}" style="--fc:${f.color}">
      <b>${f.name}</b><span>${f.title}</span><em>${n ? n + ' 本' : '空'}</em>
    </button>`;
  }).join('');
  const whoLine = mode === 'student'
    ? `而家以學號 <b>${studentId}</b> 瀏覽（只顯示你嘅冊）`
    : '教師模式：每層顯示該年全班個人冊';
  el.innerHTML = `
    <div class="grab"></div>
    <header>
      <div><h2>揀年份書架</h2><p>${whoLine}</p></div>
      <button type="button" class="x" id="sheetClose">✕</button>
    </header>
    <div class="modechip">
      <button type="button" data-act="relobby">返大堂</button>
      <button type="button" data-act="relogin">切換身份</button>
    </div>
    <div class="tower">${rows}<div class="plate"></div></div>`;
  el.classList.add('show');
}

function closeSheet() {
  $('sheet').classList.remove('show');
}

function openDesk(item) {
  selected = item;
  const floor = FLOOR[item.year] || { color: '#86afd8' };
  const url = pdfUrl(item);
  const desk = $('desk');
  desk.innerHTML = `
    <div class="d-top">
      <p class="d-eyebrow"><span class="chip" style="--fc:${floor.color}">${item.year}</span> ${item.class} 個人錯題簿</p>
      <button type="button" class="x" id="deskClose">✕</button>
    </div>
    <h2>學號 ${item.student_id}</h2>
    <p class="d-meta">${item.pages || '?'} 頁 · ${formatSize(item.size || 0)}</p>
    <p class="d-meta">檔案：library/${item.path}</p>
    <div class="d-actions">
      <button type="button" id="openPdf">打開 PDF</button>
      <a class="ghost" href="${url}" target="_blank" rel="noopener">新分頁</a>
      <button type="button" class="ghost" id="deskBack">放返架</button>
    </div>`;
  desk.classList.add('show');
  setState('book');
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

function pickBook(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(bookMeshes, false);
  return hits[0]?.object || null;
}

function showTip(e, item) {
  const tip = $('tip');
  tip.innerHTML = `<b>學號 ${item.student_id}</b><span>${item.year} · ${item.pages || '?'} 頁</span>`;
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 220)}px`;
  tip.style.top = `${Math.min(e.clientY + 14, innerHeight - 70)}px`;
  tip.classList.add('show');
}

function hideTip() { $('tip').classList.remove('show'); }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function enterAsStudent(raw) {
  const sid = String(raw || '').trim().padStart(2, '0');
  if (!/^\d{2}$/.test(sid) || +sid < 1 || +sid > 22) {
    $('gateErr').textContent = '請輸入 01 至 22 嘅學號';
    return;
  }
  const mine = itemsForStudentAllYears(sid);
  if (!mine.length) {
    $('gateErr').textContent = `學號 ${sid} 暫時未有個人 PDF（仍可進入空架）`;
  } else {
    $('gateErr').textContent = '';
  }
  mode = 'student';
  studentId = sid;
  $('whoBtn').textContent = `學號 ${sid}`;
  $('gate').hidden = true;
  // prefer latest year that has a book
  const years = [...new Set(mine.map((i) => i.year))].sort();
  const start = years.at(-1) || currentYear;
  goShelf(start);
}

function enterAsTeacher() {
  mode = 'teacher';
  studentId = null;
  $('gateErr').textContent = '';
  $('whoBtn').textContent = '教師';
  $('gate').hidden = true;
  goShelf(currentYear);
}

function showGate() {
  closePdfViewer();
  closeDesk();
  closeSheet();
  $('gate').hidden = false;
  setState('gate');
  camPos.copy(lobbyPos);
  camLook.copy(lobbyLook);
}

function onPointerMove(e) {
  if (state !== 'shelf') { hideTip(); return; }
  const obj = pickBook(e);
  if (obj?.userData?.item) showTip(e, obj.userData.item);
  else hideTip();
  renderer.domElement.style.cursor = obj ? 'pointer' : 'default';
}

async function onPointerDown(e) {
  if (state !== 'shelf' || busy) return;
  const obj = pickBook(e);
  if (!obj?.userData?.item) return;
  openDesk(obj.userData.item);
}

function bindUi() {
  $('enterStudent').onclick = () => enterAsStudent($('sidInput').value);
  $('enterTeacher').onclick = () => enterAsTeacher();
  $('sidInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterAsStudent($('sidInput').value);
  });
  $('floorBtn').onclick = () => openFloorSheet();
  $('otherFloor').onclick = () => openFloorSheet();
  $('lobbyBtn').onclick = () => goLobby();
  $('whoBtn').onclick = () => showGate();
  $('hint').onclick = () => openFloorSheet();
  $('rClose').onclick = () => closePdfViewer();
  $('sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheetClose') { closeSheet(); return; }
    const y = e.target.closest('[data-year]')?.dataset.year;
    if (y) { closeSheet(); goShelf(y); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'relobby') { closeSheet(); goLobby(); }
    if (act === 'relogin') { closeSheet(); showGate(); }
  });
  $('desk').addEventListener('click', (e) => {
    if (e.target.id === 'deskClose' || e.target.id === 'deskBack') { closeDesk(); return; }
    if (e.target.id === 'openPdf' && selected) openPdfViewer(selected);
  });
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  addEventListener('resize', resize);
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('reader').hidden) closePdfViewer();
      else if ($('sheet').classList.contains('show')) closeSheet();
      else if ($('desk').classList.contains('show')) closeDesk();
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  updateWorld();
  camera.position.lerp(camPos, 0.08);
  const look = camLook.clone();
  // subtle sway in lobby
  if (state === 'lobby' || state === 'gate') {
    look.x += Math.sin(performance.now() / 2800) * 0.05;
  }
  camera.lookAt(look);
  renderer.render(scene, camera);
}

async function boot() {
  buildWorld();
  resize();
  bindUi();
  try {
    const res = await fetch('catalog.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    catalog = await res.json();
    if (!catalog.items) catalog = { meta: {}, items: catalog };
    // sanity: probe one pdf
    const sample = catalog.items[0];
    if (sample) {
      const probe = await fetch(pdfUrl(sample), { method: 'HEAD' });
      console.info('[library] catalog', catalog.meta?.count ?? catalog.items.length, 'sample HEAD', probe.status, pdfUrl(sample));
    }
  } catch (err) {
    console.error(err);
    toast('#e0745a', '目錄讀取失敗', String(err.message || err));
  }
  dressFloor(FLOOR[currentYear].year, FLOOR[currentYear].color, 0);
  camPos.copy(lobbyPos);
  camLook.copy(lobbyLook);
  $('loading').classList.add('hide');
  animate();
}

boot();
