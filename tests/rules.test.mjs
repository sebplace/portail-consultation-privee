// Tests déterministes du moteur (sans framework). node tests/rules.test.mjs
import assert from 'node:assert';
import {
  addDays, atTime, isoWeekday, resolveAnchor, cadenceWindow, compatibleSlots,
  futurePlanned, bookingCapReached, validateMove, proposeSeries,
} from '../assets/js/core/rules.js';
import { generateOpenSlots, isClosed, appointmentsInClosure } from '../assets/js/core/availability.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}

// Trame du médecin (identique au seed).
const doctor = {
  name: 'Test', slotDurationMin: 45, horizonWeeks: 12,
  weeklyTemplate: {
    2: ['13:00', '13:45', '14:30', '15:15', '16:00'],
    4: ['08:30', '09:15', '10:00', '10:45', '11:30', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'],
  },
  emergencyTemplate: { 4: ['12:15'] },
  closures: [],
};
// Lundi 2026-01-05 comme "maintenant" de référence.
const NOW = new Date(2026, 0, 5, 7, 0, 0, 0);

test('isoWeekday: mardi=2, jeudi=4', () => {
  assert.equal(isoWeekday(new Date(2026, 0, 6)), 2);
  assert.equal(isoWeekday(new Date(2026, 0, 8)), 4);
});

test('generateOpenSlots: seulement mardi/jeudi, urgence exclue par défaut', () => {
  const to = addDays(NOW, 14);
  const slots = generateOpenSlots({ doctor, appointments: [], from: NOW, to, now: NOW });
  assert.ok(slots.length > 0);
  for (const s of slots) {
    assert.ok([2, 4].includes(isoWeekday(s.start)), 'mardi ou jeudi');
    assert.notEqual(s.time, '12:15', 'urgence jamais publique');
    assert.equal(s.emergency, false);
  }
});

test('generateOpenSlots: urgence 12:15 visible seulement si includeEmergency', () => {
  const to = addDays(NOW, 10);
  const withE = generateOpenSlots({ doctor, appointments: [], from: NOW, to, now: NOW, includeEmergency: true });
  assert.ok(withE.some((s) => s.time === '12:15' && s.emergency), '12:15 présent en mode urgence');
});

test('generateOpenSlots: une fermeture supprime les créneaux du jour', () => {
  const thu = '2026-01-08';
  const doc2 = { ...doctor, closures: [{ from: thu, to: thu, label: 'congé' }] };
  const to = addDays(NOW, 10);
  const slots = generateOpenSlots({ doctor: doc2, appointments: [], from: NOW, to, now: NOW });
  assert.ok(!slots.some((s) => s.day === thu), 'aucun créneau le jour fermé');
  assert.ok(isClosed(atTime(new Date(2026, 0, 8), '10:00'), doc2.closures));
});

test('generateOpenSlots: un rdv planifié occupe le créneau', () => {
  const busy = atTime(new Date(2026, 0, 6), '13:00'); // mardi 13:00
  const appts = [{ id: 'x', patientId: 'p', status: 'planifie', datetime: busy.toISOString(), durationMin: 45 }];
  const to = addDays(NOW, 5);
  const slots = generateOpenSlots({ doctor, appointments: appts, from: NOW, to, now: NOW });
  assert.ok(!slots.some((s) => s.start.getTime() === busy.getTime()), 'créneau occupé exclu');
});

test('resolveAnchor: ignore futur/annulé/absent, ne garde que effectué', () => {
  const appts = [
    { patientId: 'p', status: 'planifie', datetime: new Date(2026, 0, 20).toISOString() }, // futur
    { patientId: 'p', status: 'annule', datetime: new Date(2026, 0, 2).toISOString() },
    { patientId: 'p', status: 'absent', datetime: new Date(2026, 0, 3).toISOString() },
    { patientId: 'p', status: 'effectue', datetime: new Date(2025, 11, 15).toISOString() },
    { patientId: 'p', status: 'effectue', datetime: new Date(2025, 11, 29).toISOString() }, // le + récent effectué
  ];
  const a = resolveAnchor({ appointments: appts, patientId: 'p', explicitAnchor: null });
  assert.equal(a.date.getTime(), new Date(2025, 11, 29).getTime());
});

test('resolveAnchor: annulation d\'un futur ne change pas l\'ancrage (correctif)', () => {
  const done = new Date(2025, 11, 29);
  const before = [
    { patientId: 'p', status: 'effectue', datetime: done.toISOString() },
    { patientId: 'p', status: 'planifie', datetime: new Date(2026, 0, 20).toISOString() },
  ];
  const after = [
    { patientId: 'p', status: 'effectue', datetime: done.toISOString() },
    { patientId: 'p', status: 'annule', datetime: new Date(2026, 0, 20).toISOString() }, // annulé
  ];
  const a1 = resolveAnchor({ appointments: before, patientId: 'p' }).date.getTime();
  const a2 = resolveAnchor({ appointments: after, patientId: 'p' }).date.getTime();
  assert.equal(a1, done.getTime());
  assert.equal(a2, done.getTime(), 'ancrage identique avant/après annulation du futur');
});

test('resolveAnchor: date explicite du médecin prime', () => {
  const appts = [{ patientId: 'p', status: 'effectue', datetime: new Date(2025, 11, 1).toISOString() }];
  const exp = new Date(2026, 0, 15);
  const a = resolveAnchor({ appointments: appts, patientId: 'p', explicitAnchor: exp.toISOString() });
  assert.equal(a.date.getTime(), exp.getTime());
  assert.equal(a.source, 'medecin');
});

test('cadenceWindow: mode cadence = ancrage + fréquence ± marge', () => {
  const anchor = new Date(2026, 0, 5);
  const w = cadenceWindow({ anchor, cadence: { mode: 'cadence', frequencyDays: 21, marginDays: 5, horizonWeeks: 12 }, now: NOW });
  assert.equal(w.target.getTime(), addDays(anchor, 21).getTime());
  assert.equal(w.from.getTime(), addDays(anchor, 16).getTime());
  assert.equal(w.to.getTime(), addDays(anchor, 26).getTime());
});

test('cadenceWindow: mode fourchette = [min, max] ± marge', () => {
  const anchor = new Date(2026, 0, 5);
  const w = cadenceWindow({ anchor, cadence: { mode: 'fourchette', minDays: 10, maxDays: 21, marginDays: 2, horizonWeeks: 12 }, now: NOW });
  assert.equal(w.from.getTime(), addDays(anchor, 8).getTime());
  assert.equal(w.to.getTime(), addDays(anchor, 23).getTime());
});

test('compatibleSlots: filtre les créneaux ouverts selon la cadence', () => {
  const anchor = new Date(2025, 11, 29); // lundi
  const openS = generateOpenSlots({ doctor, appointments: [], from: NOW, to: addDays(NOW, 84), now: NOW });
  const cadence = { mode: 'cadence', frequencyDays: 21, marginDays: 5, horizonWeeks: 12, maxFuture: 1 };
  const { window: win, slots } = compatibleSlots({ openSlots: openS, anchor, cadence, now: NOW });
  assert.ok(slots.length > 0);
  for (const d of slots) {
    assert.ok(d >= win.from && d <= addDays(win.to, 1), 'dans la fenêtre');
    assert.ok([2, 4].includes(isoWeekday(d)), 'jour de trame');
  }
});

test('bookingCapReached: compte les rdv planifiés futurs', () => {
  const patient = { id: 'p' };
  const cad = { maxFuture: 1 };
  assert.equal(bookingCapReached([], patient, cad, NOW), false);
  const one = [{ patientId: 'p', status: 'planifie', datetime: addDays(NOW, 10).toISOString() }];
  assert.equal(bookingCapReached(one, patient, cad, NOW), true);
  // un rdv 'deplace' ne compte pas
  const moved = [{ patientId: 'p', status: 'deplace', datetime: addDays(NOW, 10).toISOString() }];
  assert.equal(bookingCapReached(moved, patient, cad, NOW), false);
});

test('validateMove: refuse un créneau hors trame, accepte un créneau ouvert', () => {
  const openS = generateOpenSlots({ doctor, appointments: [], from: NOW, to: addDays(NOW, 14), now: NOW });
  const bad = validateMove({ openSlots: openS, newDate: atTime(new Date(2026, 0, 7), '10:00'), now: NOW }); // mercredi
  assert.equal(bad.ok, false);
  const good = validateMove({ openSlots: openS, newDate: openS[0].start, now: NOW });
  assert.equal(good.ok, true, good.reason);
});

test('proposeSeries: série atomique de 3, espacée ~14j, ou null si impossible', () => {
  const openS = generateOpenSlots({ doctor, appointments: [], from: NOW, to: addDays(NOW, 84), now: NOW });
  const serie = proposeSeries({ openSlots: openS, count: 3, spacingDays: 14, marginDays: 6, now: NOW });
  assert.ok(Array.isArray(serie) && serie.length === 3, 'trois créneaux garantis');
  for (let i = 1; i < serie.length; i++) {
    const gap = (serie[i] - serie[i - 1]) / (24 * 3600 * 1000);
    assert.ok(gap >= 14 - 6 - 1 && gap <= 14 + 6 + 1, `espacement ${gap}j`);
  }
  // impossible : aucune dispo -> null
  const none = proposeSeries({ openSlots: [], count: 3, spacingDays: 14, now: NOW });
  assert.equal(none, null);
});

test('appointmentsInClosure: liste les rdv planifiés tombant dans la fermeture', () => {
  const inDay = atTime(new Date(2026, 0, 8), '10:00'); // jeudi
  const appts = [
    { id: 'z1', status: 'planifie', datetime: inDay.toISOString() },
    { id: 'z2', status: 'annule', datetime: inDay.toISOString() },
  ];
  const list = appointmentsInClosure(appts, { from: '2026-01-08', to: '2026-01-08' });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'z1');
});

test('generateOpenSlots: créneau protégé exclu du public, visible si includeProtected', () => {
  const doc2 = { ...doctor, protectedTemplate: { 2: ['16:00'] } };
  const to = addDays(NOW, 8);
  const pub = generateOpenSlots({ doctor: doc2, appointments: [], from: NOW, to, now: NOW });
  assert.ok(!pub.some((s) => isoWeekday(s.start) === 2 && s.time === '16:00'), 'protégé absent du public');
  const withP = generateOpenSlots({ doctor: doc2, appointments: [], from: NOW, to, now: NOW, includeProtected: true });
  assert.ok(withP.some((s) => s.time === '16:00' && s.protected), 'protégé visible en mode protégé');
});

test('isClosed: fermeture demi-journée (ISO) ne bloque que la plage horaire', () => {
  const closures = [{ from: '2026-01-08T08:00:00', to: '2026-01-08T12:00:00', label: 'matinée' }];
  assert.equal(isClosed(atTime(new Date(2026, 0, 8), '09:15'), closures), true, 'matin fermé');
  assert.equal(isClosed(atTime(new Date(2026, 0, 8), '14:30'), closures), false, 'après-midi ouvert');
});

console.log(`\n${passed} test(s) réussi(s).`);
