// Donnees de demonstration (FAUX patients, aucune donnee reelle).
// Regles par patient conformes au moteur (assets/js/core/rules.js).
// La date de reference est calculee au chargement pour rester coherente avec "aujourd'hui".

function iso(d) { return d.toISOString(); }

export function buildSeed(now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const at = (base, days, hhmm) => {
    const d = new Date(base.getTime() + days * day);
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const patients = [
    {
      id: 'p-anne',
      code: 'ANNE-2026',
      displayName: 'Patient A. (démo)',
      rule: {
        frequencyDays: 21, marginDays: 5,
        allowedWeekdays: [1, 2, 4], // lun, mar, jeu
        startTime: '09:00', endTime: '12:30',
        durationMin: 45, slotStepMin: 45, bookAhead: 1,
      },
    },
    {
      id: 'p-bruno',
      code: 'BRUNO-2026',
      displayName: 'Patient B. (démo)',
      rule: {
        frequencyDays: 14, marginDays: 3,
        allowedWeekdays: [3, 5], // mer, ven
        startTime: '14:00', endTime: '18:00',
        durationMin: 30, slotStepMin: 30, bookAhead: 2,
      },
    },
    {
      id: 'p-clara',
      code: 'CLARA-2026',
      displayName: 'Patient C. (démo)',
      rule: {
        frequencyDays: 42, marginDays: 7,
        allowedWeekdays: [2, 4], // mar, jeu
        startTime: '10:00', endTime: '16:00',
        durationMin: 60, slotStepMin: 60, bookAhead: 1,
      },
    },
  ];

  // RDV passes (servent de "dernier rdv" pour calculer la prochaine fenetre).
  const appointments = [
    { id: 'a1', patientId: 'p-anne', datetime: iso(at(now, -20, '09:00')), durationMin: 45, status: 'done' },
    { id: 'a2', patientId: 'p-bruno', datetime: iso(at(now, -13, '14:30')), durationMin: 30, status: 'done' },
    { id: 'a3', patientId: 'p-clara', datetime: iso(at(now, -40, '10:00')), durationMin: 60, status: 'done' },
    // Un rdv futur deja pose pour Bruno (bookAhead=2).
    { id: 'a4', patientId: 'p-bruno', datetime: iso(at(now, 1, '15:00')), durationMin: 30, status: 'booked' },
  ];

  const requests = [];
  const waitlist = [];
  const log = [
    { ts: iso(new Date(now.getTime() - 5 * 60000)), actor: 'systeme', action: 'seed', detail: 'Jeu de demonstration initialise.' },
  ];

  return { patients, appointments, requests, waitlist, log, version: 1 };
}
