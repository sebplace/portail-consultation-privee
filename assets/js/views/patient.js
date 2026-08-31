// Portail patient : connexion par code (démo), prochains rendez-vous, prise /
// déplacement / annulation dans les créneaux compatibles, liste de désistement,
// signalement d'une demande. Le paramètre « rendez-vous à l'avance » agit comme
// un plafond du nombre total de rendez-vous futurs simultanés.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, toast } from './dom.js';

let currentPatientId = null;

function lastReferenceDate(patientId) {
  // Dernier rendez-vous effectif (réalisé ou programmé) le plus récent, sinon aujourd'hui.
  const appts = store.appointmentsOf(patientId)
    .filter((a) => a.status === 'done' || a.status === 'booked')
    .map((a) => new Date(a.datetime))
    .sort((a, b) => b - a);
  return appts[0] || new Date();
}

function loginView(mount) {
  clear(mount);
  const codes = store.patients().map((p) => `${p.displayName} — code ${p.code}`).join(' · ');
  const input = el('input', { class: 'field', placeholder: 'Ex. ANNE-2026', 'aria-label': "Code d'accès" });
  const connect = () => {
    const p = store.patientByCode(input.value);
    if (!p) { toast('Code inconnu.', 'err'); return; }
    currentPatientId = p.id;
    render(mount);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  const card = el('div', { class: 'card narrow' },
    el('h2', {}, 'Espace patient'),
    el('p', { class: 'muted' }, "Connexion par code d'accès personnel (démonstration)."),
    input,
    el('button', { class: 'btn btn-primary', onclick: connect }, 'Se connecter'),
    el('p', { class: 'hint' }, 'Codes de démo : ' + codes),
  );
  mount.appendChild(card);
}

function appointmentRow(mount, a, patient) {
  const now = new Date();
  const canChange = new Date(a.datetime) > now;
  return el('div', { class: 'row-item' },
    el('div', {},
      el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
      el('div', { class: 'muted small' }, `${a.durationMin} min${a.exception ? ' · exception' : ''}`),
    ),
    el('div', { class: 'row-actions' },
      canChange ? el('button', { class: 'btn btn-ghost', onclick: () => moveView(mount, a, patient) }, 'Déplacer') : null,
      canChange ? el('button', { class: 'btn btn-ghost danger', onclick: () => {
        if (!confirm(`Annuler le rendez-vous du ${fmtDateTime(a.datetime)} ?`)) return;
        store.cancelAppointment(a.id);
        toast('Rendez-vous annulé.');
        render(mount);
      } }, 'Annuler') : null,
    ),
  );
}

function slotGrid(slots, onPick) {
  if (slots.length === 0) {
    return el('div', { class: 'empty' }, "Aucun créneau compatible avec votre rythme de suivi pour le moment. Vous pouvez signaler une demande ci-dessous : le médecin décidera s'il faut ouvrir une place.");
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

function capBanner(patient, future) {
  const cap = patient.rule.bookAhead;
  return el('div', { class: 'notice info' },
    `Vous avez ${future.length} rendez-vous à venir sur un maximum de ${cap}. `
    + "Pour en reprendre un nouveau, un rendez-vous devra d'abord passer ou être annulé.");
}

function bookView(mount, patient) {
  clear(mount);
  header(mount, patient);
  const future = store.futureAppointmentsOf(patient.id);
  if (rules.bookingCapReached(store.appointments(), patient, new Date())) {
    mount.appendChild(el('div', { class: 'card' },
      el('h3', {}, 'Prendre un rendez-vous'),
      capBanner(patient, future),
      el('div', { class: 'row-actions end' },
        el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
      ),
    ));
    return;
  }
  const ref = lastReferenceDate(patient.id);
  const { window: win, slots } = rules.compatibleSlots({
    rule: patient.rule, lastDate: ref, allBooked: store.bookedAppointments(), now: new Date(),
  });
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Prendre un rendez-vous'),
    el('p', { class: 'muted' }, `Ancrage du calcul : dernier rendez-vous du ${fmtDate(ref)}.`),
    el('p', { class: 'muted' }, `Créneaux proposés entre le ${fmtDate(win.from)} et le ${fmtDate(win.to)} (cible : ${fmtDate(win.target)}), selon votre rythme.`),
    slotGrid(slots, (s) => {
      const res = store.bookAppointment(patient.id, s.toISOString(), patient.rule.durationMin);
      if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
      toast('Rendez-vous enregistré.');
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
    el('h3', {}, 'Déplacer le rendez-vous'),
    el('p', { class: 'muted' }, `Actuellement : ${fmtDateTime(appointment.datetime)}. Nouveau créneau (dans la fourchette cohérente) :`),
    slotGrid(slots, (s) => {
      const check = rules.validateMove({
        rule: patient.rule, appointment, newDate: s,
        patientAppointments: patientAppts, allBooked: store.bookedAppointments(), now: new Date(),
      });
      if (!check.ok) { toast(check.reason, 'err'); return; }
      store.moveAppointment(appointment.id, s.toISOString());
      toast('Rendez-vous déplacé.');
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
  const note = el('textarea', { class: 'field', rows: '3', placeholder: "Votre message (visible uniquement dans l'espace sécurisé du médecin, jamais par e-mail)." });
  header(mount, patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Signaler une demande'),
    el('p', { class: 'muted' }, 'Le médecin recevra une notification neutre (sans contenu). Il consultera votre message dans son espace sécurisé.'),
    el('label', { class: 'lbl' }, 'Type de demande'), typeSel,
    el('label', { class: 'lbl' }, 'Message (optionnel)'), note,
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
      el('button', { class: 'btn btn-primary', onclick: () => {
        store.addRequest(patient.id, typeSel.value, note.value);
        toast('Demande envoyée. Le médecin a été notifié.');
        render(mount);
      } }, 'Envoyer la demande'),
    ),
  ));
}

function header(mount, patient) {
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Bonjour'), el('p', { class: 'muted' }, patient.displayName)),
    el('button', { class: 'btn btn-ghost', onclick: () => { currentPatientId = null; render(mount); } }, 'Se déconnecter'),
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
  const future = store.futureAppointmentsOf(patient.id);
  const capReached = rules.bookingCapReached(store.appointments(), patient, new Date());
  const onWaitlist = store.waitlist().some((w) => w.patientId === patient.id);

  const bookBtn = el('button', {
    class: 'btn btn-primary', disabled: capReached ? '' : null,
    title: capReached ? `Plafond de ${patient.rule.bookAhead} rendez-vous à venir atteint.` : null,
    onclick: () => bookView(mount, patient),
  }, '+ Prendre un rendez-vous');

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, 'Mes rendez-vous'),
      bookBtn,
    ),
    el('p', { class: 'muted small' }, `${future.length} rendez-vous à venir · plafond : ${patient.rule.bookAhead}`),
    capReached ? capBanner(patient, future) : null,
    upcoming.length ? el('div', { class: 'list' }, upcoming.map((a) => appointmentRow(mount, a, patient)))
      : el('div', { class: 'empty' }, 'Aucun rendez-vous à venir.'),
  ));

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Autres actions')),
    el('div', { class: 'action-grid' },
      el('button', { class: 'btn btn-tile', onclick: () => requestView(mount, patient) },
        el('strong', {}, 'Signaler une demande'),
        el('span', { class: 'muted small' }, 'Parler, ordonnance, rapport…')),
      el('button', { class: 'btn btn-tile', onclick: () => {
        if (onWaitlist) { store.leaveWaitlist(patient.id); toast('Retiré de la liste de désistement.'); }
        else { store.joinWaitlist(patient.id); toast('Inscrit sur la liste de désistement.'); }
        render(mount);
      } },
        el('strong', {}, onWaitlist ? 'Quitter la liste de désistement' : 'Liste de désistement'),
        el('span', { class: 'muted small' }, "Être prévenu si un créneau plus tôt se libère")),
    ),
  ));

  mount.appendChild(el('div', { class: 'notice' },
    "Ce canal ne remplace pas les dispositifs d'urgence. En cas d'urgence, contactez le 112 ou les services d'urgence."));
}

export function mountPatient(node) { render(node); }
