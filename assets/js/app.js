// Routeur : rôle dans l'URL (hash), thème clair/sombre, en-tête commun.
import * as store from './core/store.js';
import { mountPatient } from './views/patient.js';
import { mountSecretary } from './views/secretary.js';
import { mountDoctor } from './views/doctor.js';
import { el, clear } from './views/dom.js';

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
  const seg = (id, label) => el('button', { class: 'seg' + (space === id ? ' active' : ''), 'aria-current': space === id ? 'page' : null, onclick: () => go(id) }, label);
  return el('div', { class: 'switcher', role: 'tablist', 'aria-label': 'Rôle' },
    seg('patient', 'Patient'),
    seg('secretariat', 'Secrétariat'),
    seg('medecin', 'Médecin'),
  );
}

function render() {
  clear(app);
  const space = currentSpace();
  const themeBtn = el('button', {
    class: 'theme-btn', title: currentTheme() === 'dark' ? 'Passer en clair' : 'Passer en sombre',
    'aria-label': 'Basculer le thème', onclick: toggleTheme,
  }, currentTheme() === 'dark' ? '☀️' : '🌙');

  const head = el('header', { class: 'topbar' },
    el('div', { class: 'brand' },
      el('div', { class: 'logo' }, 'MP'),
      el('div', {}, el('div', { class: 'brand-title' }, 'Dr Mathieu Place'),
        el('div', { class: 'brand-sub' }, 'Psychiatre · consultation privée')),
    ),
    el('div', { class: 'header-right' }, switcher(), themeBtn),
  );
  app.appendChild(head);
  const main = el('main', { class: 'container', id: 'contenu' });
  app.appendChild(main);
  if (space === 'patient') mountPatient(main);
  else if (space === 'secretariat') mountSecretary(main);
  else mountDoctor(main);

  app.appendChild(el('footer', { class: 'foot' },
    'Prototype de démonstration · données fictives · aucune donnée réelle · stockage local du navigateur.'));
}

window.addEventListener('hashchange', render);
render();
