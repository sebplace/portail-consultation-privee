// Portail patient. Aucune règle interne visible. Créneaux proposés avec navigation
// par semaine + "prochain créneau", récapitulatif avant réservation, ajout au
// calendrier (.ics), préférences de désistement, suivi de demande par référence.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import { t } from '../i18n.js';
import { el, clear, field, fmtDateTime, fmtDate, fmtTime, weekdayShort, toast, modal, confirmDialog, downloadText, icsForAppointment } from './dom.js';

let currentPatientId = null;
let weekOffset = 0; // navigation par semaine dans le sélecteur de créneaux

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
  const input = el('input', { class: 'field', placeholder: 'Ex. ANNE-2026', 'aria-label': t('p.code') });
  const connect = () => {
    const p = store.patientByCode(input.value);
    if (!p) { toast('Code inconnu.', 'err'); return; }
    currentPatientId = p.id; weekOffset = 0; render(mount);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  mount.appendChild(el('div', { class: 'card narrow' },
    el('h2', {}, t('p.space')),
    el('p', { class: 'muted' }, t('p.cabinet')),
    el('p', { class: 'muted' }, t('p.access')),
    input,
    el('button', { class: 'btn btn-primary', onclick: connect }, t('p.login')),
    el('div', { class: 'sep' }),
    el('p', { class: 'muted small' }, t('p.notyet')),
    el('div', { class: 'row-actions wrap' },
      el('button', { class: 'btn btn-ghost', onclick: () => newDemandView(mount) }, t('p.newdemand')),
      el('button', { class: 'btn btn-ghost', onclick: () => trackDemandView(mount) }, t('p.track')),
      el('button', { class: 'btn btn-ghost', onclick: () => faqView(mount) }, t('p.faq')),
    ),
    el('p', { class: 'hint' }, t('p.democodes') + codes),
  ));
}

// FAQ / page d'accueil expliquant le fonctionnement.
function faqView(mount) {
  clear(mount);
  const items = [
    ['Comment prendre un rendez-vous ?', "Connectez-vous avec votre code, cliquez sur « Choisir un rendez-vous » et sélectionnez un créneau proposé. Seuls les créneaux actuellement disponibles vous sont proposés."],
    ['Puis-je déplacer ou annuler ?', "Oui, depuis « Mes rendez-vous », tant que le rendez-vous est à venir. Vous pouvez déplacer votre rendez-vous parmi les créneaux disponibles."],
    ["Qu'est-ce que la liste de désistement ?", "Si vous avez déjà un rendez-vous à venir, vous pouvez demander à être prévenu(e) si une place plus tôt se libère, selon vos préférences (jours, horaires, délai)."],
    ['Comment adresser une nouvelle demande ?', "Utilisez « Adresser une nouvelle demande ». Le dépôt ne garantit ni acceptation, ni rendez-vous, ni délai. Le médecin examine chaque demande."],
    ['Le médecin voit-il mes messages par e-mail ?', "Non. Les e-mails sont neutres et ne contiennent aucun contenu. Votre message reste dans l'espace sécurisé du médecin."],
    ["En cas d'urgence ?", "Ce dispositif ne remplace jamais les services d'urgence. En cas d'urgence, appelez le 112."],
  ];
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, t('p.faq')), el('p', { class: 'muted' }, 'Cabinet du Dr Mathieu Place')),
    el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, t('p.back'))));
  mount.appendChild(el('div', { class: 'card' }, items.map(([q, a]) => el('div', { class: 'faq-item' },
    el('div', { class: 'faq-q' }, q), el('div', { class: 'muted small' }, a)))));
  mount.appendChild(el('div', { class: 'notice' }, t('p.emergency')));
}

function header(mount, patient) {
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, t('p.hello')), el('p', { class: 'muted' }, patient.displayName)),
    el('button', { class: 'btn btn-ghost', onclick: () => { currentPatientId = null; render(mount); } }, t('p.logout')),
  ));
}

