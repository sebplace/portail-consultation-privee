// Tableau de bord médecin. Onglets : Agenda, À traiter, Files, Règles patients,
// Disponibilité, Migration, Journal, E-mails.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import * as avail from '../core/availability.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, weekdayLabel, toast } from './dom.js';

let tab = 'agenda';

function labelFor(a) {
  const p = store.patientById(a.patientId);
  if (p) return p.displayName;
  const d = store.demands().find((x) => x.id === a.patientId || x.circuitInstanceId === a.circuitInstanceId);
  if (d) return `Demande — ${store.circuitById(d.circuitId)?.label || 'circuit'}`;
  return a.patientId;
}

function tabs(mount) {
  const items = [
    ['agenda', 'Agenda'], ['intervention', 'À traiter'], ['files', 'Files'],
    ['regles', 'Règles patients'], ['dispo', 'Disponibilité'], ['migration', 'Migration'],
    ['journal', 'Journal'], ['emails', 'E-mails'],
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

// --- AGENDA ---
function agendaTab(mount) {
  const now = new Date();
  const appts = store.appointments().filter((a) => a.status === 'planifie')
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const recent = store.appointments().filter((a) => ['effectue', 'annule', 'absent', 'deplace'].includes(a.status))
    .sort((a, b) => new Date(b.datetime) - new Date(a.datetime)).slice(0, 10);

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
          el('button', { class: 'btn btn-ghost danger', onclick: () => { if (confirm('Annuler ?')) { store.cancelAppointment(a.id, { actor: 'medecin' }); render(mount); } } }, 'Annuler'),
        ),
      ))) : el('div', { class: 'empty' }, 'Aucun rendez-vous planifié.'),
    ),
    el('div', { class: 'card' },
      el('h3', {}, 'Historique récent'),
      recent.length ? el('div', { class: 'list' }, recent.map((a) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)), el('div', { class: 'muted small' }, labelFor(a))),
        el('div', {}, statusPicker(a)),
      ))) : el('div', { class: 'empty' }, 'Rien pour le moment.'),
    ),
  );
}

// --- À TRAITER (demandes explicites + fermetures impactantes) ---
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
        el('button', { class: 'btn btn-ghost', onclick: () => { store.approveException(r.patientId, prompt('Date/heure ISO exception (ex. 2026-09-10T12:15) :') || new Date().toISOString()); toast('Exception créée.'); render(mount); } }, 'Exception'),
        el('button', { class: 'btn btn-primary', onclick: () => { store.resolveRequest(r.id); toast('Demande traitée.'); render(mount); } }, 'Marquer traitée'),
      ),
    ))) : el('div', { class: 'empty' }, 'Rien à traiter. Tout est à jour.'),
  );
}

