// dom.js — a tiny element builder. Text is always set as text, never as HTML,
// so nothing from the feeds can inject markup.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/** Text with <b>…</b> only, turned into nodes. For the About copy, which is ours, not the feeds'. */
export function rich(str) {
  const out = [];
  const re = /<b>(.*?)<\/b>/g;
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(document.createTextNode(str.slice(last, m.index)));
    out.push(h("b", null, m[1]));
    last = re.lastIndex;
  }
  if (last < str.length) out.push(document.createTextNode(str.slice(last)));
  return out;
}
