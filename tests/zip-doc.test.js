import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { readZipDoc, writeZipDoc } from '../src/core/zip-doc.js';

// 한글과 워드가 실제로 만든 파일이다. 손으로 지어낸 XML로 시험하면 실물에서 깨진다.
const SAMPLES = [
  { format: 'hwpx', file: '달을 쏘다.hwpx', body: 'Contents/section0.xml' },
  { format: 'hwpx', file: 'Frankenstein_Chapter 5.hwpx', body: 'Contents/section0.xml' },
  { format: 'docx', file: '달을 쏘다.docx', body: 'word/document.xml' },
  { format: 'docx', file: 'Frankenstein_Chapter 5.docx', body: 'word/document.xml' },
];

const sampleBytes = (file) => readFile(new URL(`../samples/${file}`, import.meta.url));
const load = async ({ file, format }) => readZipDoc(await sampleBytes(file), file, format);

// 저장할 문단 목록. a 는 이 원고에서의 문단 번호다.
const asIs = (doc) => doc.paragraphs.map((text, a) => ({ text, a, b: null }));
const reread = (bytes, format) => readZipDoc(bytes, '다시', format);
const bodyXml = (bytes, key) => Buffer.from(unzipSync(bytes)[key]).toString('utf8');

for (const sample of SAMPLES) {
  const { format, file, body } = sample;

  test(`${file} · 문단을 순서대로 읽는다`, async () => {
    const doc = await load(sample);
    assert.equal(doc.format, format);
    assert.ok(doc.paragraphs.length > 5);
    assert.ok(doc.paragraphs[0].trim(), '첫 문단은 제목이라 비어 있지 않다');
    assert.ok(doc.paragraphs.includes(''), '빈 문단도 자리를 지킨다');
  });

  test(`${file} · 고치지 않고 다시 쓰면 한 글자도 달라지지 않는다`, async () => {
    const doc = await load(sample);
    const again = reread(writeZipDoc(doc.source, asIs(doc), 'a'), format);
    assert.deepEqual(again.paragraphs, doc.paragraphs);
  });

  test(`${file} · XML을 깨뜨리는 글자가 그대로 돌아온다`, async () => {
    const doc = await load(sample);
    const danger = '표 <w:p> & <hp:p> "따옴표" 5 < 6 … é À';
    const outputs = asIs(doc);
    const at = doc.paragraphs.findIndex((p) => p.length > 20);
    outputs[at] = { text: danger, a: at, b: null };
    const again = reread(writeZipDoc(doc.source, outputs, 'a'), format);
    assert.equal(again.paragraphs[at], danger);
    assert.equal(again.paragraphs.length, doc.paragraphs.length);
  });

  test(`${file} · 앞뒤 공백이 붙은 글도 그대로 돌아온다`, async () => {
    const doc = await load(sample);
    const spaced = '  앞뒤에 공백이 있는 글  ';
    const outputs = asIs(doc);
    outputs[0] = { text: spaced, a: 0, b: null };
    assert.equal(reread(writeZipDoc(doc.source, outputs, 'a'), format).paragraphs[0], spaced);
  });

  test(`${file} · 빈 문단에 글을 넣고 있던 글을 지울 수 있다`, async () => {
    const doc = await load(sample);
    const blank = doc.paragraphs.findIndex((p) => p === '');
    const filled = doc.paragraphs.findIndex((p) => p.length > 20);
    const outputs = asIs(doc);
    outputs[blank] = { text: '비어 있던 자리에 넣은 글', a: blank, b: null };
    outputs[filled] = { text: '', a: filled, b: null };

    const again = reread(writeZipDoc(doc.source, outputs, 'a'), format);
    assert.equal(again.paragraphs[blank], '비어 있던 자리에 넣은 글');
    assert.equal(again.paragraphs[filled], '');
  });

  test(`${file} · 문단을 늘리거나 줄여도 개수가 맞는다`, async () => {
    const doc = await load(sample);
    const grown = [...asIs(doc), { text: '뒤에 붙인 문단', a: null, b: 0 }];
    assert.equal(reread(writeZipDoc(doc.source, grown, 'a'), format).paragraphs.length, doc.paragraphs.length + 1);

    const shrunk = asIs(doc).slice(0, 6);
    const after = reread(writeZipDoc(doc.source, shrunk, 'a'), format);
    assert.deepEqual(after.paragraphs, doc.paragraphs.slice(0, 6));
  });

  test(`${file} · 반대쪽 원고에서 온 문단도 자리를 잡는다`, async () => {
    const doc = await load(sample);
    const outputs = asIs(doc);
    // a 가 null 이면 이 원고에 짝이 없는 문단이다. 본보기가 없어도 터지지 않아야 한다.
    outputs.splice(3, 0, { text: '반대쪽에서 온 문단', a: null, b: 99 });
    const again = reread(writeZipDoc(doc.source, outputs, 'a'), format);
    assert.equal(again.paragraphs[3], '반대쪽에서 온 문단');
  });

  test(`${file} · 쪽 설정과 글꼴 정의를 잃지 않는다`, async () => {
    const doc = await load(sample);
    const bytes = writeZipDoc(doc.source, asIs(doc).slice(0, 5), 'a');
    const files = unzipSync(bytes);
    const xml = bodyXml(bytes, body);

    if (format === 'hwpx') {
      assert.ok(files['Contents/header.xml'], '글꼴·문단 모양 정의');
      assert.ok(files['mimetype'] && files['META-INF/container.xml']);
      assert.ok(xml.includes('<hp:secPr'), '쪽 크기·여백은 첫 문단 안에 있다');
      assert.equal((xml.match(/<hp:linesegarray/g) || []).length, 0, '옛 줄 배치 기록은 버린다');
    } else {
      assert.ok(files['word/styles.xml'] && files['[Content_Types].xml']);
      assert.ok(xml.includes('<w:sectPr'), '쪽 설정은 마지막 문단 뒤에 있다');
      assert.equal((xml.match(/w14:paraId/g) || []).length, 0, '겹칠 수 있는 문단 식별자는 지운다');
    }
  });

  test(`${file} · 건드리지 않은 문단의 굵게·기울임은 그대로 남는다`, async () => {
    const doc = await load(sample);
    const before = bodyXml(await sampleBytes(file), body);
    const after = bodyXml(writeZipDoc(doc.source, asIs(doc), 'a'), body);
    const marks = format === 'hwpx' ? /charPrIDRef="(\d+)"/g : /<w:(b|i)\/>/g;
    const count = (xml) => (xml.match(marks) || []).length;
    assert.ok(count(before) > 0, '표본에 서식이 들어 있어야 시험이 된다');
    assert.equal(count(after), count(before));
  });
}

test('형식이 다른 파일을 내밀면 분명한 말로 거절한다', async () => {
  assert.throws(() => readZipDoc(new Uint8Array([1, 2, 3]), 'x.hwpx', 'hwpx'), /열지 못했습니다/);
  const docx = await sampleBytes('달을 쏘다.docx');
  assert.throws(() => readZipDoc(docx, 'x.hwpx', 'hwpx'), /HWPX 파일이 아닙니다/);
});
