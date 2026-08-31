// Persistance locale (localStorage) + journal + notifications neutres.
// Aucune donnee ne quitte le navigateur : prototype pour avis uniquement.
import { buildSeed } from '../data/seed.js';
import { bookingCapReached } from './rules.js';

const KEY = 'pcp.state.v1';

let state = null;
const listeners = new Set();

export function load() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try { state = JSON.parse(raw); }
    catch { state = buildSeed(new Date()); }
  } else {
    state = buildSeed(new Date());
  }
  return state;
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

export function reset() {
  state = buildSeed(new Date());
  save();
  return state;
}

export function get() { return state || load(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// --- Selecteurs ---
export function patients() { return get().patients; }
export function patientById(id) { return get().patients.find((p) => p.id === id); }
export function patientByCode(code) {
  const c = (code || '').trim().toUpperCase();
  return get().patients.find((p) => p.code.toUpperCase() === c);
}
export function appointments() { return get().appointments; }
export function appointmentsOf(patientId) {
  return get().appointments.filter((a) => a.patientId === patientId);
}
export function futureAppointmentsOf(patientId, now = new Date()) {
  return get().appointments.filter((a) =>
    a.patientId === patientId && a.status === 'booked' && new Date(a.datetime) > now);
}
export function bookedAppointments() {
  return get().appointments.filter((a) => a.status === 'booked');
}
export function requests() { return get().requests; }
export function openRequests() { return get().requests.filter((r) => r.status === 'nouvelle'); }
export function waitlist() { return get().waitlist; }
export function logEntries() { return [...get().log].reverse(); }

// --- Journalisation ---
export function logOp(actor, action, detail) {
  get().log.push({ ts: new Date().toISOString(), actor, action, detail });
}

// --- Mutations rdv ---
function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

export function bookAppointment(patientId, datetimeISO, durationMin) {
  const patient = patientById(patientId);
  // Plafond de programmation : nombre max de rdv futurs simultanes.
  if (patient && bookingCapReached(get().appointments, patient, new Date())) {
    return { error: 'cap', message: `Plafond atteint : ${patient.rule.bookAhead} rendez-vous a venir maximum.` };
  }
  // Protection anti double-reservation : le creneau ne doit pas chevaucher un rdv existant.
  const start = new Date(datetimeISO);
  const end = new Date(start.getTime() + durationMin * 60000);
  const clash = get().appointments.some((a) => {
    if (a.status !== 'booked') return false;
    const s = new Date(a.datetime);
    const e = new Date(s.getTime() + a.durationMin * 60000);
    return start < e && s < end;
  });
  if (clash) return { error: 'clash', message: 'Ce creneau vient d\'etre pris. Choisissez-en un autre.' };
  const a = { id: uid('a'), patientId, datetime: datetimeISO, durationMin, status: 'booked' };
  get().appointments.push(a);
  logOp('patient', 'prise', `${patientId} @ ${datetimeISO}`);
  save();
  return a;
}

export function moveAppointment(appointmentId, newDatetimeISO) {
  const a = get().appointments.find((x) => x.id === appointmentId);
  if (!a) return null;
  const old = a.datetime;
  a.datetime = newDatetimeISO;
  a.status = 'booked';
  logOp('patient', 'deplacement', `${a.patientId} ${old} -> ${newDatetimeISO}`);
  save();
  return a;
}

export function cancelAppointment(appointmentId) {
  const a = get().appointments.find((x) => x.id === appointmentId);
  if (!a) return null;
  a.status = 'cancelled';
  logOp('patient', 'annulation', `${a.patientId} @ ${a.datetime}`);
  save();
  return a;
}

// --- Demandes (declenchent une notification neutre) ---
export const REQUEST_TYPES = [
  { id: 'parler', label: 'Besoin de vous parler avant' },
  { id: 'ordonnance', label: "Renouvellement d'ordonnance" },
  { id: 'rapport', label: 'Demande de rapport' },
  { id: 'autre', label: 'Autre demande' },
];

export function addRequest(patientId, type, note, linkedAppointmentId = null) {
  const r = {
    id: uid('r'), patientId, type, note: note || '',
    linkedAppointmentId, status: 'nouvelle', createdAt: new Date().toISOString(),
  };
  get().requests.push(r);
  logOp('patient', 'demande', `${patientId} type=${type}`);
  // Notification NEUTRE (aucune donnee clinique) : simple signal + lien.
  pushNeutralEmail();
  save();
  return r;
}

export function resolveRequest(requestId) {
  const r = get().requests.find((x) => x.id === requestId);
  if (!r) return null;
  r.status = 'traitee';
  logOp('medecin', 'traitement demande', requestId);
  save();
  return r;
}

// --- Liste de desistement ---
export function joinWaitlist(patientId) {
  if (get().waitlist.some((w) => w.patientId === patientId)) return;
  get().waitlist.push({ patientId, createdAt: new Date().toISOString() });
  logOp('patient', 'desistement', `${patientId} inscrit`);
  save();
}
export function leaveWaitlist(patientId) {
  get().waitlist = get().waitlist.filter((w) => w.patientId !== patientId);
  save();
}

// --- Regles (tableau de bord medecin) ---
export function updateRule(patientId, rule) {
  const p = patientById(patientId);
  if (!p) return null;
  p.rule = { ...p.rule, ...rule };
  logOp('medecin', 'modification regles', `${patientId}`);
  save();
  return p.rule;
}

// --- Exceptions (creneau hors regles autorise par le medecin) ---
export function approveException(patientId, datetimeISO, durationMin) {
  const a = { id: uid('a'), patientId, datetime: datetimeISO, durationMin, status: 'booked', exception: true };
  get().appointments.push(a);
  logOp('medecin', 'exception approuvee', `${patientId} @ ${datetimeISO}`);
  save();
  return a;
}

// --- File de notifications e-mail neutres (stub, cote medecin) ---
let neutralInbox = [];
export function pushNeutralEmail() {
  neutralInbox.push({
    ts: new Date().toISOString(),
    subject: 'Nouvelle demande disponible',
    body: "Bonjour,\n\nUne nouvelle demande est disponible dans votre espace professionnel sécurisé.\nAucun détail n'est transmis par e-mail.\n\nLien : [espace pro sécurisé]\n\nCe canal ne remplace pas les dispositifs d'urgence.",
  });
}
export function neutralEmails() { return [...neutralInbox].reverse(); }
