// Tableau de bord médecin : règles par patient, agenda, file « nécessite intervention »,
// exceptions, journal des opérations, aperçu des e-mails neutres.
import * as store from '../core/store.js';
import * as rules from '../core/rules.js';
import { el, clear, fmtDateTime, fmtDate, fmtTime, weekdayShort, toast } from './dom.js';

let tab = 'agenda';

function tabs(mount) {
  const items = [
    ['agenda', 'Agenda'],
    ['intervention', 'À traiter'],
    ['regles', 'Règles patients'],
    ['journal', 'Journal'],
    ['emails', 'E-mails'],
  ];
  return el('div', { class: 'tabs' },
    items.map(([id, label]) => {
      const open = store.openRequests().length;
      const badge = (id === 'intervention' && open) ? el('span', { class: 'badge' }, String(open)) : null;
      return el('button', {
        class: 'tab' + (tab === id ? ' active' : ''),
        'aria-pressed': tab === id ? 'true' : 'false',
        onclick: () => { tab = id; render(mount); },
      }, label, badge);
    }),
  );
}

function agendaTab(mount) {
  const appts = store.appointments()
    .filter((a) => a.status === 'booked')
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  const cancelled = store.appointments().filter((a) => a.status === 'cancelled');

  return el('div', {},
    el('div', { class: 'card' },
      el('h3', {}, 'Rendez-vous à venir'),
      appts.length ? el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, ['Date', 'Patient', 'Durée', 'Type'].map((h) => el('th', {}, h)))),
        el('tbody', {}, appts.map((a) => el('tr', {},
          el('td', {}, fmtDateTime(a.datetime)),
          el('td', {}, store.patientById(a.patientId)?.displayName || a.patientId),
          el('td', {}, `${a.durationMin} min`),
          el('td', {}, a.exception ? el('span', { class: 'pill warn' }, 'exception') : el('span', { class: 'pill' }, 'standard')),
        ))),
      ) : el('div', { class: 'empty' }, 'Aucun rendez-vous à venir.'),
    ),
    el('div', { class: 'card' },
      el('h3', {}, 'Annulations récentes'),
      cancelled.length ? el('div', { class: 'list' }, cancelled.slice(-8).reverse().map((a) => el('div', { class: 'row-item' },
        el('div', {}, el('div', { class: 'row-title' }, fmtDateTime(a.datetime)),
          el('div', { class: 'muted small' }, store.patientById(a.patientId)?.displayName || a.patientId)),
      ))) : el('div', { class: 'empty' }, 'Aucune annulation.'),
    ),
  );
}

function interventionTab(mount) {
  const open = store.openRequests();
  const typeLabel = (id) => (store.REQUEST_TYPES.find((t) => t.id === id) || {}).label || id;
  return el('div', { class: 'card' },
    el('h3', {}, 'Demandes nécessitant votre intervention'),
    el('p', { class: 'muted' }, 'Seules les demandes explicites apparaissent ici. Les prises / déplacements / annulations ordinaires ne génèrent aucune alerte.'),
    open.length ? el('div', { class: 'list' }, open.map((r) => el('div', { class: 'row-item stack' },
      el('div', {},
        el('div', { class: 'row-title' }, `${store.patientById(r.patientId)?.displayName || r.patientId} — ${typeLabel(r.type)}`),
        el('div', { class: 'muted small' }, fmtDateTime(r.createdAt)),
        r.note ? el('div', { class: 'note-box' }, r.note) : el('div', { class: 'muted small' }, '(pas de message)'),
      ),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-ghost', onclick: () => exceptionDialog(mount, r.patientId) }, 'Ouvrir une exception'),
        el('button', { class: 'btn btn-primary', onclick: () => { store.resolveRequest(r.id); toast('Demande traitée.'); render(mount); } }, 'Marquer traitée'),
      ),
    ))) : el('div', { class: 'empty' }, 'Rien à traiter. Tout est à jour.'),
  );
}

function exceptionDialog(mount, patientId) {
  const patient = store.patientById(patientId);
  const dateInput = el('input', { class: 'field', type: 'datetime-local' });
  const durInput = el('input', { class: 'field', type: 'number', value: String(patient.rule.durationMin), min: '10', step: '5' });
  const dlg = el('div', { class: 'modal-back', onclick: (e) => { if (e.target === dlg) dlg.remove(); } },
    el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      el('h3', {}, 'Exception — créneau hors règles'),
      el('p', { class: 'muted' }, `Patient : ${patient.displayName}. Vous ouvrez volontairement un créneau qui ne respecte pas les règles habituelles (le plafond du patient est ignoré).`),
      el('label', { class: 'lbl' }, 'Date et heure'), dateInput,
      el('label', { class: 'lbl' }, 'Durée (min)'), durInput,
      el('div', { class: 'row-actions end' },
        el('button', { class: 'btn btn-ghost', onclick: () => dlg.remove() }, 'Annuler'),
        el('button', { class: 'btn btn-primary', onclick: () => {
          if (!dateInput.value) { toast('Choisissez une date.', 'err'); return; }
          store.approveException(patientId, new Date(dateInput.value).toISOString(), Number(durInput.value));
          toast('Exception approuvée et posée à l\'agenda.');
          dlg.remove(); render(mount);
        } }, "Approuver l'exception"),
      ),
    ),
  );
  document.body.appendChild(dlg);
}