// Navigation par semaine : regroupe et n'affiche qu'une semaine à la fois.
function weekSlots(slots, offset) {
  if (!slots.length) return { list: [], label: '', hasPrev: false, hasNext: false, firstNext: null };
  const now = new Date();
  const monday = new Date(now); monday.setHours(0, 0, 0, 0);
  const wd = (monday.getDay() === 0 ? 7 : monday.getDay());
  monday.setDate(monday.getDate() - (wd - 1) + offset * 7);
  const end = new Date(monday.getTime() + 7 * 24 * 3600 * 1000);
  const list = slots.filter((s) => s >= monday && s < end);
  const label = `Semaine du ${fmtDate(monday)}`;
  const hasPrev = slots.some((s) => s < monday) && offset > 0;
  const hasNext = slots.some((s) => s >= end);
  const firstNext = slots.find((s) => s >= end) || null;
  return { list, label, hasPrev, hasNext, firstNext, monday };
}

function slotGrid(list, onPick, highlightFirst) {
  const byDay = new Map();
  for (const s of list) { const k = fmtDate(s); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s); }
  return el('div', { class: 'slot-days' },
    [...byDay.entries()].map(([day, l]) => el('div', { class: 'slot-day' },
      el('div', { class: 'slot-day-label' }, day),
      el('div', { class: 'slot-chips' }, l.map((s, i) => el('button', {
        class: 'chip' + (highlightFirst && s === highlightFirst ? ' next' : ''), onclick: () => onPick(s),
      }, fmtTime(s)))),
    )),
  );
}

function bookRecap(mount, patient, slot, onConfirm) {
  const body = [
    el('p', {}, t('p.about2book')),
    el('div', { class: 'note-box' }, `${fmtDateTime(slot)} · ${store.doctor().slotDurationMin} min`),
    el('p', { class: 'muted small' }, t('p.reminder')),
  ];
  const confirm = el('button', { class: 'btn btn-primary', onclick: () => { m.close(); onConfirm(); } }, t('p.confirm'));
  const cancel = el('button', { class: 'btn btn-ghost', onclick: () => m.close() }, t('p.back'));
  const m = modal(t('p.confirm'), body, [cancel, confirm]);
}

function bookView(mount, patient) {
  clear(mount); header(mount, patient);
  const all = proposedSlots(patient);
  const wk = weekSlots(all, weekOffset);
  const nav = el('div', { class: 'weeknav' },
    el('button', { class: 'btn btn-ghost', disabled: wk.hasPrev ? null : '', onclick: () => { weekOffset = Math.max(0, weekOffset - 1); bookView(mount, patient); } }, t('p.weekprev')),
    el('strong', {}, wk.label || 'Aucun créneau'),
    el('button', { class: 'btn btn-ghost', disabled: wk.hasNext ? null : '', onclick: () => { weekOffset += 1; bookView(mount, patient); } }, t('p.weeknext')),
  );
  const pickHandler = (s) => bookRecap(mount, patient, s, () => {
    const res = store.bookAppointment(patient.id, s.toISOString(), { actor: 'patient' });
    if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
    toast('Rendez-vous enregistré.'); render(mount);
  });

  let content;
  if (!all.length) {
    content = el('div', { class: 'empty' }, "Aucun créneau ne vous est proposé actuellement. Vous pouvez vous inscrire sur la liste de désistement, ou signaler une demande.");
  } else if (!wk.list.length) {
    content = el('div', { class: 'empty' },
      'Aucun créneau cette semaine.',
      wk.firstNext ? el('div', { class: 'row-actions', style: 'justify-content:center;margin-top:10px' },
        el('button', { class: 'btn btn-primary', onclick: () => { const tgt = new Date(wk.firstNext); const nowMon = new Date(); nowMon.setHours(0,0,0,0); const wd = nowMon.getDay()===0?7:nowMon.getDay(); nowMon.setDate(nowMon.getDate()-(wd-1)); weekOffset = Math.round((tgt - nowMon) / (7*24*3600*1000)); bookView(mount, patient); } }, `Prochain créneau : ${fmtDate(wk.firstNext)}`)) : null);
  } else {
    content = slotGrid(wk.list, pickHandler, wk.list[0]);
  }

  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, t('p.chooserdv')),
    el('p', { class: 'muted' }, t('p.proposed')),
    nav, content,
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, t('p.back'))),
  ));
}

