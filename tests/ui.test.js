import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, click, type, $, $$, textOf } from './dom-setup.js';

// 화면 코드는 불러오는 순간 document 와 localStorage 를 쓴다. 환경을 먼저 세운다.
setupDom();

const { el } = await import('../src/ui/dom.js');
const { state, setRenderer } = await import('../src/state.js');
const { renderHome } = await import('../src/ui/home.js');
const { renderTopbar } = await import('../src/ui/topbar.js');

const app = document.getElementById('app');

// 진짜 앱처럼 위쪽 띠와 화면을 함께 그린다. 이 조립을 거치지 않고 화면만
// 갈아 끼우면 띠가 사라진다 — 그게 여기서 막으려는 회귀다.
let renderCount = 0;
function paint() {
  renderCount++;
  app.replaceChildren(renderTopbar('home', () => {}), renderHome());
}
setRenderer(paint, () => {});

const fresh = () => { renderCount = 0; paint(); };
const tabs = () => $$('.tabs button');
const areas = () => $$('.slot textarea');

test('el: textarea 의 글은 속성이 아니라 프로퍼티로 넣는다', () => {
  // textarea 는 value 속성을 보지 않는다. 속성으로 넣으면 화면에 빈 칸이 나온다.
  assert.equal(el('textarea', { value: '남아 있어야 하는 글' }).value, '남아 있어야 하는 글');
  assert.equal(el('input', { type: 'search', value: '검색어' }).value, '검색어');
});

test('el: 빈 문자열도 지운 것으로 보고 그대로 넣는다', () => {
  assert.equal(el('textarea', { value: '' }).value, '');
});

test('el: null·undefined·false 인 속성은 붙이지 않는다', () => {
  const node = el('button', { 'aria-current': null, disabled: false, title: undefined });
  assert.equal(node.hasAttribute('aria-current'), false);
  assert.equal(node.hasAttribute('title'), false);
});

test('메인 화면에는 파일 고르기와 붙여넣기 두 탭만 있다', () => {
  fresh();
  assert.deepEqual(textOf(tabs()), ['파일 고르기', '붙여넣기']);
  // 예문 보기는 화면을 떠나는 동작이라 탭에 끼우지 않는다.
  assert.ok($('.example-full'));
});

test('탭을 바꾸면 위쪽 띠를 지우지 않고 앱 전체를 다시 그린다', () => {
  fresh();
  const before = renderCount;
  click(tabs()[1]);

  assert.equal(renderCount, before + 1, '앱 전체를 다시 그려야 한다');
  assert.ok($('.topbar'), '위쪽 띠가 남아 있어야 한다');
  assert.equal(areas().length, 2, '붙여넣기 칸 두 개');
});

test('붙여넣은 글은 탭을 오가도 사라지지 않는다', () => {
  fresh();
  click(tabs()[1]);
  type(areas()[0], '원문으로 붙여넣은 글');
  type(areas()[1], '수정본으로 붙여넣은 글');

  click(tabs()[0]);
  assert.equal(areas().length, 0, '파일 고르기 탭에는 붙여넣기 칸이 없다');
  click(tabs()[1]);

  assert.deepEqual(areas().map((a) => a.value), ['원문으로 붙여넣은 글', '수정본으로 붙여넣은 글']);
});

test('줄바꿈 정리는 끊긴 줄을 잇고 결과를 화면에 되돌려 놓는다', () => {
  fresh();
  click(tabs()[1]);
  type(areas()[0], '정부는 이번 대책에서\n고용 안정을\n최우선으로 삼겠다.');
  type(areas()[1], '정부는 이번 대책에서\n고용 안정을 최우선 과제로 삼겠다.');

  click($$('.actions button').find((b) => b.textContent === '줄바꿈 정리'));

  assert.equal(areas()[0].value, '정부는 이번 대책에서 고용 안정을 최우선으로 삼겠다.');
  assert.equal(areas()[1].value, '정부는 이번 대책에서 고용 안정을 최우선 과제로 삼겠다.');
});

