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

// Accessibilité : associe un libellé à un champ via for/id (id auto si absent).
// Retourne [label, input] afin de rester des frères directs (compatible grilles CSS).
let _autoId = 0;
export function field(labelText, input, labelClass = 'lbl') {
  if (!input.id) input.id = 'f-' + (++_autoId);
  return [el('label', { class: labelClass, for: input.id }, labelText), input];
}

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
  return `${wd} ${day}/${month}/${dt.getFullYear()} à ${hh}h${mm}`;
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
  if (!host) { host = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(host); }
  const t = el('div', { class: `toast toast-${kind}` }, msg);
  host.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

// Modale accessible (fermeture par Échap et clic sur le fond).
export function modal(title, bodyNodes, actionsNodes) {
  const back = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === back) close(); } });
  const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('h3', {}, title),
    el('div', {}, ...(Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes])),
    el('div', { class: 'row-actions end' }, ...(actionsNodes || [])),
  );
  back.appendChild(box);
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() { document.removeEventListener('keydown', onKey); back.remove(); }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  const focusable = box.querySelector('button, input, select, textarea, [tabindex]');
  if (focusable) setTimeout(() => focusable.focus(), 0);
  return { close, box };
}

// Confirmation stylée (remplace confirm()). Retourne une Promise<boolean>.
export function confirmDialog(message, { okLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = {}) {
  return new Promise((resolve) => {
    let m;
    const ok = el('button', { class: 'btn ' + (danger ? 'btn-ghost danger' : 'btn-primary'), onclick: () => { m.close(); resolve(true); } }, okLabel);
    const cancel = el('button', { class: 'btn btn-ghost', onclick: () => { m.close(); resolve(false); } }, cancelLabel);
    m = modal('Confirmation', [el('p', { class: 'pre-line' }, message)], [cancel, ok]);
  });
}

// Téléchargement d'un fichier texte (journal CSV, export d'état, .ics).
export function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Génère un fichier .ics pour un rendez-vous (ajout au calendrier personnel).
export function icsForAppointment({ title, start, durationMin, location = '', description = '' }) {
  const dt = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
  };
  const s = new Date(start);
  const e = new Date(s.getTime() + durationMin * 60000);
  const uid = `${dt(s)}-${Math.random().toString(36).slice(2)}@portail-demo`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Portail Demo//FR', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(s)}`, `DTEND:${dt(e)}`,
    `SUMMARY:${title}`, location ? `LOCATION:${location}` : '', description ? `DESCRIPTION:${description}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}
