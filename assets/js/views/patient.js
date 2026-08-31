// Portail patient : connexion par code (demo), prochains rdv, prise / deplacement /
// annulation dans les creneaux compatibles, liste de desistement, signalement d'une demande.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, toast } from './dom.js';

let currentPatientId = null;

function lastReferenceDate(patientId) {
  // Dernier rdv effectif (done ou booked) le plus recent, sinon aujourd'hui.
  const appts = store.appointmentsOf(patientId)
    .filter((a) => a.status === 'done' || a.status === 'booked')
    .map((a) => new Date(a.datetime))
    .sort((a, b) => b - a);
  return appts[0] || new Date();
}

function loginView(mount) {
  clear(mount);
  const codes = store.patients().map((p) => `${p.displayName} — code ${p.code}`).join(' · ');
  const input = el('input', { class: 'field', placeholder: 'Ex. ANNE-2026', 'aria-label': 'Code d\'acces' });
  const card = el('div', { class: 'card narrow' },
    el('h2', {}, 'Espace patient'),
    el('p', { class: 'muted' }, 'Connexion par code d\'acces personnel (demonstration).'),
    input,
    el('button', { class: 'btn btn-primary', onclick: () => {
      const p = store.patientByCode(input.value);
      if (!p) { toast('Code inconnu.', 'err'); return; }
      currentPatientId = p.id;
      render(mount);
    } }, 'Se connecter'),
    el('p', { class: 'hint' }, 'Codes de demo : ' + codes),
  );
  mount.appendChild(card);
}

function appointmentRow(mount, a, patient) {
  const now = new Date();
  const canMove = new Date(a.datetime) > now;
  return el('div', { class: 'row-item' },
    el('div', {},
      el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
      el('div', { class: 'muted small' }, `${a.durationMin} min${a.exception ? ' · exception' : ''}`),
    ),
    el('div', { class: 'row-actions' },
      canMove ? el('button', { class: 'btn btn-ghost', onclick: () => moveView(mount, a, patient) }, 'Deplacer') : null,
      canMove ? el('button', { class: 'btn btn-ghost danger', onclick: () => {
        store.cancelAppointment(a.id);
        toast('Rendez-vous annule.');
        render(mount);
      } }, 'Annuler') : null,
    ),
  );
}

function slotGrid(slots, onPick) {
  if (slots.length === 0) {
    return el('div', { class: 'empty' }, 'Aucun creneau compatible avec votre rythme de suivi pour le moment. Vous pouvez signaler une demande ci-dessous.');
  }
  const byDay = new Map();
  for (const s of slots) {
    const k = fmtDate(s);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  return el('div', { class: 'slot-days' },
    [...byDay.entries()].map(([day, list]) => el('div', { class: 'slot-day' },
      el('div', { class: 'slot-day-label' }, day),
      el('div', { class: 'slot-chips' },
        list.map((s) => el('button', { class: 'chip', onclick: () => onPick(s) }, fmtTime(s))),
      ),
    )),
  );
}

function bookView(mount, patient) {
  clear(mount);
  const ref = lastReferenceDate(patient.id);
  const { window: win, slots } = rules.compatibleSlots({
    rule: patient.rule, lastDate: ref, allBooked: store.bookedAppointments(), now: new Date(),
  });
  header(mount, patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Prendre un rendez-vous'),
    el('p', { class: 'muted' }, `Creneaux proposes entre le ${fmtDate(win.from)} et le ${fmtDate(win.to)} (cible : ${fmtDate(win.target)}), selon votre rythme.`),
    slotGrid(slots, (s) => {
      store.bookAppointment(patient.id, s.toISOString(), patient.rule.durationMin);
      toast('Rendez-vous enregistre.');
      render(mount);
    }),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
    ),
  ));
}

