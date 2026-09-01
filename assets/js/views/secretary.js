// Rôle SECRÉTARIAT (limité). Peut : rechercher une personne, réserver / déplacer /
// annuler pour elle, l'inscrire au désistement, encoder présence/absence/annulation,
// encoder l'urgence 12:15 après accord tracé du médecin.
// Ne peut PAS : lire les commentaires cliniques, modifier une cadence/contrainte,
// accepter/refuser une demande, prolonger un parcours, ouvrir une exception clinique.
// Toutes les opérations sont journalisées.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, toast, modal, confirmDialog, downloadText } from './dom.js';

let selectedId = null;

function proposedSlots(patient) {
  const now = new Date();
  const open = store.openSlots({ now });
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: patient.id, explicitAnchor: patient.anchorDate }).date;
  const { slots } = rules.compatibleSlots({ openSlots: open, anchor, cadence: patient.cadence, now });
  return slots;
}

function searchCard(mount) {
  const input = el('input', { class: 'field', placeholder: 'Nom ou code patient', 'aria-label': 'Recherche patient' });
  const results = el('div', { class: 'list' });
  const run = () => {
    clear(results);
    const q = (input.value || '').trim().toLowerCase();
    const found = store.patients().filter((p) =>
      !q || p.displayName.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    if (!found.length) { results.appendChild(el('div', { class: 'empty' }, 'Aucun résultat.')); return; }
    found.forEach((p) => results.appendChild(el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, p.displayName), el('div', { class: 'muted small' }, `code ${p.code}`)),
      el('button', { class: 'btn btn-ghost', onclick: () => { selectedId = p.id; render(mount); } }, 'Ouvrir'),
    )));
  };
  input.addEventListener('input', run);
  const card = el('div', { class: 'card' }, el('h3', {}, 'Rechercher une personne'), input, results);
  setTimeout(run, 0);
  return card;
}

function bookForView(mount, patient) {
  clear(mount); head(mount);
  const slots = proposedSlots(patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, `Réserver pour ${patient.displayName}`),
    el('p', { class: 'muted' }, 'Créneaux proposés (mêmes règles que côté patient).'),
    slots.length ? el('div', { class: 'slot-days' }, groupDays(slots, (s) => {
      const res = store.bookAppointment(patient.id, s.toISOString(), { actor: 'secretariat' });
      if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
      toast('Rendez-vous réservé (secrétariat).'); render(mount);
    })) : el('div', { class: 'empty' }, 'Aucun créneau proposé actuellement.'),
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour')),
  ));
}

function groupDays(slots, onPick) {
  const byDay = new Map();
  for (const s of slots) { const k = fmtDate(s); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s); }
  return [...byDay.entries()].map(([day, list]) => el('div', { class: 'slot-day' },
    el('div', { class: 'slot-day-label' }, day),
    el('div', { class: 'slot-chips' }, list.map((s) => el('button', { class: 'chip', onclick: () => onPick(s) }, fmtTime(s)))),
  ));
}

function moveForView(mount, patient, appt) {
  clear(mount); head(mount);
  const now = new Date();
  const open = store.openSlots({ now });
  const slots = proposedSlots(patient);
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, `Déplacer le rendez-vous de ${patient.displayName}`),
    el('p', { class: 'muted' }, `Actuellement : ${fmtDateTime(appt.datetime)}.`),
    slots.length ? el('div', { class: 'slot-days' }, groupDays(slots, (s) => {
      const check = rules.validateMove({ openSlots: open, newDate: s, now });
      if (!check.ok) { toast(check.reason, 'err'); return; }
      const res = store.moveAppointment(appt.id, s.toISOString(), { actor: 'secretariat' });
      if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
      toast('Rendez-vous déplacé (secrétariat).'); render(mount);
    })) : el('div', { class: 'empty' }, 'Aucun créneau proposé.'),
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour')),
  ));
}

