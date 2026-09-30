import { el, frag } from './dom.js';
import { state, render, pick, pickMany, pickScene, saveAs, saveReviewTable, toast } from '../state.js';
import { outputFormats, FORMAT_NAMES } from '../core/document.js';
import { goTo } from '../main.js';

// 화면을 다시 그릴 때마다 목록과 본문을 새로 만든다. 그냥 두면 스크롤이 맨 위로 돌아가,
// 아래쪽 단락을 고르는 순간 목록이 단락 1로 튀어 올라간다. 보던 자리를 기억했다가 되돌린다.
let shown = { scene: -1 };

export function renderWorkspace() {
  const scenes = visibleScenes();
  if (state.scene >= scenes.length) state.scene = Math.max(0, scenes.length - 1);

  const keep = {
    list: document.querySelector('.scene-list')?.scrollTop ?? 0,
    pane: document.querySelector('.pane')?.scrollTop ?? 0,
    sameScene: shown.scene === state.scene,
    firstTime: shown.scene === -1,
  };
  shown = { scene: state.scene };

  const node = el('div', { class: 'workspace' }, sidebar(scenes), main(scenes));

  // requestAnimationFrame 은 창이 가려지면 멈춘다. 그 사이 화면을 그리면 복원이 통째로
  // 건너뛰어진다. 마이크로태스크는 화면이 보이든 말든 이번 작업 끝에 반드시 돈다.
  queueMicrotask(() => {
    const list = node.querySelector('.scene-list');
    const pane = node.querySelector('.pane');
    // 비교 화면에 처음 들어올 때만 본문에 초점을 준다. 매번 주면 방금 누른 버튼에서 초점을 뺏는다.
    if (keep.firstTime) pane?.focus();
    // 크기가 잡히기 전에 스크롤을 넣으면 0으로 깎인다. scrollHeight 를 읽어 먼저 확정시킨다.
    if (list) {
      void list.scrollHeight;
      list.scrollTop = keep.list;
    }
    // 단락을 옮겼으면 본문은 처음부터, 같은 단락이면 보던 자리 그대로 둔다.
    if (pane) {
      void pane.scrollHeight;
      pane.scrollTop = keep.sameScene ? keep.pane : 0;
    }
    // 키보드로 옮겨 고른 단락이 목록 밖에 있으면 보이는 자리까지만 끌어온다.
    node.querySelector('.scene[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  });
  return node;
}

/** 검색어가 있으면 좌우 본문과 첫 문장에서 찾은 단락만 남긴다. */
function visibleScenes() {
  const { scenes, paragraphs } = state.comparison;
  const query = state.query.trim();
  if (!query) return scenes;
  const needle = query.toLowerCase();
  return scenes.filter((scene) =>
    scene.title.toLowerCase().includes(needle) ||
    scene.rows.some((row) =>
      (row.a !== null && paragraphs.old[row.a].toLowerCase().includes(needle)) ||
      (row.b !== null && paragraphs.new[row.b].toLowerCase().includes(needle))));
}

function sidebar(scenes) {
  const { comparison } = state;
  const done = comparison.changes.filter((c) => state.choices[c.id]).length;
  const total = comparison.totalChanges;
  const percent = total ? Math.round((done / total) * 100) : 100;

  return el('aside', { class: 'side' },
    el('div', { class: 'side-top' },
      // '다른 원고 비교'는 다른 예문이 더 있는 것처럼 읽힌다. 가는 곳을 그대로 적는다.
      el('button', { class: 'text', onclick: goHome }, '← 홈으로'),
      el('h2', { class: 'doc-title', text: documentTitle() }),
      el('div', { class: 'doc-stat' },
        el('span', { text: '원문' }),
        el('b', { text: `${comparison.original.characters.toLocaleString()}자` })),
      el('div', { class: 'doc-stat' },
        el('span', { text: '수정본' }),
        el('b', { text: `${comparison.revised.characters.toLocaleString()}자` })),
      el('input', {
        type: 'search',
        value: state.query,
        placeholder: '본문 검색',
        'aria-label': '본문에서 찾기',
        oninput: debounce((e) => { state.query = e.target.value; state.scene = 0; render(); }),
      }),
    ),

    el('nav', { class: 'scene-list', 'aria-label': '단락 목록' },
      scenes.length
        ? scenes.map((scene, i) => sceneButton(scene, i))
        : el('p', { class: 'empty-state', text: '찾는 글이 없습니다.' })),

    el('div', { class: 'progress' },
      el('div', null,
        el('b', { text: '검토 진행' }),
        el('span', { text: ` ${done} / ${total}` })),
      el('div', {
        class: 'progress-track',
        role: 'progressbar',
        'aria-valuenow': String(percent),
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-label': '검토 진행률',
      }, el('div', { class: 'progress-fill', style: `width:${percent}%` })),
    ),
  );
}

/**
 * 두 파일 이름에서 같은 앞부분을 떼어 원고 이름으로 쓴다.
 * '달을 쏘다_원문.txt'와 '달을 쏘다_수정본.txt' 면 '달을 쏘다'가 된다.
 */
function documentTitle() {
  const bare = (name) => name.replace(/\.[^.]+$/, '');
  const a = bare(state.docs.old.name);
  const b = bare(state.docs.new.name);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const stem = a.slice(0, i).replace(/[\s_()\-–—]+$/, '').trim();
  return stem.length >= 2 ? stem : b;
}

function sceneButton(scene, index) {
  const done = scene.changes.filter((c) => state.choices[c.id]).length;
  const all = scene.changes.length;
  return el('button', {
    class: 'scene' + (all && done === all ? ' done' : ''),
    'aria-current': String(index === state.scene),
    onclick: () => { state.scene = index; render(); },
  },
    el('b', { text: `단락 ${scene.number}.` }),
    el('small', { class: 'preview', text: scene.title || '빈 단락' }),
    el('small', { class: 'stat', text: all ? `변경 ${all}개 · 검토 ${done}` : '변경 없음' }),
  );
}

function main(scenes) {
  const scene = scenes[state.scene];
  const formats = outputFormats(state.docs.old, state.docs.new);

  return el('div', { class: 'main' },
    el('div', { class: 'bar' },
      el('div', { class: 'grow' },
        el('div', { class: 'names', text: `${state.docs.old.name} ↔ ${state.docs.new.name}` })),
      // 버튼에는 지금 상태가 아니라 누르면 일어날 일을 적는다.
      el('button', {
        onclick: () => { state.view = state.view === 'changes' ? 'full' : 'changes'; render(); },
      }, state.view === 'changes' ? '전체 글 보기' : '변경만 보기'),
      el('button', { onclick: saveReviewTable }, '검토표 ↓'),
      ...formats.list.map((format) =>
        el('button', {
          class: format === formats.preferred ? 'primary' : '',
          onclick: () => trySave(format),
        }, `${FORMAT_NAMES[format]} 저장 ↓`)),
    ),

    el('div', { class: 'pane', tabindex: '0', 'aria-label': '원문과 수정본 비교' },
      scene ? sceneBlock(scene) : el('p', { class: 'empty-state', text: '보여 줄 단락이 없습니다.' })),
  );
}

function trySave(format) {
  try {
    saveAs(format);
  } catch (error) {
    toast(error.message, 5000);
  }
}

function sceneBlock(scene) {
  const { paragraphs } = state.comparison;
  const body = [];
  let index = 0;

  while (index < scene.rows.length) {
    const row = scene.rows[index];

    // 같은 표 줄에 든 칸은 바뀐 것까지 묶어 한 줄로 그린다. 칸마다 따로 쌓으면 표를 알아볼 수 없다.
    const key = rowKey(row);
    if (key) {
      const group = [];
      while (index < scene.rows.length && rowKey(scene.rows[index]) === key) {
        group.push(scene.rows[index]);
        index++;
      }
      const block = tableRowBlock(group);
      if (block) body.push(block);
      continue;
    }

    if (row.equal) {
      if (state.view === 'full') body.push(sameRow(paragraphs.old[row.a]));
      index++;
      continue;
    }
    const change = state.comparison.changes.find((c) => c.id === row.change);
    body.push(changeBlock(change));
    index += change.rowEnd - change.rowStart;
  }

  if (!body.length) {
    body.push(el('p', { class: 'empty-state', text: '이 단락은 바뀐 곳이 없습니다.' }));
  }

  return el('section', { class: 'scene-block' },
    el('div', { class: 'scene-head' },
      el('b', { text: `단락 ${scene.number}.` }),
      el('p', { class: 'preview', text: scene.title || '빈 단락' }),
      el('div', { class: 'meta' },
        el('span', { text: scene.changes.length ? `변경 ${scene.changes.length}개` : '변경 없음' }),
        scene.changes.length
          ? frag(
            el('button', { class: 'text', onclick: () => pickScene(state.scene, 'old') }, '전부 원문 유지'),
            el('button', { class: 'text', onclick: () => pickScene(state.scene, 'new') }, '전부 수정 채택'))
          : null,
      ),
    ),
    ...body,
  );
}

/**
 * 표 한 줄을 좌우로 나란히 놓고 칸을 가로로 늘어놓는다.
 * 바뀐 칸은 짚어 주고, 고르는 것은 칸이 아니라 줄 단위로 한다. 한 칸만 원문으로 되돌린
 * 표는 줄이 어긋나 읽을 수 없기 때문이다.
 */
function tableRowBlock(rows) {
  const { paragraphs, changes } = state.comparison;
  const ids = [...new Set(rows.map((r) => r.change).filter(Boolean))];
  if (!ids.length) {
    if (state.view !== 'full') return null;
    const items = rows.map((r) => ({ text: paragraphs.old[r.a], cell: cellKeyAt('old', r.a), changed: false }));
    const plain = () => el('div', { class: 'cell table-line' }, ...intoCells(items).map(tableCell));
    return el('div', { class: 'row same' }, plain(), plain());
  }

  const picked = ids.every((id) => state.choices[id]) ? state.choices[ids[0]] : null;
  const side = (which) => {
    const at = which === 'old' ? 'a' : 'b';
    const items = rows.filter((r) => r[at] !== null).map((r) => ({
      text: paragraphs[which][r[at]],
      cell: cellKeyAt(which, r[at]),
      changed: Boolean(r.change),
    }));
    return el('div', { class: `cell table-line side-${which}${picked === which ? ' chosen' : ''}` },
      ...intoCells(items).map(tableCell));
  };

  const label = ids.length === 1
    ? changes.find((c) => c.id === ids[0]).label
    : `${ids.length}곳 수정`;

  return el('div', { class: 'change' + (picked ? ' decided' : '') },
    el('div', { class: 'change-head' },
      el('span', { class: 'label', text: `표 한 줄 · ${label}` }),
      el('span', { class: 'spacer' }),
      el('button', {
        dataset: { pick: 'old' },
        'aria-pressed': String(picked === 'old'),
        onclick: () => pickMany(ids, 'old'),
      }, '원문 유지'),
      el('button', {
        dataset: { pick: 'new' },
        'aria-pressed': String(picked === 'new'),
        onclick: () => pickMany(ids, 'new'),
      }, '수정 채택'),
    ),
    el('div', { class: 'row' }, side('old'), side('new')),
  );
}

const sameRow = (text) =>
  el('div', { class: 'row same' },
    el('div', { class: 'cell', text }),
    el('div', { class: 'cell', text }));

function changeBlock(change) {
  const picked = state.choices[change.id];
  const button = (side, label) =>
    el('button', {
      dataset: { pick: side },
      'aria-pressed': String(picked === side),
      onclick: () => pick(change.id, side),
    }, label);

  return el('div', {
    class: 'change' + (picked ? ' decided' : ''),
    id: 'change-' + change.id,
  },
    el('div', { class: 'change-head' },
      el('span', { class: 'label', text: `${change.number}. ${change.label}` }),
      el('span', { class: 'spacer' }),
      button('old', '원문 유지'),
      button('new', '수정 채택'),
    ),
    ...sides(change, picked),
  );
}

/**
 * 1:1로 맞은 문단은 글자 단위로, 그 밖에는 통째로 좌우에 놓는다.
 * 고른 쪽 칸에 표시를 달아 둔다. 덩이 테두리보다 고른 칸 자체가 눈에 먼저 들어온다.
 */
/** 이 행이 속한 표 줄의 자리. 표 밖이면 null 이다. */
function rowKey(r) {
  const { tableRow } = state.comparison;
  return (r.a !== null ? tableRow.old[r.a] : null) ?? (r.b !== null ? tableRow.new[r.b] : null);
}

const cellKeyAt = (side, i) => state.comparison.tableCell[side][i] ?? null;

/**
 * 표 한 줄의 문단을 칸 단위로 묶는다.
 * 한 칸 안에 문단이 여럿 있기도 하다. 「매우」와 「보수적이다」처럼 줄을 나눠 쓴 경우인데,
 * 문단을 칸으로 세면 없는 칸이 생겨 표가 어긋난다.
 */
function intoCells(items) {
  const cells = [];
  let last;
  for (const item of items) {
    if (!cells.length || item.cell !== last) cells.push([]);
    last = item.cell;
    cells[cells.length - 1].push(item);
  }
  return cells;
}

/** 칸 하나. 안에 든 문단을 줄바꿔 쌓고, 바뀐 문단이 있으면 짚어 준다. */
const tableCell = (cell) =>
  el('span', { class: 'tcell' + (cell.some((c) => c.changed) ? ' tcell-changed' : '') },
    ...cell.map((c) => el('span', { class: 'tline', text: c.text || ' ' })));

function sides(change, picked) {
  const klass = (side, extra = '') =>
    `cell side-${side}${extra}${picked === side ? ' chosen' : ''}`;

  if (change.inline) {
    return change.inline.map((parts) =>
      el('div', { class: 'row' },
        el('div', { class: klass('old') }, ...parts.filter((p) => !p.added).map(markup('del'))),
        el('div', { class: klass('new') }, ...parts.filter((p) => !p.removed).map(markup('ins')))));
  }

  // 한 변경 안에 표가 통째로 들어오기도 한다. 구역 하나가 새로 생기면 질문과 표가
  // 함께 「문단 추가」 하나로 묶이기 때문이다. 그 안에서도 표 줄은 가로로 늘어놓는다.
  const lines = state.comparison.rows.slice(change.rowStart, change.rowEnd);

  const column = (side, empty) => {
    const at = side === 'old' ? 'a' : 'b';
    const texts = state.comparison.paragraphs[side];
    const mine = lines.filter((r) => r[at] !== null);
    if (!mine.length) return el('div', { class: klass(side, ' empty'), text: empty });

    const out = [];
    let i = 0;
    while (i < mine.length) {
      const key = rowKey(mine[i]);
      if (key) {
        const items = [];
        while (i < mine.length && rowKey(mine[i]) === key) {
          const r = mine[i++];
          items.push({ text: texts[r[at]], cell: cellKeyAt(side, r[at]), changed: Boolean(r.change) });
        }
        out.push(el('div', { class: klass(side, ' table-line') }, ...intoCells(items).map(tableCell)));
        continue;
      }
      out.push(el('div', { class: klass(side), text: texts[mine[i][at]] || '(빈 문단)' }));
      i++;
    }
    return el('div', { class: picked === side ? 'stack chosen-stack' : 'stack' }, ...out);
  };

  return [el('div', { class: 'row' }, column('old', '(없음)'), column('new', '(지움)'))];
}

const markup = (tag) => (part) =>
  part.added || part.removed
    ? el(tag, { text: part.value })
    : document.createTextNode(part.value);

/**
 * Alt + ←/→ 로 단락, Alt + ↑/↓ 로 변경 사이를 옮긴다.
 * 화면을 다시 그려도 한 번만 걸어 둔다. 그릴 때마다 붙이면 누를 때마다 여러 번 반응한다.
 */
document.addEventListener('keydown', (event) => {
  if (!event.altKey || !state.comparison || state.page !== 'compare') return;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const next = state.scene + (event.key === 'ArrowRight' ? 1 : -1);
    if (next < 0 || next >= visibleScenes().length) return;
    event.preventDefault();
    state.scene = next;
    render();
    return;
  }

  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  const blocks = [...document.querySelectorAll('.change')];
  const pane = document.querySelector('.pane');
  if (!blocks.length || !pane) return;
  event.preventDefault();

  // 화면 위쪽 경계를 막 지난 블록이 '다음', 그 두 칸 앞이 '이전'이다.
  const top = pane.getBoundingClientRect().top + 4;
  const ahead = blocks.findIndex((b) => b.getBoundingClientRect().top > top);
  const from = ahead < 0 ? blocks.length - 1 : ahead;
  const to = from + (event.key === 'ArrowDown' ? 0 : -2);
  blocks[Math.max(0, Math.min(blocks.length - 1, to))]
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
});

async function goHome() {
  await goTo('home');
}

function debounce(fn, ms = 160) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
