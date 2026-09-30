import { compareDocuments, mergeParagraphs } from './core/compare.js';
import { writeDocument, pickSkeleton } from './core/document.js';
import { changesToCsv } from './core/csv.js';

export const state = {
  docs: { old: null, new: null },
  comparison: null,
  choices: {},
  scene: 0,
  query: '',
  view: 'changes',
  saved: true,
  theme: read('theme', null),      // null 이면 운영체제 설정을 따른다
  fontSize: Number(read('fontSize', 16)),
};

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  } catch {
    // 저장 공간이 막혀 있어도 이번 방문 동안은 설정이 먹는다.
  }
}

/** 운영체제 설정을 따르다가, 한 번 누르면 그때부터 고른 대로 간다. */
export function toggleTheme() {
  state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
  write('theme', state.theme);
  applyTheme();
  render();
}

export const effectiveTheme = () =>
  state.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function applyTheme() {
  document.documentElement.dataset.theme = effectiveTheme();
  document.documentElement.style.setProperty('--font-size', state.fontSize + 'px');
}

export const FONT_RANGE = [13, 22];

export function changeFontSize(step) {
  const [min, max] = FONT_RANGE;
  state.fontSize = Math.min(max, Math.max(min, state.fontSize + step));
  write('fontSize', String(state.fontSize));
  applyTheme();
  render();
}

// 화면을 그리고 옮기는 일은 main.js 가 맡는다. 여기서 ui 모듈을 부르면 서로 물고 돈다.
let renderer = () => {};
let navigator = () => {};
export const setRenderer = (fn, navigate) => { renderer = fn; navigator = navigate; };
export const render = () => renderer();
export const openPage = (target) => navigator(target);

export function toast(message, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), ms);
}

function download(name, bytes, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// 같은 원고 짝에만 선택을 되살린다. 다른 원고에 옛 선택을 씌우면 엉뚱한 문단이 바뀐다.
const fingerprint = (a, b) =>
  `${a.name}|${a.paragraphs.length}|${a.paragraphs.join('').length}` +
  `::${b.name}|${b.paragraphs.length}|${b.paragraphs.join('').length}`;

const storeKey = () => 'choices:' + fingerprint(state.docs.old, state.docs.new);

const saveChoices = () => write(storeKey(), JSON.stringify(state.choices));

// 내려받는 파일 이름은 수정본 이름을 따른다.
const baseName = () => state.docs.new.name.replace(/\.[^.]+$/, '');

export function startComparison(oldDoc, newDoc) {
  state.docs = { old: oldDoc, new: newDoc };
  state.comparison = compareDocuments(oldDoc, newDoc);
  try {
    state.choices = JSON.parse(read(storeKey(), '{}'));
  } catch {
    state.choices = {};
  }
  // 앞쪽 단락이 제목뿐이라 바뀐 곳이 없는 경우가 흔하다. 빈 화면으로 맞이하지 않는다.
  state.scene = Math.max(0, state.comparison.scenes.findIndex((s) => s.changes.length));
  state.query = '';
  state.saved = state.comparison.totalChanges === 0;
  openPage('compare');

  const notes = [...(oldDoc.notes || []), ...(newDoc.notes || []), ...structureNotes(oldDoc, newDoc)];
  if (notes.length) toast(notes[0], 6000);
}

/**
 * 표는 문단이 아니라서 선택으로 늘리거나 줄일 수 없다. 저장하면 틀로 쓴 원고의
 * 표 구성을 그대로 따른다. 두 원고의 표 개수가 다르면 그 사실을 먼저 알린다.
 */
function structureNotes(oldDoc, newDoc) {
  if (oldDoc.tables === undefined || oldDoc.tables === newDoc.tables) return [];
  const more = newDoc.tables > oldDoc.tables ? '수정본' : '원문';
  return [`두 원고의 표 개수가 다릅니다(원문 ${oldDoc.tables}개, 수정본 ${newDoc.tables}개). `
    + `표 안의 글은 비교하지만 표 자체는 «${more}» 쪽 구성으로 저장됩니다.`];
}

export function pick(changeId, side) {
  state.choices[changeId] === side ? delete state.choices[changeId] : (state.choices[changeId] = side);
  state.saved = false;
  saveChoices();
  render();
}

/** 표 한 줄에 여러 곳이 바뀌어 있으면 줄째로 고른다. 칸마다 따로 고르는 건 실익이 없다. */
export function pickMany(ids, side) {
  for (const id of ids) state.choices[id] = side;
  state.saved = false;
  saveChoices();
  render();
}

export function pickScene(sceneIndex, side) {
  for (const change of state.comparison.scenes[sceneIndex].changes) state.choices[change.id] = side;
  state.saved = false;
  saveChoices();
  render();
}

export function saveAs(format) {
  const skeleton = pickSkeleton(state.docs.old, state.docs.new, format);
  const merged = mergeParagraphs(state.comparison, state.choices);
  const { bytes, mime } = writeDocument(format, merged, skeleton);
  download(`${baseName()}_합친본.${format}`, bytes, mime);
  state.saved = true;
  render();
  // 틀로 쓸 원고가 없으면 서식을 물려받을 곳도 없다. 내려받고 나서 알면 늦으므로 먼저 말한다.
  toast(skeleton?.blank
    ? '합친 원고를 내려받습니다. 이 형식의 원고가 없어 글꼴·쪽 설정은 기본값으로 나갑니다.'
    : '합친 원고를 내려받습니다.', skeleton?.blank ? 5200 : 2600);
}

export function saveReviewTable() {
  download(`${baseName()}_검토표.csv`, changesToCsv(state.comparison, state.choices), 'text/csv;charset=utf-8');
  toast('검토표를 내려받습니다. 엑셀에서 바로 열립니다.');
}