test('안내 문구는 다시 그린 뒤에도 지금 화면에 보인다', () => {
  fresh();
  click(tabs()[1]);
  type(areas()[0], '이미 정리된 글이다.');
  type(areas()[1], '이미 정리된 글이다.');

  click($$('.actions button').find((b) => b.textContent === '줄바꿈 정리'));

  // 다시 그리기 전의 낡은 요소에 적으면 아무도 못 본다.
  assert.match($('#home-status').textContent, /이어 붙일 줄이 없었습니다/);
});

test('두 칸을 다 채우지 않고 비교하면 이유를 알려 준다', async () => {
  fresh();
  click(tabs()[1]);
  // 붙여넣은 글은 일부러 화면 너머까지 남는다. 앞 시험이 남긴 것을 먼저 비운다.
  type(areas()[0], '한쪽만 채웠다.');
  type(areas()[1], '');

  click($$('.actions button').find((b) => b.textContent.includes('비교하기')));
  await Promise.resolve();

  assert.match($('#home-status').textContent, /모두 붙여넣어/);
  assert.ok($('#home-status').classList.contains('error'));
});

test('위쪽 띠는 화면에 따라 다른 것을 보여 준다', () => {
  // 비교 중에는 예문 보기를 감춘다. 누르면 검토하던 것이 예문으로 바뀐다.
  const onCompare = textOf([...renderTopbar('compare', () => {}).querySelectorAll('button')]);
  assert.ok(!onCompare.includes('예문 보기'));
  assert.ok(onCompare.includes('A−') && onCompare.includes('A+'), '글자 크기는 비교 화면에만');

  const onHome = textOf([...renderTopbar('home', () => {}).querySelectorAll('button')]);
  assert.ok(onHome.includes('예문 보기'));
  assert.ok(!onHome.includes('A+'), '메인에는 키울 본문이 없다');
});

test('지금 보는 화면을 띠에 표시한다', () => {
  const bar = renderTopbar('patchnotes', () => {});
  const current = [...bar.querySelectorAll('button')].filter((b) => b.getAttribute('aria-current') === 'page');
  assert.deepEqual(textOf(current), ['패치노트']);
});

test('글자 크기는 정해진 범위를 벗어나지 않는다', async () => {
  const { changeFontSize, FONT_RANGE } = await import('../src/state.js');
  const [min, max] = FONT_RANGE;

  for (let i = 0; i < 40; i++) changeFontSize(1);
  assert.equal(state.fontSize, max);
  for (let i = 0; i < 40; i++) changeFontSize(-1);
  assert.equal(state.fontSize, min);
});

test('예문·설문은 둘러보기라 내려받지 않아도 나갈 때 묻지 않는다', async () => {
  const { hasUnsavedWork, startComparison, pick } = await import('../src/state.js');
  const { readPastedText } = await import('../src/core/document.js');
  const docs = () => [readPastedText('가\n\n나', '원문.txt'), readPastedText('가다\n\n나', '수정본.txt')];

  startComparison(...docs(), { viewer: true });
  pick(state.comparison.scenes[0].changes[0].id, 'new');
  assert.equal(hasUnsavedWork(), false, '예문은 골라도 작업이 아니다');
  fresh();
  assert.equal($('.resume'), null, '예문을 보고 나와도 「검토하던 원고」 띠는 없다');

  // 예문을 본 뒤 직접 올린 원고는 다시 작업으로 센다.
  startComparison(...docs());
  pick(state.comparison.scenes[0].changes[0].id, 'new');
  assert.equal(hasUnsavedWork(), true, '올린 원고는 내려받기 전까지 묻는다');
  fresh();
  assert.ok($('.resume'), '올린 원고는 돌아갈 길을 열어 둔다');
});
