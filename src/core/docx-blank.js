import { zipSync } from 'fflate';

// DOCX 원고 없이 DOCX로 내보낼 때 쓰는 빈 문서다.
// HWPX는 글꼴·문단 모양 정의가 header.xml 에 수십 KB로 들어가 맨손으로 짓기 어렵지만,
// DOCX는 부품 셋이면 워드가 연다. 그래서 파일을 싸들고 다니지 않고 여기서 만든다.

const xml = (body) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;

const CONTENT_TYPES = xml(
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>');

const RELS = xml(
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>');

// 본보기가 될 문단 하나와 A4 쪽 설정. 문단의 rPr 이 글꼴을 정하고, 새로 만드는 run 이
// 이걸 본떠 간다. 한글 글꼴을 지정하지 않으면 워드가 라틴 글꼴로 한글을 그린다.
const DOCUMENT = xml(
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:body>' +
  '<w:p><w:pPr><w:rPr>' +
  '<w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/>' +
  '<w:sz w:val="20"/><w:szCs w:val="20"/>' +
  '</w:rPr></w:pPr></w:p>' +
  '<w:sectPr>' +
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1701" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/>' +
  '</w:sectPr>' +
  '</w:body></w:document>');

const encode = (text) => new TextEncoder().encode(text);

export function blankDocx() {
  return zipSync({
    '[Content_Types].xml': encode(CONTENT_TYPES),
    '_rels/.rels': encode(RELS),
    'word/document.xml': encode(DOCUMENT),
  }, { level: 6 });
}