function patientPanel(mount, patient) {
  const now = new Date();
  const appts = store.appointmentsOf(patient.id)
    .filter((a) => ['planifie', 'effectue', 'absent'].includes(a.status))
    .sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  const onWaitlist = store.waitlist().some((w) => w.patientId === patient.id);
  // Garde-fou désistement : accessible uniquement si un rendez-vous futur planifié existe.
  const hasFuturePlanned = appts.some((a) => new Date(a.datetime) > now && a.status === 'planifie');
  const emgAuths = store.pendingEmergencyAuth().filter((e) => e.patientId === patient.id);

  const rows = appts.map((a) => {
    const future = new Date(a.datetime) > now && a.status === 'planifie';
    return el('div', { class: 'row-item stack' },
      el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
        el('div', { class: 'muted small' }, store.STATUS_LABEL[a.status] + (a.emergency ? ' · urgence' : ''))),
      el('div', { class: 'row-actions wrap' },
        future ? el('button', { class: 'btn btn-ghost', onclick: () => moveForView(mount, patient, a) }, 'Déplacer') : null,
        future ? el('button', { class: 'btn btn-ghost danger', onclick: () => cancelForReason(mount, a) }, 'Annuler') : null,
        // Présence administrative : effectué / absent (jamais automatique)
        (a.status === 'planifie') ? el('button', { class: 'btn btn-ghost', onclick: () => { store.setStatus(a.id, 'effectue', { actor: 'secretariat' }); toast('Marqué effectué.'); render(mount); } }, 'Présent') : null,
        (a.status === 'planifie') ? el('button', { class: 'btn btn-ghost', onclick: () => { store.setStatus(a.id, 'absent', { actor: 'secretariat' }); toast('Marqué absent.'); render(mount); } }, 'Absent') : null,
      ),
    );
  });

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, patient.displayName),
      el('button', { class: 'btn btn-ghost', onclick: () => { selectedId = null; render(mount); } }, 'Fermer'),
    ),
    el('div', { class: 'muted small' }, `code ${patient.code}`),
    el('div', { class: 'row-actions wrap top' },
      el('button', { class: 'btn btn-primary', onclick: () => bookForView(mount, patient) }, 'Réserver'),
      (onWaitlist || hasFuturePlanned)
        ? el('button', { class: 'btn btn-ghost', onclick: () => {
            if (onWaitlist) { store.leaveWaitlist(patient.id); toast('Retiré du désistement.'); }
            else { const r = store.joinWaitlist(patient.id, { actor: 'secretariat' }); if (r && r.error) { toast(r.message, 'err'); return; } toast('Inscrit au désistement.'); }
            render(mount);
          } }, onWaitlist ? 'Retirer du désistement' : 'Inscrire au désistement')
        : el('button', { class: 'btn btn-ghost', disabled: '', title: "Uniquement pour une personne ayant un rendez-vous à venir à avancer." }, 'Désistement indisponible'),
      el('button', { class: 'btn btn-ghost', onclick: () => toast("Lien d'accès (ré)envoyé (simulation).") }, "Aider à l'accès"),
    ),
    emgAuths.length ? el('div', { class: 'notice info' },
      el('div', {}, 'Urgence 12:15 autorisée par le médecin — à encoder :'),
      el('div', { class: 'row-actions wrap' }, emgAuths.map((e) => el('button', { class: 'btn btn-primary', onclick: () => {
        const r = store.useEmergencyAuth(e.id, { actor: 'secretariat' });
        if (r && r.error) { toast('Autorisation invalide.', 'err'); } else { toast('Urgence 12:15 encodée.'); }
        render(mount);
      } }, `Encoder ${fmtDateTime(e.datetime)}`))),
    ) : null,
    el('div', { class: 'sep' }),
    el('div', { class: 'muted small' }, 'Rendez-vous (aucun commentaire clinique visible)'),
    rows.length ? el('div', { class: 'list' }, rows) : el('div', { class: 'empty' }, 'Aucun rendez-vous.'),
  );
}

// Annulation avec motif par le secrétariat.
function cancelForReason(mount, a) {
  const reason = el('input', { class: 'field', placeholder: 'Motif (optionnel)' });
  const m = modal(`Annuler — ${fmtDateTime(a.datetime)}`, [el('label', { class: 'lbl' }, 'Motif'), reason], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Retour'),
    el('button', { class: 'btn btn-ghost danger', onclick: () => { store.cancelAppointment(a.id, { actor: 'secretariat', reason: reason.value }); m.close(); toast('Rendez-vous annulé.'); render(mount); } }, "Confirmer l'annulation"),
  ]);
}

