import { el } from './dom.js';

// 새 판을 낼 때마다 맨 위에 한 덩이씩 쌓는다.
const RELEASES = [
  {
    version: '0.2.1',
    date: '2026-10-02',
    notes: [
      '예문·설문 보기는 둘러보기로 엽니다. 홈으로 나갈 때 확인창이 뜨지 않습니다.',
      '예문을 본 뒤 다시 접속해 설문을 열면 확인창이 뜨고, 붙여넣기 탭에 설문 화면이 나오던 오류를 고쳤습니다.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-30',
    notes: [
      'HWPX와 DOCX에 든 표를 읽습니다. 표 안의 문단도 본문과 똑같이 비교하고 골라 합칩니다.',
      '표 하나가 단락 하나입니다. 한 줄씩 칸을 가로로 늘어놓아 보여 줍니다.',
      '두 원고의 표 개수가 다르면 비교를 열 때 알려 줍니다.',
      '표가 든 설문지 예문을 더했습니다.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-29',
    notes: [
      'HWPX·DOCX·TXT 원고 두 벌을 문단마다 비교하고 골라 합칩니다.',
      '고친 문단의 글자만 갈아 끼워 저장합니다. 글꼴·쪽 설정·스타일은 그대로입니다.',
      '파일 없이 글을 붙여넣어도 비교합니다. PDF에서 끊긴 줄은 「줄바꿈 정리」로 다시 연결합니다.',
      '바뀐 문단만 모아 검토표를 CSV로 내려받습니다.',
    ],
  },
];

export function renderPatchnotes() {
  return el('div', { class: 'scroll' },
    el('div', { class: 'patchnotes' },
      el('h1', { text: '패치노트' }),
      ...RELEASES.map((release) =>
        el('section', { class: 'release' },
          el('div', { class: 'release-head' },
            el('b', { text: release.version }),
            el('time', { datetime: release.date, text: release.date.replace(/-/g, '. ') }),
          ),
          el('ul', null, ...release.notes.map((note) => el('li', { text: note }))),
        )),
    ),
  );
}
