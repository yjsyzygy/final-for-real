import { el, frag } from './dom.js';
import { state, startComparison, openPage, render } from '../state.js';
import { readFile, readPastedText } from '../core/document.js';
import { reflow } from '../core/cleanup.js';

// 화면을 다시 그려도 고른 파일과 붙여넣은 글은 남아 있어야 한다.
const input = { mode: 'file', files: { old: null, new: null }, texts: { old: '', new: '' } };

export function renderHome() {
  const compareButton = el('button', {
    class: 'primary',
    onclick: () => run(),
  }, '비교하기 →');

  const tab = (mode, label) =>
    el('button', {
      'aria-selected': String(input.mode === mode),
      onclick: () => { input.mode = mode; redraw(); },
    }, label);

  return el('div', { class: 'scroll' },
    el('div', { class: 'home' },
      el('div', { class: 'brand' },
        el('h1', { text: '최종_진짜최종' }),
        el('em', { text: '원고 비교/합치기' }),
      ),
      el('p', { class: 'lede', text: '원래 원고와 고친 원고를 나란히 두고, 문단마다 반영할 부분을 선택합니다.' }),
      el('p', { class: 'lede-note', text: '*파일은 이 브라우저 밖으로 나가지 않습니다.' }),

      resumeBand(),

      el('div', { class: 'tabs', role: 'tablist' },
        tab('file', '파일 고르기'),
        tab('paste', '붙여넣기'),
      ),

      input.mode === 'file'
        ? el('div', { class: 'pair' }, fileSlot('old', '원문'), fileSlot('new', '수정본'))
        : el('div', { class: 'pair' }, textSlot('old', '원문'), textSlot('new', '수정본')),

      el('div', { class: 'actions' },
        input.mode === 'paste'
          ? el('button', { onclick: cleanBoth }, '줄바꿈 정리')
          : null,
        el('span', { class: 'spacer' }),
        compareButton,
      ),
      // 탭에 끼우지 않는다. 앞의 두 탭은 아래 입력칸을 바꾸지만 이건 누르는 순간
      // 비교 화면으로 넘어간다. 폭을 끝까지 써서 구분선 노릇을 하되, 점선과 흐린 글씨로
      // 「비교하기」보다 뒤에 서게 한다.
      el('button', {
        class: 'example-full',
        onclick: () => loadExample('prose'),
      }, `${EXAMPLES.prose.hint}  ${EXAMPLES.prose.label} →`),
      el('button', {
        class: 'example-full',
        onclick: () => loadExample('survey'),
      }, `${EXAMPLES.survey.hint}  ${EXAMPLES.survey.label} →`),
      el('p', { class: 'status', id: 'home-status' }),
      help(),
    ),
  );
}

/** 비교하던 원고가 아직 메모리에 있으면 돌아갈 길을 열어 둔다. */
function resumeBand() {
  if (!state.comparison) return null;
  const { old: a, new: b } = state.docs;
  return el('div', { class: 'resume' },
    el('div', null,
      el('b', { text: '검토하던 원고가 있습니다' }),
      el('small', { text: `${a.name} ↔ ${b.name} · 변경 ${state.comparison.totalChanges}개` }),
    ),
    el('button', {
      class: 'primary',
      onclick: () => openPage('compare'),
    }, '이어서 비교 →'),
  );
}

function fileSlot(side, label) {
  const chosen = input.files[side];
  const picker = el('input', {
    type: 'file',
    accept: '.hwpx,.docx,.txt',
    class: 'sr-only',
    id: `file-${side}`,
    onchange: (e) => {
      input.files[side] = e.target.files[0] || null;
      redraw();
    },
  });

  const slot = el('div', { class: 'slot' },
    el('h2', { text: label }),
    picker,
    el('label', { for: `file-${side}` },
      el('button', { onclick: () => picker.click() }, chosen ? '다시 고르기' : '파일 고르기'),
    ),
    chosen
      ? el('div', { class: 'file-name', text: chosen.name })
      : el('p', { class: 'hint', text: 'HWPX·DOCX·TXT. 여기로 끌어다 놓아도 됩니다.' }),
  );

  slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drop-over'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('drop-over'));
  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    slot.classList.remove('drop-over');
    const file = e.dataTransfer.files[0];
    if (file) { input.files[side] = file; redraw(); }
  });
  return slot;
}

function textSlot(side, label) {
  return el('div', { class: 'slot' },
    el('h2', { text: label }),
    el('textarea', {
      value: input.texts[side],
      placeholder: '여기에 글을 붙여넣으세요. 한 줄이 한 문단, 빈 줄이 단락 경계입니다.',
      'aria-label': `${label} 붙여넣기`,
      oninput: (e) => { input.texts[side] = e.target.value; },
    }),
  );
}

