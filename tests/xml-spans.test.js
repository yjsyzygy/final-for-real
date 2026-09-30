import test from 'node:test';
import assert from 'node:assert/strict';
import { scanElements, textOf, decodeXml, encodeXml, spliceWithin } from '../src/core/xml-spans.js';

const find = (xml, name) => scanElements(xml).filter((e) => e.name === name);

test('중첩된 같은 이름 요소를 문서 순서와 깊이로 구분한다', () => {
  const xml = '<root><p>겉<p>안</p>글</p><p>둘째</p></root>';
  const ps = find(xml, 'p');
  assert.equal(ps.length, 3);
  assert.deepEqual(ps.map((p) => p.depth), [1, 2, 1]);
  assert.equal(xml.slice(ps[1].innerStart, ps[1].innerEnd), '안');
  assert.equal(xml.slice(ps[2].innerStart, ps[2].innerEnd), '둘째');
  // 겉 문단의 구간은 중첩된 문단을 통째로 품는다.
  assert.equal(xml.slice(ps[0].innerStart, ps[0].innerEnd), '겉<p>안</p>글');
});

test('self-closing 태그는 내용이 없고 스택을 건드리지 않는다', () => {
  const xml = '<p>앞<br/>뒤</p>';
  const br = find(xml, 'br')[0];
  assert.equal(br.empty, true);
  assert.equal(br.innerStart, br.innerEnd);
  assert.equal(find(xml, 'p')[0].end, xml.length);
});

test('속성 안의 꺾쇠와 따옴표에 속지 않는다', () => {
  const xml = `<p a="1>2" b='3>4'>본문</p>`;
  const p = find(xml, 'p')[0];
  assert.equal(xml.slice(p.innerStart, p.innerEnd), '본문');
});

test('주석·CDATA·선언을 건너뛴다', () => {
  const xml = '<?xml version="1.0"?><!-- <p>가짜</p> --><root><![CDATA[<p>더가짜</p>]]><p>진짜</p></root>';
  const ps = find(xml, 'p');
  assert.equal(ps.length, 1);
  assert.equal(xml.slice(ps[0].innerStart, ps[0].innerEnd), '진짜');
});

test('textOf는 안쪽 태그를 버리고 실체 참조를 되돌린다', () => {
  const xml = '<p><t>한</t><tab/><t>글 &amp; 워드 &#48160;</t></p>';
  const p = find(xml, 'p')[0];
  assert.equal(textOf(xml, p.innerStart, p.innerEnd), '한글 & 워드 밠');
});

test('실체 참조를 되돌리고 되돌린 것을 다시 감쌀 수 있다', () => {
  assert.equal(decodeXml('&lt;a&gt; &quot;b&quot; &apos;c&apos; &#x41;'), `<a> "b" 'c' A`);
  assert.equal(encodeXml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  // 모르는 실체는 건드리지 않는다. 망가뜨리느니 그대로 두는 편이 낫다.
  assert.equal(decodeXml('&nbsp;'), '&nbsp;');
});

test('여러 구간을 한 번에 교체해도 앞쪽 위치가 밀리지 않는다', () => {
  const xml = '<p>하나</p><p>둘</p><p>셋</p>';
  const ps = find(xml, 'p');
  const edits = ps.map((p, i) => ({ start: p.innerStart, end: p.innerEnd, text: `바뀐${i}번` }));
  assert.equal(spliceWithin(xml, 0, xml.length, edits), '<p>바뀐0번</p><p>바뀐1번</p><p>바뀐2번</p>');
});

test('구간 밖은 건드리지 않고 그 안만 베껴 낸다', () => {
  const xml = '앞<p>속</p>뒤';
  const p = find(xml, 'p')[0];
  assert.equal(spliceWithin(xml, p.start, p.end, [{ start: p.innerStart, end: p.innerEnd, text: '새 글' }]),
    '<p>새 글</p>');
});

test('겹치는 교체는 조용히 망가뜨리지 않고 거부한다', () => {
  assert.throws(
    () => spliceWithin('0123456789', 0, 10, [{ start: 0, end: 5, text: 'a' }, { start: 3, end: 8, text: 'b' }]),
    /겹칩니다/,
  );
});

test('닫히지 않은 태그에서도 멈추지 않는다', () => {
  const xml = '<root><p>안 닫힘';
  const p = find(xml, 'p')[0];
  assert.equal(textOf(xml, p.innerStart, p.innerEnd), '안 닫힘');
});
