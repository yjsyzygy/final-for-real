import { unzipSync, zipSync } from 'fflate';
import { scanElements, textOf, encodeXml, spliceWithin } from './xml-spans.js';
import { MAX_BYTES } from './txt.js';

const decode = (bytes) => new TextDecoder('utf-8').decode(bytes);
const encode = (text) => new TextEncoder().encode(text);

/**
 * HWPX와 DOCX는 둘 다 ZIP 안에 본문 XML이 든 같은 꼴이다. 다른 점만 여기 적는다.
 *
 * 본문 XML은 문자열 그대로 들고 다니며 바뀐 문단의 글자만 갈아 끼운다. 트리로 파싱해
 * 다시 직렬화하면 속성 순서·네임스페이스·self-closing 표기가 흔들려 한글이나 워드가
 * 파일을 거부할 수 있다.
 */
const SPECS = {
  hwpx: {
    label: 'HWPX',
    body: /^Contents\/section\d+\.xml$/,
    order: (a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]),
    marker: 'Contents/header.xml',
    notThis: 'HWPX 파일이 아닙니다. 한글에서 ‘다른 이름으로 저장’ → HWPX를 선택해 주세요.',
    broken: 'HWPX 파일을 열지 못했습니다. 한글에서 HWPX로 다시 저장해 주세요.',
    p: 'hp:p',
    t: 'hp:t',
    run: 'hp:run',
    // 한글이 계산해 둔 줄 배치 기록. 글이 바뀌면 어긋나므로 버리고 다시 계산하게 둔다.
    drop: ['hp:linesegarray'],
    stripAttrs: [],
    // 쪽 크기·여백이 구역 첫 문단 안에 들어 있다. 그 문단이 지워져도 설정은 옮겨 심는다.
    carry: 'hp:secPr',
    table: 'hp:tbl',
    row: 'hp:tr',
    cell: 'hp:tc',
    writeText: (node, escaped) => ({ start: node.innerStart, end: node.innerEnd, text: escaped }),
    buildRun(xml, node, escaped) {
      // 빈 문단은 <hp:run charPrIDRef="7"/> 처럼 글자 상자가 없다. run 을 펼쳐 안을 만든다.
      const run = node.runs[0];
      if (run && run.empty) {
        const open = xml.slice(run.start, run.end).replace(/\s*\/>$/, '>');
        return { start: run.start, end: run.end, text: `${open}<hp:t>${escaped}</hp:t></hp:run>` };
      }
      if (run) return { start: run.innerStart, end: run.innerStart, text: `<hp:t>${escaped}</hp:t>` };
      return {
        start: node.innerStart,
        end: node.innerStart,
        text: `<hp:run charPrIDRef="0"><hp:t>${escaped}</hp:t></hp:run>`,
      };
    },
  },

  docx: {
    label: 'DOCX',
    body: /^word\/document\.xml$/,
    order: () => 0,
    marker: 'word/document.xml',
    notThis: 'DOCX 파일이 아닙니다. 워드에서 .docx 로 다시 저장해 주세요.',
    broken: 'DOCX 파일을 열지 못했습니다. 워드에서 다시 저장해 주세요.',
    p: 'w:p',
    t: 'w:t',
    run: 'w:r',
    drop: [],
    // sectPr 이 마지막 문단 뒤에 따로 있어 꼬리에 그대로 남는다. 옮길 것이 없다.
    carry: null,
    table: 'w:tbl',
    row: 'w:tr',
    cell: 'w:tc',
    // 문단 식별자는 베껴 쓰면 겹친다. 지우면 워드가 다시 매긴다.
    stripAttrs: ['w14:paraId', 'w14:textId'],
    // xml:space 없이는 워드가 앞뒤 공백을 버린다.
    writeText: (node, escaped) => ({
      start: node.start,
      end: node.end,
      text: `<w:t xml:space="preserve">${escaped}</w:t>`,
    }),
    buildRun(xml, node, escaped) {
      // 빈 문단에는 run 이 아예 없다. 문단 끝 글자 모양(pPr/rPr)을 본떠 하나 만든다.
      const pPr = node.children.find((e) => e.name === 'w:pPr');
      const rPr = node.children.find((e) => e.name === 'w:rPr' && pPr && e.start > pPr.start && e.end <= pPr.end);
      const props = rPr ? xml.slice(rPr.start, rPr.end) : '';
      const at = pPr ? pPr.end : node.innerStart;
      return { start: at, end: at, text: `<w:r>${props}<w:t xml:space="preserve">${escaped}</w:t></w:r>` };
    },
  },
};