function ruleEditor(mount, patient) {
  const r = patient.rule;
  const num = (val, min, step = '1') => el('input', { class: 'field mini', type: 'number', value: String(val), min: String(min), step });
  const freq = num(r.frequencyDays, 1);
  const margin = num(r.marginDays, 0);
  const dur = num(r.durationMin, 10, '5');
  const step = num(r.slotStepMin || r.durationMin, 5, '5');
  const ahead = num(r.bookAhead, 1);
  const start = el('input', { class: 'field mini', type: 'time', value: r.startTime });
  const end = el('input', { class: 'field mini', type: 'time', value: r.endTime });
  const dayBtns = [1, 2, 3, 4, 5, 6, 7].map((d) => {
    const on = r.allowedWeekdays.includes(d);
    return el('button', {
      class: 'day-toggle' + (on ? ' on' : ''), 'data-day': String(d),
      'aria-pressed': on ? 'true' : 'false',
      'aria-label': weekdayShort(d) + (on ? ' (sélectionné)' : ''),
      onclick: (e) => {
        const b = e.currentTarget;
        const nowOn = b.classList.toggle('on');
        b.setAttribute('aria-pressed', nowOn ? 'true' : 'false');
        b.setAttribute('aria-label', weekdayShort(d) + (nowOn ? ' (sélectionné)' : ''));
      },
    }, weekdayShort(d));
  });

  const future = store.futureAppointmentsOf(patient.id).length;

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h3', {}, patient.displayName),
      el('span', { class: 'muted small' }, `code ${patient.code} · ${future} rdv à venir`),
    ),
    el('div', { class: 'rule-grid' },
      el('label', { class: 'lbl' }, 'Fréquence (jours)'), freq,
      el('label', { class: 'lbl' }, 'Marge ± (jours)'), margin,
      el('label', { class: 'lbl' }, 'Durée (min)'), dur,
      el('label', { class: 'lbl' }, 'Pas des créneaux (min)'), step,
      el('label', { class: 'lbl' }, "RDV à l'avance (plafond)"), ahead,
      el('label', { class: 'lbl' }, 'Début'), start,
      el('label', { class: 'lbl' }, 'Fin'), end,
    ),
    el('label', { class: 'lbl' }, 'Jours autorisés'),
    el('div', { class: 'day-row', role: 'group', 'aria-label': 'Jours autorisés' }, dayBtns),
    el('div', { class: 'row-actions end' },
      el('button', { class: 'btn btn-primary', onclick: (e) => {
        const days = [...e.target.closest('.card').querySelectorAll('.day-toggle.on')].map((b) => Number(b.dataset.day));
        if (days.length === 0) { toast('Sélectionnez au moins un jour.', 'err'); return; }
        store.updateRule(patient.id, {
          frequencyDays: Number(freq.value), marginDays: Number(margin.value),
          durationMin: Number(dur.value), slotStepMin: Number(step.value),
          bookAhead: Number(ahead.value), startTime: start.value, endTime: end.value,
          allowedWeekdays: days.sort(),
        });
        toast('Règles enregistrées.');
        render(mount);
      } }, 'Enregistrer les règles'),
    ),
  );
}

function reglesTab(mount) {
  return el('div', {}, store.patients().map((p) => ruleEditor(mount, p)));
}

function journalTab() {
  const entries = store.logEntries();
  return el('div', { class: 'card' },
    el('h3', {}, 'Journal des opérations'),
    entries.length ? el('table', { class: 'tbl' },
      el('thead', {}, el('tr', {}, ['Horodatage', 'Acteur', 'Action', 'Détail'].map((h) => el('th', {}, h)))),
      el('tbody', {}, entries.map((e) => el('tr', {},
        el('td', {}, fmtDateTime(e.ts)),
        el('td', {}, el('span', { class: 'pill' }, e.actor)),
        el('td', {}, e.action),
        el('td', { class: 'muted small' }, e.detail || ''),
      ))),
    ) : el('div', { class: 'empty' }, 'Journal vide.'),
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
    ))) : el('div', { class: 'empty' }, "Aucun e-mail envoyé pour l'instant."),
  );
}

function render(mount) {
  clear(mount);
  mount.appendChild(el('div', { class: 'space-head' },
    el('div', {}, el('h2', {}, 'Tableau de bord — Dr Mathieu Place'),
      el('p', { class: 'muted' }, 'Démonstration — données fictives locales')),
    el('button', { class: 'btn btn-ghost danger', onclick: () => {
      if (confirm('Réinitialiser toutes les données de démonstration ?')) { store.reset(); tab = 'agenda'; render(mount); toast('Données réinitialisées.'); }
    } }, 'Réinitialiser la démo'),
  ));
  mount.appendChild(tabs(mount));
  const body = el('div', {});
  if (tab === 'agenda') body.appendChild(agendaTab(mount));
  else if (tab === 'intervention') body.appendChild(interventionTab(mount));
  else if (tab === 'regles') body.appendChild(reglesTab(mount));
  else if (tab === 'journal') body.appendChild(journalTab());
  else if (tab === 'emails') body.appendChild(emailsTab());
  mount.appendChild(body);
}

export function mountDoctor(node) { render(node); }
