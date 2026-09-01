// Routeur : rôle dans l'URL (hash), thème clair/sombre, langue, en-tête commun.
import * as store from './core/store.js';
import * as i18n from './i18n.js';
import { mountPatient } from './views/patient.js';
import { mountSecretary } from './views/secretary.js';
import { mountDoctor } from './views/doctor.js';
import { el, clear, toast } from './views/dom.js';

// Numéro de version affiché et utilisé pour repérer les mises à jour du cache.
export const APP_VERSION = 'v7';

store.load();

const app = document.getElementById('app');
const ROLES = ['patient', 'secretariat', 'medecin'];

function currentSpace() {
  const h = (location.hash || '').replace('#', '').split('/')[0];
  return ROLES.includes(h) ? h : 'patient';
}
function go(space) { location.hash = space; }

function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('pcp.theme', next); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', next === 'dark' ? '#0e1420' : '#3a5bd9');
  render();
}

function switcher() {
  const space = currentSpace();
  const seg = (id) => el('button', { class: 'seg' + (space === id ? ' active' : ''), 'aria-current': space === id ? 'page' : null, onclick: () => go(id) }, i18n.t('role.' + id));
  return el('div', { class: 'switcher', role: 'tablist', 'aria-label': 'Rôle' }, seg('patient'), seg('secretariat'), seg('medecin'));
}

function langSelect() {
  const sel = el('select', { class: 'lang-select', 'aria-label': i18n.t('lang.label'), title: i18n.t('lang.label') },
    i18n.langs().map(([code, label]) => el('option', { value: code, selected: i18n.getLang() === code ? '' : null }, label)));
  sel.addEventListener('change', () => { i18n.setLang(sel.value); render(); });
  return sel;
}

function render() {
  clear(app);
  const space = currentSpace();
  const skip = document.querySelector('.skip-link'); if (skip) skip.textContent = i18n.t('skip');
  const themeBtn = el('button', { class: 'theme-btn', title: i18n.t('theme.toggle'), 'aria-label': i18n.t('theme.toggle'), onclick: toggleTheme }, currentTheme() === 'dark' ? '☀️' : '🌙');

  const right = el('div', { class: 'header-right' }, switcher(), i18n.langs().length > 1 ? langSelect() : null, themeBtn);
  // Cloche de décisions + undo (uniquement côté médecin).
  if (space === 'medecin') {
    const count = store.pendingDecisionsCount();
    const bell = el('button', { class: 'theme-btn', title: 'Décisions en attente', 'aria-label': 'Décisions en attente', onclick: () => { location.hash = 'medecin'; window.dispatchEvent(new CustomEvent('goto-decisions')); } }, '🔔', count ? el('span', { class: 'bell-badge' }, String(count)) : null);
    const undoBtn = el('button', { class: 'theme-btn', title: 'Annuler la dernière action', 'aria-label': 'Annuler', disabled: store.canUndo() ? null : '', onclick: () => { const r = store.undo(); if (r.ok) { toast('Action annulée : ' + (r.label || '')); render(); } } }, '↶');
    right.insertBefore(undoBtn, right.firstChild);
    right.insertBefore(bell, right.firstChild);
  }

  const head = el('header', { class: 'topbar' },
    el('div', { class: 'brand' },
      el('div', { class: 'logo' }, 'MP'),
      el('div', {}, el('div', { class: 'brand-title' }, 'Dr Mathieu Place'),
        el('div', { class: 'brand-sub' }, i18n.t('brand.sub'))),
    ),
    right,
  );
  app.appendChild(head);
  const main = el('main', { class: 'container', id: 'contenu' });
  app.appendChild(main);
  if (space === 'patient') mountPatient(main);
  else if (space === 'secretariat') mountSecretary(main);
  else mountDoctor(main);

  app.appendChild(el('footer', { class: 'foot' }, i18n.t('foot') + ' · Version ' + APP_VERSION));
}

window.addEventListener('hashchange', render);
// Rafraîchit l'en-tête (cloche, undo) à chaque changement d'état.
let rerenderQueued = false;
store.subscribe(() => { if (rerenderQueued) return; rerenderQueued = true; queueMicrotask(() => { rerenderQueued = false; render(); }); });
render();
