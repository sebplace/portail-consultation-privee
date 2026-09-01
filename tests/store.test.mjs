// Tests d'acceptation au niveau du store (Node), avec un shim localStorage.
// Rejoue les 7 critères validés avec le client. Lancer : node tests/store.test.mjs
globalThis.localStorage = (() => {
  let m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => { m = new Map(); },
  };
})();

const store = await import('../assets/js/core/store.js');
const rules = await import('../assets/js/core/rules.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion'); };

const now = () => new Date();
const avis = () => store.avisOpenSlots({ now: now() });

test('T1 : désistement refusé sans rdv futur (Anne), accepté avec (Bruno)', () => {
  store.reset();
  const r = store.joinWaitlist('p-anne', { actor: 'patient' });
  assert(r && r.error === 'no-future', 'Anne doit être refusée');
  const r2 = store.joinWaitlist('p-bruno', { actor: 'patient' });
  assert(r2 && r2.ok, 'Bruno (rdv futur) doit être accepté');
});

test('T2 : créneaux d\'avis exacts (mardi 16:00 + jeudi 11:30) et exclus de l\'ordinaire', () => {
  store.reset();
  const types = [...new Set(avis().map((s) => (s.start.getDay() === 2 ? 'mardi ' : 'jeudi ') + s.time))];
  assert(types.includes('mardi 16:00') && types.includes('jeudi 11:30'), 'avis attendus');
  const ord = store.openSlots({ now: now() });
  assert(!ord.some((s) => (s.start.getDay() === 2 && s.time === '16:00') || (s.start.getDay() === 4 && s.time === '11:30')), 'avis exclus de l\'ordinaire');
});

test('T3 : TDAH démarre 3 consultations initiales seulement', () => {
  store.reset();
  const d = store.submitDemand({ circuitId: 'tdah', origine: 'personnelle', objectif: 'x', ackLimites: true });
  store.acceptDemand(d.id);
  const s = rules.proposeSeries({ openSlots: avis(), count: 3, spacingDays: 14, marginDays: 3, now: now() });
  const r = store.startCircuitAtomic(d.id, s.map((x) => x.toISOString()));
  const n = store.appointments().filter((a) => a.circuitInstanceId === r.instanceId && a.status === 'planifie').length;
  assert(n === 3, `attendu 3, obtenu ${n}`);
});

test('T4 : bloc thérapeutique (+3) seulement après décision distincte', () => {
  store.reset();
  const d = store.submitDemand({ circuitId: 'tdah', origine: 'personnelle', objectif: 'x', ackLimites: true });
  store.acceptDemand(d.id);
  const s = rules.proposeSeries({ openSlots: avis(), count: 3, spacingDays: 14, marginDays: 3, now: now() });
  const r = store.startCircuitAtomic(d.id, s.map((x) => x.toISOString()));
  const before = store.appointments().filter((a) => a.circuitInstanceId === r.instanceId && a.status === 'planifie').length;
  const last = store.appointments().filter((a) => a.circuitInstanceId === r.instanceId && a.status === 'planifie').map((a) => new Date(a.datetime)).sort((a, b) => b - a)[0];
  const sT = rules.proposeSeries({ openSlots: avis(), count: 3, spacingDays: 14, marginDays: 3, startFrom: new Date(last.getTime() + 864e5), now: now() });
  const rt = store.openTherapeuticBlock(d.id, sT.map((x) => x.toISOString()));
  const after = store.appointments().filter((a) => a.circuitInstanceId === r.instanceId && a.status === 'planifie').length;
  assert(before === 3 && after === 6 && !rt.error, `avant ${before}, après ${after}`);
});

test('T5 : conditionnel démarre les initiales, médicament bloqué sans relais puis débloqué', () => {
  store.reset();
  const d = store.submitDemand({ circuitId: 'avis-pharmaco', origine: 'personnelle', objectif: 'x', relais: '', ackLimites: true });
  assert(store.acceptDemand(d.id).status === 'acceptee-conditionnelle', 'doit être conditionnelle');
  const s = rules.proposeSeries({ openSlots: avis(), count: 3, spacingDays: 14, marginDays: 3, now: now() });
  const r = store.startCircuitAtomic(d.id, s.map((x) => x.toISOString()));
  assert(r.created && r.created.length === 3, 'initiales démarrées sous conditionnelle');
  assert(store.clearMedication(d.id).error, 'médicament bloqué sans relais');
  store.setRelay(d.id, 'Dr X');
  assert(store.clearMedication(d.id).ok, 'médicament autorisé avec relais');
});

