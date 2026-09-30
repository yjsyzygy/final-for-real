import { diffArrays, diffChars } from 'diff';

// 문단 하나가 한 줄, 빈 문단이 경계다. 연속된 빈 문단도 경계 하나로 본다.
// 빈 줄로 나뉜 문단 묶음을 코드에서는 scene, 화면에서는 '단락'이라고 부른다.
const blank = (text) => !text || !text.trim();

/**
 * 두 원고를 문단 단위로 맞춰 본다.
 *
 * 먼저 문단 배열을 통째로 정렬해 행(row)을 만든다. 한 행은 원문 문단과 수정본
 * 문단의 짝이며, 한쪽이 없으면 null이다. 이어서 달라진 행이 연달아 나오는 구간을
 * 변경(change) 하나로 묶는다. 문장 나눔처럼 1:2로 갈라진 곳을 한 번에 고르게 하려는 것이다.
 */
export function compareDocuments(original, revised) {
  const rows = alignRows(original.paragraphs, revised.paragraphs);
  const changes = groupChanges(rows, original.paragraphs, revised.paragraphs);
  const scenes = splitScenes(rows, changes, original, revised);

  return {
    original: summary(original),
    revised: summary(revised),
    paragraphs: { old: original.paragraphs, new: revised.paragraphs },
    tableRow: { old: original.tableRow || [], new: revised.tableRow || [] },
    tableCell: { old: original.tableCell || [], new: revised.tableCell || [] },
    rows,
    changes,
    scenes,
    totalChanges: changes.length,
  };
}

function summary(doc) {
  return {
    name: doc.name,
    format: doc.format,
    paragraphs: doc.paragraphs.length,
    characters: doc.paragraphs.reduce((n, p) => n + p.length, 0),
    notes: doc.notes || [],
  };
}

function alignRows(a, b) {
  const rows = [];
  let ai = 0;
  let bi = 0;
  // diffArrays 는 지운 덩어리와 더한 덩어리를 따로 내놓는다. 짝지을 수 있는 만큼
  // 같은 행에 올려야 좌우가 나란히 보인다.
  const parts = diffArrays(a, b);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      for (let k = 0; k < part.count; k++) rows.push({ a: ai++, b: bi++, equal: true });
      continue;
    }
    if (part.removed) {
      const next = parts[i + 1];
      const paired = next && next.added ? Math.min(part.count, next.count) : 0;
      for (let k = 0; k < paired; k++) rows.push({ a: ai++, b: bi++, equal: false });
      for (let k = paired; k < part.count; k++) rows.push({ a: ai++, b: null, equal: false });
      if (next && next.added) {
        for (let k = paired; k < next.count; k++) rows.push({ a: null, b: bi++, equal: false });
        i++;
      }
      continue;
    }
    for (let k = 0; k < part.count; k++) rows.push({ a: null, b: bi++, equal: false });
  }
  return rows;
}

function groupChanges(rows, a, b) {
  const changes = [];
  const add = (start, end) => {
    const slice = rows.slice(start, end);
    const oldText = slice.filter((r) => r.a !== null).map((r) => a[r.a]);
    const newText = slice.filter((r) => r.b !== null).map((r) => b[r.b]);
    const id = 'c' + (changes.length + 1);
    for (const row of slice) row.change = id;
    changes.push({
      id,
      number: changes.length + 1,
      rowStart: start,
      rowEnd: end,
      old: oldText,
      new: newText,
      kind: !oldText.join('') ? 'added' : !newText.join('') ? 'deleted' : 'modified',
      label: describe(oldText, newText),
      inline: inlineDiff(oldText, newText),
    });
  };

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].equal) continue;
    const start = i;
    while (i + 1 < rows.length && !rows[i + 1].equal) i++;
    const run = rows.slice(start, i + 1);
    // 좌우가 하나씩 짝지어진 구간은 문단마다 따로 고를 수 있어야 한다.
    // 한쪽이 비어 있는 행이 섞이면 문장 나눔·합침이므로 통째로 한 번에 고른다.
    if (run.every((r) => r.a !== null && r.b !== null)) {
      for (let k = 0; k < run.length; k++) add(start + k, start + k + 1);
    } else {
      add(start, i + 1);
    }
  }
  return changes;
}

