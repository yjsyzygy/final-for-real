import { parseHTML } from 'linkedom';

/**
 * 화면 코드를 브라우저 없이 돌리기 위한 최소한의 환경.
 * 모듈을 불러오기 전에 전역을 세워야 한다. state.js 는 불러오는 순간
 * localStorage 를 읽고, topbar.js 는 document 로 아이콘을 만든다.
 */
export function setupDom() {
  const { window, document } = parseHTML(
    '<!doctype html><html><head></head><body><div id="app"></div></body></html>',
  );

  const store = new Map();
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };

  Object.assign(globalThis, {
    window,
    document,
    localStorage,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    DocumentFragment: window.DocumentFragment,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });

  return { window, document, localStorage };
}

export const click = (node) => node.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

export const type = (node, value) => {
  node.value = value;
  node.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
};

export const $ = (selector) => globalThis.document.querySelector(selector);
export const $$ = (selector) => [...globalThis.document.querySelectorAll(selector)];
export const textOf = (nodes) => nodes.map((n) => n.textContent);
