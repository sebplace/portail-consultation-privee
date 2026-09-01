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
    // Trame publique des suivis ORDINAIRES (mardi 16:00 et jeudi 11:30 sont désormais
    // des créneaux d'AVIS dédiés, donc retirés d'ici).
    weeklyTemplate: {
      2: ['13:00', '13:45', '14:30', '15:15'],                                        // mardi
      4: ['08:30', '09:15', '10:00', '10:45',                                          // jeudi matin (11:30 = avis)
        '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'],                         // jeudi après-midi (17:30 reste ordinaire)
    },
    // Créneaux d'AVIS dédiés (réservés aux circuits, exclus des suivis ordinaires) :
    // mardi 16:00 + jeudi 11:30 = 2/semaine = 8 par 4 semaines (capacité de base).
    avisTemplate: {
      2: ['16:00'],
      4: ['11:30'],
    },
    emergencyTemplate: {
      4: ['12:15'],                                                                  // jeudi urgence, invisible au public
    },
    protectedTemplate: {},                                                           // (fonction disponible, non utilisée)
    extraAvisSlots: [],                                                              // créneaux d'avis ponctuels (max 2 / 4 sem.) pour porter 8 -> 10
    convertedAvisSlots: [],                                                          // créneaux d'avis convertis manuellement en suivi ordinaire (ISO)
    closures: [],                                                                    // congés/fermetures datées
    avisCapacity: { windowDays: 28, target: 8, base: 8, max: 10, maxExtra: 2 },      // 8 séances / 4 semaines (extensible à 10)
    notifyConfig: { onComment: true, remindersJ2: true, remindersJ1: true },         // notifications neutres configurables
  };

  // --- Circuits (avis / parcours ciblés) ---
  const circuits = [
    {
      id: 'avis-general', label: 'Avis psychiatrique général', initialSessions: 2, spacingDays: 14,
      needsRelay: false, medication: false,
      description: "Avis ponctuel et limité dans le temps (2 consultations par défaut). Ce circuit ne constitue pas un suivi psychiatrique régulier ni indéfini.",
      objectives: [
        'Clarification diagnostique ou second avis',
        'Orientation thérapeutique',
        'Avis concernant un traitement',
        'Évaluation ponctuelle d\'une situation',
        'Autre',
      ],
    },
    {
      id: 'avis-pharmaco', label: 'Avis psychopharmacologique', initialSessions: 3, spacingDays: 14,
      needsRelay: true, medication: true,
      description: "Avis psychopharmacologique limité dans le temps (3 consultations par défaut). Toute instauration ou adaptation de traitement nécessite un relais prescripteur identifié. Ce circuit ne constitue pas un suivi indéfini.",
      objectives: [
        'Question concernant l\'instauration d\'un traitement',
        'Efficacité insuffisante',
        'Effets indésirables ou problème de tolérance',
        'Simplification d\'un traitement ou polymédication',
        'Interactions ou stratégie d\'ajustement',
        'Autre',
      ],
    },
    {
      id: 'tdah', label: 'TDA/TDAH', initialSessions: 3, spacingDays: 14,
      needsRelay: false, medication: false,
      phases: { diagnostic: 3, therapeutique: 3 }, therapeuticNeedsDecision: true, therapeuticMedication: true,
      description: "Évaluation TDA/TDAH limitée dans le temps : 3 consultations initiales d'évaluation. Une phase thérapeutique de 3 consultations peut éventuellement être ouverte ensuite, uniquement sur décision médicale distincte. Ce circuit ne constitue pas un suivi indéfini.",
      objectives: [
        'Suspicion ou demande de confirmation diagnostique',
        'Réévaluation d\'un diagnostic antérieur',
        'Discussion concernant une éventuelle instauration thérapeutique',
        'Réévaluation ou adaptation d\'un traitement en cours',
        'Autre',
      ],
    },
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
    // Bruno a un rendez-vous FUTUR planifié : il peut donc utiliser la liste de désistement.
    // (Anne n'a aucun rendez-vous futur : elle ne doit PAS pouvoir s'y inscrire.)
    { id: 'a4', patientId: 'p-bruno', datetime: iso(atWeekday(now, 4, '14:30', 1)), durationMin: 45, status: 'planifie' },
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

  return { doctor, circuits, patients, appointments, requests, demands, waitlist, offers, migrations, log, fakeCsv, version: 5 };
}

// Renvoie la prochaine date au jour de semaine voulu (1=lundi..7=dimanche), à l'heure
// hhmm, au moins `minWeeksAhead` semaines après `now`. Garantit un vrai créneau de trame.
function atWeekday(now, isoWd, hhmm, minWeeksAhead = 0) {
  const d = new Date(now.getTime() + minWeeksAhead * 7 * 24 * 3600 * 1000);
  const cur = d.getDay() === 0 ? 7 : d.getDay();
  let delta = isoWd - cur;
  if (delta <= 0) delta += 7;
  d.setDate(d.getDate() + delta);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function ymdPlus(now, days) {
  const d = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