function moveView(mount, appointment, patient) {
  clear(mount);
  const patientAppts = store.appointmentsOf(patient.id);
  // Fenetre autour du rdv precedent.
  const others = patientAppts.filter((a) => a.status === 'booked' && a.id !== appointment.id)
    .map((a) => new Date(a.datetime)).sort((a, b) => a - b);
  const nd = new Date(appointment.datetime);
  const prev = others.filter((d) => d < nd).pop();
  const ref = prev || lastReferenceDate(patient.id);
  const { slots } = rules.compatibleSlots({
    rule: patient.rule, lastDate: ref, allBooked: store.bookedAppointments(),
    now: new Date(), excludeAppointmentId: appointment.id,
  });
  header(mount, patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Deplacer le rendez-vous'),
    el('p', { class: 'muted' }, `Actuellement : ${fmtDateTime(appointment.datetime)}. Nouveau creneau (dans la fourchette coherente) :`),
    slotGrid(slots, (s) => {
      const check = rules.validateMove({
        rule: patient.rule, appointment, newDate: s,
        patientAppointments: patientAppts, allBooked: store.bookedAppointments(), now: new Date(),
      });
      if (!check.ok) { toast(check.reason, 'err'); return; }
      store.moveAppointment(appointment.id, s.toISOString());
      toast('Rendez-vous deplace.');
      render(mount);
    }),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
    ),
  ));
}

function requestView(mount, patient) {
  clear(mount);
  const typeSel = el('select', { class: 'field' },
    store.REQUEST_TYPES.map((t) => el('option', { value: t.id }, t.label)));
  const note = el('textarea', { class: 'field', rows: '3', placeholder: 'Votre message (visible uniquement dans l\'espace securise du medecin, jamais par e-mail).' });
  header(mount, patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Signaler une demande'),
    el('p', { class: 'muted' }, 'Le medecin recevra une notification neutre (sans contenu). Il consultera votre message dans son espace securise.'),
    el('label', { class: 'lbl' }, 'Type de demande'), typeSel,
    el('label', { class: 'lbl' }, 'Message (optionnel)'), note,
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
      el('button', { class: 'btn btn-primary', onclick: () => {
        store.addRequest(patient.id, typeSel.value, note.value);
        toast('Demande envoyee. Le medecin a ete notifie.');
        render(mount);
      } }, 'Envoyer la demande'),
    ),
  ));
}

function header(mount, patient) {
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Bonjour'), el('p', { class: 'muted' }, patient.displayName)),
    el('button', { class: 'btn btn-ghost', onclick: () => { currentPatientId = null; render(mount); } }, 'Se deconnecter'),
  ));
}

function render(mount) {
  clear(mount);
  if (!currentPatientId) { loginView(mount); return; }
  const patient = store.patientById(currentPatientId);
  if (!patient) { currentPatientId = null; loginView(mount); return; }
  header(mount, patient);

  const upcoming = store.appointmentsOf(patient.id)
    .filter((a) => a.status === 'booked')
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const onWaitlist = store.waitlist().some((w) => w.patientId === patient.id);

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, 'Mes rendez-vous'),
      el('button', { class: 'btn btn-primary', onclick: () => bookView(mount, patient) }, '+ Prendre un rendez-vous'),
    ),
    upcoming.length ? el('div', { class: 'list' }, upcoming.map((a) => appointmentRow(mount, a, patient)))
      : el('div', { class: 'empty' }, 'Aucun rendez-vous a venir.'),
  ));

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, 'Autres actions'),
    ),
    el('div', { class: 'action-grid' },
      el('button', { class: 'btn btn-tile', onclick: () => requestView(mount, patient) },
        el('strong', {}, 'Signaler une demande'),
        el('span', { class: 'muted small' }, 'Parler, ordonnance, rapport...')),
      el('button', { class: 'btn btn-tile', onclick: () => {
        if (onWaitlist) { store.leaveWaitlist(patient.id); toast('Retire de la liste de desistement.'); }
        else { store.joinWaitlist(patient.id); toast('Inscrit sur la liste de desistement.'); }
        render(mount);
      } },
        el('strong', {}, onWaitlist ? 'Quitter la liste de desistement' : 'Liste de desistement'),
        el('span', { class: 'muted small' }, 'Etre prevenu si un creneau plus tot se libere')),
    ),
  ));

  mount.appendChild(el('div', { class: 'notice' },
    'Ce canal ne remplace pas les dispositifs d\'urgence. En cas d\'urgence, contactez le 112 ou les services d\'urgence.'));
}

export function mountPatient(node) { render(node); }