function moveView(mount, appointment, patient) {
  clear(mount); header(mount, patient);
  const now = new Date();
  const open = store.openSlots({ now });
  const all = proposedSlots(patient);
  const wk = weekSlots(all, weekOffset);
  const nav = el('div', { class: 'weeknav' },
    el('button', { class: 'btn btn-ghost', disabled: wk.hasPrev ? null : '', onclick: () => { weekOffset = Math.max(0, weekOffset - 1); moveView(mount, appointment, patient); } }, '← Semaine préc.'),
    el('strong', {}, wk.label || 'Aucun créneau'),
    el('button', { class: 'btn btn-ghost', disabled: wk.hasNext ? null : '', onclick: () => { weekOffset += 1; moveView(mount, appointment, patient); } }, 'Semaine suiv. →'),
  );
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Déplacer le rendez-vous'),
    el('p', { class: 'muted' }, `Actuellement : ${fmtDateTime(appointment.datetime)}.`),
    nav,
    wk.list.length ? slotGrid(wk.list, (s) => {
      const check = rules.validateMove({ openSlots: open, newDate: s, now });
      if (!check.ok) { toast(check.reason, 'err'); return; }
      const res = store.moveAppointment(appointment.id, s.toISOString(), { actor: 'patient' });
      if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
      toast('Rendez-vous déplacé.'); render(mount);
    }, wk.list[0]) : el('div', { class: 'empty' }, 'Aucun créneau cette semaine.'),
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

// Préférences de désistement (jours, plage horaire, délai minimal pour être prévenu).
function waitlistPrefsView(mount, patient) {
  clear(mount); header(mount, patient);
  const existing = store.waitlist().find((w) => w.patientId === patient.id);
  const p = (existing && existing.prefs) || { weekdays: null, timeFrom: null, timeTo: null, minDelayHours: 24 };
  const consultDays = store.consultationWeekdays(); // uniquement les vrais jours de consultation
  const dayBtns = consultDays.map((d) => {
    const on = !p.weekdays || p.weekdays.includes(d);
    return el('button', { class: 'day-toggle' + (on ? ' on' : ''), 'data-day': String(d), 'aria-pressed': on ? 'true' : 'false',
      onclick: (e) => { const b = e.currentTarget; const now = b.classList.toggle('on'); b.setAttribute('aria-pressed', now ? 'true' : 'false'); } }, weekdayShort(d));
  });
  const from = el('input', { class: 'field mini', type: 'time', value: p.timeFrom || '' });
  const to = el('input', { class: 'field mini', type: 'time', value: p.timeTo || '' });
  const delay = el('input', { class: 'field mini', type: 'number', min: '0', value: String(p.minDelayHours ?? 24) });
  mount.appendChild(el('div', { class: 'card' },
    el('h3', {}, 'Liste de désistement — mes préférences'),
    el('p', { class: 'muted small' }, 'Vous serez prévenu(e) uniquement pour une place plus tôt correspondant à ces préférences. Seuls les jours de consultation sont proposés.'),
    el('label', { class: 'lbl' }, 'Jours acceptés'),
    el('div', { class: 'day-row', role: 'group', 'aria-label': 'Jours acceptés' }, dayBtns),
    el('div', { class: 'rule-grid' },
      ...field('À partir de', from),
      ...field("Jusqu'à", to),
      ...field('Délai minimal pour être prévenu (h)', delay),
    ),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
      el('button', { class: 'btn btn-primary', onclick: (e) => {
        const days = [...e.target.closest('.card').querySelectorAll('.day-toggle.on')].map((b) => Number(b.dataset.day));
        const prefs = { weekdays: days.length === consultDays.length ? null : days, timeFrom: from.value || null, timeTo: to.value || null, minDelayHours: Number(delay.value) || 0 };
        if (!store.waitlist().some((w) => w.patientId === patient.id)) {
          const r = store.joinWaitlist(patient.id, { actor: 'patient', prefs });
          if (r && r.error) { toast(r.message, 'err'); return; }
        } else store.updateWaitlistPrefs(patient.id, prefs);
        toast('Préférences enregistrées. Vous êtes sur la liste de désistement.'); render(mount);
      } }, 'Enregistrer et m\'inscrire'),
    ),
  ));
}

