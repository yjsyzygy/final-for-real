// 문단이 어떻게 읽히는지 눈으로 보는 도구.
import { readFileSync } from 'node:fs';
import { readZipDoc } from '../src/core/zip-doc.js';

const path = process.argv[2];
const doc = readZipDoc(readFileSync(path), path, path.toLowerCase().endsWith('.docx') ? 'docx' : 'hwpx');
console.log(`${doc.format}  ${doc.paragraphs.length}문단  ${doc.paragraphs.join('').length}자`);
doc.paragraphs.forEach((text, i) =>
  console.log(String(i).padStart(3), JSON.stringify(text.slice(0, 70))));
