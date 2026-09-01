// Tableau de bord médecin. Onglets : Accueil, Agenda, À traiter, Files, Règles,
// Disponibilité, Migration, Journal, E-mails, Réglages.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import * as avail from '../core/availability.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, weekdayLabel, weekdayShort, toast, modal, confirmDialog, downloadText } from './dom.js';

let tab = 'accueil';
window.addEventListener('goto-decisions', () => { tab = 'accueil'; });

function labelFor(a) {
  const p = store.patientById(a.patientId);
  if (p) return p.displayName;
  const d = store.demands().find((x) => x.id === a.patientId || x.circuitInstanceId === a.circuitInstanceId);
  if (d) return `Demande — ${store.circuitById(d.circuitId)?.label || 'circuit'}`;
  return a.patientId;
}
function statusTag(status) { return el('span', { class: 'st st-' + status }, store.STATUS_LABEL[status] || status); }

function tabs(mount) {
  const items = [
    ['accueil', 'Accueil'], ['aujourdhui', "Aujourd'hui"], ['calendrier', 'Calendrier'], ['agenda', 'Agenda'],
    ['intervention', 'À traiter'], ['files', 'Files'], ['regles', 'Règles'], ['dispo', 'Disponibilité'],
    ['migration', 'Migration'], ['journal', 'Journal'], ['emails', 'E-mails'], ['reglages', 'Réglages'],
  ];
  const openReq = store.openRequests().length;
  const newDem = store.demands().filter((d) => d.status === 'deposee').length;
  return el('div', { class: 'tabs' }, items.map(([id, label]) => {
    let badge = null;
    if (id === 'intervention' && openReq) badge = el('span', { class: 'badge' }, String(openReq));
    if (id === 'files' && newDem) badge = el('span', { class: 'badge' }, String(newDem));
    return el('button', { class: 'tab' + (tab === id ? ' active' : ''), 'aria-pressed': tab === id ? 'true' : 'false',
      onclick: () => { tab = id; render(mount); } }, label, badge);
  }));
}

// Centre de décisions en attente.
function decisionsCard(mount) {
  const items = store.pendingDecisions();
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Décisions en attente'), el('span', { class: 'pill' + (items.length ? ' warn' : '') }, String(items.length))),
    items.length ? el('div', { class: 'decisions-list' }, items.map((it) => el('div', { class: 'decision' },
      el('span', { class: 'dot' }), el('span', {}, it.label),
      el('button', { class: 'btn btn-ghost', style: 'margin-left:auto', onclick: () => {
        tab = (it.type === 'demande-explicite') ? 'intervention' : (it.type === 'fermeture-impact' ? 'dispo' : 'files'); render(mount);
      } }, 'Ouvrir'),
    ))) : el('div', { class: 'empty' }, 'Rien à décider. Tout est à jour.'),
  );
}

// --- AUJOURD'HUI ---
function aujourdhuiTab(mount) {
  const now = new Date();
  const today = store.appointments().filter((a) => a.status === 'planifie' && fmtDate(a.datetime) === fmtDate(now))
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const next = store.appointments().filter((a) => a.status === 'planifie' && new Date(a.datetime) > now).sort((a, b) => new Date(a.datetime) - new Date(b.datetime))[0];
  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', {}, `Aujourd'hui — ${fmtDate(now)}`), el('button', { class: 'btn btn-ghost', onclick: () => window.print() }, '🖨️ Imprimer')),
      next ? el('div', { class: 'notice info' }, `Prochain : ${fmtTime(next.datetime)} — ${labelFor(next)}`) : null,
      today.length ? el('div', { class: 'list' }, today.map((a) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, `${fmtTime(a.datetime)} — ${labelFor(a)}`),
          el('div', { class: 'muted small' }, `${a.durationMin} min${a.circuitInstanceId ? ' · parcours' : ''}${a.emergency ? ' · urgence' : ''}`)),
        el('div', { class: 'row-actions wrap' },
          el('button', { class: 'btn btn-ghost', onclick: () => { store.setStatus(a.id, 'effectue', { actor: 'medecin' }); toast('Effectué.'); render(mount); } }, 'Effectué'),
          el('button', { class: 'btn btn-ghost', onclick: () => { store.setStatus(a.id, 'absent', { actor: 'medecin' }); toast('Absent.'); render(mount); } }, 'Absent'),
        ),
      ))) : el('div', { class: 'empty' }, 'Aucun rendez-vous aujourd\'hui.'),
    ),
  );
}

// --- CALENDRIER (semaine) ---
let calWeek = 0;
function calendrierTab(mount) {
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0);
  const wd = monday.getDay() === 0 ? 7 : monday.getDay();
  monday.setDate(monday.getDate() - (wd - 1) + calWeek * 7);
  const days = store.consultationWeekdays(); // mardi, jeudi
  const cols = days.map((d) => {
    const day = new Date(monday); day.setDate(monday.getDate() + (d - 1));
    const dayStr = fmtDate(day);
    // Créneaux planifiés ce jour + ouverts.
    const appts = store.appointments().filter((a) => a.status === 'planifie' && fmtDate(a.datetime) === dayStr).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const evs = appts.map((a) => el('div', { class: 'cal-ev ' + (a.emergency ? 'urgence' : (a.circuitInstanceId ? 'avis' : 'ordinaire')) }, `${fmtTime(a.datetime)} ${labelFor(a)}`));
    return el('div', { class: 'cal-col' }, el('h4', {}, `${weekdayLabel(d)} ${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`), ...(evs.length ? evs : [el('div', { class: 'muted small' }, '—')]));
  });
  return el('div', {},
    el('div', { class: 'card' },
      el('div', { class: 'weeknav' },
        el('button', { class: 'btn btn-ghost', onclick: () => { calWeek -= 1; render(mount); } }, '← Semaine préc.'),
        el('strong', {}, `Semaine du ${fmtDate(monday)}`),
        el('button', { class: 'btn btn-ghost', onclick: () => { calWeek += 1; render(mount); } }, 'Semaine suiv. →'),
      ),
      el('div', { class: 'cal', style: `--cols:${days.length}` }, ...cols),
      el('div', { class: 'muted small', style: 'margin-top:8px' }, 'Bleu : suivi ordinaire · orange : avis/parcours · rouge : urgence.'),
    ),
  );
}

// --- ACCUEIL : synthèse + décisions + recherche + jauges ---
function accueilTab(mount) {
  const s = store.stats();
  const summary = el('div', { class: 'summary-grid' },
    tile(s.requestsOpen, 'Demandes à traiter', () => { tab = 'intervention'; render(mount); }),
    tile(s.demandsOpen, 'Nouvelles demandes', () => { tab = 'files'; render(mount); }),
    tile(s.waitlist, 'Désistements actifs', () => { tab = 'files'; render(mount); }),
    tile(s.upcoming, 'RDV à venir', () => { tab = 'agenda'; render(mount); }),
  );

  const capInfo = store.avisCapacityInfo();
  const occ = el('div', { class: 'card' },
    el('h3', {}, 'Occupation (4 prochaines semaines)'),
    gauge(s.occupancy, false),
    el('div', { class: 'muted small' }, `${s.occupancy}% des créneaux ordinaires ouverts sont réservés.`),
    el('h3', { style: 'margin-top:14px' }, "Capacité avis / parcours (4 semaines)"),
    gauge(Math.round((capInfo.used / capInfo.max) * 100), capInfo.used > capInfo.max),
    el('div', { class: 'muted small' }, `${capInfo.used} séance(s) d'avis planifiée(s) sur ${capInfo.max} (base ${capInfo.base}${capInfo.extra ? ` + ${capInfo.extra} ponctuel(s)` : ''}, plafond ${capInfo.ceiling}). Restant : ${capInfo.remaining}.`),
  );

  const nextClosure = (store.doctor().closures || []).map((c) => c).sort((a, b) => new Date(a.from) - new Date(b.from))[0];
  const reminders = store.simulateReminders();

  const misc = el('div', { class: 'card' },
    el('h3', {}, 'À noter'),
    el('div', { class: 'list' },
      el('div', { class: 'row-item' }, el('div', {}, el('div', { class: 'row-title' }, 'Prochaine fermeture'), el('div', { class: 'muted small' }, nextClosure ? `${fmtDate(nextClosure.from)} → ${fmtDate(nextClosure.to)} · ${nextClosure.label}` : 'Aucune'))),
      el('div', { class: 'row-item' }, el('div', {}, el('div', { class: 'row-title' }, 'Rappels neutres à envoyer (simulés)'), el('div', { class: 'muted small' }, reminders.length ? `${reminders.length} rappel(s) J-2/J-1` : 'Aucun pour l\'instant'))),
    ),
  );

  return el('div', {}, decisionsCard(mount), searchCard(mount), summary, occ, misc);
}
function tile(num, label, onclick) {
  return el('button', { class: 'summary-tile', onclick }, el('div', { class: 'summary-num' }, String(num)), el('div', { class: 'summary-lbl' }, label));
}
function gauge(pct, over) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return el('div', { class: 'gauge' + (over ? ' over' : '') }, el('span', { style: `width:${p}%` }));
}

