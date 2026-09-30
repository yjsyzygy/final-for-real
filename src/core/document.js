import { readTxt, writeTxt } from './txt.js';
import { readZipDoc, writeZipDoc } from './zip-doc.js';
import { blankDocx } from './docx-blank.js';

export const FORMAT_NAMES = { hwpx: 'HWPX', docx: 'DOCX', txt: 'TXT' };
const ZIP_FORMATS = ['hwpx', 'docx'];
const MIME = {
  hwpx: 'application/hwp+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain;charset=utf-8',
};

export function formatOf(name) {
  const ext = String(name).toLowerCase().split('.').pop();
  if (ext === 'hwpx' || ext === 'docx' || ext === 'txt') return ext;
  if (ext === 'hwp') throw Error('.hwp 는 아직 읽지 못합니다. 한글에서 ‘다른 이름으로 저장’ → HWPX를 선택해 주세요.');
  if (ext === 'doc') throw Error('.doc 는 읽지 못합니다. 워드에서 .docx 로 다시 저장해 주세요.');
  throw Error(`${ext ? '.' + ext : '이 형식'} 은 읽지 못합니다. HWPX·DOCX·TXT 파일을 선택해 주세요.`);
}

/** 파일 하나를 읽어 공통 문단 모델로 바꾼다. */
export async function readFile(file) {
  const format = formatOf(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return format === 'txt' ? readTxt(bytes, file.name) : readZipDoc(bytes, file.name, format);
}

/** 붙여넣은 글도 파일과 똑같은 모델로 만든다. 그래야 뒤쪽 처리가 하나로 끝난다. */
export function readPastedText(text, name) {
  return readTxt(new TextEncoder().encode(text), name);
}

/**
 * 고른 문단으로 파일을 만든다.
 * HWPX는 고른 쪽 원고를 틀로 삼아 그 안의 문단만 갈아 끼운다. 새 문서를 처음부터
 * 짓지 않으므로 글꼴·쪽 설정·스타일이 그대로 남는다.
 */
export function writeDocument(format, outputs, skeleton) {
  const texts = outputs.map((o) => o.text ?? '');
  if (format === 'txt') return { bytes: writeTxt(texts), mime: MIME.txt };
  if (!ZIP_FORMATS.includes(format)) throw Error('저장할 수 있는 형식이 아닙니다.');
  if (skeleton?.doc?.format !== format) {
    throw Error(`${FORMAT_NAMES[format]} 로 저장하려면 ${FORMAT_NAMES[format]} 원고가 있어야 합니다.`);
  }
  return { bytes: writeZipDoc(skeleton.doc.source, outputs, skeleton.indexKey), mime: MIME[format] };
}

/**
 * 저장 형식 후보를 고른다. 둘 다 TXT면 TXT뿐이고, 한쪽이라도 HWPX면 HWPX로 저장할 수 있다.
 * 기본값은 서식을 가장 많이 지키는 쪽이다.
 */
export function outputFormats(original, revised) {
  const native = ZIP_FORMATS.filter((f) => original.format === f || revised.format === f);
  // DOCX는 빈 문서를 직접 지을 수 있어 원고가 없어도 내보낼 수 있다.
  const list = [...new Set([...native, 'docx', 'txt'])];
  return { list, preferred: list[0] };
}

/**
 * 저장할 때 틀로 쓸 원고를 고른다. 수정본이 그 형식이면 그쪽을 먼저 쓴다.
 * 그 형식 원고가 없으면 빈 문서를 틀로 쓴다. 이때 글꼴·쪽 설정은 물려받을 곳이 없어
 * 기본값으로 나간다. blank 로 표시해 화면에서 미리 알릴 수 있게 한다.
 */
export function pickSkeleton(original, revised, format) {
  if (revised.format === format) return { doc: revised, indexKey: 'b' };
  if (original.format === format) return { doc: original, indexKey: 'a' };
  if (format === 'docx') {
    // 본보기 문단이 하나뿐이라 모든 문단이 그 서식을 따른다. indexKey 는 맞는 것이 없다.
    return { doc: readZipDoc(blankDocx(), '새 문서.docx', 'docx'), indexKey: 'none', blank: true };
  }
  return null;
}
