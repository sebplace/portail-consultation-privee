// Petits utilitaires DOM et formatage (aucune dependance).
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

const WD = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const WD_SHORT = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export function weekdayLabel(iso) { return WD[iso] || ''; }
export function weekdayShort(iso) { return WD_SHORT[iso] || ''; }

export function fmtDateTime(d) {
  const dt = new Date(d);
  const wd = WD[dt.getDay() === 0 ? 7 : dt.getDay()];
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${wd} ${day}/${month}/${dt.getFullYear()} a ${hh}h${mm}`;
}

export function fmtDate(d) {
  const dt = new Date(d);
  const wd = WD[dt.getDay() === 0 ? 7 : dt.getDay()];
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  return `${wd} ${day}/${month}/${dt.getFullYear()}`;
}

export function fmtTime(d) {
  const dt = new Date(d);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${hh}h${mm}`;
}

export function toast(msg, kind = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) { host = el('div', { class: 'toast-host' }); document.body.appendChild(host); }
  const t = el('div', { class: `toast toast-${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