// --- FILES (désistement + avis/parcours) ---
function filesTab(mount) {
  const now = new Date();
  // Désistement
  store.purgeWaitlist(now);
  const wl = store.waitlist().map((w) => ({ w, p: store.patientById(w.patientId) }));
  const offers = store.offers().filter((o) => o.status === 'en cours');
  // Avis / parcours
  const demands = [...store.demands()].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  const desistement = el('div', { class: 'card' },
    el('h3', {}, 'Liste de désistement'),
    el('p', { class: 'muted small' }, "Personnes déjà suivies souhaitant avancer leur prochain rendez-vous. L'inscription expire au prochain rendez-vous. Offre successive 48h."),
    wl.length ? el('div', { class: 'list' }, wl.map(({ w, p }) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, p ? p.displayName : w.patientId),
        el('div', { class: 'muted small' }, `inscrit le ${fmtDate(w.createdAt)}${w.expiresAt ? ` · expire au ${fmtDate(w.expiresAt)}` : ''}`)),
    ))) : el('div', { class: 'empty' }, 'Personne inscrite.'),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => {
        const open = store.openSlots({ now });
        if (!open.length) { toast('Aucun créneau ouvert à proposer.', 'err'); return; }
        const res = store.offerFreedSlot(open[0].start.toISOString(), { now });
        if (res && res.error) { toast(res.message, 'err'); } else { toast('Place proposée (48h) à la 1re personne compatible.'); }
        render(mount);
      } }, 'Simuler une place libérée'),
    ),
    offers.length ? el('div', { class: 'sub' },
      el('div', { class: 'muted small' }, 'Offres en cours :'),
      el('div', { class: 'list' }, offers.map((o) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, `${store.patientById(o.patientId)?.displayName || o.patientId} — ${fmtDateTime(o.datetime)}`),
          el('div', { class: 'muted small' }, `expire ${fmtDateTime(o.expiresAt)}`)),
      ))),
    ) : null,
  );

  const statusPill = (d) => el('span', { class: 'pill' + (d.status.startsWith('accept') ? ' warn' : '') }, store.DEMAND_STATUSES[d.status] || d.status);

  const avisFile = el('div', { class: 'card' },
    el('h3', {}, 'File d\'avis et de parcours ciblés'),
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
  if (d.status === 'acceptee-conditionnelle') {
    actions.push(el('button', { class: 'btn btn-ghost', onclick: () => { const v = prompt('Relais prescripteur identifié :'); if (v) { store.setRelay(d.id, v); toast('Relais enregistré.'); render(mount); } } }, 'Identifier le relais'));
  }
  if (d.status === 'acceptee') {
    actions.push(el('button', { class: 'btn btn-primary', onclick: () => startCircuit(mount, d) }, 'Démarrer le parcours (atomique)'));
  }
  // priorité
  const prio = el('input', { class: 'field mini', type: 'number', value: String(d.priority || 0), title: 'Priorité (plus petit = plus prioritaire)' });
  prio.addEventListener('change', () => { store.setPriority(d.id, prio.value); toast('Priorité mise à jour.'); });

  return el('div', { class: 'row-item stack' },
    el('div', {},
      el('div', { class: 'row-title' }, `${c ? c.label : d.circuitId} `, el('span', { class: 'pill' }, store.DEMAND_STATUSES[d.status] || d.status)),
      el('div', { class: 'muted small' }, `déposée ${fmtDate(d.createdAt)} · origine ${d.origine}${d.adressePar ? ' · adressé par ' + d.adressePar : ''}${c && c.needsRelay ? ` · relais : ${d.relais || 'à identifier'}` : ''}`),
      d.objectif ? el('div', { class: 'muted small' }, 'Objectif : ' + d.objectif) : null,
      (c && c.needsRelay && !d.relais) ? el('div', { class: 'notice info small' }, 'Adaptation médicamenteuse impossible tant que le relais prescripteur n\'est pas identifié.') : null,
    ),
    el('div', { class: 'row-actions wrap' }, ...actions, (d.status !== 'refusee' && d.status !== 'close') ? el('label', { class: 'lbl inline' }, 'Priorité', prio) : null),
  );
}

function startCircuit(mount, d) {
  const c = store.circuitById(d.circuitId);
  const now = new Date();
  const open = store.openSlots({ now });
  const count = c.initialSessions;
  const serie = rules.proposeSeries({ openSlots: open, count, spacingDays: c.spacingDays, marginDays: 6, now });
  if (!serie) { toast(`Série de ${count} non garantie sur l'horizon — parcours non démarré.`, 'err'); return; }
  const preview = serie.map((s) => fmtDateTime(s)).join('\n');
  if (!confirm(`Réserver atomiquement ${count} consultations :\n\n${preview}\n\nConfirmer ?`)) return;
  const res = store.startCircuitAtomic(d.id, serie.map((s) => s.toISOString()));
  if (res && res.error) { toast(res.message, 'err'); render(mount); return; }
  toast(`Parcours démarré : ${res.created.length} consultations réservées. Invitation 7 jours.`);
  render(mount);
}