function searchCard(mount) {
  const input = el('input', { class: 'field', placeholder: 'Rechercher un patient (nom ou code)', 'aria-label': 'Recherche patient' });
  const results = el('div', {});
  const run = () => {
    clear(results);
    const q = (input.value || '').trim().toLowerCase();
    if (!q) return;
    const found = store.patients().filter((p) => p.displayName.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
    if (!found.length) { results.appendChild(el('div', { class: 'empty' }, 'Aucun résultat.')); return; }
    results.appendChild(el('div', { class: 'list' }, found.map((p) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, p.displayName), el('div', { class: 'muted small' }, `code ${p.code}`)),
      el('button', { class: 'btn btn-ghost', onclick: () => patientFiche(mount, p) }, 'Fiche'),
    ))));
  };
  input.addEventListener('input', run);
  return el('div', { class: 'card' }, el('h3', {}, 'Recherche'), input, results);
}

// Fiche patient consolidée (historique complet) en modale.
function patientFiche(mount, p) {
  const appts = store.appointmentsOf(p.id).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: p.id, explicitAnchor: p.anchorDate });
  const body = [
    el('div', { class: 'muted small' }, `code ${p.code} · ancrage : ${anchor.date ? fmtDate(anchor.date) : '—'} (${anchor.source})`),
    el('div', { class: 'sep' }),
    el('div', { class: 'list' }, appts.length ? appts.map((a) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)), el('div', { class: 'muted small' }, `${a.durationMin} min${a.circuitInstanceId ? ' · parcours' : ''}${a.emergency ? ' · urgence' : ''}`)),
      statusTag(a.status),
    )) : [el('div', { class: 'empty' }, 'Aucun rendez-vous.')]),
  ];
  modal(`Fiche — ${p.displayName}`, body, [el('button', { class: 'btn btn-primary', onclick: () => document.querySelector('.modal-back')?.remove() }, 'Fermer')]);
}

// --- AGENDA ---
function agendaTab(mount) {
  const now = new Date();
  const appts = store.appointments().filter((a) => a.status === 'planifie').sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const recent = store.appointments().filter((a) => ['effectue', 'annule', 'absent', 'deplace'].includes(a.status)).sort((a, b) => new Date(b.datetime) - new Date(a.datetime)).slice(0, 10);
  const statusPicker = (a) => {
    const sel = el('select', { class: 'field mini' }, store.STATUSES.map((s) => el('option', { value: s, selected: s === a.status ? '' : null }, store.STATUS_LABEL[s])));
    sel.addEventListener('change', () => { store.setStatus(a.id, sel.value, { actor: 'medecin' }); toast('Statut mis à jour.'); render(mount); });
    return sel;
  };
  return el('div', {},
    el('div', { class: 'card' },
      el('h3', {}, 'Rendez-vous planifiés'),
      el('p', { class: 'muted small' }, "Le logiciel ne marque jamais « effectué » automatiquement : c'est une action explicite."),
      appts.length ? el('div', { class: 'list' }, appts.map((a) => el('div', { class: 'row-item stack' },
        el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
          el('div', { class: 'muted small' }, labelFor(a) + `${a.circuitInstanceId ? ' · parcours' : ''}${a.emergency ? ' · urgence' : ''}${a.imported ? ' · importé' : ''}`)),
        el('div', { class: 'row-actions wrap' },
          el('button', { class: 'btn btn-ghost', onclick: () => { store.setStatus(a.id, 'effectue', { actor: 'medecin' }); toast('Effectué.'); render(mount); } }, 'Effectué'),
          el('button', { class: 'btn btn-ghost', onclick: () => { store.setStatus(a.id, 'absent', { actor: 'medecin' }); toast('Absent.'); render(mount); } }, 'Absent'),
          el('button', { class: 'btn btn-ghost danger', onclick: () => cancelWithReason(mount, a) }, 'Annuler'),
        ),
      ))) : el('div', { class: 'empty' }, 'Aucun rendez-vous planifié.'),
    ),
    el('div', { class: 'card' },
      el('h3', {}, 'Historique récent'),
      recent.length ? el('div', { class: 'list' }, recent.map((a) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)), el('div', { class: 'muted small' }, labelFor(a) + (a.cancelReason ? ' · ' + a.cancelReason : ''))),
        el('div', {}, statusPicker(a)),
      ))) : el('div', { class: 'empty' }, 'Rien pour le moment.'),
    ),
  );
}

function cancelWithReason(mount, a) {
  const reason = el('input', { class: 'field', placeholder: 'Motif (optionnel)' });
  const note = el('textarea', { class: 'field', rows: '2', placeholder: 'Note interne (optionnelle)' });
  const m = modal(`Annuler — ${fmtDateTime(a.datetime)}`, [el('label', { class: 'lbl' }, 'Motif'), reason, el('label', { class: 'lbl' }, 'Note interne'), note], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Retour'),
    el('button', { class: 'btn btn-ghost danger', onclick: () => { store.cancelAppointment(a.id, { actor: 'medecin', reason: [reason.value, note.value].filter(Boolean).join(' — ') }); m.close(); toast('Rendez-vous annulé.'); render(mount); } }, 'Confirmer l\'annulation'),
  ]);
}

// --- À TRAITER ---
function interventionTab(mount) {
  const open = store.openRequests();
  const typeLabel = (id) => (store.REQUEST_TYPES.find((t) => t.id === id) || {}).label || id;
  return el('div', { class: 'card' },
    el('h3', {}, 'Demandes nécessitant votre intervention'),
    el('p', { class: 'muted' }, 'Seules les demandes explicites apparaissent ici. Prises / déplacements / annulations ordinaires ne génèrent aucune alerte.'),
    open.length ? el('div', { class: 'list' }, open.map((r) => el('div', { class: 'row-item stack' },
      el('div', {},
        el('div', { class: 'row-title' }, `${store.patientById(r.patientId)?.displayName || r.patientId} — ${typeLabel(r.type)}`),
        el('div', { class: 'muted small' }, fmtDateTime(r.createdAt)),
        r.note ? el('div', { class: 'note-box' }, r.note) : el('div', { class: 'muted small' }, '(pas de message)'),
      ),
      el('div', { class: 'row-actions wrap' },
        el('button', { class: 'btn btn-primary', onclick: () => { store.resolveRequest(r.id); toast('Demande traitée.'); render(mount); } }, 'Marquer traitée'),
      ),
    ))) : el('div', { class: 'empty' }, 'Rien à traiter. Tout est à jour.'),
  );
}