test('T6 : aucune notification médecin sur opérations ordinaires', () => {
  store.reset();
  const before = store.neutralEmails().length;
  const ord = store.openSlots({ now: now() });
  const bk = store.bookAppointment('p-clara', ord[0].start.toISOString(), { actor: 'patient' });
  const mv = store.moveAppointment(bk.id, ord[1].start.toISOString(), { actor: 'patient' });
  store.cancelAppointment(mv.id, { actor: 'patient' });
  assert(store.neutralEmails().length === before, 'aucune notification ne doit être émise');
});

test('T7 : undo restaure l\'état précédent', () => {
  store.reset();
  const ord = store.openSlots({ now: now() });
  const n0 = store.appointments().filter((a) => a.status === 'planifie').length;
  store.bookAppointment('p-clara', ord[0].start.toISOString(), { actor: 'patient' });
  const n1 = store.appointments().filter((a) => a.status === 'planifie').length;
  assert(n1 === n0 + 1, 'réservation ajoutée');
  store.undo();
  const n2 = store.appointments().filter((a) => a.status === 'planifie').length;
  assert(n2 === n0, 'undo doit restaurer l\'état');
});

test('T8 : undo est une opération corrective journalisée (ne supprime aucune trace)', () => {
  store.reset();
  const ord = store.openSlots({ now: now() });
  const bk = store.bookAppointment('p-clara', ord[0].start.toISOString(), { actor: 'patient' });
  store.cancelAppointment(bk.id, { actor: 'patient' });
  const logAfterCancel = store.get().log.length;
  store.undo();
  const logAfterUndo = store.get().log.length;
  assert(logAfterUndo >= logAfterCancel, 'le journal ne doit jamais être raccourci par un undo');
  const last = store.get().log[store.get().log.length - 1];
  assert(/corrective/.test(last.action), 'undo doit journaliser une opération corrective');
  const apt = store.appointments().find((a) => a.id === bk.id);
  assert(apt && apt.status === 'planifie', 'la donnée métier doit être restaurée');
});

test('T9 : date d\'effet de la trame (jamais rétroactive) + liste des incompatibles', () => {
  store.reset();
  const ord = store.openSlots({ now: now() });
  const slot = ord[0];
  const wd = slot.start.getDay() === 0 ? 7 : slot.start.getDay();
  store.bookAppointment('p-clara', slot.start.toISOString(), { actor: 'patient' });
  const effPast = new Date().toISOString().slice(0, 10);
  const incNow = store.incompatibleAfterSlotRemoval(wd, slot.time, 'ordinaire', effPast);
  assert(incNow.some((a) => a.datetime === slot.start.toISOString()), 'rdv incompatible si retrait immédiat');
  const effFuture = new Date(slot.start.getTime() + 60 * 864e5).toISOString().slice(0, 10);
  const incFut = store.incompatibleAfterSlotRemoval(wd, slot.time, 'ordinaire', effFuture);
  assert(incFut.length === 0, 'rdv avant la date d\'effet non incompatible');
  const rem = store.removeSlot(wd, slot.time, 'ordinaire', { effectiveDate: effFuture });
  assert(rem.ok, 'retrait daté accepté');
  assert((store.doctor().weeklyTemplate[wd] || []).includes(slot.time), 'retrait futur ne mute pas la trame de base');
  assert(store.trameChanges().some((c) => c.action === 'remove' && c.time === slot.time), 'override daté enregistré');
});

test('T10 : fermeture récurrente hebdomadaire bloque le bon jour et la bonne demi-journée', () => {
  store.reset();
  const hasTuePm = (slots) => slots.some((s) => { const wd = s.start.getDay() === 0 ? 7 : s.start.getDay(); return wd === 2 && s.start.getHours() >= 12; });
  assert(hasTuePm(store.openSlots({ now: now() })), 'des créneaux mardi après-midi doivent exister au départ');
  store.addClosure({ recurring: 'weekly', weekday: 2, part: 'pm', label: 'test récurrente' });
  assert(!hasTuePm(store.openSlots({ now: now() })), 'aucun créneau mardi après-midi après la fermeture récurrente');
});

console.log(`\n${passed} test(s) d'acceptation réussi(s).`);
