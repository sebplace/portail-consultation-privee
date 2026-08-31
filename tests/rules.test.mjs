// Tests deterministes du moteur de regles (sans framework).
// Lancer : node tests/rules.test.mjs
import assert from 'node:assert';
import {
  addDays, isoWeekday, coherentWindow, compatibleSlots, validateMove, proposeChain, atTime,
} from '../assets/js/core/rules.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// Reference fixe pour un test deterministe : lundi 2026-01-05 (isoWeekday 1).
const REF = new Date(2026, 0, 5, 9, 0, 0, 0);

const rule = {
  frequencyDays: 21, marginDays: 5,
  allowedWeekdays: [1, 2, 4], // lun, mar, jeu
  startTime: '09:00', endTime: '12:30',
  durationMin: 45, slotStepMin: 45, bookAhead: 1,
};

test('isoWeekday: dimanche = 7', () => {
  assert.equal(isoWeekday(new Date(2026, 0, 4)), 7); // 2026-01-04 est un dimanche
  assert.equal(isoWeekday(new Date(2026, 0, 5)), 1); // lundi
});

test('coherentWindow: cible = ref + frequence, +/- marge', () => {
  const w = coherentWindow(REF, rule);
  assert.equal(w.target.getDate(), addDays(REF, 21).getDate());
  assert.equal(w.from.getDate(), addDays(REF, 16).getDate());
  assert.equal(w.to.getDate(), addDays(REF, 26).getDate());
});

test('compatibleSlots: uniquement jours autorises et heures dans la plage', () => {
  const { slots } = compatibleSlots({ rule, lastDate: REF, allBooked: [], now: new Date(2026, 0, 1) });
  assert.ok(slots.length > 0, 'des creneaux devraient exister');
  for (const s of slots) {
    assert.ok([1, 2, 4].includes(isoWeekday(s)), 'jour autorise');
    const mins = s.getHours() * 60 + s.getMinutes();
    assert.ok(mins >= 540 && mins + 45 <= 750 + 1, 'dans la plage horaire');
  }
});

test('compatibleSlots: aucun creneau dans le passe', () => {
  const now = new Date(2026, 0, 22, 10, 0); // a l'interieur de la fenetre
  const { slots } = compatibleSlots({ rule, lastDate: REF, allBooked: [], now });
  for (const s of slots) assert.ok(s > now, 'creneau strictement futur');
});

test('compatibleSlots: evite les conflits avec l\'agenda', () => {
  const clash = atTime(addDays(REF, 21), '09:00'); // en plein dans la fenetre, jour cible
  const booked = [{ id: 'x', status: 'booked', datetime: clash.toISOString(), durationMin: 45 }];
  const { slots } = compatibleSlots({ rule, lastDate: REF, allBooked: booked, now: new Date(2026, 0, 1) });
  assert.ok(!slots.some((s) => s.getTime() === clash.getTime()), 'le creneau occupe est exclu');
});

test('validateMove: refuse un jour non autorise', () => {
  const appt = { id: 'm1', patientId: 'p', status: 'booked', datetime: atTime(addDays(REF, 21), '09:00').toISOString(), durationMin: 45 };
  const wed = atTime(addDays(REF, 23), '09:00'); // mercredi (3) non autorise
  const res = validateMove({ rule, appointment: appt, newDate: wed, patientAppointments: [appt], allBooked: [appt], now: new Date(2026, 0, 1) });
  assert.equal(res.ok, false);
});

test('validateMove: accepte un deplacement dans la fenetre coherente', () => {
  const appt = { id: 'm2', patientId: 'p', status: 'booked', datetime: atTime(addDays(REF, 21), '09:00').toISOString(), durationMin: 45 };
  const target = atTime(addDays(REF, 22), '10:30'); // mardi, dans la fenetre
  const res = validateMove({ rule, appointment: appt, newDate: target, patientAppointments: [appt], allBooked: [appt], now: new Date(2026, 0, 1) });
  assert.equal(res.ok, true, res.reason);
});

test('proposeChain: enchaine N rdv espaces d\'environ la frequence', () => {
  const chain = proposeChain({ rule, lastDate: REF, allBooked: [], now: new Date(2026, 0, 1), count: 3 });
  assert.equal(chain.length, 3);
  assert.ok(chain.every(Boolean), 'les 3 propositions existent');
  for (let i = 1; i < chain.length; i++) {
    const gap = (chain[i] - chain[i - 1]) / (24 * 3600 * 1000);
    assert.ok(gap >= rule.frequencyDays - rule.marginDays - 1 && gap <= rule.frequencyDays + rule.marginDays + 1,
      `ecart ${gap}j dans la fourchette`);
  }
});

console.log(`\n${passed} test(s) reussi(s).`);