// --- FILES ---
function filesTab(mount) {
  const now = new Date();
  store.purgeWaitlist(now); store.processOffers(now); store.processInvitations(now);
  const wl = store.waitlist().map((w) => ({ w, p: store.patientById(w.patientId) }));
  const offers = store.offers().filter((o) => o.status === 'en cours');
  const demands = [...store.demands()].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  const prefLabel = (pr) => {
    if (!pr) return '';
    const days = pr.weekdays && pr.weekdays.length ? pr.weekdays.map(weekdayShort).join('/') : 'tous jours';
    const h = (pr.timeFrom || pr.timeTo) ? ` ${pr.timeFrom || ''}-${pr.timeTo || ''}` : '';
    return `${days}${h} · délai ${pr.minDelayHours ?? 24}h`;
  };

  const desistement = el('div', { class: 'card' },
    el('h3', {}, 'Liste de désistement'),
    el('p', { class: 'muted small' }, "Personnes déjà suivies souhaitant avancer leur prochain rendez-vous. Expiration au prochain rendez-vous. Offre successive 48h avec relance automatique."),
    wl.length ? el('div', { class: 'list' }, wl.map(({ w, p }) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, p ? p.displayName : w.patientId),
        el('div', { class: 'muted small' }, `${prefLabel(w.prefs)}${w.expiresAt ? ` · expire ${fmtDate(w.expiresAt)}` : ''}`)),
    ))) : el('div', { class: 'empty' }, 'Personne inscrite.'),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => {
        const open = store.openSlots({ now });
        if (!open.length) { toast('Aucun créneau ouvert à proposer.', 'err'); return; }
        const res = store.offerFreedSlot(open[0].start.toISOString(), { now });
        if (res && res.error) toast(res.message, 'err'); else toast('Place proposée (48h) à la 1re personne compatible.');
        render(mount);
      } }, 'Simuler une place libérée'),
    ),
    offers.length ? el('div', { class: 'sub' }, el('div', { class: 'muted small' }, 'Offres en cours :'),
      el('div', { class: 'list' }, offers.map((o) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, `${store.patientById(o.patientId)?.displayName || o.patientId} — ${fmtDateTime(o.datetime)}`),
          el('div', { class: 'muted small' }, `expire ${fmtDateTime(o.expiresAt)} · position ${o.position + 1}/${o.order.length}`)),
        el('button', { class: 'btn btn-ghost', onclick: () => { store.advanceOffer(o.id, { reason: 'relance manuelle' }); toast('Relance à la personne suivante.'); render(mount); } }, 'Relancer'),
      )))) : null,
  );

  const avisFile = el('div', { class: 'card' },
    el('h3', {}, "File d'avis et de parcours ciblés"),
    el('p', { class: 'muted small' }, "Nouvelles demandes. J'examine humainement ; entrée en file après acceptation. Ordre par ancienneté, priorité modifiable."),
    demands.length ? el('div', { class: 'list' }, demands.map((d) => demandRow(mount, d))) : el('div', { class: 'empty' }, 'Aucune demande.'),
  );
  return el('div', {}, desistement, avisFile);
}

function demandRow(mount, d) {
  const c = store.circuitById(d.circuitId);
  const now = new Date();
  const actions = [];
  if (d.status === 'deposee') {
    actions.push(el('button', { class: 'btn btn-primary', onclick: () => { const r = store.acceptDemand(d.id); toast(r.status === 'acceptee-conditionnelle' ? 'Acceptée (relais en attente).' : 'Acceptée.'); render(mount); } }, 'Accepter'));
    actions.push(el('button', { class: 'btn btn-ghost danger', onclick: () => { store.refuseDemand(d.id); toast('Refusée.'); render(mount); } }, 'Refuser'));
  }
  // Démarrage des consultations INITIALES possible dès acceptation ferme OU conditionnelle.
  if (['acceptee', 'acceptee-conditionnelle'].includes(d.status) && !d.circuitInstanceId) {
    actions.push(el('button', { class: 'btn btn-primary', onclick: () => startCircuit(mount, d) }, 'Démarrer les consultations initiales'));
  }
  if (d.status === 'acceptee-conditionnelle') {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => relayModal(mount, d) }, 'Identifier le relais'));
  }
  // Relais manquant : relance possible même après démarrage des initiales.
  if (d.relais === '' && c && (c.medication || (c.phases && c.therapeuticMedication)) && d.circuitInstanceId && d.status !== 'close') {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => relayModal(mount, d) }, 'Identifier le relais'));
  }
  // Circuit démarré : gestion du parcours.
  const circuitStarted = !!d.circuitInstanceId;
  if (circuitStarted && d.status !== 'close') {
    // Bloc thérapeutique (TDAH) : décision médicale distincte.
    if (c && c.therapeuticNeedsDecision && !d.therapeuticStarted) {
      actions.push(el('button', { class: 'btn btn-ghost', onclick: () => openTherapeutic(mount, d) }, `Ouvrir le bloc thérapeutique (${c.phases.therapeutique})`));
    }
    // Adaptation médicamenteuse : bloquée sans relais.
    if (c && (c.medication || (c.phases && c.therapeuticMedication))) {
      const canMed = !!d.relais;
      actions.push(el('button', { class: 'btn ' + (canMed ? 'btn-ghost' : 'btn-ghost'), disabled: canMed ? null : '',
        title: canMed ? null : "Relais prescripteur non identifié : adaptation médicamenteuse bloquée.",
        onclick: () => { const r = store.clearMedication(d.id); if (r.error) toast(r.message, 'err'); else toast('Adaptation médicamenteuse autorisée.'); render(mount); } },
        d.medicationCleared ? 'Adaptation autorisée ✓' : 'Autoriser l\'adaptation médicamenteuse'));
    }
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => extendModal(mount, d) }, 'Prolonger'));
    actions.push(el('button', { class: 'btn btn-ghost danger', onclick: () => { const n = store.closeCircuitEarly(d.circuitInstanceId); toast(`Parcours raccourci : ${n} consultation(s) libérée(s).`); render(mount); } }, 'Raccourcir'));
  }
  const prio = el('input', { class: 'field mini', type: 'number', value: String(d.priority || 0), title: 'Priorité' });
  prio.addEventListener('change', () => { store.setPriority(d.id, prio.value); toast('Priorité mise à jour.'); });

  const sessions = circuitStarted ? store.appointments().filter((a) => a.circuitInstanceId === d.circuitInstanceId && a.status === 'planifie').length : 0;
  const medBlocked = c && (c.medication || (c.phases && c.therapeuticMedication)) && !d.relais;

  return el('div', { class: 'row-item stack' },
    el('div', {},
      el('div', { class: 'row-title' }, `${c ? c.label : d.circuitId} `, el('span', { class: 'pill' + (String(d.status).startsWith('accept') ? ' warn' : '') }, store.DEMAND_STATUSES[d.status] || d.status), `  réf. `, el('span', { class: 'ref-code' }, d.id.slice(-6).toUpperCase())),
      el('div', { class: 'muted small' }, `déposée ${fmtDate(d.createdAt)} · origine ${d.origine}${d.adressePar ? ' · adressé par ' + d.adressePar : ''} · relais : ${d.relais || 'à identifier'}${d.relaisCoord ? ' (' + d.relaisCoord + ')' : ''}`),
      d.objectif ? el('div', { class: 'muted small' }, 'Objectif : ' + d.objectif) : null,
      circuitStarted ? el('div', { class: 'muted small' }, `Parcours : ${sessions} consultation(s) à venir${d.therapeuticStarted ? ' · bloc thérapeutique ouvert' : ''}${d.medicationCleared ? ' · adaptation médicamenteuse autorisée' : ''}`) : null,
      medBlocked ? el('div', { class: 'notice info small' }, "Consultations initiales possibles, mais aucune instauration/adaptation médicamenteuse tant que le relais prescripteur n'est pas identifié.") : null,
    ),
    el('div', { class: 'row-actions wrap' }, ...actions, (d.status !== 'refusee' && d.status !== 'close') ? el('label', { class: 'lbl inline' }, 'Priorité', prio) : null),
  );
}

