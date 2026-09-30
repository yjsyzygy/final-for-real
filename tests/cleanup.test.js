import test from 'node:test';
import assert from 'node:assert/strict';
import { reflow } from '../src/core/cleanup.js';

test('문장 중간에서 끊긴 줄을 다시 잇는다', () => {
  const { text, joined } = reflow('정부는 이번 대책에서 고용 안정을\n최우선 과제로\n삼겠다고 밝혔다.');
  assert.equal(text, '정부는 이번 대책에서 고용 안정을 최우선 과제로 삼겠다고 밝혔다.');
  assert.equal(joined, 2);
});

test('기본은 공백으로 잇고, 낱말이 잘린 글은 붙여 잇기를 고를 수 있다', () => {
  // 한글은 낱말 가운데서도 줄이 바뀌어 어느 쪽이 맞는지 글마다 다르다.
  // 기계가 정하지 않고 기본값만 두고 맡긴다.
  assert.equal(reflow('고용\n안정').text, '고용 안정');
  assert.equal(reflow('고용\n안정', { joinWith: '' }).text, '고용안정');
  assert.equal(reflow('2024 fiscal\nyear budget').text, '2024 fiscal year budget');
});

test('문장이 끝난 줄은 잇지 않는다', () => {
  const text = '첫 문장이다.\n둘째 문장이다.\n셋째 문장이다.';
  assert.deepEqual(reflow(text), { text, joined: 0 });
});

test('닫는 따옴표나 괄호로 끝나도 문장이 끝난 것으로 본다', () => {
  const text = '그는 "그렇다"\n고 답했다.';
  assert.equal(reflow(text).joined, 0);
});

test('목록 기호와 번호로 시작하는 줄은 앞 줄에 붙이지 않는다', () => {
  for (const marker of ['- 항목', '1. 항목', '가) 항목', '① 항목', '제3조 항목']) {
    const { text } = reflow(`앞 줄은 안 끝났고\n${marker}`);
    assert.ok(text.includes('\n' + marker), `${marker} 는 새 줄로 남아야 한다`);
  }
});

test('새 줄에서 시작하는 대사는 앞 문장에 붙이지 않는다', () => {
  const { text } = reflow('점순이가 말하기를\n"느 집엔 이거 없지?"');
  assert.ok(text.includes('\n"느 집엔'));
});

test('연속된 빈 줄을 하나로 줄이고 앞뒤 빈 줄을 없앤다', () => {
  assert.equal(reflow('\n\n가\n\n\n\n나\n\n').text, '가\n\n나');
});

test('줄 끝 공백과 탭을 없앤다', () => {
  assert.equal(reflow('끝났다.   \t\n다음 줄이다.').text, '끝났다.\n다음 줄이다.');
});

test('CRLF와 CR을 줄바꿈 하나로 본다', () => {
  assert.equal(reflow('가.\r\n나.\r다.').text, '가.\n나.\n다.');
});

test('빈 줄은 단락 경계라 잇는 대상이 아니다', () => {
  const { text } = reflow('안 끝난 줄\n\n다음 단락');
  assert.equal(text, '안 끝난 줄\n\n다음 단락');
});

test('이미 정리된 글은 건드리지 않는다', () => {
  const text = '첫 단락이다.\n\n둘째 단락이다.';
  assert.deepEqual(reflow(text), { text, joined: 0 });
});