/** ZIP 안 문서를 읽어 문단 목록과, 같은 파일로 되쓰기 위한 원본 조각을 돌려준다. */
export function readZipDoc(bytes, name, format) {
  const spec = SPECS[format];
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length > MAX_BYTES) throw Error('파일 하나당 30 MB까지 읽을 수 있습니다.');

  let files;
  try {
    files = unzipSync(data);
  } catch {
    throw Error(spec.broken);
  }
  if (!files[spec.marker]) throw Error(spec.notThis);

  const keys = Object.keys(files).filter((k) => spec.body.test(k)).sort(spec.order);
  if (!keys.length) throw Error(`${spec.label} 본문을 찾지 못했습니다.`);

  const bodies = keys.map((key) => {
    const xml = decode(files[key]);
    return { key, xml, ...paragraphNodes(xml, spec) };
  });

  const paragraphs = [];
  const index = [];
  const inTable = [];
  const tableRow = [];
  const tableCell = [];
  bodies.forEach((body, b) =>
    body.nodes.forEach((node, p) => {
      paragraphs.push(node.text);
      index.push([b, p]);
      inTable.push(node.inTable);
      // 구역이 여럿이면 자리 번호가 겹친다. 구역 번호를 앞에 붙여 구분한다.
      tableRow.push(node.tableRow === null ? null : `${b}:${node.tableRow}`);
      tableCell.push(node.tableCell === null ? null : `${b}:${node.tableCell}`);
    }));

  // 표는 선택으로 늘리거나 줄일 수 없다. 저장할 때 틀로 쓴 원고의 구성을 그대로 따르므로,
  // 두 원고의 표 개수가 다르면 미리 알려야 한다.
  const tables = bodies.reduce((n, body) => n + countElements(body.xml, spec.table), 0);

  return { name, format, paragraphs, inTable, tableRow, tableCell, tables, source: { files, bodies, index, spec } };
}

/**
 * 문단을 찾아 두 가지를 함께 기록한다.
 *
 * 하나는 문단끼리의 품고 품기는 관계다. 표 안에는 칸마다 문단이 또 들어간다.
 * 다른 하나는 이어 붙은 문단 덩어리(run)다. 표를 사이에 둔 본문 문단은 서로 다른
 * 덩어리가 되고, 덩어리와 덩어리 사이에 있는 것은 저장할 때 원본 그대로 베낀다.
 * 이렇게 해야 문단 수가 바뀌어도 표가 제자리에 남는다.
 */
const countElements = (xml, name) =>
  scanElements(xml).filter((e) => e.name === name).length;