function relayModal(mount, d) {
  const input = el('input', { class: 'field', placeholder: 'Relais prescripteur (nom)' , value: d.relais || '' });
  const coord = el('input', { class: 'field', placeholder: 'Coordonnées (e-mail/téléphone)', value: d.relaisCoord || '' });
  const m = modal('Identifier le relais prescripteur', [el('label', { class: 'lbl' }, 'Nom'), input, el('label', { class: 'lbl' }, 'Coordonnées'), coord], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => { if (!input.value) { toast('Saisissez un relais.', 'err'); return; } d.relaisCoord = coord.value; store.setRelay(d.id, input.value); m.close(); toast('Relais enregistré.'); render(mount); } }, 'Enregistrer'),
  ]);
}

function seriesPreview(count, spacing, now) {
  const av = store.avisOpenSlots({ now });
  return rules.proposeSeries({ openSlots: av, count, spacingDays: spacing, marginDays: 3, now });
}

function startCircuit(mount, d) {
  const c = store.circuitById(d.circuitId);
  const now = new Date();
  // Espacement 14 jours PAR DÉFAUT, modifiable par le médecin.
  const spacingInput = el('input', { class: 'field mini', type: 'number', min: '1', value: String(c.spacingDays) });
  const previewBox = el('div', { class: 'note-box' }, '');
  let serie = null;
  const refresh = () => {
    serie = seriesPreview(c.initialSessions, Number(spacingInput.value) || c.spacingDays, now);
    previewBox.textContent = serie ? serie.map((s) => fmtDateTime(s)).join('\n') : `Série de ${c.initialSessions} non garantie sur les créneaux d'avis.`;
  };
  spacingInput.addEventListener('change', refresh); setTimeout(refresh, 0);
  const cap = store.avisCapacityInfo(now);
  const m = modal(`Démarrer — ${c.label}`, [
    el('p', { class: 'muted small' }, `Réservation d'un seul bloc de ${c.initialSessions} consultation(s) initiale(s) sur les créneaux d'avis (mardi 16:00 / jeudi 11:30). En production, l'atomicité sera garantie côté serveur.`),
    el('div', { class: 'muted small' }, `Capacité avis : ${cap.used}/${cap.max} sur ${cap.windowDays / 7} semaines.`),
    el('label', { class: 'lbl' }, 'Espacement (jours, défaut 14)'), spacingInput,
    el('label', { class: 'lbl' }, 'Aperçu de la série'), previewBox,
  ], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => {
      if (!serie) { toast('Série non garantie — parcours non démarré.', 'err'); return; }
      const res = store.startCircuitAtomic(d.id, serie.map((s) => s.toISOString()));
      if (res && res.error) { toast(res.message, 'err'); m.close(); render(mount); return; }
      m.close(); toast(`Consultations initiales réservées : ${res.created.length}. Invitation 7 jours.`); render(mount);
    } }, 'Réserver le bloc initial'),
  ]);
}

function openTherapeutic(mount, d) {
  const c = store.circuitById(d.circuitId);
  const now = new Date();
  const count = c.phases.therapeutique;
  const av = store.avisOpenSlots({ now });
  // Démarre après les consultations initiales existantes.
  const last = store.appointments().filter((a) => a.circuitInstanceId === d.circuitInstanceId && a.status === 'planifie').map((a) => new Date(a.datetime)).sort((a, b) => b - a)[0] || now;
  const serie = rules.proposeSeries({ openSlots: av, count, spacingDays: c.spacingDays, marginDays: 3, startFrom: new Date(last.getTime() + 24 * 3600 * 1000), now });
  if (!serie) { toast('Bloc thérapeutique non garanti sur les créneaux d\'avis.', 'err'); return; }
  const preview = serie.map((s) => fmtDateTime(s)).join('\n');
  confirmDialog(`Décision médicale : ouvrir le bloc thérapeutique (${count} consultations) ?\n\n${preview}\n\nCeci n'autorise pas l'adaptation médicamenteuse (relais requis).`, { okLabel: 'Ouvrir le bloc' }).then((ok) => {
    if (!ok) return;
    const res = store.openTherapeuticBlock(d.id, serie.map((s) => s.toISOString()));
    if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
    toast(`Bloc thérapeutique ouvert : ${res.created.length} consultations.`); render(mount);
  });
}

function extendModal(mount, d) {
  const now = new Date();
  const c = store.circuitById(d.circuitId);
  const nInput = el('input', { class: 'field mini', type: 'number', min: '1', value: '1' });
  const previewBox = el('div', { class: 'note-box' }, '');
  let serie = null;
  const cap = store.avisCapacityInfo(now);
  const refresh = () => {
    const n = Number(nInput.value) || 1;
    const av = store.avisOpenSlots({ now });
    const last = store.appointments().filter((a) => a.circuitInstanceId === d.circuitInstanceId && a.status === 'planifie').map((a) => new Date(a.datetime)).sort((a, b) => b - a)[0] || now;
    serie = rules.proposeSeries({ openSlots: av, count: n, spacingDays: c.spacingDays, marginDays: 3, startFrom: new Date(last.getTime() + 24 * 3600 * 1000), now });
    previewBox.textContent = serie ? `${serie.length} consultation(s) :\n` + serie.map((s) => fmtDateTime(s)).join('\n') + `\n\nCapacité avis après ajout : ${cap.used + serie.length}/${cap.max}.` : 'Ajout non garanti (capacité/créneaux d\'avis insuffisants).';
  };
  nInput.addEventListener('change', refresh); setTimeout(refresh, 0);
  const m = modal('Prolonger le parcours', [
    el('p', { class: 'muted small' }, "Ajout de consultations sans plafond clinique artificiel, sous réserve de la capacité disponible. Impact visible ci-dessous."),
    el('label', { class: 'lbl' }, 'Nombre de consultations à ajouter'), nInput,
    previewBox,
  ], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => {
      if (!serie) { toast('Ajout non garanti.', 'err'); return; }
      const res = store.extendCircuit(d.circuitInstanceId, serie.map((s) => s.toISOString()));
      if (res && res.error) { toast(res.message, 'err'); return; }
      m.close(); toast(`Parcours prolongé de ${res.length} consultation(s).`); render(mount);
    } }, 'Valider la prolongation'),
  ]);
}

// --- RÈGLES ---
const CADENCE_TEMPLATES = [
  { label: 'Hebdomadaire', cadence: { mode: 'cadence', frequencyDays: 7, marginDays: 1, horizonWeeks: 12, maxFuture: 1 } },
  { label: 'Toutes les 2 semaines', cadence: { mode: 'cadence', frequencyDays: 14, marginDays: 2, horizonWeeks: 12, maxFuture: 1 } },
  { label: 'Toutes les 3 semaines', cadence: { mode: 'cadence', frequencyDays: 21, marginDays: 5, horizonWeeks: 12, maxFuture: 1 } },
  { label: 'Mensuel', cadence: { mode: 'cadence', frequencyDays: 28, marginDays: 4, horizonWeeks: 12, maxFuture: 1 } },
  { label: 'Souple 1 à 3 sem.', cadence: { mode: 'fourchette', minDays: 7, maxDays: 21, marginDays: 1, horizonWeeks: 12, maxFuture: 2 } },
];

