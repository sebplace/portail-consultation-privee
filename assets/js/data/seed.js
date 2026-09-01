// Données de démonstration (FAUX patients, aucune donnée réelle).
// La trame hebdomadaire est la disponibilité PROFESSIONNELLE réelle du médecin
// (offre de créneaux), pas une donnée patient.

function iso(d) { return d.toISOString(); }

export function buildSeed(now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const at = (base, days, hhmm) => {
    const d = new Date(base.getTime() + days * day);
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  };

  // --- Médecin : disponibilité générale réelle ---
  const doctor = {
    name: 'Dr Mathieu Place',
    slotDurationMin: 45,
    horizonWeeks: 12,
    weeklyTemplate: {
      2: ['13:00', '13:45', '14:30', '15:15', '16:00'],                              // mardi
      4: ['08:30', '09:15', '10:00', '10:45', '11:30',                               // jeudi matin
        '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'],                       // jeudi après-midi (coupure 13:00-13:45)
    },
    emergencyTemplate: {
      4: ['12:15'],                                                                  // jeudi urgence, invisible au public
    },
    protectedTemplate: {
      2: ['16:00'],                                                                  // mardi 16:00 : créneau protégé (réservé à certains usages), non public
    },
    closures: [],                                                                    // congés/fermetures datées
    avisCapacity: { windowDays: 28, target: 8, min: 8, max: 10 },                    // ~8 séances / 4 semaines (8-10)
    notifyConfig: { onComment: true, remindersJ2: true, remindersJ1: true },         // notifications neutres configurables
  };

  // --- Circuits (avis / parcours ciblés) ---
  const circuits = [
    { id: 'avis-general', label: 'Avis psychiatrique général', initialSessions: 2, spacingDays: 14, needsRelay: false },
    { id: 'avis-pharmaco', label: 'Avis psychopharmacologique', initialSessions: 3, spacingDays: 14, needsRelay: true },
    { id: 'tdah', label: 'TDA/TDAH', initialSessions: 3, spacingDays: 14, needsRelay: false,
      phases: { diagnostic: 3, therapeutique: 3 } },
  ];

  // --- Faux patients suivis (cadence CACHÉE côté patient) ---
  const patients = [
    {
      id: 'p-anne', code: 'ANNE-2026', displayName: 'Patient A. (démo)', email: 'anne@example.test',
      anchorDate: null, // le médecin peut fixer une date d'ancrage explicite
      cadence: { mode: 'cadence', frequencyDays: 21, marginDays: 5, horizonWeeks: 12, maxFuture: 1 },
    },
    {
      id: 'p-bruno', code: 'BRUNO-2026', displayName: 'Patient B. (démo)', email: 'bruno@example.test',
      anchorDate: null,
      cadence: { mode: 'fourchette', minDays: 10, maxDays: 21, marginDays: 2, horizonWeeks: 12, maxFuture: 2 },
    },
    {
      id: 'p-clara', code: 'CLARA-2026', displayName: 'Patient C. (démo)', email: 'clara@example.test',
      anchorDate: null,
      cadence: { mode: 'cadence', frequencyDays: 42, marginDays: 7, horizonWeeks: 12, maxFuture: 1 },
    },
    {
      id: 'p-david', code: 'DAVID-2026', displayName: 'Patient D. (démo)', email: 'david@example.test',
      anchorDate: null, // nouveau suivi : aucun rdv effectué -> tout l'horizon ouvert
      cadence: { mode: 'cadence', frequencyDays: 28, marginDays: 4, horizonWeeks: 12, maxFuture: 1 },
    },
    {
      id: 'p-elodie', code: 'ELODIE-2026', displayName: 'Patient E. (démo)', email: 'elodie@example.test',
      anchorDate: null,
      cadence: { mode: 'fourchette', minDays: 7, maxDays: 14, marginDays: 1, horizonWeeks: 12, maxFuture: 3 },
    },
  ];

  // --- Rendez-vous : au moins un EFFECTUÉ (ancrage) par patient, tous 45 min ---
  const appointments = [
    { id: 'a1', patientId: 'p-anne', datetime: iso(at(now, -20, '13:00')), durationMin: 45, status: 'effectue' },
    { id: 'a2', patientId: 'p-bruno', datetime: iso(at(now, -12, '14:30')), durationMin: 45, status: 'effectue' },
    { id: 'a3', patientId: 'p-clara', datetime: iso(at(now, -40, '10:00')), durationMin: 45, status: 'effectue' },
    { id: 'a5', patientId: 'p-elodie', datetime: iso(at(now, -8, '09:15')), durationMin: 45, status: 'effectue' },
  ];

  // --- Faux CSV Mobminder (rdv futurs à migrer) : texte brut pour la démo ---
  const fakeCsv = [
    'code_patient;date;heure;duree',
    'ANNE-2026;' + ymdPlus(now, 8) + ';13:45;45',   // futur, compatible
    'BRUNO-2026;' + ymdPlus(now, 5) + ';15:15;45',  // futur
    'CLARA-2026;' + ymdPlus(now, 3) + ';10:00;45',  // futur
    'INCONNU-9999;' + ymdPlus(now, 6) + ';09:15;45', // patient inconnu -> rejet
    'ANNE-2026;' + ymdPlus(now, 8) + ';13:45;45',   // doublon strict -> rejet
    'BRUNO-2026;' + ymdPlus(now, 5) + ';15:15;60',  // collision horaire (même créneau, durée != 45)
  ].join('\n');

  const requests = [];     // demandes explicites (déclenchent notif neutre)
  const demands = [];      // file avis/parcours (nouvelles demandes)
  const waitlist = [];     // liste de désistement
  const offers = [];       // propositions de désistement en cours (48h)
  const migrations = [];   // journaux de migration
  const log = [
    { ts: iso(new Date(now.getTime() - 5 * 60000)), actor: 'systeme', action: 'seed', detail: 'Jeu de démonstration initialisé.' },
  ];

  return { doctor, circuits, patients, appointments, requests, demands, waitlist, offers, migrations, log, fakeCsv, version: 4 };
}

function ymdPlus(now, days) {
  const d = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