// 메인 화면만 갈아 끼우면 위쪽 띠가 함께 지워진다. 앱 전체를 다시 그린다.
const redraw = () => render();

function cleanBoth() {
  let joined = 0;
  for (const side of ['old', 'new']) {
    const result = reflow(input.texts[side]);
    input.texts[side] = result.text;
    joined += result.joined;
  }
  redraw();
  setStatus(joined ? `끊긴 줄 ${joined}개를 이어 붙였습니다. 결과를 확인하고 비교하세요.` : '이어 붙일 줄이 없었습니다.');
}

async function run() {
  try {
    setStatus('원고를 읽고 있습니다…');
    const [oldDoc, newDoc] = input.mode === 'file' ? await fromFiles() : fromTexts();
    if (oldDoc.paragraphs.join('') === newDoc.paragraphs.join('')) {
      setStatus('두 원고의 본문이 똑같습니다. 다른 원고를 골라 주세요.', true);
      return;
    }
    startComparison(oldDoc, newDoc);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function fromFiles() {
  const { old: a, new: b } = input.files;
  if (!a || !b) throw Error('원문과 수정본을 하나씩 골라 주세요.');
  return Promise.all([readFile(a), readFile(b)]);
}

function fromTexts() {
  const { old: a, new: b } = input.texts;
  if (!a.trim() || !b.trim()) throw Error('원문과 수정본을 모두 붙여넣어 주세요.');
  return [readPastedText(a, '붙여넣은 원문.txt'), readPastedText(b, '붙여넣은 수정본.txt')];
}

/** 상단 바의 「예문 보기」도 같은 길을 쓴다. */
export const openExample = () => loadExample();

// 화면을 다시 그리면 붙잡아 둔 요소는 버려진다. 쓸 때마다 지금 화면의 것을 찾는다.
function setStatus(message, isError = false) {
  const node = document.getElementById('home-status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('error', Boolean(isError));
}

const EXAMPLES = {
  prose: {
    hint: '처음이신가요?',
    label: '예문 보기',
    files: ['달을 쏘다_원문.txt', '달을 쏘다_수정본.txt'],
  },
  survey: {
    hint: '리서처인가요?',
    label: '설문 보기',
    files: ['general_demographicsq.hwpx', 'general_demographicsq_최종.hwpx'],
  },
};

async function loadExample(key = 'prose') {
  const { files } = EXAMPLES[key];
  try {
    setStatus('예문을 불러오고 있습니다…');
    // 받아온 것을 File 로 감싸 파일 고르기와 같은 길로 보낸다. TXT 든 HWPX 든 상관없어진다.
    const docs = await Promise.all(files.map(async (name) => {
      const response = await fetch(`${import.meta.env.BASE_URL}examples/${encodeURIComponent(name)}`);
      if (!response.ok) throw Error('예문 파일을 받지 못했습니다.');
      return readFile(new File([await response.arrayBuffer()], name));
    }));
    startComparison(docs[0], docs[1]);
  } catch (error) {
    setStatus(error.message, true);
  }
}

const help = () => el('div', { class: 'notes' },
  el('h3', { text: '작업 가능 확장자' }),
  el('p', { text: 'HWPX·DOCX·TXT를 읽습니다.' }),
  el('p', { text: '.hwp 는 한글에서 ‘다른 이름으로 저장 → HWPX’ 로 바꿔 주세요.' }),
  el('p', { class: 'gap', text: 'HWPX·DOCX로 저장하면 올린 파일을 그대로 복사한 뒤 고친 문단의 글자만 바꿔 넣습니다.' }),
  el('p', { text: '글꼴·쪽 설정·스타일·표는 손대지 않습니다. 표 안의 글도 본문처럼 비교하고 고를 수 있습니다.' }),

  el('h3', { text: '단락 나누기' }),
  el('p', { text: '빈 줄 하나가 단락을 나눕니다.' }),
  el('p', { text: '표 하나는 통째로 단락 하나입니다.' }),

  el('h3', { text: '자료 처리 및 저장' }),
  el('p', { text: '업로드한 문서의 읽기·비교·저장은 모두 이 브라우저 안에서만 이루어집니다.' }),
  el('p', { text: '선택한 내용은 이 브라우저에만 남습니다.' }),
  el('p', { text: '중요한 원고는 파일로 내려받아 두세요.' }),
);