function appointmentRow(mount, a, patient) {
  const canChange = new Date(a.datetime) > new Date();
  return el('div', { class: 'row-item' },
    el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
      el('div', { class: 'muted small' }, `${a.durationMin} min`)),
    el('div', { class: 'row-actions wrap' },
      el('button', { class: 'btn btn-ghost', title: 'Ajouter à mon calendrier', onclick: () => {
        downloadText('rendez-vous.ics', icsForAppointment({ title: 'Consultation — Dr Mathieu Place', start: a.datetime, durationMin: a.durationMin, description: 'Rendez-vous (prototype démo).' }), 'text/calendar;charset=utf-8');
        toast('Fichier calendrier téléchargé (.ics).');
      } }, t('p.calendar')),
      canChange ? el('button', { class: 'btn btn-ghost', onclick: () => { weekOffset = 0; moveView(mount, a, patient); } }, t('p.move')) : null,
      canChange ? el('button', { class: 'btn btn-ghost danger', onclick: async () => {
        if (!await confirmDialog(`Annuler le rendez-vous du ${fmtDateTime(a.datetime)} ?`, { danger: true, okLabel: 'Annuler le rendez-vous', cancelLabel: 'Conserver' })) return;
        store.cancelAppointment(a.id, { actor: 'patient' }); toast('Rendez-vous annulé.'); render(mount);
      } }, 'Annuler') : null,
    ),
  );
}