// --- RÈGLES PATIENTS (cadence cachée du patient, ancrage) ---
function reglesTab(mount) {
  return el('div', {},
    el('div', { class: 'notice info' }, 'Ces règles sont strictement internes : elles ne sont jamais visibles côté patient.'),
    ...store.patients().map((p) => cadenceEditor(mount, p)),
  );
}

function cadenceEditor(mount, patient) {
  const cad = patient.cadence;
  const now = new Date();
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: patient.id, explicitAnchor: patient.anchorDate });
  const modeSel = el('select', { class: 'field mini' },
    el('option', { value: 'cadence', selected: cad.mode === 'cadence' ? '' : null }, 'Cadence (fréquence fixe)'),
    el('option', { value: 'fourchette', selected: cad.mode === 'fourchette' ? '' : null }, 'Fourchette (min–max)'));
  const num = (v, min) => el('input', { class: 'field mini', type: 'number', value: String(v ?? ''), min: String(min) });
  const freq = num(cad.frequencyDays, 1), minD = num(cad.minDays, 1), maxD = num(cad.maxDays, 1);
  const margin = num(cad.marginDays, 0), horizon = num(cad.horizonWeeks || 12, 1), maxFut = num(cad.maxFuture, 1);
  const anchorInput = el('input', { class: 'field mini', type: 'date', value: patient.anchorDate ? patient.anchorDate.slice(0, 10) : '' });

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, patient.displayName),
      el('span', { class: 'muted small' }, `code ${patient.code}`),
    ),
    el('div', { class: 'muted small' }, `Ancrage effectif : ${anchor.date ? fmtDate(anchor.date) : '—'} (${anchor.source})`),
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
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => { store.setAnchor(patient.id, null); toast('Ancrage remis en automatique.'); render(mount); } }, 'Ancrage auto'),
      el('button', { class: 'btn btn-primary', onclick: () => {
        store.updateCadence(patient.id, {
          mode: modeSel.value, frequencyDays: Number(freq.value) || undefined,
          minDays: Number(minD.value) || undefined, maxDays: Number(maxD.value) || undefined,
          marginDays: Number(margin.value) || 0, horizonWeeks: Number(horizon.value) || 12, maxFuture: Number(maxFut.value) || 1,
        });
        store.setAnchor(patient.id, anchorInput.value ? new Date(anchorInput.value).toISOString() : null);
        toast('Règles enregistrées.'); render(mount);
      } }, 'Enregistrer'),
    ),
  );
}

