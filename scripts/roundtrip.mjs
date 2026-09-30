// 한글과 워드가 우리가 만든 파일을 여는지 눈으로 확인하려고 쓰는 도구다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readZipDoc, writeZipDoc } from '../src/core/zip-doc.js';

const src = process.argv[2];
const format = src.toLowerCase().endsWith('.docx') ? 'docx' : 'hwpx';
const doc = readZipDoc(readFileSync(src), src, format);
const outputs = doc.paragraphs.map((text, a) => ({ text, a, b: null }));

const filled = doc.paragraphs.findIndex((p) => p.length > 20);
const blank = doc.paragraphs.findIndex((p) => p === '');
outputs[0] = { ...outputs[0], text: doc.paragraphs[0] + ' — 고친 제목' };
outputs[filled] = { ...outputs[filled], text: '통째로 갈아 끼운 글이다. 특수문자: < > & " 5<6 · 앞뒤 공백 →  ' };
outputs[blank] = { ...outputs[blank], text: '원래 비어 있던 문단에 넣은 글' };
outputs.splice(filled + 1, 0, { text: '없던 자리에 새로 끼워 넣은 문단', a: null, b: 0 });
outputs.splice(filled + 3, 1);

mkdirSync('samples/out', { recursive: true });
const out = src.replace('samples/', 'samples/out/').replace(/(\.\w+)$/, '_검증$1');
writeFileSync(out, writeZipDoc(doc.source, outputs, 'a'));
console.log(`${doc.paragraphs.length} → ${outputs.length}문단  ${out}`);
