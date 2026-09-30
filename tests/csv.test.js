import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDocuments } from '../src/core/compare.js';
import { changesToCsv } from '../src/core/csv.js';

const doc = (name, paragraphs) => ({ name, format: 'txt', paragraphs });
const text = (bytes) => new TextDecoder('utf-8').decode(bytes);

const sample = () =>
  compareDocuments(
    doc('원문.txt', ['첫 단락', '', '가', '나']),
    doc('수정본.txt', ['첫 단락', '', '가 고침', '나']),
  );

test('BOM을 붙여 엑셀이 한글을 깨뜨리지 않게 한다', () => {
  const bytes = changesToCsv(sample(), {});
  // TextDecoder 는 BOM을 먹어 치우므로 바이트로 확인한다.
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(text(bytes).includes('가 고침'));
});

test('바뀐 문단만 한 줄씩 담고 선택 결과를 적는다', () => {
  const comparison = sample();
  const id = comparison.changes[0].id;

  const before = text(changesToCsv(comparison, {})).trim().split('\r\n');
  assert.equal(before.length, 2, '머리글 한 줄 + 변경 한 줄');
  assert.ok(before[1].includes('미선택 (원문)'));

  const after = text(changesToCsv(comparison, { [id]: 'new' }));
  assert.ok(after.includes('수정 채택'));
  assert.ok(text(changesToCsv(comparison, { [id]: 'old' })).includes('원문 유지'));
});

test('큰따옴표와 쉼표와 줄바꿈이 든 본문이 칸을 깨뜨리지 않는다', () => {
  const comparison = compareDocuments(
    doc('원문.txt', ['그는 "그렇다, 아마도"라고 했다']),
    doc('수정본.txt', ['그는 "아니다"라고 했다']),
  );
  const out = text(changesToCsv(comparison, {}));
  // 큰따옴표는 두 번 써서 벗어난다. 엑셀이 읽는 방식이다.
  assert.ok(out.includes('""그렇다, 아마도""'));
  assert.equal(out.trim().split('\r\n').length, 2);
});

test('여러 문단이 묶인 변경은 한 칸 안에 줄바꿈으로 담는다', () => {
  const comparison = compareDocuments(
    doc('원문.txt', ['앞 문장이다. 뒤 문장이다.']),
    doc('수정본.txt', ['앞 문장이다.', '뒤 문장이다.']),
  );
  const out = text(changesToCsv(comparison, {}));
  assert.ok(out.includes('앞 문장이다.\n뒤 문장이다.'));
  assert.ok(out.includes('문장 나눔 (1 → 2문단)'));
});

test('바뀐 곳이 없으면 머리글만 남는다', () => {
  const same = ['가', '', '나'];
  const out = text(changesToCsv(compareDocuments(doc('a.txt', same), doc('b.txt', same)), {}));
  assert.equal(out.replace('\uFEFF', '').trim().split('\r\n').length, 1);
});