function paragraphNodes(xml, spec) {
  const all = scanElements(xml);
  const paras = all.filter((e) => e.name === spec.p);

  // 표 안에 있는 문단은 따로 표시해 둔다. 칸과 칸 사이의 빈 줄까지 단락 경계로 세면
  // 표 한 칸이 단락 하나가 되어 목록이 쓸모없어진다.
  const tables = all.filter((e) => e.name === spec.table);
  // 같은 표 줄에 속한 칸을 알아보려면 줄의 자리를 같이 들고 있어야 한다.
  const tableRows = all.filter((e) => e.name === spec.row);
  // 한 칸 안에 문단이 여럿 들어가기도 한다. 「매우」와 「보수적이다」처럼 줄을 나눠 쓴 경우다.
  // 문단을 칸으로 세면 없는 칸이 생겨 표가 어긋난다.
  const tableCells = all.filter((e) => e.name === spec.cell);

  const nodes = paras.map((node, i) => {
    // 가장 가까이 품고 있는 문단. 표 칸 안의 문단이면 그 표를 담은 문단이 된다.
    let parent = -1;
    for (let k = 0; k < i; k++) {
      if (paras[k].start < node.start && node.end <= paras[k].end) parent = k;
    }
    const inner = paras.filter((p) => p !== node && p.start >= node.innerStart && p.end <= node.innerEnd);
    const owns = (e) =>
      e.start >= node.innerStart && e.end <= node.innerEnd &&
      !inner.some((n) => e.start >= n.start && e.end <= n.end);

    const children = all.filter(owns);
    const texts = children.filter((e) => e.name === spec.t);

    return {
      index: i,
      parent,
      inTable: tables.some((t) => t.start < node.start && node.end <= t.end),
      tableRow: tableRows.findLast((r) => r.start < node.start && node.end <= r.end)?.start ?? null,
      tableCell: tableCells.findLast((c) => c.start < node.start && node.end <= c.end)?.start ?? null,
      start: node.start,
      end: node.end,
      innerStart: node.innerStart,
      openTag: xml.slice(node.start, node.innerStart),
      text: texts.map((t) => textOf(xml, t.innerStart, t.innerEnd)).join(''),
      texts,
      runs: children.filter((e) => e.name === spec.run),
      drop: children.filter((e) => spec.drop.includes(e.name)),
      children,
      childRuns: [],
      runIndex: -1,
    };
  });

  const groups = [];
  for (const node of nodes) {
    const last = groups[groups.length - 1];
    const joined = last && last.parent === node.parent && !xml.slice(last.end, node.start).trim();
    if (joined) {
      last.nodes.push(node.index);
      last.end = node.end;
    } else {
      groups.push({ parent: node.parent, nodes: [node.index], start: node.start, end: node.end });
    }
    node.runIndex = groups.length - 1;
  }
  groups.forEach((group, g) => {
    if (group.parent !== -1) nodes[group.parent].childRuns.push(g);
  });

  return { nodes, groups };
}

/**
 * 고른 문단으로 같은 형식의 파일을 다시 만든다.
 * @param {Array<{text: string, a: number|null, b: number|null}>} outputs 저장할 문단
 * @param {'a'|'b'} indexKey outputs 의 어느 번호가 이 원고의 문단 번호인지
 */
export function writeZipDoc(source, outputs, indexKey) {
  const { files, bodies, index, spec } = source;
  const plans = bodies.map(() => []);

  // 문단마다 서식을 물려받을 본보기 노드를 고른다. 이 원고에서 온 문단은 제 노드를,
  // 반대쪽 원고에서 온 문단은 바로 앞 문단의 노드를 따라 서식이 갑자기 끊기지 않게 한다.
  let last = [0, 0];
  for (const out of outputs) {
    const own = out?.[indexKey];
    const at = own !== null && own !== undefined && index[own] ? index[own] : last;
    last = at;
    plans[at[0]].push({ node: bodies[at[0]].nodes[at[1]], text: out.text ?? '' });
  }

  const result = { ...files };
  bodies.forEach((body, b) => {
    result[body.key] = encode(rebuild(body, plans[b], spec));
  });
  return zipSync(result, { level: 6 });
}