// Agenda du jour, imprimable / exportable.
function dayAgenda(mount) {
  const now = new Date();
  const today = store.appointments().filter((a) => a.status === 'planifie' && fmtDate(a.datetime) === fmtDate(now))
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const rows = today.map((a) => `${fmtTime(a.datetime)}  ${store.patientById(a.patientId)?.displayName || a.patientId}  (${a.durationMin} min)`);
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, `Agenda du jour — ${fmtDate(now)}`),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-ghost', onclick: () => confirmDialog("L'impression de l'agenda contient des données personnelles (fictives ici). En production, ces impressions devront être encadrées. Continuer ?", { okLabel: 'Continuer' }).then((ok) => { if (ok) window.print(); }) }, '🖨️ Imprimer'),
        el('button', { class: 'btn btn-ghost', onclick: () => confirmDialog("L'export de l'agenda contient des données personnelles (fictives ici). En production, ces exports devront être encadrés. Continuer ?", { okLabel: 'Continuer' }).then((ok) => { if (ok) { downloadText('agenda-du-jour.txt', `Agenda du ${fmtDate(now)}\n\n` + (rows.join('\n') || 'Aucun rendez-vous.'), 'text/plain;charset=utf-8'); toast('Agenda exporté.'); } }) }, 'Exporter'),
      ),
    ),
    today.length ? el('div', { class: 'list' }, today.map((a) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, `${fmtTime(a.datetime)} — ${store.patientById(a.patientId)?.displayName || a.patientId}`),
        el('div', { class: 'muted small' }, `${a.durationMin} min${a.emergency ? ' · urgence' : ''}`)),
    ))) : el('div', { class: 'empty' }, 'Aucun rendez-vous aujourd\'hui.'),
  );
}

function head(mount) {
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Secrétariat'),
      el('p', { class: 'muted' }, 'Accès limité — aucune donnée clinique. Opérations journalisées.')),
  ));
}

// Bandeau global des urgences 12:15 autorisées par le médecin (accord tracé).
// Le secrétariat ne peut encoder l'urgence qu'ici, après accord explicite et journalisé.
function emergencyBanner(mount) {
  const auths = store.pendingEmergencyAuth();
  if (!auths.length) return null;
  return el('div', { class: 'notice warn' },
    el('div', {}, el('strong', {}, `Urgence 12:15 — ${auths.length} accord(s) du médecin à encoder`)),
    el('div', { class: 'muted small' }, "Ce créneau n'est jamais proposé automatiquement. Il s'encode uniquement après accord explicite et tracé du médecin."),
    el('div', { class: 'row-actions wrap', style: 'margin-top:6px' }, auths.map((e) => {
      const p = store.patientById(e.patientId);
      return el('button', { class: 'btn btn-primary', onclick: () => {
        const r = store.useEmergencyAuth(e.id, { actor: 'secretariat' });
        if (r && r.error) toast('Autorisation invalide.', 'err'); else toast('Urgence 12:15 encodée.');
        render(mount);
      } }, `Encoder ${p ? p.displayName : e.patientId} — ${fmtDateTime(e.datetime)}`);
    })),
  );
}

// Mode "appel téléphonique" : le secrétariat agit à la place de la personne qui appelle.
function phoneModeNote() {
  return el('div', { class: 'notice info small' },
    el('strong', {}, 'Mode appel téléphonique'), ' — ',
    "recherchez la personne qui appelle, puis réservez, déplacez, annulez ou inscrivez-la au désistement à sa place. Solution de secours lorsqu'elle ne peut pas utiliser le portail.");
}

function restrictionsBox() {
  return el('div', { class: 'card' },
    el('h3', {}, 'Périmètre du secrétariat'),
    el('div', { class: 'muted small' }, 'Autorisé : rechercher, réserver / déplacer / annuler, désistement, présence / absence, encoder l\'urgence 12:15 après accord du médecin.'),
    el('div', { class: 'muted small', style: 'margin-top:6px' }, 'Non autorisé : lire les commentaires cliniques, modifier une cadence, accepter / refuser une demande, prolonger un parcours, ouvrir une exception. Toutes les opérations sont journalisées.'),
  );
}

function render(mount) {
  clear(mount); store.purgeWaitlist(); head(mount);
  const banner = emergencyBanner(mount);
  if (banner) mount.appendChild(banner);
  if (selectedId) {
    const p = store.patientById(selectedId);
    if (p) { mount.appendChild(patientPanel(mount, p)); return; }
    selectedId = null;
  }
  mount.appendChild(phoneModeNote());
  mount.appendChild(dayAgenda(mount));
  mount.appendChild(searchCard(mount));
  mount.appendChild(restrictionsBox());
}

export function mountSecretary(node) { render(node); }
