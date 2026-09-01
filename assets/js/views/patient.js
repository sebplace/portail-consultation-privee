// Portail patient. IMPORTANT : aucune règle interne visible (ni fréquence, ni
// marge, ni ancrage, ni nombre de rdv autorisés). Le patient voit uniquement
// les créneaux actuellement proposés. Inclut le formulaire de nouvelle demande.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, toast } from './dom.js';

let currentPatientId = null;

function proposedSlots(patient) {
  const now = new Date();
  const open = store.openSlots({ now });
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: patient.id, explicitAnchor: patient.anchorDate }).date;
  const { slots } = rules.compatibleSlots({ openSlots: open, anchor, cadence: patient.cadence, now });
  return slots;
}

function loginView(mount) {
  clear(mount);
  const codes = store.patients().map((p) => `${p.displayName} — code ${p.code}`).join(' · ');
  const input = el('input', { class: 'field', placeholder: 'Ex. ANNE-2026', 'aria-label': "Code d'accès" });
  const connect = () => {
    const p = store.patientByCode(input.value);
    if (!p) { toast('Code inconnu.', 'err'); return; }
    currentPatientId = p.id; render(mount);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  mount.appendChild(el('div', { class: 'card narrow' },
    el('h2', {}, 'Espace patient'),
    el('p', { class: 'muted' }, 'Cabinet du Dr Mathieu Place — psychiatre.'),
    el('p', { class: 'muted' }, "Accès par lien sécurisé personnel (démonstration : code d'accès)."),
    input,
    el('button', { class: 'btn btn-primary', onclick: connect }, 'Se connecter'),
    el('div', { class: 'sep' }),
    el('p', { class: 'muted small' }, "Vous n'êtes pas encore suivi(e) ?"),
    el('button', { class: 'btn btn-ghost', onclick: () => newDemandView(mount) }, 'Adresser une nouvelle demande'),
    el('p', { class: 'hint' }, 'Codes de démo : ' + codes),
  ));
}

function header(mount, patient) {
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Bonjour'), el('p', { class: 'muted' }, patient.displayName)),
    el('button', { class: 'btn btn-ghost', onclick: () => { currentPatientId = null; render(mount); } }, 'Se déconnecter'),
  ));
}

function slotGrid(slots, onPick) {
  if (slots.length === 0) {
    return el('div', { class: 'empty' },
      "Aucun créneau ne vous est proposé actuellement. Vous pouvez vous inscrire sur la liste de désistement, ou signaler une demande : le cabinet reviendra vers vous.");
  }
  const byDay = new Map();
  for (const s of slots) { const k = fmtDate(s); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s); }
  return el('div', { class: 'slot-days' },
    [...byDay.entries()].map(([day, list]) => el('div', { class: 'slot-day' },
      el('div', { class: 'slot-day-label' }, day),
      el('div', { class: 'slot-chips' }, list.map((s) => el('button', { class: 'chip', onclick: () => onPick(s) }, fmtTime(s)))),
    )),
  );
}

function bookView(mount, patient) {
  clear(mount); header(mount, patient);
  const slots = proposedSlots(patient);
  // Aucune mention de cadence/fenêtre/ancrage : on n'affiche QUE les créneaux.
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Choisir un rendez-vous'),
    el('p', { class: 'muted' }, 'Voici les créneaux qui vous sont proposés.'),
    slotGrid(slots, (s) => {
      const res = store.bookAppointment(patient.id, s.toISOString(), { actor: 'patient' });
      if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
      toast('Rendez-vous enregistré.'); render(mount);
    }),
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour')),
  ));
}

function moveView(mount, appointment, patient) {
  clear(mount); header(mount, patient);
  const now = new Date();
  const open = store.openSlots({ now });
  // Déplacement : mêmes créneaux proposés que la prise, sans révéler la logique.
  const slots = proposedSlots(patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Déplacer le rendez-vous'),
    el('p', { class: 'muted' }, `Actuellement : ${fmtDateTime(appointment.datetime)}.`),
    slotGrid(slots, (s) => {
      const check = rules.validateMove({ openSlots: open, newDate: s, now });
      if (!check.ok) { toast(check.reason, 'err'); return; }
      const res = store.moveAppointment(appointment.id, s.toISOString(), { actor: 'patient' });
      if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
      toast('Rendez-vous déplacé.'); render(mount);
    }),
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour')),
  ));
}

function requestView(mount, patient) {
  clear(mount); header(mount, patient);
  const typeSel = el('select', { class: 'field' }, store.REQUEST_TYPES.map((t) => el('option', { value: t.id }, t.label)));
  const note = el('textarea', { class: 'field', rows: '3', placeholder: "Votre message (visible uniquement dans l'espace sécurisé du médecin, jamais par e-mail)." });
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Signaler une demande'),
    el('p', { class: 'muted' }, 'Le médecin recevra une notification neutre (sans contenu). Il consultera votre message dans son espace sécurisé.'),
    el('label', { class: 'lbl' }, 'Type de demande'), typeSel,
    el('label', { class: 'lbl' }, 'Message (optionnel)'), note,
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
      el('button', { class: 'btn btn-primary', onclick: () => {
        store.addRequest(patient.id, typeSel.value, note.value);
        toast('Demande envoyée. Le médecin a été notifié.'); render(mount);
      } }, 'Envoyer la demande'),
    ),
  ));
}