function rebuild(body, plan, spec) {
  const { xml, nodes, groups } = body;
  if (!nodes.length) return xml;

  const byGroup = new Map();
  for (const item of plan) {
    const g = item.node.runIndex;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(item);
  }

  // 한 노드를 여러 문단의 본보기로 쓸 때(문장 나눔) 그 안의 표까지 베끼면 표가 늘어난다.
  // 처음 한 번만 속을 들고 가고, 이어지는 사본은 껍데기만 쓴다.
  const spent = new Set();
  const renderGroup = (g) => {
    const items = byGroup.get(g) || [];
    if (!items.length) {
      // 표 칸에 문단이 하나도 없으면 문서가 깨진다. 빈 문단 하나는 남긴다.
      const keep = groups[g].parent === -1 ? null : nodes[groups[g].nodes[0]];
      return keep ? renderParagraph(xml, keep, '', spec, groups, renderGroup, spent) : '';
    }
    return items.map(({ node, text }) => renderParagraph(xml, node, text, spec, groups, renderGroup, spent)).join('');
  };

  let out = '';
  let cursor = 0;
  let first = true;
  groups.forEach((group, g) => {
    if (group.parent !== -1) return;
    let block = renderGroup(g);
    if (first && block) {
      block = carrySection(block, xml, nodes[0], spec);
      first = false;
    }
    out += xml.slice(cursor, group.start) + block;
    cursor = group.end;
  });
  return out + xml.slice(cursor);
}

/**
 * HWPX 는 쪽 크기·여백을 구역 첫 문단 안에 둔다. 그 문단이 표였다가 지워지는 일도 있어서,
 * 첫 노드를 통째로 끌어다 쓰는 대신 설정 덩이만 떼어 새 첫 문단에 옮겨 심는다.
 */
function carrySection(block, xml, firstNode, spec) {
  if (!spec.carry || block.includes(`<${spec.carry}`)) return block;
  const source = firstNode.children.find((e) => e.name === spec.carry);
  if (!source) return block;

  const section = xml.slice(source.start, source.end);
  const runAt = block.indexOf(`<${spec.run}`);
  if (runAt !== -1) {
    const inside = block.indexOf('>', runAt) + 1;
    // 빈 run 이면 펼쳐서 안에 담는다.
    if (block[inside - 2] === '/') {
      const open = block.slice(runAt, inside).replace(/\s*\/>$/, '>');
      return block.slice(0, runAt) + open + section + `</${spec.run}>` + block.slice(inside);
    }
    return block.slice(0, inside) + section + block.slice(inside);
  }
  const opened = block.indexOf('>') + 1;
  return block.slice(0, opened) + `<${spec.run} charPrIDRef="0">${section}</${spec.run}>` + block.slice(opened);
}

/** 본보기 문단을 그대로 베끼되 글자만 갈아 끼운다. */
function renderParagraph(xml, node, text, spec, groups, renderGroup, spent) {
  const escaped = encodeXml(text);
  const edits = [];

  if (node.texts.length) {
    // 첫 글자 상자에 전부 몰아넣고 나머지는 비운다.
    // 한계: 문단 안에서 부분마다 다른 서식은 잃는다. 되살리려면 바뀐 구간을 글자 단위로
    // 되짚어 상자마다 나눠 넣어야 한다. 건드리지 않은 문단은 원본 그대로 남는다.
    edits.push(spec.writeText(node.texts[0], escaped));
    for (const t of node.texts.slice(1)) edits.push({ start: t.innerStart, end: t.innerEnd, text: '' });
  } else if (text) {
    edits.push(spec.buildRun(xml, node, escaped));
  }

  for (const junk of node.drop) edits.push({ start: junk.start, end: junk.end, text: '' });

  // 안에 품은 문단 덩어리(표 칸 등)는 따로 다시 그려 끼운다. 그 사이의 표 뼈대는 손대지 않는다.
  const first = !spent.has(node.index);
  spent.add(node.index);
  for (const g of node.childRuns) {
    const span = groups[g];
    edits.push({ start: span.start, end: span.end, text: first ? renderGroup(g) : '' });
  }

  const open = stripAttributes(node.openTag, spec.stripAttrs);
  if (open !== node.openTag) edits.push({ start: node.start, end: node.innerStart, text: open });

  return spliceWithin(xml, node.start, node.end, edits);
}

function stripAttributes(openTag, names) {
  let out = openTag;
  for (const name of names) {
    out = out.replace(new RegExp(`\\s${name}="[^"]*"`, 'g'), '');
  }
  return out;
}
