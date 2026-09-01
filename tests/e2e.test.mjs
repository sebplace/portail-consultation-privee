// Test END-TO-END de la logique métier (parcours complet enchaîné), sans navigateur.
// Couvre : prise/plafond/déplacement/annulation, ancrage après annulation, circuit
// atomique, impact d'une fermeture (sans déplacement), migration CSV contrôlée.
// Lancer : node tests/e2e.test.mjs
globalThis.localStorage = (() => {
  let m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => { m = new Map(); } };
})();

const store = await import('../assets/js/core/store.js');
const rules = await import('../assets/js/core/rules.js');
const avail = await import('../assets/js/core/availability.js');

let passed = 0;
function step(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.stack || e.message}`); process.exitCode = 1; }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion'); };
const now = () => new Date();

store.reset();

let anneBooking;
step('E1 : Anne réserve un créneau compatible (1 rdv futur)', () => {
  const open = store.openSlots({ now: now() });
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: 'p-anne', explicitAnchor: null }).date;
  const anne = store.patients().find((p) => p.id === 'p-anne');
  const { slots } = rules.compatibleSlots({ openSlots: open, anchor, cadence: anne.cadence, now: now() });
  assert(slots.length > 0, 'au moins un créneau compatible pour Anne');
  anneBooking = store.bookAppointment('p-anne', slots[0].toISOString(), { actor: 'patient' });
  assert(anneBooking && anneBooking.id, 'réservation créée');
  assert(store.futureAppointmentsOf('p-anne').length === 1, 'exactement 1 rdv futur');
});

step('E2 : le plafond (maxFuture=1) bloque une seconde réservation', () => {
  const open = store.openSlots({ now: now() });
  const anne = store.patients().find((p) => p.id === 'p-anne');
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: 'p-anne', explicitAnchor: null }).date;
  const { slots } = rules.compatibleSlots({ openSlots: open, anchor, cadence: anne.cadence, now: now() });
  const another = slots.find((s) => s.toISOString() !== anneBooking.datetime) || slots[0];
  const r = store.bookAppointment('p-anne', another.toISOString(), { actor: 'patient' });
  assert(r && r.error === 'cap', 'la seconde réservation doit être refusée (plafond)');
});

step('E3 : annulation libère la capacité et ne sert JAMAIS d\'ancrage', () => {
  store.cancelAppointment(anneBooking.id, { actor: 'patient' });
  assert(store.futureAppointmentsOf('p-anne').length === 0, 'plus de rdv futur après annulation');
  const anchor = rules.resolveAnchor({ appointments: store.appointments(), patientId: 'p-anne', explicitAnchor: null });
  // L'ancrage doit rester le dernier rdv EFFECTUÉ (a1, -20j), pas le rdv annulé.
  const a1 = store.appointments().find((a) => a.id === 'a1');
  assert(new Date(anchor.date).getTime() === new Date(a1.datetime).getTime(), 'ancrage = dernier effectué, pas l\'annulé');
});

let tdahInstance;
step('E4 : circuit TDAH démarré atomiquement (3 initiales) après acceptation', () => {
  const emailsBefore = store.neutralEmails().length;
  const d = store.submitDemand({ circuitId: 'tdah', origine: 'personnelle', objectif: 'Suspicion', ackLimites: true });
  assert(store.neutralEmails().length === emailsBefore + 1, 'une notification neutre est émise pour la nouvelle demande');
  store.acceptDemand(d.id);
  const series = rules.proposeSeries({ openSlots: store.avisOpenSlots({ now: now() }), count: 3, spacingDays: 14, marginDays: 3, now: now() });
  const r = store.startCircuitAtomic(d.id, series.map((x) => x.toISOString()));
  tdahInstance = r.instanceId;
  const n = store.appointments().filter((a) => a.circuitInstanceId === r.instanceId && a.status === 'planifie').length;
  assert(n === 3, `3 initiales attendues, obtenu ${n}`);
});

step('E5 : une fermeture bloque sans déplacer les rendez-vous existants', () => {
  const target = store.appointments().find((a) => a.circuitInstanceId === tdahInstance && a.status === 'planifie');
  const day = target.datetime.slice(0, 10);
  store.addClosure({ from: day, to: day, label: 'fermeture test' });
  const impacted = avail.appointmentsInClosure(store.appointments(), { from: day, to: day });
  assert(impacted.length >= 1, 'au moins un rdv impacté listé');
  const still = store.appointments().find((a) => a.id === target.id);
  assert(still.status === 'planifie', 'le rdv impacté n\'est jamais déplacé automatiquement');
  assert(store.pendingDecisions().some((it) => it.type === 'fermeture-impact'), 'la fermeture apparaît dans les décisions en attente');
});

step('E6 : migration CSV contrôlée (aperçu, doublons/collisions rejetés, commit)', () => {
  const rows = store.analyzeCsv(store.get().fakeCsv);
  assert(rows.length > 0, 'des lignes analysées');
  assert(rows.some((r) => !r.accepted && r.issues.length), 'certaines lignes sont rejetées (doublon/collision/inconnu)');
  const before = store.appointments().length;
  const rec = store.commitMigration(rows);
  assert(rec.imported >= 1, 'au moins une ligne importée');
  assert(store.appointments().length === before + rec.imported, 'les rdv importés sont ajoutés');
  assert(store.migrations().length === 1, 'un journal de migration est conservé');
});

console.log(`\n${passed} étape(s) end-to-end réussie(s).`);