function appointmentRow(mount, a, patient) {
  const canChange = new Date(a.datetime) > new Date();
  return el('div', { class: 'row-item' },
    el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
      el('div', { class: 'muted small' }, `${a.durationMin} min`)),
    el('div', { class: 'row-actions' },
      canChange ? el('button', { class: 'btn btn-ghost', onclick: () => moveView(mount, a, patient) }, 'Déplacer') : null,
      canChange ? el('button', { class: 'btn btn-ghost danger', onclick: () => {
        if (!confirm(`Annuler le rendez-vous du ${fmtDateTime(a.datetime)} ?`)) return;
        store.cancelAppointment(a.id, { actor: 'patient' }); toast('Rendez-vous annulé.'); render(mount);
      } }, 'Annuler') : null,
    ),
  );
}

// --- Formulaire de nouvelle demande (choix fermés + zone libre) ---
function newDemandView(mount) {
  clear(mount);
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Nouvelle demande'), el('p', { class: 'muted' }, 'Cabinet du Dr Mathieu Place')),
    el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
  ));
  const circuitSel = el('select', { class: 'field' }, store.circuits().map((c) => el('option', { value: c.id }, c.label)));
  const origineSel = el('select', { class: 'field' },
    el('option', { value: 'personnelle' }, 'Démarche personnelle'),
    el('option', { value: 'adresse' }, 'Adressé(e) par un professionnel'));
  const objectif = el('textarea', { class: 'field', rows: '2', placeholder: 'Objectif de la demande' });
  const adressePar = el('input', { class: 'field', placeholder: 'Professionnel qui adresse (si applicable)' });
  const relais = el('input', { class: 'field', placeholder: 'Relais prescripteur éventuel (médecin traitant, psychiatre…)' });
  const dispos = el('input', { class: 'field', placeholder: 'Vos disponibilités générales' });
  const note = el('textarea', { class: 'field', rows: '3', placeholder: 'Zone libre (facultatif)' });
  const ack = el('input', { type: 'checkbox' });

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'notice' }, "Le dépôt d'une demande ne garantit ni acceptation, ni rendez-vous, ni délai, ni ouverture d'un suivi régulier. Ce dispositif ne remplace pas les services d'urgence (112)."),
    el('label', { class: 'lbl' }, 'Circuit demandé'), circuitSel,
    el('label', { class: 'lbl' }, 'Origine de la démarche'), origineSel,
    el('label', { class: 'lbl' }, 'Objectif'), objectif,
    el('label', { class: 'lbl' }, 'Adressé(e) par'), adressePar,
    el('label', { class: 'lbl' }, 'Relais prescripteur éventuel'), relais,
    el('label', { class: 'lbl' }, 'Disponibilités'), dispos,
    el('label', { class: 'lbl' }, 'Précisions libres'), note,
    el('label', { class: 'check' }, ack, ' J\'ai pris connaissance des limites du dispositif.'),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-primary', onclick: () => {
        if (!ack.checked) { toast('Merci de valider la prise de connaissance des limites.', 'err'); return; }
        store.submitDemand({
          circuitId: circuitSel.value, origine: origineSel.value, objectif: objectif.value,
          adressePar: adressePar.value, relais: relais.value, dispos: dispos.value,
          note: note.value, ackLimites: true,
        });
        toast('Demande transmise. Le médecin l\'examinera.'); render(mount);
      } }, 'Transmettre la demande'),
    ),
  ));
}

function render(mount) {
  clear(mount);
  if (!currentPatientId) { loginView(mount); return; }
  const patient = store.patientById(currentPatientId);
  if (!patient) { currentPatientId = null; loginView(mount); return; }
  store.purgeWaitlist();
  header(mount, patient);

  const upcoming = store.appointmentsOf(patient.id).filter((a) => a.status === 'planifie')
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const onWaitlist = store.waitlist().some((w) => w.patientId === patient.id);

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, 'Mes rendez-vous'),
      el('button', { class: 'btn btn-primary', onclick: () => bookView(mount, patient) }, '+ Choisir un rendez-vous'),
    ),
    upcoming.length ? el('div', { class: 'list' }, upcoming.map((a) => appointmentRow(mount, a, patient)))
      : el('div', { class: 'empty' }, 'Aucun rendez-vous à venir.'),
  ));

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Autres actions')),
    el('div', { class: 'action-grid' },
      el('button', { class: 'btn btn-tile', onclick: () => requestView(mount, patient) },
        el('strong', {}, 'Signaler une demande'), el('span', { class: 'muted small' }, 'Parler, ordonnance, rapport…')),
      el('button', { class: 'btn btn-tile', onclick: () => {
        if (onWaitlist) { store.leaveWaitlist(patient.id); toast('Retiré de la liste de désistement.'); }
        else { store.joinWaitlist(patient.id, { actor: 'patient' }); toast('Inscrit sur la liste de désistement.'); }
        render(mount);
      } },
        el('strong', {}, onWaitlist ? 'Quitter la liste de désistement' : 'Liste de désistement'),
        el('span', { class: 'muted small' }, 'Avancer votre prochain rendez-vous si une place se libère')),
    ),
  ));

  mount.appendChild(el('div', { class: 'notice' },
    "Ce canal ne remplace pas les dispositifs d'urgence. En cas d'urgence, contactez le 112 ou les services d'urgence."));
}

export function mountPatient(node) { render(node); }
