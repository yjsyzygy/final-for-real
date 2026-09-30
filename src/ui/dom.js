/** 작은 DOM 도우미. 문자열로 HTML을 짓지 않으려고 둔다. 원고 글이 그대로 화면에 들어가므로
 *  innerHTML 을 쓰면 남의 문서 한 줄이 스크립트가 될 수 있다. */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    // textarea 는 value 속성을 보지 않는다. 속성으로 넣으면 다시 그릴 때마다 글이 사라진다.
    else if (key === 'value') node.value = value;
    else if (key in node && key !== 'list' && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  f.append(...children.flat().filter(Boolean));
  return f;
};