// --- DISPONIBILITÉ (trame, fermetures, urgence) ---
function dispoTab(mount) {
  const d = store.doctor();
  const now = new Date();
  const wdList = Object.keys(d.weeklyTemplate).map(Number).sort();
  const closureFrom = el('input', { class: 'field mini', type: 'date' });
  const closureTo = el('input', { class: 'field mini', type: 'date' });
  const closureLabel = el('input', { class: 'field', placeholder: 'Motif (congé, formation, fermeture…)' });

  const trame = el('div', { class: 'card' },
    el('h3', {}, 'Trame hebdomadaire'),
    el('p', { class: 'muted small' }, `Durée des consultations : ${d.slotDurationMin} min · Intervalle entre les créneaux (min) : ${d.slotDurationMin} · Horizon : ${d.horizonWeeks} semaines`),
    el('div', { class: 'list' }, wdList.map((wd) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, weekdayLabel(wd)),
        el('div', { class: 'muted small' }, d.weeklyTemplate[wd].join(' · '))),
    ))),
    el('div', { class: 'notice info small' }, `Créneau d'urgence (invisible au public) : ${Object.entries(d.emergencyTemplate).map(([wd, t]) => weekdayLabel(Number(wd)) + ' ' + t.join(',')).join(' ; ')}. Encodable par le secrétariat seulement après votre accord tracé (onglet Files / bouton dédié ci-dessous).`),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-ghost', onclick: () => {
        const p = prompt('Autoriser une urgence 12:15 pour quel code patient ?'); if (!p) return;
        const pat = store.patientByCode(p); if (!pat) { toast('Code inconnu.', 'err'); return; }
        // prochaine urgence jeudi 12:15 ouverte
        const emg = avail.generateOpenSlots({ doctor: d, appointments: store.appointments(), from: now, to: new Date(now.getTime() + 21 * 864e5), now, includeEmergency: true }).find((s) => s.emergency);
        if (!emg) { toast('Aucun créneau urgence disponible.', 'err'); return; }
        store.authorizeEmergency(pat.id, emg.start.toISOString());
        toast(`Urgence ${fmtDateTime(emg.start)} autorisée pour ${pat.displayName}. Le secrétariat peut l'encoder.`);
        render(mount);
      } }, 'Autoriser une urgence 12:15'),
    ),
  );

  const closures = el('div', { class: 'card' },
    el('h3', {}, 'Congés / fermetures / exceptions datées'),
    el('div', { class: 'rule-grid' },
      el('label', { class: 'lbl' }, 'Du'), closureFrom,
      el('label', { class: 'lbl' }, 'Au'), closureTo,
    ),
    closureLabel,
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-primary', onclick: () => {
        if (!closureFrom.value || !closureTo.value) { toast('Renseignez les dates.', 'err'); return; }
        const closure = { from: closureFrom.value, to: closureTo.value, label: closureLabel.value || 'fermeture' };
        const impacted = avail.appointmentsInClosure(store.appointments(), closure);
        d.closures.push(closure);
        store.logOp('medecin', 'fermeture ajoutée', `${closure.from}->${closure.to} (${closure.label})`);
        store.save();
        if (impacted.length) {
          toast(`Fermeture ajoutée. ${impacted.length} rendez-vous à traiter (non déplacés automatiquement).`, 'err');
        } else { toast('Fermeture ajoutée.'); }
        render(mount);
      } }, 'Ajouter la fermeture'),
    ),
    d.closures.length ? el('div', { class: 'list' }, d.closures.map((c, i) => {
      const impacted = avail.appointmentsInClosure(store.appointments(), c);
      return el('div', { class: 'row-item stack' },
        el('div', {}, el('div', { class: 'row-title' }, `${fmtDate(c.from)} → ${fmtDate(c.to)} · ${c.label}`),
          impacted.length ? el('div', { class: 'notice info small' },
            `${impacted.length} rendez-vous à traiter (bloque toute nouvelle réservation sur la période, sans déplacer personne) :`,
            el('ul', { class: 'mini-list' }, impacted.map((a) => el('li', {}, `${fmtDateTime(a.datetime)} — ${labelFor(a)}`))),
          ) : el('div', { class: 'muted small' }, 'Aucun rendez-vous impacté.')),
        el('div', { class: 'row-actions' },
          el('button', { class: 'btn btn-ghost danger', onclick: () => { d.closures.splice(i, 1); store.logOp('medecin', 'fermeture retirée', `${c.from}->${c.to}`); store.save(); render(mount); } }, 'Retirer'),
        ),
      );
    })) : el('div', { class: 'empty' }, 'Aucune fermeture enregistrée.'),
  );

  return el('div', {}, trame, closures);
}

