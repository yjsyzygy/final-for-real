import './style.css';
import { state, setRenderer, applyTheme, hasUnsavedWork } from './state.js';
import { renderTopbar } from './ui/topbar.js';
import { renderHome, openExample } from './ui/home.js';
import { renderWorkspace } from './ui/workspace.js';
import { renderPatchnotes } from './ui/patchnotes.js';
import { confirmDialog } from './ui/confirm.js';

const app = document.getElementById('app');
const HASH = { home: '', compare: '#compare', patchnotes: '#patchnotes' };
const PAGE = { '#compare': 'compare', '#patchnotes': 'patchnotes' };

/**
 * 어느 화면인지는 state 가 쥐고, 주소는 뒤따라 적기만 한다.
 * 한 장짜리 오프라인 판처럼 주소를 바꿀 수 없는 자리에서도 화면은 움직여야 한다.
 */
function setPage(target) {
  state.page = target;
  try {
    if (location.hash !== HASH[target]) location.hash = HASH[target];
  } catch {
    // 주소를 못 바꾸는 자리라도 화면 전환까지 막히지는 않게 한다.
  }
}

function currentPage() {
  // 비교할 원고가 없는데 비교 화면으로 들어오면 보여 줄 것이 없다.
  return state.page === 'compare' && !state.comparison ? 'home' : state.page;
}

/**
 * 비교 화면을 떠나기 전에 한 번 묻는다.
 * 화면을 옮기는 것만으로 검토 내용이 사라지지는 않는다. 다만 합친 결과를 아직
 * 내려받지 않았다면, 브라우저를 닫는 순간 원고를 다시 올려야 한다는 점은 알려야 한다.
 */
export async function confirmLeave() {
  if (!hasUnsavedWork() || currentPage() !== 'compare') return true;
  return confirmDialog({
    title: '합친 원고를 아직 내려받지 않았습니다',
    message: '지금 나가도 검토 내용은 남아 있어 메인의 「이어서 비교」로 돌아올 수 있습니다. '
      + '다만 브라우저를 닫으면 원고를 처음부터 다시 올려야 합니다.',
    confirmLabel: '나가기',
  });
}

export async function goTo(target) {
  // 비교 화면으로 들어가는 길은 떠나는 게 아니다. 새 원고를 열 때 묻지 않는다.
  if (target !== 'compare' && !(await confirmLeave())) return;
  if (target === 'example') return openExample();
  setPage(target);
  render();
}

function render() {
  const page = currentPage();
  // 원고 없이 비교 화면을 가리키던 상태(새로 접속한 #compare 등)는 홈으로 바로잡는다.
  // 그대로 두면 다음에 여는 원고가 「떠나기」로 잡혀 확인창이 뜨고, 탭만 눌러도 그 원고가 튀어나온다.
  if (page !== state.page) setPage(page);
  const view = page === 'compare' ? renderWorkspace()
    : page === 'patchnotes' ? renderPatchnotes()
      : renderHome();
  app.replaceChildren(renderTopbar(page, goTo), view);
}

setRenderer(render, goTo);

// 뒤로 가기처럼 주소가 밖에서 바뀐 경우에만 state 를 맞춘다.
window.addEventListener('hashchange', () => {
  const page = PAGE[location.hash] || 'home';
  if (page === state.page) return;
  state.page = page;
  render();
});

window.addEventListener('beforeunload', (event) => {
  // 고른 것을 내려받지 않은 채 창을 닫으면 되살릴 길이 없다.
  if (hasUnsavedWork()) event.preventDefault();
});

// 운영체제 설정을 따라가는 중이라면, 설정이 바뀔 때 화면도 따라 바뀐다.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!state.theme) { applyTheme(); render(); }
});

state.page = PAGE[location.hash] || 'home';
applyTheme();
render();