function reglesTab(mount) {
  return el('div', {},
    el('div', { class: 'notice info' }, 'Ces règles sont strictement internes : elles ne sont jamais visibles côté patient.'),
    ...store.patients().map((p) => cadenceEditor(mount, p)),
  );
}

function cadenceEditor(mount, patient) {
  const cad = patient.cadence;
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: patient.id, explicitAnchor: patient.anchorDate });
  const modeSel = el('select', { class: 'field mini' },
    el('option', { value: 'cadence', selected: cad.mode === 'cadence' ? '' : null }, 'Cadence (fréquence fixe)'),
    el('option', { value: 'fourchette', selected: cad.mode === 'fourchette' ? '' : null }, 'Fourchette (min–max)'));
  const num = (v, min) => el('input', { class: 'field mini', type: 'number', value: String(v ?? ''), min: String(min) });
  const freq = num(cad.frequencyDays, 1), minD = num(cad.minDays, 1), maxD = num(cad.maxDays, 1);
  const margin = num(cad.marginDays, 0), horizon = num(cad.horizonWeeks || 12, 1), maxFut = num(cad.maxFuture, 1);
  const anchorInput = el('input', { class: 'field mini', type: 'date', value: patient.anchorDate ? patient.anchorDate.slice(0, 10) : '' });
  const previewBox = el('div', { class: 'muted small' });

  const readCadence = () => ({
    mode: modeSel.value, frequencyDays: Number(freq.value) || undefined,
    minDays: Number(minD.value) || undefined, maxDays: Number(maxD.value) || undefined,
    marginDays: Number(margin.value) || 0, horizonWeeks: Number(horizon.value) || 12, maxFuture: Number(maxFut.value) || 1,
  });
  const preview = () => {
    const now = new Date();
    const open = store.openSlots({ now });
    const a = anchorInput.value ? new Date(anchorInput.value) : anchor.date;
    const { window: win, slots } = rules.compatibleSlots({ openSlots: open, anchor: a, cadence: readCadence(), now });
    previewBox.textContent = `Aperçu : ${slots.length} créneau(x) proposé(s)` + (win.target ? ` · cible ${fmtDate(win.target)}` : ` · fenêtre ${fmtDate(win.from)} → ${fmtDate(win.to)}`);
  };

  const templates = el('div', { class: 'row-actions wrap' }, CADENCE_TEMPLATES.map((t) => el('button', { class: 'btn btn-ghost', onclick: () => {
    modeSel.value = t.cadence.mode; freq.value = t.cadence.frequencyDays || ''; minD.value = t.cadence.minDays || ''; maxD.value = t.cadence.maxDays || '';
    margin.value = t.cadence.marginDays; horizon.value = t.cadence.horizonWeeks; maxFut.value = t.cadence.maxFuture; preview();
  } }, t.label)));

  setTimeout(preview, 0);

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, patient.displayName), el('span', { class: 'muted small' }, `code ${patient.code}`)),
    el('div', { class: 'muted small' }, `Ancrage effectif : ${anchor.date ? fmtDate(anchor.date) : '—'} (${anchor.source})`),
    el('div', { class: 'lbl' }, 'Gabarits'), templates,
    el('div', { class: 'rule-grid' },
      el('label', { class: 'lbl' }, 'Mode'), modeSel,
      el('label', { class: 'lbl' }, 'Fréquence (jours)'), freq,
      el('label', { class: 'lbl' }, 'Fourchette min (jours)'), minD,
      el('label', { class: 'lbl' }, 'Fourchette max (jours)'), maxD,
      el('label', { class: 'lbl' }, 'Marge ± (jours)'), margin,
      el('label', { class: 'lbl' }, 'Horizon (semaines)'), horizon,
      el('label', { class: 'lbl' }, 'RDV futurs autorisés'), maxFut,
      el('label', { class: 'lbl' }, 'Ancrage explicite (optionnel)'), anchorInput,
    ),
    previewBox,
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: preview }, 'Aperçu'),
      el('button', { class: 'btn btn-ghost', onclick: () => { store.setAnchor(patient.id, null); toast('Ancrage remis en automatique.'); render(mount); } }, 'Ancrage auto'),
      el('button', { class: 'btn btn-primary', onclick: () => {
        store.updateCadence(patient.id, readCadence());
        store.setAnchor(patient.id, anchorInput.value ? new Date(anchorInput.value).toISOString() : null);
        toast('Règles enregistrées.'); render(mount);
      } }, 'Enregistrer'),
    ),
  );
}

