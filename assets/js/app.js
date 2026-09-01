// Routeur minimal : bascule Patient / Secrétariat / Médecin.
import * as store from './core/store.js';
import { mountPatient } from './views/patient.js';
import { mountSecretary } from './views/secretary.js';
import { mountDoctor } from './views/doctor.js';
import { el, clear } from './views/dom.js';

store.load();

const app = document.getElementById('app');
let space = 'patient';

function switcher() {
  const seg = (id, label) => el('button', { class: 'seg' + (space === id ? ' active' : ''), onclick: () => { space = id; render(); } }, label);
  return el('div', { class: 'switcher' },
    seg('patient', 'Patient'),
    seg('secretariat', 'Secrétariat'),
    seg('medecin', 'Médecin'),
  );
}

function render() {
  clear(app);
  const head = el('header', { class: 'topbar' },
    el('div', { class: 'brand' },
      el('div', { class: 'logo' }, 'MP'),
      el('div', {}, el('div', { class: 'brand-title' }, 'Dr Mathieu Place'),
        el('div', { class: 'brand-sub' }, 'Psychiatre · consultation privée')),
    ),
    switcher(),
  );
  app.appendChild(head);
  const main = el('main', { class: 'container' });
  app.appendChild(main);
  if (space === 'patient') mountPatient(main);
  else if (space === 'secretariat') mountSecretary(main);
  else mountDoctor(main);

  app.appendChild(el('footer', { class: 'foot' },
    'Prototype de démonstration · données fictives · aucune donnée réelle · stockage local du navigateur.'));
}

render();