// --- Nouvelle demande : formulaire en étapes (stepper) ---
function newDemandView(mount) {
  clear(mount);
  const state = { step: 0, circuitId: store.circuits()[0].id, nom: '', prenom: '', naissance: '', email: '', tel: '', origine: 'personnelle', objectif: '', adressePar: '', relais: '', relaisCoord: '', dispos: '', note: '', ack: false };
  const steps = ['Circuit', 'Contexte', 'Disponibilités', 'Validation'];
  function head() {
    return el('div', { class: 'space-head' },
      el('div', {}, el('h2', {}, 'Nouvelle demande'), el('p', { class: 'muted' }, 'Cabinet du Dr Mathieu Place')),
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'));
  }
  function stepper() { return el('div', { class: 'stepper' }, steps.map((s, i) => el('div', { class: 'step' + (i <= state.step ? ' on' : ''), title: s }))); }
  function draw() {
    clear(mount); mount.appendChild(head()); mount.appendChild(stepper());
    const card = el('div', { class: 'card' });
    const circuit = store.circuitById(state.circuitId);
    if (state.step === 0) {
      const sel = el('select', { class: 'field' }, store.circuits().map((c) => el('option', { value: c.id, selected: c.id === state.circuitId ? '' : null }, c.label)));
      const explain = el('div', { class: 'notice info' }, circuit.description || '');
      sel.addEventListener('change', () => { state.circuitId = sel.value; explain.textContent = store.circuitById(sel.value).description || ''; });
      card.append(el('h3', {}, 'Quel type de demande ?'), ...field('Circuit demandé', sel), explain,
        el('div', { class: 'notice' }, "Le dépôt ne garantit ni acceptation, ni rendez-vous, ni délai, ni suivi régulier. Ce dispositif ne remplace pas les services d'urgence (112)."));
      card.append(navRow(null, () => { state.circuitId = sel.value; state.step = 1; draw(); }));
    } else if (state.step === 1) {
      const nom = el('input', { class: 'field', autocomplete: 'family-name', value: state.nom });
      const prenom = el('input', { class: 'field', autocomplete: 'given-name', value: state.prenom });
      const naissance = el('input', { class: 'field', type: 'date', autocomplete: 'bday', value: state.naissance });
      const email = el('input', { class: 'field', type: 'email', autocomplete: 'email', placeholder: 'prenom.nom@exemple.be', value: state.email });
      const tel = el('input', { class: 'field', type: 'tel', autocomplete: 'tel', placeholder: 'Téléphone de secours', value: state.tel });
      const origine = el('select', { class: 'field' }, el('option', { value: 'personnelle', selected: state.origine === 'personnelle' ? '' : null }, 'Démarche personnelle'), el('option', { value: 'adresse', selected: state.origine === 'adresse' ? '' : null }, 'Adressé(e) par un professionnel'));
      // Objectif principal en CHOIX FERMÉS (propre au circuit).
      const objSel = el('select', { class: 'field' }, (circuit.objectives || ['Autre']).map((o) => el('option', { value: o, selected: o === state.objectif ? '' : null }, o)));
      const adressePar = el('input', { class: 'field', placeholder: 'Professionnel qui adresse (si applicable)', value: state.adressePar });
      const relais = el('input', { class: 'field', placeholder: 'Relais prescripteur (nom), le cas échéant', value: state.relais });
      const relaisCoord = el('input', { class: 'field', placeholder: 'Coordonnées du relais (e-mail/téléphone)', value: state.relaisCoord });
      const save = () => { state.nom = nom.value.trim(); state.prenom = prenom.value.trim(); state.naissance = naissance.value; state.email = email.value.trim(); state.tel = tel.value.trim(); state.origine = origine.value; state.objectif = objSel.value; state.adressePar = adressePar.value; state.relais = relais.value; state.relaisCoord = relaisCoord.value; };
      card.append(el('h3', {}, 'Vos coordonnées'),
        el('p', { class: 'muted small' }, 'Nécessaires pour vous adresser une invitation sécurisée ou vous joindre en secours. Champs à titre de démonstration (données fictives).'),
        ...field('Nom', nom), ...field('Prénom', prenom), ...field('Date de naissance', naissance),
        ...field('E-mail', email), ...field('Téléphone de secours', tel),
        el('h3', {}, 'Contexte'),
        ...field('Origine de la démarche', origine),
        ...field('Objectif principal', objSel),
        ...field('Adressé(e) par', adressePar),
        ...field('Relais prescripteur éventuel', relais),
        ...field('Coordonnées du relais', relaisCoord));
      card.append(navRow(() => { save(); state.step = 0; draw(); }, () => {
        save();
        if (!state.nom || !state.prenom || !state.email) { toast('Nom, prénom et e-mail sont nécessaires pour vous recontacter.', 'err'); return; }
        state.step = 2; draw();
      }));
    } else if (state.step === 2) {
      const dispos = el('input', { class: 'field', placeholder: 'Vos disponibilités générales', value: state.dispos });
      const note = el('textarea', { class: 'field', rows: '3', placeholder: 'Précisions libres (facultatif)' }, state.note);
      card.append(el('h3', {}, 'Disponibilités'), ...field('Disponibilités générales', dispos), ...field('Précisions libres', note));
      card.append(navRow(() => { state.step = 1; draw(); }, () => { state.dispos = dispos.value; state.note = note.value; state.step = 3; draw(); }));
    } else {
      const c = circuit;
      const ack = el('input', { type: 'checkbox' });
      ack.checked = state.ack;
      card.append(el('h3', {}, 'Validation'),
        el('div', { class: 'note-box' }, `Demandeur : ${state.prenom} ${state.nom}${state.naissance ? ' (né·e le ' + state.naissance + ')' : ''}\nContact : ${state.email}${state.tel ? ' · ' + state.tel : ''}\nCircuit : ${c.label}\nOrigine : ${state.origine}\nObjectif : ${state.objectif || '—'}\nRelais : ${state.relais || '—'}${state.relaisCoord ? ' (' + state.relaisCoord + ')' : ''}`),
        el('label', { class: 'check' }, ack, " Je confirme avoir compris les limites du dispositif et les consignes d'urgence (ce canal ne remplace pas le 112)."));
      const submit = el('button', { class: 'btn btn-primary', onclick: () => {
        if (!ack.checked) { toast('Merci de confirmer la prise de connaissance des limites et consignes d\'urgence.', 'err'); return; }
        const d = store.submitDemand({ circuitId: state.circuitId, nom: state.nom, prenom: state.prenom, naissance: state.naissance, email: state.email, tel: state.tel, origine: state.origine, objectif: state.objectif, adressePar: state.adressePar, relais: state.relais, relaisCoord: state.relaisCoord, dispos: state.dispos, note: state.note, ackLimites: true });
        demandSubmittedView(mount, d);
      } }, 'Transmettre la demande');
      card.append(el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost', onclick: () => { state.step = 2; draw(); } }, 'Précédent'), submit));
    }
    mount.appendChild(card);
  }
  function navRow(onBack, onNext) {
    return el('div', { class: 'row-actions end' },
      onBack ? el('button', { class: 'btn btn-ghost', onclick: onBack }, 'Précédent') : null,
      el('button', { class: 'btn btn-primary', onclick: onNext }, 'Continuer'));
  }
  draw();
}

function demandSubmittedView(mount, d) {
  clear(mount);
  const ref = d.id.slice(-6).toUpperCase();
  mount.appendChild(el('div', { class: 'card narrow' },
    el('h2', {}, 'Demande transmise'),
    el('p', { class: 'muted' }, 'Le médecin examinera votre demande. Aucun délai n\'est garanti.'),
    el('p', {}, 'Votre référence de suivi :'),
    el('p', { class: 'ref-code' }, ref),
    el('p', { class: 'muted small' }, 'Conservez cette référence pour suivre l\'état de votre demande.'),
    el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-primary', onclick: () => render(mount) }, 'Terminer')),
  ));
}

function trackDemandView(mount) {
  clear(mount);
  const input = el('input', { class: 'field', placeholder: 'Référence (6 caractères)', 'aria-label': 'Référence' });
  const result = el('div', {});
  const look = () => {
    clear(result);
    const ref = (input.value || '').trim().toUpperCase();
    const d = store.demands().find((x) => x.id.slice(-6).toUpperCase() === ref);
    if (!d) { result.appendChild(el('div', { class: 'empty' }, 'Aucune demande pour cette référence.')); return; }
    result.appendChild(el('div', { class: 'note-box' }, `Circuit : ${store.circuitById(d.circuitId)?.label || d.circuitId}\nÉtat : ${store.DEMAND_STATUSES[d.status] || d.status}`));
  };
  mount.appendChild(el('div', { class: 'card narrow' },
    el('h2', {}, 'Suivre ma demande'),
    el('p', { class: 'muted small' }, 'Saisissez la référence reçue lors du dépôt.'),
    input,
    el('div', { class: 'row-actions wrap' },
      el('button', { class: 'btn btn-ghost', onclick: () => render(mount) }, 'Retour'),
      el('button', { class: 'btn btn-primary', onclick: look }, 'Vérifier'),
    ),
    result,
  ));
}

function render(mount) {
  clear(mount);
  if (!currentPatientId) { loginView(mount); return; }
  const patient = store.patientById(currentPatientId);
  if (!patient) { currentPatientId = null; loginView(mount); return; }
  store.purgeWaitlist(); store.processOffers();
  header(mount, patient);

  // Offre de désistement en cours pour ce patient ?
  const myOffer = store.offers().find((o) => o.status === 'en cours' && o.patientId === patient.id);
  if (myOffer) {
    mount.appendChild(el('div', { class: 'card' },
      el('h3', {}, 'Une place plus tôt vous est proposée'),
      el('p', {}, `${fmtDateTime(myOffer.datetime)} (proposition valable jusqu'au ${fmtDateTime(myOffer.expiresAt)}).`),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-primary', onclick: () => { const r = store.acceptOffer(myOffer.id, { actor: 'patient' }); if (r && r.error) toast(r.message, 'err'); else toast('Place acceptée.'); render(mount); } }, 'Accepter cette place'),
        el('button', { class: 'btn btn-ghost', onclick: () => { store.advanceOffer(myOffer.id, { reason: 'refus' }); toast('Proposition déclinée.'); render(mount); } }, 'Décliner'),
      ),
    ));
  }

  const upcoming = store.appointmentsOf(patient.id).filter((a) => a.status === 'planifie')
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const onWaitlist = store.waitlist().some((w) => w.patientId === patient.id);
  const canWaitlist = rules.canJoinWaitlist(store.appointments(), patient.id, new Date());

  // Bannière : rendez-vous tombant dans une fermeture -> reprogrammation guidée.
  const inClosure = store.appointmentsInClosures(patient.id);
  if (inClosure.length) {
    mount.appendChild(el('div', { class: 'card' },
      el('div', { class: 'notice' }, t('p.closurewarn')),
      el('div', { class: 'list' }, inClosure.map((a) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime))),
        el('button', { class: 'btn btn-primary', onclick: () => { weekOffset = 0; moveView(mount, a, patient); } }, t('p.reschedule')),
      ))),
    ));
  }

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, t('p.myrdv')),
      el('button', { class: 'btn btn-primary', onclick: () => { weekOffset = 0; bookView(mount, patient); } }, t('p.choose')),
    ),
    upcoming.length ? el('div', { class: 'list' }, upcoming.map((a) => appointmentRow(mount, a, patient)))
      : el('div', { class: 'empty' }, t('p.none')),
  ));

  mount.appendChild(el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', {}, t('p.otheractions')),
      el('button', { class: 'btn btn-ghost', onclick: () => faqView(mount) }, t('p.faq'))),
    el('div', { class: 'action-grid' },
      el('button', { class: 'btn btn-tile', onclick: () => requestView(mount, patient) },
        el('strong', {}, t('p.signal')), el('span', { class: 'muted small' }, t('p.signalsub'))),
      el('button', { class: 'btn btn-tile', disabled: (canWaitlist || onWaitlist) ? null : '',
        title: (canWaitlist || onWaitlist) ? null : t('p.waitlistneed'),
        onclick: () => { if (!canWaitlist && !onWaitlist) { toast("La liste de désistement n'est accessible que si vous avez déjà un rendez-vous à venir.", 'err'); return; } waitlistPrefsView(mount, patient); } },
        el('strong', {}, onWaitlist ? t('p.waitlistprefs') : t('p.waitlist')),
        el('span', { class: 'muted small' }, onWaitlist ? 'Modifier jours, horaires, délai' : (canWaitlist ? t('p.waitlistsub') : t('p.waitlistneed')))),
    ),
    onWaitlist ? el('div', { class: 'row-actions end' }, el('button', { class: 'btn btn-ghost danger', onclick: () => { store.leaveWaitlist(patient.id); toast('Retiré de la liste de désistement.'); render(mount); } }, t('p.leavewaitlist'))) : null,
  ));

  // Historique des rendez-vous passés (lecture seule).
  const past = store.pastAppointmentsOf(patient.id).slice(0, 10);
  if (past.length) {
    mount.appendChild(el('div', { class: 'card' },
      el('h3', {}, t('p.history')),
      el('div', { class: 'list' }, past.map((a) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
          el('div', { class: 'muted small' }, store.STATUS_LABEL[a.status] || a.status)),
      ))),
    ));
  }

  mount.appendChild(el('div', { class: 'notice' }, t('p.emergency')));
}

export function mountPatient(node) { render(node); }