// --- DISPONIBILITÉ ---
function dispoTab(mount) {
  const d = store.doctor();
  const now = new Date();
  const wdList = Object.keys(d.weeklyTemplate).map(Number).sort();
  const kind = el('select', { class: 'field mini' },
    el('option', { value: 'jour' }, 'Journée(s) entière(s)'),
    el('option', { value: 'demi' }, 'Demi-journée (matin/après-midi)'),
    el('option', { value: 'creneau' }, 'Créneau précis'));
  const dateFrom = el('input', { class: 'field mini', type: 'date' });
  const dateTo = el('input', { class: 'field mini', type: 'date' });
  const half = el('select', { class: 'field mini' }, el('option', { value: 'am' }, 'Matin (jusqu\'à 12:00)'), el('option', { value: 'pm' }, 'Après-midi (dès 12:00)'));
  const slotDate = el('input', { class: 'field mini', type: 'date' });
  const slotTime = el('input', { class: 'field mini', type: 'time' });
  const label = el('input', { class: 'field', placeholder: 'Motif (congé, formation, fermeture…)' });

  const dynamic = el('div', {});
  const drawDynamic = () => {
    clear(dynamic);
    if (kind.value === 'jour') dynamic.append(el('label', { class: 'lbl' }, 'Du'), dateFrom, el('label', { class: 'lbl' }, 'Au'), dateTo);
    else if (kind.value === 'demi') dynamic.append(el('label', { class: 'lbl' }, 'Date'), dateFrom, el('label', { class: 'lbl' }, 'Demi-journée'), half);
    else dynamic.append(el('label', { class: 'lbl' }, 'Date'), slotDate, el('label', { class: 'lbl' }, 'Heure'), slotTime);
  };
  kind.addEventListener('change', drawDynamic); setTimeout(drawDynamic, 0);

  const addClosure = () => {
    let closure;
    if (kind.value === 'jour') {
      if (!dateFrom.value || !dateTo.value) { toast('Renseignez les dates.', 'err'); return; }
      closure = { from: dateFrom.value, to: dateTo.value, label: label.value || 'fermeture' };
    } else if (kind.value === 'demi') {
      if (!dateFrom.value) { toast('Renseignez la date.', 'err'); return; }
      closure = half.value === 'am'
        ? { from: `${dateFrom.value}T00:00:00`, to: `${dateFrom.value}T12:00:00`, label: label.value || 'matinée' }
        : { from: `${dateFrom.value}T12:00:00`, to: `${dateFrom.value}T23:59:00`, label: label.value || 'après-midi' };
    } else {
      if (!slotDate.value || !slotTime.value) { toast('Renseignez date et heure.', 'err'); return; }
      const [hh, mm] = slotTime.value.split(':').map(Number);
      const endM = mm + d.slotDurationMin;
      const eh = hh + Math.floor(endM / 60), em = endM % 60;
      closure = { from: `${slotDate.value}T${slotTime.value}:00`, to: `${slotDate.value}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`, label: label.value || 'créneau fermé' };
    }
    const impacted = avail.appointmentsInClosure(store.appointments(), closure);
    store.addClosure(closure);
    toast(impacted.length ? `Fermeture ajoutée. ${impacted.length} rdv à traiter (non déplacés).` : 'Fermeture ajoutée.', impacted.length ? 'err' : 'ok');
    render(mount);
  };

  const trame = el('div', { class: 'card' },
    el('h3', {}, 'Trame hebdomadaire'),
    el('p', { class: 'muted small' }, `Durée des consultations : ${d.slotDurationMin} min · Intervalle entre les créneaux (min) : ${d.slotDurationMin} · Horizon : ${d.horizonWeeks} semaines`),
    el('div', { class: 'list' }, wdList.map((wd) => el('div', { class: 'row-item stack' },
      el('div', {}, el('div', { class: 'row-title' }, weekdayLabel(wd) + ' — suivis ordinaires'),
        el('div', { class: 'row-actions wrap', style: 'margin-top:6px' }, d.weeklyTemplate[wd].map((t) => el('span', { class: 'pill' }, t, ' ', el('button', { class: 'pill-x', title: 'Retirer', onclick: () => { store.removeSlot(wd, t, 'ordinaire'); toast('Créneau retiré.'); render(mount); } }, '×'))))),
    ))),
    el('div', { class: 'notice info small' }, `Créneaux d'avis dédiés (réservés aux circuits, exclus des suivis ordinaires) : ${Object.entries(d.avisTemplate).map(([wd, tt]) => weekdayLabel(Number(wd)) + ' ' + tt.join(',')).join(' ; ')}. Base ${d.avisCapacity.base} séances / 4 semaines.`),
    el('div', { class: 'notice info small' }, `Créneau d'urgence (invisible au public) : ${Object.entries(d.emergencyTemplate).map(([wd, tt]) => weekdayLabel(Number(wd)) + ' ' + tt.join(',')).join(' ; ')}.`),
    el('div', { class: 'row-actions wrap end' },
      el('button', { class: 'btn btn-ghost', onclick: () => slotEditorModal(mount) }, 'Ajouter un créneau à la trame'),
      el('button', { class: 'btn btn-ghost', onclick: () => capacityModal(mount) }, 'Régler la capacité avis'),
      el('button', { class: 'btn btn-ghost', onclick: () => authorizeEmergencyPrompt(mount) }, 'Autoriser une urgence 12:15'),
      el('button', { class: 'btn btn-ghost', onclick: () => addExtraAvisModal(mount) }, "Créneau d'avis ponctuel"),
      el('button', { class: 'btn btn-ghost', onclick: () => convertAvisModal(mount) }, "Convertir un avis en ordinaire"),
    ),
    avisCapacityCard(),
  );

  const closures = el('div', { class: 'card' },
    el('h3', {}, 'Congés / fermetures / exceptions datées'),
    el('div', { class: 'row-actions' }, el('button', { class: 'btn btn-ghost', onclick: () => { const n = store.prefillHolidays(); toast(n ? `${n} jour(s) férié(s) belge(s) ajouté(s).` : 'Jours fériés déjà présents.'); render(mount); } }, 'Pré-remplir les jours fériés belges')),
    el('div', { class: 'rule-grid' }, el('label', { class: 'lbl' }, 'Type'), kind),
    dynamic, label,
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-primary', onclick: addClosure }, 'Ajouter la fermeture')),
    d.closures.length ? el('div', { class: 'list' }, d.closures.map((c, i) => {
      const impacted = avail.appointmentsInClosure(store.appointments(), c);
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(c.from) && /^\d{4}-\d{2}-\d{2}$/.test(c.to);
      const span = dateOnly ? (c.from === c.to ? fmtDate(c.from) : `${fmtDate(c.from)} → ${fmtDate(c.to)}`) : `${fmtDateTime(c.from)} → ${fmtDateTime(c.to)}`;
      return el('div', { class: 'row-item stack' },
        el('div', {}, el('div', { class: 'row-title' }, `${span} · ${c.label}`),
          impacted.length ? el('div', { class: 'notice info small' }, `${impacted.length} rendez-vous à traiter (bloque toute nouvelle réservation, sans déplacer personne) :`,
            el('ul', { class: 'mini-list' }, impacted.map((a) => el('li', {}, `${fmtDateTime(a.datetime)} — ${labelFor(a)}`)))) : el('div', { class: 'muted small' }, 'Aucun rendez-vous impacté.')),
        el('div', { class: 'row-actions' }, el('button', { class: 'btn btn-ghost danger', onclick: () => { store.removeClosure(i); render(mount); } }, 'Retirer')),
      );
    })) : el('div', { class: 'empty' }, 'Aucune fermeture enregistrée.'),
  );
  return el('div', {}, trame, closures);
}

// Éditeur : ajouter un créneau (ordinaire ou avis) à la trame.
function slotEditorModal(mount) {
  const wdSel = el('select', { class: 'field mini' }, [1, 2, 3, 4, 5, 6, 7].map((wd) => el('option', { value: String(wd), selected: wd === 2 ? '' : null }, weekdayLabel(wd))));
  const timeInput = el('input', { class: 'field mini', type: 'time', value: '13:00' });
  const kindSel = el('select', { class: 'field mini' }, el('option', { value: 'ordinaire' }, 'Suivi ordinaire'), el('option', { value: 'avis' }, "Avis (circuits)"));
  const m = modal('Ajouter un créneau à la trame', [
    el('div', { class: 'rule-grid' }, el('label', { class: 'lbl' }, 'Jour'), wdSel, el('label', { class: 'lbl' }, 'Heure'), timeInput, el('label', { class: 'lbl' }, 'Type'), kindSel),
  ], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => { const r = store.addSlot(Number(wdSel.value), timeInput.value, kindSel.value); if (r.error) toast(r.error === 'exists' ? 'Créneau déjà présent.' : 'Format invalide.', 'err'); else { m.close(); toast('Créneau ajouté.'); render(mount); } } }, 'Ajouter'),
  ]);
}

// Éditeur : régler la capacité avis (base / plafond).
function capacityModal(mount) {
  const cap = store.doctor().avisCapacity;
  const base = el('input', { class: 'field mini', type: 'number', min: '0', value: String(cap.base) });
  const max = el('input', { class: 'field mini', type: 'number', min: '0', value: String(cap.max) });
  const m = modal('Régler la capacité avis (4 semaines)', [
    el('p', { class: 'muted small' }, 'Base : nombre de séances d\'avis visées. Plafond : maximum absolu (extensions ponctuelles comprises).'),
    el('div', { class: 'rule-grid' }, el('label', { class: 'lbl' }, 'Base'), base, el('label', { class: 'lbl' }, 'Plafond'), max),
  ], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => { store.setAvisCapacity({ base: base.value, max: max.value }); m.close(); toast('Capacité mise à jour.'); render(mount); } }, 'Enregistrer'),
  ]);
}

function authorizeEmergencyPrompt(mount) {
  const input = el('input', { class: 'field', placeholder: 'Code patient (ex. ANNE-2026)' });
  const m = modal('Autoriser une urgence 12:15', [el('p', { class: 'muted small' }, 'Le secrétariat pourra encoder le prochain créneau d\'urgence pour ce patient (accord tracé).'), input], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => {
      const pat = store.patientByCode(input.value); if (!pat) { toast('Code inconnu.', 'err'); return; }
      const d = store.doctor(); const now = new Date();
      const emg = avail.generateOpenSlots({ doctor: d, appointments: store.appointments(), from: now, to: new Date(now.getTime() + 21 * 864e5), now, includeEmergency: true }).find((s) => s.emergency);
      if (!emg) { toast('Aucun créneau urgence disponible.', 'err'); return; }
      store.authorizeEmergency(pat.id, emg.start.toISOString()); m.close();
      toast(`Urgence ${fmtDateTime(emg.start)} autorisée pour ${pat.displayName}.`); render(mount);
    } }, 'Autoriser'),
  ]);
}

