const PICKED = { old: '원문 유지', new: '수정 채택' };

// 엑셀은 큰따옴표를 두 번 써서 이스케이프한다. 줄바꿈이 든 칸도 따옴표로 감싸면 그대로 읽는다.
const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * 바뀐 문단만 뽑아 검토표로 만든다. 무엇을 왜 골랐는지 남겨 두려는 것이다.
 * @returns {Uint8Array} BOM 붙은 UTF-8. 없으면 엑셀이 한글을 깨뜨린다.
 */
export function changesToCsv(comparison, choices = {}) {
  const header = ['단락', '단락 첫 문장', '변경', '종류', '원문', '수정본', '선택'];
  const lines = [header.map(cell).join(',')];

  for (const scene of comparison.scenes) {
    for (const change of scene.changes) {
      lines.push([
        scene.number,
        scene.title,
        change.number,
        change.label,
        change.old.join('\n'),
        change.new.join('\n'),
        PICKED[choices[change.id]] ?? '미선택 (원문)',
      ].map(cell).join(','));
    }
  }

  return new TextEncoder().encode('\uFEFF' + lines.join('\r\n'));
}
