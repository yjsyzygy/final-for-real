import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { readZipDoc } from '../src/core/zip-doc.js';
import { formatOf, outputFormats, pickSkeleton, writeDocument } from '../src/core/document.js';
import { readTxt } from '../src/core/txt.js';

const txtDoc = (name, lines) => readTxt(new TextEncoder().encode(lines.join('\n')), name);
const hwpxDoc = async () =>
  readZipDoc(await readFile(new URL('../samples/달을 쏘다.hwpx', import.meta.url)), '원고.hwpx', 'hwpx');
const outputs = (texts) => texts.map((text) => ({ text, a: null, b: null }));

test('확장자로 형식을 가리고 못 읽는 것은 대안을 알려 준다', () => {
  assert.equal(formatOf('보고서.hwpx'), 'hwpx');
  assert.equal(formatOf('보고서.DOCX'), 'docx');
  assert.equal(formatOf('메모.txt'), 'txt');
  assert.throws(() => formatOf('옛보고서.hwp'), /HWPX를 선택/);
  assert.throws(() => formatOf('옛보고서.doc'), /\.docx 로 다시 저장/);
  assert.throws(() => formatOf('그림.png'), /HWPX·DOCX·TXT/);
});

test('저장 후보에는 올린 형식과 DOCX와 TXT가 들어간다', async () => {
  const hwpx = await hwpxDoc();
  const txt = txtDoc('메모.txt', ['가']);

  assert.deepEqual(outputFormats(hwpx, hwpx).list, ['hwpx', 'docx', 'txt']);
  assert.deepEqual(outputFormats(txt, txt).list, ['docx', 'txt']);
  // 기본값은 서식을 가장 많이 지키는 쪽, 곧 올린 원고와 같은 형식이다.
  assert.equal(outputFormats(hwpx, txt).preferred, 'hwpx');
});

test('HWPX는 그 형식 원고가 있어야 저장할 수 있다', () => {
  const txt = txtDoc('메모.txt', ['가']);
  assert.equal(pickSkeleton(txt, txt, 'hwpx'), null);
  assert.throws(() => writeDocument('hwpx', outputs(['가']), null), /HWPX 원고가 있어야/);
});

test('DOCX 원고가 없으면 빈 문서를 틀로 삼아 내보낸다', () => {
  const txt = txtDoc('메모.txt', ['가']);
  const skeleton = pickSkeleton(txt, txt, 'docx');
  assert.equal(skeleton.blank, true, '서식을 물려받을 곳이 없다고 표시한다');

  const lines = ['첫 문단이다.', '', '둘째 문단이다. 특수문자 < > & "'];
  const { bytes } = writeDocument('docx', outputs(lines), skeleton);
  const again = readZipDoc(bytes, '다시.docx', 'docx');
  assert.deepEqual(again.paragraphs, lines);

  // 워드가 열려면 부품 셋이 다 있어야 한다.
  const files = unzipSync(bytes);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
    assert.ok(files[part], part);
  }
  assert.ok(Buffer.from(files['word/document.xml']).toString('utf8').includes('<w:sectPr'), '쪽 설정');
});

test('HWPX 원고를 DOCX로 내보내도 문단이 그대로 옮겨진다', async () => {
  const hwpx = await hwpxDoc();
  const txt = txtDoc('메모.txt', hwpx.paragraphs);
  const skeleton = pickSkeleton(hwpx, txt, 'docx');

  const { bytes, mime } = writeDocument('docx', outputs(hwpx.paragraphs), skeleton);
  assert.ok(mime.includes('wordprocessingml'));
  assert.deepEqual(readZipDoc(bytes, '변환.docx', 'docx').paragraphs, hwpx.paragraphs);
});

test('같은 형식 원고가 있으면 빈 문서 대신 그 원고를 틀로 쓴다', async () => {
  const hwpx = await hwpxDoc();
  const skeleton = pickSkeleton(hwpx, hwpx, 'hwpx');
  assert.equal(skeleton.blank, undefined);
  assert.equal(skeleton.doc, hwpx);
});