function describe(oldText, newText) {
  if (!oldText.length) return '문단 추가';
  if (!newText.length) return '문단 삭제';
  if (oldText.length === newText.length) return oldText.length === 1 ? '문구 수정' : '여러 문단 수정';
  return oldText.length < newText.length
    ? `문장 나눔 (${oldText.length} → ${newText.length}문단)`
    : `문장 합침 (${oldText.length} → ${newText.length}문단)`;
}

// 1:1로 맞춰진 문단만 글자 단위로 견준다. 문단 수가 다르면 어느 글자가 어느 글자로
// 바뀐 것인지 단정할 수 없어, 통째로 바뀐 것으로 보여 주는 편이 덜 헷갈린다.
function inlineDiff(oldText, newText) {
  if (oldText.length !== newText.length) return null;
  return oldText.map((left, i) => diffChars(left, newText[i]));
}

function splitScenes(rows, changes, original, revised) {
  const a = original.paragraphs;
  const b = revised.paragraphs;
  const byId = new Map(changes.map((c) => [c.id, c]));
  const scenes = [];
  let current = null;

  // 표 칸과 칸 사이에도 빈 문단이 들어간다. 그것까지 경계로 세면 표 한 칸이 단락 하나가 되어
  // 목록이 「매우」, 「보통」 같은 조각으로 뒤덮인다. 표 안의 빈 줄은 단락을 나누지 않는다.
  const inTable = (row) =>
    (row.a !== null && original.inTable?.[row.a]) || (row.b !== null && revised.inTable?.[row.b]);

  const flush = () => {
    if (current && current.rows.length) scenes.push(finish(current, scenes.length, byId, a, b));
    current = null;
  };

  for (const row of rows) {
    const left = row.a === null ? '' : a[row.a];
    const right = row.b === null ? '' : b[row.b];
    if (blank(left) && blank(right) && !inTable(row)) {
      flush();
      continue;
    }
    if (!current) current = { rows: [] };
    current.rows.push(row);
  }
  flush();
  return scenes;
}

function finish(scene, index, byId, a, b) {
  const ids = [...new Set(scene.rows.map((r) => r.change).filter(Boolean))];
  // splitScenes 가 양쪽 다 빈 행은 걸러 내므로 반드시 찾는다.
  const first = scene.rows.find((r) => (r.a !== null && a[r.a].trim()) || (r.b !== null && b[r.b].trim()));
  return {
    id: 's' + (index + 1),
    number: index + 1,
    title: (first.a !== null ? a[first.a] : b[first.b]).trim().slice(0, 60),
    rows: scene.rows,
    changes: ids.map((id) => byId.get(id)),
  };
}

/**
 * 고른 대로 합친 문단 목록을 만든다.
 * choices[changeId] 가 'new' 면 수정본, 그 밖에는 원문이다. 미선택은 원문으로 남는다.
 */
export function mergeParagraphs(comparison, choices = {}) {
  const { rows, changes, paragraphs } = comparison;
  const byId = new Map(changes.map((c) => [c.id, c]));
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.equal) {
      out.push({ text: paragraphs.old[row.a], from: 'equal', a: row.a, b: row.b });
      continue;
    }
    // 변경 묶음은 통째로 한 번만 펼친다.
    const change = byId.get(row.change);
    const take = choices[change.id] === 'new' ? 'new' : 'old';
    const rowsOfChange = rows.slice(change.rowStart, change.rowEnd)
      .filter((r) => (take === 'new' ? r.b !== null : r.a !== null));
    for (const r of rowsOfChange) {
      out.push({
        text: take === 'new' ? paragraphs.new[r.b] : paragraphs.old[r.a],
        from: take,
        a: r.a,
        b: r.b,
        change: change.id,
      });
    }
    i = change.rowEnd - 1;
  }
  return out;
}
