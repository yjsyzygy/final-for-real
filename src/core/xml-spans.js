// XML 본문을 문자열 그대로 두고 필요한 구간의 위치만 찾는다.
// 트리로 파싱해 다시 직렬화하면 속성 순서·네임스페이스·self-closing 표기가 흔들려
// 한글과 워드가 파일을 거부할 수 있다. 원본 바이트를 최대한 보존하려는 선택이다.

const SKIP = [
  ['<!--', '-->'],
  ['<![CDATA[', ']]>'],
  ['<?', '?>'],
  ['<!', '>'],
];

// lt 자리가 주석·CDATA·선언이면 그 다음 위치를, 아니면 -1을 돌려준다.
// 닫히지 않았으면 문서 끝까지 건너뛴다.
function skipMarkup(xml, lt) {
  const skip = SKIP.find(([open]) => xml.startsWith(open, lt));
  if (!skip) return -1;
  const close = xml.indexOf(skip[1], lt + skip[0].length);
  return close === -1 ? xml.length : close + skip[1].length;
}

// XML을 훑어 모든 요소의 구간을 문서 순서로 돌려준다.
// 각 항목: {name, depth, start, end, innerStart, innerEnd, empty}
// start~end 는 여는 꺾쇠부터 닫는 꺾쇠까지, innerStart~innerEnd 는 그 안쪽이다.
export function scanElements(xml) {
  const out = [];
  const stack = [];
  let i = 0;

  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;

    const after = skipMarkup(xml, lt);
    if (after !== -1) {
      i = after;
      continue;
    }

    const gt = findTagEnd(xml, lt);
    if (gt === -1) break;

    if (xml[lt + 1] === '/') {
      const name = xml.slice(lt + 2, gt).trim();
      // 짝이 맞는 가장 가까운 여는 태그까지 닫는다. 깨진 XML에서도 멈추지 않게 한다.
      for (let d = stack.length - 1; d >= 0; d--) {
        if (stack[d].name !== name) continue;
        const open = stack[d];
        open.innerEnd = lt;
        open.end = gt + 1;
        stack.length = d;
        break;
      }
      i = gt + 1;
      continue;
    }

    const selfClosing = xml[gt - 1] === '/';
    const name = readName(xml, lt + 1);
    const node = {
      name,
      depth: stack.length,
      start: lt,
      end: selfClosing ? gt + 1 : -1,
      innerStart: gt + 1,
      innerEnd: selfClosing ? gt + 1 : -1,
      empty: selfClosing,
    };
    out.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }

  // 닫히지 않은 채 끝난 요소는 문서 끝까지로 본다.
  for (const open of stack) {
    if (open.end === -1) {
      open.innerEnd = xml.length;
      open.end = xml.length;
    }
  }
  return out;
}

function findTagEnd(xml, lt) {
  let quote = '';
  for (let i = lt + 1; i < xml.length; i++) {
    const c = xml[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return -1;
}

function readName(xml, from) {
  let i = from;
  while (i < xml.length && !/[\s/>]/.test(xml[i])) i++;
  return xml.slice(from, i);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return body in ENTITIES ? ENTITIES[body] : whole;
  });
}

export function encodeXml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

// 구간 안의 글자만 모은다. 안에 있는 태그는 버리고 실체 참조는 되돌린다.
export function textOf(xml, start, end) {
  let out = '';
  let i = start;
  while (i < end) {
    const lt = xml.indexOf('<', i);
    if (lt === -1 || lt >= end) {
      out += xml.slice(i, end);
      break;
    }
    out += xml.slice(i, lt);
    const after = skipMarkup(xml, lt);
    if (after !== -1) {
      i = after;
      continue;
    }
    const gt = findTagEnd(xml, lt);
    i = gt === -1 ? end : gt + 1;
  }
  return decodeXml(out);
}

/**
 * start~end 구간을 베끼되 지정한 자리만 갈아 끼운 문자열을 돌려준다.
 * 겹치는 교체는 어느 쪽이 이겼는지 알 수 없으므로 조용히 뭉개지 않고 거절한다.
 * @param {Array<{start: number, end: number, text: string}>} edits
 */
export function spliceWithin(xml, start, end, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let cursor = start;
  for (const edit of sorted) {
    if (edit.start < cursor) throw Error('교체 구간이 겹칩니다.');
    out += xml.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return out + xml.slice(cursor, end);
}