// --- MIGRATION ---
let migrationRows = null;
function avisCapacityCard() {
  const cap = store.avisCapacityInfo();
  return el('div', { class: 'sub' },
    el('div', { class: 'muted small' }, `Capacité avis (4 semaines) : ${cap.used}/${cap.max} utilisée (base ${cap.base}${cap.extra ? ` + ${cap.extra} ponctuel(s)` : ''}, plafond ${cap.ceiling}).`),
    el('div', { class: 'gauge' + (cap.used > cap.max ? ' over' : '') }, el('span', { style: `width:${Math.min(100, Math.round((cap.used / cap.max) * 100))}%` })),
  );
}

function addExtraAvisModal(mount) {
  const now = new Date();
  const av = store.avisOpenSlots({ now });
  if (!av.length) { toast("Aucun créneau d'avis disponible à proposer.", 'err'); return; }
  const sel = el('select', { class: 'field' }, av.slice(0, 40).map((s) => el('option', { value: s.start.toISOString() }, fmtDateTime(s.start))));
  const cap = store.avisCapacityInfo(now);
  const m = modal("Ajouter un créneau d'avis ponctuel", [
    el('p', { class: 'muted small' }, `Porte la capacité de ${cap.base} à ${cap.ceiling} (maximum 2 créneaux ponctuels sur 4 semaines). Aperçu de l'impact ci-dessous.`),
    el('div', { class: 'muted small' }, `Capacité actuelle : ${cap.used}/${cap.max}. Après ajout : ${cap.used}/${Math.min(cap.ceiling, cap.max + 1)}.`),
    el('label', { class: 'lbl' }, 'Créneau d\'avis'), sel,
  ], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => { const r = store.addExtraAvisSlot(sel.value, { now }); if (r.error) toast(r.message, 'err'); else { m.close(); toast('Créneau d\'avis ponctuel ajouté.'); render(mount); } } }, 'Ajouter'),
  ]);
}

function convertAvisModal(mount) {
  const now = new Date();
  const av = store.avisOpenSlots({ now });
  if (!av.length) { toast("Aucun créneau d'avis inutilisé à convertir.", 'err'); return; }
  const sel = el('select', { class: 'field' }, av.slice(0, 40).map((s) => el('option', { value: s.start.toISOString() }, fmtDateTime(s.start))));
  const m = modal("Convertir un créneau d'avis en suivi ordinaire", [
    el('p', { class: 'muted small' }, "Décision manuelle : un créneau d'avis inutilisé devient réservable comme suivi ordinaire. Il n'est jamais converti automatiquement."),
    el('label', { class: 'lbl' }, 'Créneau d\'avis'), sel,
  ], [
    el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn btn-primary', onclick: () => { const r = store.convertAvisSlotToOrdinary(sel.value); if (r.error) toast(r.message, 'err'); else { m.close(); toast('Créneau converti en suivi ordinaire.'); render(mount); } } }, 'Convertir'),
  ]);
}

function migrationTab(mount) {
  const ta = el('textarea', { class: 'field mono', rows: '7' }, store.get().fakeCsv);
  const preview = el('div', {});
  if (migrationRows) preview.appendChild(migrationPreview(mount));
  return el('div', {},
    el('div', { class: 'card' },
      el('h3', {}, 'Migration depuis Mobminder (CSV fictif)'),
      el('p', { class: 'muted small' }, 'Import des rendez-vous futurs. Prévisualisation, détection des doublons / collisions / rejets, contrôle humain, journal. Aucune écriture tant que vous ne validez pas.'),
      ta,
      el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => { migrationRows = store.analyzeCsv(ta.value); render(mount); } }, 'Analyser')),
    ),
    preview, migrationLog(),
  );
}
function migrationPreview(mount) {
  const rows = migrationRows;
  const ok = rows.filter((r) => r.accepted).length;
  return el('div', { class: 'card' },
    el('h3', {}, `Prévisualisation — ${ok}/${rows.length} importables`),
    el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['Ligne', 'Statut', 'Problèmes'].map((h) => el('th', {}, h)))),
      el('tbody', {}, rows.map((r) => el('tr', {},
        el('td', { class: 'mono small' }, r.raw),
        el('td', {}, r.accepted ? el('span', { class: 'pill ok' }, 'importable') : el('span', { class: 'pill warn' }, 'rejet')),
        el('td', { class: 'muted small' }, r.issues.join(', ') || '—'),
      ))),
    )),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => { migrationRows = null; render(mount); } }, 'Annuler'),
      el('button', { class: 'btn btn-primary', onclick: () => { const rec = store.commitMigration(rows); toast(`Migration : ${rec.imported} importés, ${rec.rejected} rejetés.`); migrationRows = null; render(mount); } }, `Valider l'import (${ok})`),
    ),
  );
}
function migrationLog() {
  const migs = [...store.migrations()].reverse();
  if (!migs.length) return el('div', {});
  return el('div', { class: 'card' }, el('h3', {}, 'Journal de migration'),
    el('div', { class: 'list' }, migs.map((m) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(m.ts)), el('div', { class: 'muted small' }, `total ${m.total} · importés ${m.imported} · rejetés ${m.rejected}`))))));
}

// --- JOURNAL ---
let journalFilter = { q: '', actor: '', page: 0 };
function journalTab(mount) {
  const all = store.logEntries();
  const actors = [...new Set(all.map((e) => e.actor))];
  const q = journalFilter.q.toLowerCase();
  const filtered = all.filter((e) =>
    (!journalFilter.actor || e.actor === journalFilter.actor) &&
    (!q || (e.action + ' ' + (e.detail || '')).toLowerCase().includes(q)));
  const pageSize = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  journalFilter.page = Math.min(journalFilter.page, pages - 1);
  const slice = filtered.slice(journalFilter.page * pageSize, journalFilter.page * pageSize + pageSize);

  const search = el('input', { class: 'field', placeholder: 'Rechercher (action, détail)', value: journalFilter.q });
  search.addEventListener('input', () => { journalFilter.q = search.value; journalFilter.page = 0; render(mount); const n = mount.querySelector('.field'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } });
  const actorSel = el('select', { class: 'field mini' }, el('option', { value: '' }, 'Tous les acteurs'), actors.map((a) => el('option', { value: a, selected: journalFilter.actor === a ? '' : null }, a)));
  actorSel.addEventListener('change', () => { journalFilter.actor = actorSel.value; journalFilter.page = 0; render(mount); });

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, 'Journal des opérations'),
      el('button', { class: 'btn btn-ghost', onclick: () => { downloadText('journal.csv', store.journalCsv(), 'text/csv;charset=utf-8'); toast('Journal exporté (CSV).'); } }, 'Exporter CSV')),
    el('div', { class: 'rule-grid' }, el('label', { class: 'lbl' }, 'Recherche'), search, el('label', { class: 'lbl' }, 'Acteur'), actorSel),
    slice.length ? el('div', { class: 'journal-list' }, slice.map((e) => el('div', { class: 'journal-item' },
      el('div', { class: 'journal-top' }, el('span', { class: 'pill' }, e.actor), el('span', { class: 'muted small' }, fmtDateTime(e.ts))),
      el('div', { class: 'journal-action' }, e.action),
      e.detail ? el('div', { class: 'muted small' }, e.detail) : null,
    ))) : el('div', { class: 'empty' }, 'Aucune entrée.'),
    el('div', { class: 'weeknav' },
      el('button', { class: 'btn btn-ghost', disabled: journalFilter.page > 0 ? null : '', onclick: () => { journalFilter.page -= 1; render(mount); } }, '← Précédent'),
      el('span', { class: 'muted small' }, `Page ${journalFilter.page + 1} / ${pages} · ${filtered.length} entrée(s)`),
      el('button', { class: 'btn btn-ghost', disabled: journalFilter.page < pages - 1 ? null : '', onclick: () => { journalFilter.page += 1; render(mount); } }, 'Suivant →'),
    ),
  );
}

