export const MAX_BYTES = 30 * 1024 * 1024;
const MAX_CHARS = 1_000_000;
const MAX_PARAGRAPHS = 40_000;

export function readTxt(bytes, name = '원고.txt') {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length > MAX_BYTES) throw Error('파일 하나당 30 MB까지 읽을 수 있습니다.');

  const { text: decoded, notes } = decode(data);
  const text = decoded.replace(/^\uFEFF/, '');
  // 제어문자가 섞여 있으면 텍스트 파일이 아니다. 깨진 글자를 본문으로 들이지 않는다.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw Error('일반 텍스트 파일이 아닙니다. TXT로 저장한 원고를 선택해 주세요.');
  }

  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  checkSize(paragraphs);
  return { name, format: 'txt', paragraphs, notes };
}

export function writeTxt(paragraphs) {
  checkSize(paragraphs);
  // BOM을 붙여야 메모장과 엑셀이 UTF-8로 읽는다.
  return new TextEncoder().encode('\uFEFF' + paragraphs.join('\r\n'));
}

function decode(data) {
  if (data[0] === 0xff && data[1] === 0xfe) return { text: utf16(data, true), notes: [] };
  if (data[0] === 0xfe && data[1] === 0xff) return { text: utf16(data, false), notes: [] };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(data), notes: [] };
  } catch {
    // 국내 문서는 CP949로 저장된 것이 아직 많다. UTF-8이 아니면 한 번 더 시도한다.
    try {
      return {
        text: new TextDecoder('euc-kr', { fatal: true }).decode(data),
        notes: ['한국어 인코딩(CP949/EUC-KR)으로 읽었습니다. 글자가 다르게 보이면 UTF-8로 다시 저장해 주세요.'],
      };
    } catch {
      throw Error('TXT 인코딩을 읽지 못했습니다. UTF-8로 저장한 파일을 선택해 주세요.');
    }
  }
}

function utf16(data, little) {
  return new TextDecoder(little ? 'utf-16le' : 'utf-16be').decode(data.subarray(2));
}

function checkSize(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.some((p) => typeof p !== 'string')) {
    throw Error('문단 형식이 올바르지 않습니다.');
  }
  if (paragraphs.length > MAX_PARAGRAPHS) throw Error('본문은 4만 문단까지 다룰 수 있습니다.');
  let chars = 0;
  for (const p of paragraphs) chars += p.length;
  if (chars > MAX_CHARS) throw Error('본문은 100만 자까지 다룰 수 있습니다.');
}