// --- MIGRATION CSV ---
let migrationRows = null;
function migrationTab(mount) {
  const ta = el('textarea', { class: 'field mono', rows: '7' }, store.get().fakeCsv);
  const preview = el('div', {});
  if (migrationRows) preview.appendChild(migrationPreview(mount));

  return el('div', {},
    el('div', { class: 'card' },
      el('h3', {}, 'Migration depuis Mobminder (CSV fictif)'),
      el('p', { class: 'muted small' }, 'Import des rendez-vous futurs. Prévisualisation, détection des doublons / collisions / rejets, contrôle humain, journal. Aucune écriture tant que vous ne validez pas.'),
      ta,
      el('div', { class: 'row-actions end' },
        el('button', { class: 'btn btn-ghost', onclick: () => { migrationRows = store.analyzeCsv(ta.value); render(mount); } }, 'Analyser'),
      ),
    ),
    preview,
    migrationLog(),
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
      el('button', { class: 'btn btn-primary', onclick: () => {
        const rec = store.commitMigration(rows);
        toast(`Migration : ${rec.imported} importés, ${rec.rejected} rejetés.`);
        migrationRows = null; render(mount);
      } }, `Valider l'import (${ok})`),
    ),
  );
}

function migrationLog() {
  const migs = [...store.migrations()].reverse();
  if (!migs.length) return el('div', {});
  return el('div', { class: 'card' },
    el('h3', {}, 'Journal de migration'),
    el('div', { class: 'list' }, migs.map((m) => el('div', { class: 'row-item' },
      el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(m.ts)),
        el('div', { class: 'muted small' }, `total ${m.total} · importés ${m.imported} · rejetés ${m.rejected}`)),
    ))),
  );
}

// --- JOURNAL (adapté téléphone : cartes empilées) ---
function journalTab() {
  const entries = store.logEntries();
  return el('div', { class: 'card' },
    el('h3', {}, 'Journal des opérations'),
    entries.length ? el('div', { class: 'journal-list' }, entries.map((e) => el('div', { class: 'journal-item' },
      el('div', { class: 'journal-top' }, el('span', { class: 'pill' }, e.actor), el('span', { class: 'muted small' }, fmtDateTime(e.ts))),
      el('div', { class: 'journal-action' }, e.action),
      e.detail ? el('div', { class: 'muted small' }, e.detail) : null,
    ))) : el('div', { class: 'empty' }, 'Journal vide.'),
  );
}

function emailsTab() {
  const mails = store.neutralEmails();
  return el('div', { class: 'card' },
    el('h3', {}, 'E-mails de notification (aperçu)'),
    el('p', { class: 'muted' }, "Volontairement neutres : aucun contenu clinique. Ils signalent seulement qu'une demande est disponible."),
    mails.length ? el('div', { class: 'list' }, mails.map((m) => el('div', { class: 'mail' },
      el('div', { class: 'mail-head' }, el('strong', {}, m.subject), el('span', { class: 'muted small' }, fmtDateTime(m.ts))),
      el('pre', { class: 'mail-body' }, m.body),
    ))) : el('div', { class: 'empty' }, "Aucun e-mail pour l'instant."),
  );
}

function render(mount) {
  clear(mount);
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Tableau de bord — Dr Mathieu Place'),
      el('p', { class: 'muted' }, 'Démonstration — données fictives locales')),
    el('button', { class: 'btn btn-ghost danger', onclick: () => { if (confirm('Réinitialiser toutes les données de démonstration ?')) { store.reset(); tab = 'agenda'; migrationRows = null; render(mount); toast('Données réinitialisées.'); } } }, 'Réinitialiser la démo'),
  ));
  mount.appendChild(tabs(mount));
  const body = el('div', {});
  if (tab === 'agenda') body.appendChild(agendaTab(mount));
  else if (tab === 'intervention') body.appendChild(interventionTab(mount));
  else if (tab === 'files') body.appendChild(filesTab(mount));
  else if (tab === 'regles') body.appendChild(reglesTab(mount));
  else if (tab === 'dispo') body.appendChild(dispoTab(mount));
  else if (tab === 'migration') body.appendChild(migrationTab(mount));
  else if (tab === 'journal') body.appendChild(journalTab());
  else if (tab === 'emails') body.appendChild(emailsTab());
  mount.appendChild(body);
}

export function mountDoctor(node) { render(node); }