function emailsTab() {
  const mails = store.neutralEmails();
  const reminders = store.simulateReminders();
  return el('div', {},
    el('div', { class: 'card' },
      el('h3', {}, 'E-mails de notification (aperçu)'),
      el('p', { class: 'muted' }, "Volontairement neutres : aucun contenu clinique. Ils signalent seulement qu'une demande est disponible."),
      mails.length ? el('div', { class: 'list' }, mails.map((m) => el('div', { class: 'mail' },
        el('div', { class: 'mail-head' }, el('strong', {}, m.subject), el('span', { class: 'muted small' }, fmtDateTime(m.ts))),
        el('pre', { class: 'mail-body' }, m.body),
      ))) : el('div', { class: 'empty' }, "Aucun e-mail pour l'instant."),
    ),
    el('div', { class: 'card' },
      el('h3', {}, 'Rappels neutres à envoyer (simulés)'),
      reminders.length ? el('div', { class: 'list' }, reminders.map((r) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, `Rappel J-${r.jMinus}`), el('div', { class: 'muted small' }, `${labelFor(r)} · ${fmtDateTime(r.datetime)}`)),
      ))) : el('div', { class: 'empty' }, 'Aucun rappel dû (selon la configuration).'),
    ),
  );
}

// --- RÉGLAGES ---
function reglagesTab(mount) {
  const cfg = store.notifyConfig();
  const chk = (key, label) => {
    const c = el('input', { type: 'checkbox' }); c.checked = !!cfg[key];
    c.addEventListener('change', () => { store.setNotifyConfig({ [key]: c.checked }); toast('Configuration enregistrée.'); });
    return el('label', { class: 'check' }, c, ' ' + label);
  };
  const importInput = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  importInput.addEventListener('change', () => {
    const f = importInput.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { const r = store.importState(String(reader.result)); if (r.error) toast(r.message, 'err'); else { toast('État restauré.'); tab = 'accueil'; render(mount); } };
    reader.readAsText(f);
  });
  return el('div', {},
    el('div', { class: 'card' },
      el('h3', {}, 'Notifications neutres'),
      el('p', { class: 'muted small' }, 'Le contenu clinique ne transite jamais par e-mail. Vous choisissez seulement quels signaux neutres sont émis.'),
      chk('onComment', 'Me notifier quand une personne ajoute un commentaire/demande'),
      chk('remindersJ2', 'Rappels neutres J-2 aux patients'),
      chk('remindersJ1', 'Rappels neutres J-1 aux patients'),
    ),
    el('div', { class: 'card' },
      el('h3', {}, 'Sauvegarde locale de la démonstration'),
      el('p', { class: 'muted small' }, 'Exporter/restaurer l\'état de la démo (utile pour les tests). Données fictives uniquement.'),
      el('div', { class: 'row-actions wrap' },
        el('button', { class: 'btn btn-ghost', onclick: () => { downloadText('demo-etat.json', store.exportState(), 'application/json'); toast('État exporté.'); } }, 'Exporter l\'état'),
        el('button', { class: 'btn btn-ghost', onclick: () => importInput.click() }, 'Importer un état'),
        el('button', { class: 'btn btn-ghost', onclick: () => { downloadText('journal.csv', store.journalCsv(), 'text/csv;charset=utf-8'); toast('Journal exporté (CSV).'); } }, 'Exporter le journal (CSV)'),
      ),
      importInput,
    ),
    el('div', { class: 'card' },
      el('h3', {}, 'Statistiques'),
      statsGrid(),
    ),
  );
}
function statsGrid() {
  const s = store.statsDetailed();
  const item = (n, l) => el('div', { class: 'stat' }, el('div', { class: 'stat-num' }, String(n)), el('div', { class: 'muted small' }, l));
  const absList = Object.entries(s.absByWeekday).map(([k, v]) => `${k} : ${v}`).join(' · ') || 'aucune';
  const delayList = Object.entries(s.avgDelayByCircuit).map(([k, v]) => `${store.circuitById(k)?.label || k} : ${v} j`).join(' · ') || 'n/a';
  return el('div', {},
    el('div', { class: 'stat-grid' },
      item(s.byStatus.effectue || 0, 'Effectués'),
      item(s.byStatus.absent || 0, 'Absences'),
      item(s.absenceRate + '%', 'Taux d\'absence'),
      item(s.occupancy + '%', 'Occupation 4 sem.'),
      item(s.conversion + '%', 'Conversion demande→parcours'),
      item(s.waitlist, 'Désistements'),
    ),
    el('div', { class: 'muted small', style: 'margin-top:10px' }, `Absences par jour : ${absList}`),
    el('div', { class: 'muted small' }, `Délai moyen d'accès par circuit : ${delayList}`),
  );
}

// Visite guidée (aide) par rôle.
function guidedTour() {
  const steps = [
    ['Accueil', 'Vue d\'ensemble : décisions en attente, recherche patient, jauges d\'occupation et de capacité avis.'],
    ["Aujourd'hui", 'La journée en cours, pointage effectué/absent en un clic, impression.'],
    ['Calendrier', 'Vue semaine colorée : ordinaire (bleu), avis (orange), urgence (rouge).'],
    ['Files', 'Désistement (48h) et demandes d\'avis : accepter, démarrer les initiales, bloc thérapeutique, relais, prolonger/raccourcir.'],
    ['Disponibilité', 'Trame, créneaux d\'avis, fermetures (jour/demi/créneau), jours fériés, capacité.'],
    ['Undo', 'Le bouton ↶ en haut annule la dernière action.'],
  ];
  modal('Visite guidée — Médecin', steps.map(([t2, d]) => el('div', { class: 'faq-item' }, el('div', { class: 'faq-q' }, t2), el('div', { class: 'muted small' }, d))),
    [el('button', { class: 'btn btn-primary', onclick: () => document.querySelector('.modal-back')?.remove() }, 'Compris')]);
}

function render(mount) {
  clear(mount);
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Tableau de bord — Dr Mathieu Place'), el('p', { class: 'muted' }, 'Démonstration — données fictives locales')),
    el('div', { class: 'row-actions wrap' },
      el('button', { class: 'btn btn-ghost', onclick: guidedTour }, 'Visite guidée'),
      el('button', { class: 'btn btn-ghost danger', onclick: async () => { if (await confirmDialog('Réinitialiser toutes les données de démonstration ?', { danger: true })) { store.reset(); tab = 'accueil'; migrationRows = null; render(mount); toast('Données réinitialisées.'); } } }, 'Réinitialiser la démo'),
    ),
  ));
  mount.appendChild(tabs(mount));
  const body = el('div', {});
  const map = { accueil: accueilTab, aujourdhui: aujourdhuiTab, calendrier: calendrierTab, agenda: agendaTab, intervention: interventionTab, files: filesTab, regles: reglesTab, dispo: dispoTab, migration: migrationTab, journal: journalTab, emails: emailsTab, reglages: reglagesTab };
  const fn = map[tab] || accueilTab;
  body.appendChild(fn(mount));
  mount.appendChild(body);
}

export function mountDoctor(node) { render(node); }
