// Routeur minimal : bascule Espace patient / Espace medecin.
import * as store from './core/store.js';
import { mountPatient } from './views/patient.js';
import { mountDoctor } from './views/doctor.js';
import { el, clear } from './views/dom.js';

store.load();

const app = document.getElementById('app');
let space = 'patient';

function switcher() {
  return el('div', { class: 'switcher' },
    el('button', { class: 'seg' + (space === 'patient' ? ' active' : ''), onclick: () => { space = 'patient'; render(); } }, 'Espace patient'),
    el('button', { class: 'seg' + (space === 'medecin' ? ' active' : ''), onclick: () => { space = 'medecin'; render(); } }, 'Espace médecin'),
  );
}

function render() {
  clear(app);
  const head = el('header', { class: 'topbar' },
    el('div', { class: 'brand' },
      el('div', { class: 'logo' }, '⌁'),
      el('div', {}, el('div', { class: 'brand-title' }, 'Portail de consultation'),
        el('div', { class: 'brand-sub' }, 'Prototype — agenda privé')),
    ),
    switcher(),
  );
  app.appendChild(head);
  const main = el('main', { class: 'container' });
  app.appendChild(main);
  if (space === 'patient') mountPatient(main);
  else mountDoctor(main);

  app.appendChild(el('footer', { class: 'foot' },
    'Prototype de démonstration · données fictives · aucune donnée réelle · stockage local du navigateur.'));
}

render();
