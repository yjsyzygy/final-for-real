import { el } from './dom.js';
import { state, effectiveTheme, toggleTheme, changeFontSize, FONT_RANGE } from '../state.js';

const svg = (...paths) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '2');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    node.append(path);
  }
  return node;
};

const MOON = () => svg('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z');
const SUN = () => svg(
  'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  'M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
);

/**
 * 어느 화면에서나 같은 자리에 있는 위쪽 띠.
 * 글자 크기 조절은 비교 화면에서만 보인다. 메인에는 키울 본문이 없어 눌러도 달라지는 게 없다.
 */
export function renderTopbar(page, go) {
  const dark = effectiveTheme() === 'dark';
  const [min, max] = FONT_RANGE;

  const link = (target, label) =>
    el('button', {
      class: 'text',
      'aria-current': page === target ? 'page' : null,
      onclick: () => go(target),
    }, label);

  return el('header', { class: 'topbar' },
    el('button', { class: 'home-link', onclick: () => go('home') }, '최종_진짜최종'),
    el('span', { class: 'grow' }),

    page !== 'compare' ? link('example', '예문 보기') : null,
    link('patchnotes', '패치노트'),

    page === 'compare'
      ? el('div', { class: 'font-group' },
        el('button', {
          onclick: () => changeFontSize(-1),
          disabled: state.fontSize <= min,
          'aria-label': '본문 글자 작게',
        }, 'A−'),
        el('output', { text: String(state.fontSize), 'aria-label': '본문 글자 크기' }),
        el('button', {
          onclick: () => changeFontSize(1),
          disabled: state.fontSize >= max,
          'aria-label': '본문 글자 크게',
        }, 'A+'),
      )
      : null,

    el('button', {
      class: 'icon-btn',
      onclick: toggleTheme,
      title: dark ? '밝은 화면으로' : '어두운 화면으로',
      'aria-label': dark ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기',
    }, dark ? SUN() : MOON()),
  );
}
