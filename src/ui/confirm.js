import { el } from './dom.js';

/**
 * 확인 창을 띄우고 눌린 쪽을 돌려준다.
 * 브라우저 기본 confirm 은 문구를 다듬을 수 없고 화면과 따로 논다.
 *
 * close 이벤트에 기대지 않는다. 일부 브라우저는 dialog.close() 로 창을 닫으면서도
 * close 를 쏘지 않아, 그 경우 답을 기다리는 쪽이 영영 멈춰 선다.
 * 버튼에서 직접 끝내고, Esc·바깥 클릭은 따로 받는다.
 *
 * @returns {Promise<boolean>} 진행하기를 누르면 true
 */
export function confirmDialog({ title, message, confirmLabel, cancelLabel = '취소' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('keydown', onKey);
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(ok);
    };
    // Esc 는 되돌릴 수 없는 쪽이 아니라 취소로 본다.
    const onKey = (event) => { if (event.key === 'Escape') finish(false); };

    const dialog = el('dialog', { 'aria-labelledby': 'confirm-title' },
      el('h2', { id: 'confirm-title', text: title }),
      el('p', { text: message }),
      el('div', { class: 'dialog-actions' },
        el('button', { onclick: () => finish(false) }, cancelLabel),
        el('button', { class: 'primary', onclick: () => finish(true) }, confirmLabel),
      ),
    );

    dialog.addEventListener('click', (event) => { if (event.target === dialog) finish(false); });
    dialog.addEventListener('cancel', () => finish(false));
    dialog.addEventListener('close', () => finish(false));
    dialog.addEventListener('keydown', onKey);

    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('.primary').focus();
  });
}
