// PDF나 웹에서 복사한 글은 한 문단이 여러 줄로 쪼개져 온다.
// 그대로 비교하면 줄바꿈 위치 차이가 전부 변경으로 잡혀 쓸모가 없다.

// 문장이 끝났다고 볼 수 있는 글자. 닫는 따옴표·괄호가 뒤에 붙는 경우까지 본다.
const SENTENCE_END = /[.!?。…”’"')\]】」』]\s*$/;
// 목록 기호나 번호로 시작하는 줄은 앞 줄에 이어 붙이지 않는다.
const LIST_START = /^\s*(?:[-*·•▪◦]|\(?\d+[.)]|\(?[가-힣][.)]|[①-⑳]|제?\s*\d+\s*[장절조항])\s/;
// 대사가 새 줄에서 시작하면 앞 문장에 붙이지 않는다.
const QUOTE_START = /^\s*["“'‘「『]/;

/**
 * 문단 안에서 끊긴 줄을 다시 잇는다.
 * @param {string} text 원본 글
 * @param {{joinWith?: string}} options joinWith 는 이어 붙일 때 끼울 글자. 기본은 공백.
 * @returns {{text: string, joined: number}} 정리한 글과 이어 붙인 줄 수
 */
export function reflow(text, { joinWith = ' ' } = {}) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  const out = [];
  let joined = 0;

  for (const line of lines) {
    const previous = out.length ? out[out.length - 1] : null;
    if (previous === null || !previous.trim() || !line.trim()) {
      out.push(line);
      continue;
    }
    if (SENTENCE_END.test(previous) || LIST_START.test(line) || QUOTE_START.test(line)) {
      out.push(line);
      continue;
    }
    // 한글은 낱말 가운데서도 줄이 바뀔 수 있어, 끊긴 자리가 낱말 안인지 사이인지
    // 기계로는 가릴 수 없다. 잘못 붙인 낱말('과제로삼겠다고')은 눈에 잘 띄지 않아
    // 되레 위험하므로 공백으로 잇는 것을 기본으로 두고, 선택은 쓰는 사람에게 맡긴다.
    out[out.length - 1] = previous.replace(/\s+$/, '') + joinWith + line.replace(/^\s+/, '');
    joined++;
  }

  return { text: collapse(out).join('\n'), joined };
}

// 빈 줄이 여러 개 이어지면 하나로 줄인다. 단락 경계는 빈 줄 하나면 충분하다.
function collapse(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.trim() && out.length && !out[out.length - 1].trim()) continue;
    out.push(line.trim() ? line : '');
  }
  while (out.length && !out[0]) out.shift();
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}
