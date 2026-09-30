import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readZipDoc, writeZipDoc } from '../src/core/zip-doc.js';
import { compareDocuments, mergeParagraphs } from '../src/core/compare.js';

// 한글과 워드가 실제로 만든 설문지다. 표가 든 원본과, 표가 하나 더 늘어난 최종본.
// 손으로 지어낸 XML은 실물의 절반도 못 흉내 내므로 이 짝으로 끝까지 확인한다.
const PAIR = ['general_demographicsq', 'general_demographicsq_최종'];

const load = async (name, format) =>
  readZipDoc(await readFile(new URL(`../public/examples/${name}.${format}`, import.meta.url)), `${name}.${format}`, format);

const texts = (merged) => merged.map((m) => m.text);

for (const format of ['hwpx', 'docx']) {
  test(`${format}: 표가 든 실제 문서를 고치지 않고 다시 써도 그대로다`, async () => {
    const doc = await load(PAIR[0], format);
    assert.ok(doc.paragraphs.length > 100, `문단 ${doc.paragraphs.length}개`);
    assert.equal(doc.tables, 2);

    const asIs = doc.paragraphs.map((text, a) => ({ text, a, b: null }));
    const again = readZipDoc(writeZipDoc(doc.source, asIs, 'a'), 'x', format);
    assert.deepEqual(again.paragraphs, doc.paragraphs);
    assert.equal(again.tables, 2, '표가 사라지거나 늘어나면 안 된다');
  });

  test(`${format}: 표가 든 문서에서 본문을 고치고 끼워 넣을 수 있다`, async () => {
    const doc = await load(PAIR[0], format);
    const at = doc.paragraphs.findIndex((p) => p.trim().length > 6);
    const outputs = doc.paragraphs.map((text, a) => ({ text, a, b: null }));
    outputs[at] = { ...outputs[at], text: '고친 줄입니다' };
    outputs.splice(at + 1, 0, { text: '끼워 넣은 줄', a: null, b: 0 });

    const again = readZipDoc(writeZipDoc(doc.source, outputs, 'a'), 'x', format);
    assert.equal(again.tables, 2);
    assert.equal(again.paragraphs[at], '고친 줄입니다');
    assert.equal(again.paragraphs[at + 1], '끼워 넣은 줄');
  });

  test(`${format}: 원본과 최종본을 비교해 양쪽 모두로 되살린다`, async () => {
    const [oldDoc, newDoc] = await Promise.all(PAIR.map((n) => load(n, format)));
    const comparison = compareDocuments(oldDoc, newDoc);
    assert.ok(comparison.totalChanges > 5, `변경 ${comparison.totalChanges}개`);

    // 고른 대로 합친 글은 언제나 한쪽 원고와 정확히 같아야 한다.
    assert.deepEqual(texts(mergeParagraphs(comparison, {})), oldDoc.paragraphs);
    const all = Object.fromEntries(comparison.changes.map((c) => [c.id, 'new']));
    assert.deepEqual(texts(mergeParagraphs(comparison, all)), newDoc.paragraphs);
  });

  test(`${format}: 수정본을 틀로 저장하면 그 표 구성과 최종 글이 나온다`, async () => {
    const [oldDoc, newDoc] = await Promise.all(PAIR.map((n) => load(n, format)));
    const comparison = compareDocuments(oldDoc, newDoc);
    const all = Object.fromEntries(comparison.changes.map((c) => [c.id, 'new']));

    const saved = readZipDoc(writeZipDoc(newDoc.source, mergeParagraphs(comparison, all), 'b'), 'x', format);
    assert.deepEqual(saved.paragraphs, newDoc.paragraphs);
    assert.equal(saved.tables, newDoc.tables);
  });

  test(`${format}: 전부 원문을 골라도 글이 뒤섞이지 않는다`, async () => {
    const [oldDoc, newDoc] = await Promise.all(PAIR.map((n) => load(n, format)));
    const comparison = compareDocuments(oldDoc, newDoc);
    const merged = texts(mergeParagraphs(comparison, {}));

    const saved = readZipDoc(writeZipDoc(newDoc.source, mergeParagraphs(comparison, {}), 'b'), 'x', format);

    // 글이 든 문단은 순서까지 한 글자도 달라지면 안 된다. 글이 엉뚱한 표 칸으로
    // 옮겨 가거나 사라지는 일을 여기서 잡는다.
    const filled = (list) => list.filter((p) => p.trim());
    assert.deepEqual(filled(saved.paragraphs), filled(merged));

    // 틀로 쓴 수정본에만 있던 빈 표 칸은 자리지킴 문단으로 남는다. 늘어난 것은 빈 줄뿐이다.
    assert.ok(saved.paragraphs.length >= merged.length);
    assert.ok(saved.paragraphs.length - merged.length <= newDoc.tables - oldDoc.tables + 1,
      `빈 줄이 ${saved.paragraphs.length - merged.length}개나 늘었다`);
  });
}

test('표 개수가 다르면 비교 전에 알 수 있도록 개수를 들고 있다', async () => {
  const [a, b] = await Promise.all(PAIR.map((n) => load(n, 'hwpx')));
  assert.equal(a.tables, 2);
  assert.equal(b.tables, 3);
  assert.notEqual(a.tables, b.tables, '이 짝은 표 개수가 다른 경우를 시험한다');
});
