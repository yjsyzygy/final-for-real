import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, zipSync } from 'fflate';
import { readZipDoc, writeZipDoc } from '../src/core/zip-doc.js';

const decode = (bytes) => Buffer.from(bytes).toString('utf8');
const encode = (text) => new TextEncoder().encode(text);
const sample = (name) => readFile(new URL(`../samples/${name}`, import.meta.url));

// 한글과 워드가 만든 실물 문서에 표를 한 개 끼워 넣는다.
// DOCX 는 표가 문단의 형제로, HWPX 는 문단 안에 들어간다. 두 자리가 다르다.
const FIXTURES = {
  docx: {
    file: '달을 쏘다.docx',
    body: 'word/document.xml',
    close: '</w:p>',
    open: '<w:p ',
    table: (cells) => '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tr>'
      + cells.map((t) => `<w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>`
        + `<w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`).join('')
      + '</w:tr></w:tbl>',
    count: (xml) => (xml.match(/<w:tbl>/g) || []).length,
  },
  hwpx: {
    file: '달을 쏘다.hwpx',
    body: 'Contents/section0.xml',
    close: '</hp:p>',
    open: '<hp:p ',
    table: (cells) => '<hp:p id="0" paraPrIDRef="0"><hp:run charPrIDRef="0">'
      + '<hp:tbl rowCnt="1" colCnt="2"><hp:tr>'
      + cells.map((t) => '<hp:tc><hp:subList><hp:p id="0" paraPrIDRef="0">'
        + `<hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run></hp:p></hp:subList></hp:tc>`).join('')
      + '</hp:tr></hp:tbl></hp:run></hp:p>',
    count: (xml) => (xml.match(/<hp:tbl /g) || []).length,
  },
};

const CELLS = ['표 첫째 칸', '표 둘째 칸'];

async function withTable(format) {
  const spec = FIXTURES[format];
  const files = unzipSync(await sample(spec.file));
  const xml = decode(files[spec.body]);
  const at = xml.indexOf(spec.close, xml.indexOf(spec.open)) + spec.close.length;
  const patched = xml.slice(0, at) + spec.table(CELLS) + xml.slice(at);
  return { spec, bytes: zipSync({ ...files, [spec.body]: encode(patched) }) };
}

const asIs = (doc) => doc.paragraphs.map((text, a) => ({ text, a, b: null }));
const bodyOf = (bytes, spec) => decode(unzipSync(bytes)[spec.body]);

for (const format of ['docx', 'hwpx']) {
  test(`${format}: 표 칸 안의 문단도 비교 대상에 들어간다`, async () => {
    const { bytes } = await withTable(format);
    const doc = readZipDoc(bytes, 'x', format);
    for (const cell of CELLS) assert.ok(doc.paragraphs.includes(cell), cell);
    // 겉 문단이 칸 글자를 다시 끌어오면 같은 문장이 두 번 잡힌다.
    assert.equal(doc.paragraphs.filter((p) => p === CELLS[0]).length, 1);
  });

  test(`${format}: 고치지 않고 다시 써도 표가 그대로 남는다`, async () => {
    const { spec, bytes } = await withTable(format);
    const doc = readZipDoc(bytes, 'x', format);
    const again = writeZipDoc(doc.source, asIs(doc), 'a');

    assert.equal(spec.count(bodyOf(again, spec)), 1, '표가 사라지거나 늘어나면 안 된다');
    assert.deepEqual(readZipDoc(again, 'x', format).paragraphs, doc.paragraphs);
  });

  test(`${format}: 표 칸의 글을 고쳐 저장할 수 있다`, async () => {
    const { spec, bytes } = await withTable(format);
    const doc = readZipDoc(bytes, 'x', format);
    const at = doc.paragraphs.indexOf(CELLS[0]);
    const outputs = asIs(doc).map((o, i) => (i === at ? { ...o, text: '고친 칸' } : o));

    const again = writeZipDoc(doc.source, outputs, 'a');
    assert.equal(spec.count(bodyOf(again, spec)), 1);
    const after = readZipDoc(again, 'x', format);
    assert.equal(after.paragraphs[at], '고친 칸');
    assert.ok(after.paragraphs.includes(CELLS[1]), '옆 칸은 그대로여야 한다');
  });

  test(`${format}: 본문 문단이 늘거나 줄어도 표는 제자리다`, async () => {
    const { spec, bytes } = await withTable(format);
    const doc = readZipDoc(bytes, 'x', format);

    const grown = asIs(doc);
    grown.splice(grown.length - 1, 0, { text: '뒤에 끼운 본문', a: null, b: 0 });
    const afterGrow = writeZipDoc(doc.source, grown, 'a');
    assert.equal(spec.count(bodyOf(afterGrow, spec)), 1);
    const grownDoc = readZipDoc(afterGrow, 'x', format);
    assert.equal(grownDoc.paragraphs.length, doc.paragraphs.length + 1);
    for (const cell of CELLS) assert.ok(grownDoc.paragraphs.includes(cell), cell);

    // 표 앞 본문을 지워도 표가 앞으로 딸려 나오지 않는다.
    const shrunk = asIs(doc).filter((o) => !CELLS.includes(o.text) && o.a !== 0);
    const afterShrink = writeZipDoc(doc.source, shrunk, 'a');
    assert.equal(spec.count(bodyOf(afterShrink, spec)), 1);
  });
}
