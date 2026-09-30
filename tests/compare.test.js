import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareDocuments, mergeParagraphs } from '../src/core/compare.js';

const doc = (name, paragraphs) => ({ name, format: 'txt', paragraphs });
const texts = (merged) => merged.map((m) => m.text);

function compare(a, b) {
  return compareDocuments(doc('원문.txt', a), doc('수정본.txt', b));
}

test('같은 글은 변경이 없고 단락만 나뉜다', () => {
  const paragraphs = ['첫 단락', '', '둘째 단락'];
  const result = compare(paragraphs, paragraphs);
  assert.equal(result.totalChanges, 0);
  assert.equal(result.scenes.length, 2);
  assert.deepEqual(result.scenes.map((s) => s.title), ['첫 단락', '둘째 단락']);
});

test('문구 수정은 글자 단위로 견준다', () => {
  const result = compare(['오늘도 또 우리 수탉이 막 쫓기었다.'], ['오늘도 또 우리 수탉이 막 쫓겼다.']);
  assert.equal(result.totalChanges, 1);
  const change = result.changes[0];
  assert.equal(change.kind, 'modified');
  assert.equal(change.label, '문구 수정');
  // 바뀐 부분만 표시되고 나머지는 그대로다.
  const kept = change.inline[0].filter((p) => !p.added && !p.removed).map((p) => p.value).join('');
  assert.ok(kept.includes('오늘도 또 우리 수탉이 막 쫓'));
});

test('1:2로 갈라진 문단을 하나의 선택으로 묶는다', () => {
  const result = compare(['앞 문장이다. 뒤 문장이다.'], ['앞 문장이다.', '뒤 문장이다.']);
  assert.equal(result.totalChanges, 1);
  assert.equal(result.changes[0].label, '문장 나눔 (1 → 2문단)');
  // 문단 수가 다르면 글자 단위 대조는 하지 않는다.
  assert.equal(result.changes[0].inline, null);
});

test('추가와 삭제를 구분한다', () => {
  const added = compare(['하나'], ['하나', '둘']);
  assert.equal(added.changes[0].kind, 'added');
  assert.equal(added.changes[0].label, '문단 추가');

  const deleted = compare(['하나', '둘'], ['하나']);
  assert.equal(deleted.changes[0].kind, 'deleted');
  assert.equal(deleted.changes[0].label, '문단 삭제');
});

test('변경은 그것이 속한 단락에만 붙는다', () => {
  const result = compare(['가', '', '나', '', '다'], ['가', '', '나 고침', '', '다']);
  assert.equal(result.scenes.length, 3);
  assert.deepEqual(result.scenes.map((s) => s.changes.length), [0, 1, 0]);
});

test('선택하지 않으면 원문 그대로, 전부 고르면 수정본 그대로다', () => {
  const a = ['가', '', '나', '다', '라'];
  const b = ['가 고침', '', '나', '다 나눔1', '다 나눔2', '라'];
  const result = compare(a, b);

  assert.deepEqual(texts(mergeParagraphs(result, {})), a);

  const all = Object.fromEntries(result.changes.map((c) => [c.id, 'new']));
  assert.deepEqual(texts(mergeParagraphs(result, all)), b);
});

test('변경마다 따로 고른 결과가 섞여 나온다', () => {
  const result = compare(['가', '나'], ['가 고침', '나 고침']);
  assert.equal(result.totalChanges, 2);
  const merged = texts(mergeParagraphs(result, { [result.changes[0].id]: 'new' }));
  assert.deepEqual(merged, ['가 고침', '나']);
});

test('합친 문단은 어느 쪽에서 왔는지와 원래 위치를 들고 있다', () => {
  const result = compare(['가', '나'], ['가', '나 고침']);
  const merged = mergeParagraphs(result, { [result.changes[0].id]: 'new' });
  assert.deepEqual(merged[0], { text: '가', from: 'equal', a: 0, b: 0 });
  assert.equal(merged[1].from, 'new');
  assert.equal(merged[1].b, 1);
});

test('빈 문단은 단락 경계이면서 본문에도 남는다', () => {
  const a = ['가', '', '', '나'];
  const result = compare(a, a);
  assert.equal(result.scenes.length, 2, '빈 문단이 연속돼도 경계는 하나다');
  assert.deepEqual(texts(mergeParagraphs(result, {})), a, '저장할 때는 빈 줄이 그대로 남는다');
});

test('실제 예제 원고를 끝까지 비교하고 양쪽을 되살린다', async () => {
  const load = async (name) =>
    (await readFile(new URL(`../public/examples/${name}.txt`, import.meta.url), 'utf8')).split('\n');
  const a = await load('달을 쏘다_원문');
  const b = await load('달을 쏘다_수정본');

  const result = compare(a, b);
  assert.equal(result.scenes.length, 6);
  assert.ok(result.totalChanges >= 10, `변경 ${result.totalChanges}개`);

  assert.deepEqual(texts(mergeParagraphs(result, {})), a);
  const all = Object.fromEntries(result.changes.map((c) => [c.id, 'new']));
  assert.deepEqual(texts(mergeParagraphs(result, all)), b);
});
