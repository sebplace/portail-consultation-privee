// Persistance locale (localStorage) + logique métier : statuts, rôles, deux files,
// circuits atomiques, migration CSV, notifications neutres, journal.
// Aucune donnée ne quitte le navigateur : prototype pour avis uniquement.
import { buildSeed } from '../data/seed.js';
import * as avail from './availability.js';
import * as rules from './rules.js';

const KEY = 'pcp.state.v5';
let state = null;
const listeners = new Set();

export function load() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = (parsed && parsed.version === 5) ? parsed : buildSeed(new Date());
    } catch { state = buildSeed(new Date()); }
  } else {
    state = buildSeed(new Date());
  }
  return state;
}
export function save() { localStorage.setItem(KEY, JSON.stringify(state)); listeners.forEach((fn) => fn(state)); }
export function reset() { state = buildSeed(new Date()); save(); return state; }
export function get() { return state || load(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function uid(p) { return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

// --- Sélecteurs de base ---
export function doctor() { return get().doctor; }
// Jours de semaine où il y a réellement des consultations ordinaires (1=lundi..7=dimanche).
export function consultationWeekdays() {
  const d = doctor();
  const set = new Set([...Object.keys(d.weeklyTemplate || {}), ...Object.keys(d.avisTemplate || {})].map(Number));
  return [...set].sort();
}
export function circuits() { return get().circuits; }
export function circuitById(id) { return get().circuits.find((c) => c.id === id); }
export function patients() { return get().patients; }
export function patientById(id) { return get().patients.find((p) => p.id === id); }
export function patientByCode(code) {
  const c = (code || '').trim().toUpperCase();
  return get().patients.find((p) => p.code.toUpperCase() === c);
}
export function appointments() { return get().appointments; }
export function appointmentsOf(pid) { return get().appointments.filter((a) => a.patientId === pid); }
export function futureAppointmentsOf(pid, now = new Date()) {
  return get().appointments.filter((a) => a.patientId === pid && a.status === 'planifie' && new Date(a.datetime) > now);
}
export function requests() { return get().requests; }
export function openRequests() { return get().requests.filter((r) => r.status === 'nouvelle'); }
export function demands() { return get().demands; }
export function waitlist() { return get().waitlist; }
export function offers() { return get().offers; }
export function migrations() { return get().migrations; }
export function logEntries() { return [...get().log].reverse(); }

// --- Disponibilité : créneaux ouverts (publics) ---
export function openSlots({ now = new Date(), weeks, includeEmergency = false, includeAvis = false } = {}) {
  const d = doctor();
  const from = new Date(now.getTime());
  const to = new Date(now.getTime() + (weeks || d.horizonWeeks) * 7 * 24 * 3600 * 1000);
  return avail.generateOpenSlots({ doctor: d, appointments: appointments(), from, to, now, includeEmergency, includeAvis });
}
// Créneaux d'AVIS ouverts (réservés aux circuits).
export function avisOpenSlots({ now = new Date(), weeks } = {}) {
  const d = doctor();
  const from = new Date(now.getTime());
  const to = new Date(now.getTime() + (weeks || d.horizonWeeks) * 7 * 24 * 3600 * 1000);
  return avail.generateOpenSlots({ doctor: d, appointments: appointments(), from, to, now, includeAvis: true }).filter((s) => s.avis);
}

// --- Journal ---
export function logOp(actor, action, detail) {
  get().log.push({ ts: new Date().toISOString(), actor, action, detail });
}

// --- Notifications e-mail NEUTRES (aucun contenu clinique) ---
let neutralInbox = [];
export function pushNeutralEmail(kind = 'demande') {
  const cfg = (doctor().notifyConfig) || { onComment: true };
  if (kind === 'demande' && cfg.onComment === false) return; // notifications de demande désactivées
  neutralInbox.push({
    ts: new Date().toISOString(),
    subject: 'Nouvelle demande disponible',
    body: "Bonjour,\n\nUne nouvelle demande est disponible dans votre espace professionnel sécurisé.\nAucun détail n'est transmis par e-mail.\n\nLien : [espace pro sécurisé]\n\nCe canal ne remplace pas les dispositifs d'urgence.",
  });
}
export function neutralEmails() { return [...neutralInbox].reverse(); }
export function notifyConfig() { return doctor().notifyConfig || { onComment: true, remindersJ2: true, remindersJ1: true }; }
export function setNotifyConfig(patch) {
  const d = doctor();
  d.notifyConfig = { ...notifyConfig(), ...patch };
  logOp('medecin', 'config notifications', JSON.stringify(d.notifyConfig));
  save();
  return d.notifyConfig;
}
// Rappels neutres simulés (J-2 / J-1) pour les rdv planifiés à venir — aperçu démo.
export function simulateReminders(now = new Date()) {
  const cfg = notifyConfig();
  const wins = [];
  if (cfg.remindersJ2) wins.push(2);
  if (cfg.remindersJ1) wins.push(1);
  const out = [];
  for (const a of get().appointments) {
    if (a.status !== 'planifie') continue;
    const days = Math.round((new Date(a.datetime) - now) / (24 * 3600 * 1000));
    if (wins.includes(days)) out.push({ appointmentId: a.id, patientId: a.patientId, datetime: a.datetime, jMinus: days });
  }
  return out;
}

// --- Statuts ---
export const STATUSES = ['planifie', 'effectue', 'deplace', 'annule', 'absent'];
export const STATUS_LABEL = {
  planifie: 'Planifié', effectue: 'Effectué', deplace: 'Déplacé', annule: 'Annulé', absent: 'Absent',
};

// --- Réservation ordinaire (patient / secrétariat) : aucune notification ---
function overlapsBooked(startISO, durationMin) {
  const s = new Date(startISO).getTime();
  const e = s + durationMin * 60000;
  return get().appointments.some((a) => {
    if (a.status !== 'planifie') return false;
    const as = new Date(a.datetime).getTime();
    const ae = as + (a.durationMin || 45) * 60000;
    return s < ae && as < e;
  });
}

export function bookAppointment(patientId, datetimeISO, { actor = 'patient', circuitInstanceId = null } = {}) {
  const patient = patientById(patientId);
  const dur = doctor().slotDurationMin;
  if (patient && !circuitInstanceId) {
    const cad = patient.cadence;
    if (rules.bookingCapReached(get().appointments, patient, cad, new Date())) {
      return { error: 'cap', message: `Plafond atteint : ${cad.maxFuture} rendez-vous à venir maximum.` };
    }
  }
  if (overlapsBooked(datetimeISO, dur)) return { error: 'clash', message: "Ce créneau vient d'être pris. Choisissez-en un autre." };
  const a = { id: uid('a'), patientId, datetime: datetimeISO, durationMin: dur, status: 'planifie', circuitInstanceId };
  get().appointments.push(a);
  logOp(actor, 'prise', `${patientId} @ ${datetimeISO}`);
  save();
  return a;
}

// Déplacement : ne décale JAMAIS la série. Marque l'ancien 'deplace', crée un 'planifie'.
export function moveAppointment(appointmentId, newDatetimeISO, { actor = 'patient' } = {}) {
  const a = get().appointments.find((x) => x.id === appointmentId);
  if (!a) return { error: 'notfound' };
  const dur = a.durationMin || doctor().slotDurationMin;
  if (overlapsBooked(newDatetimeISO, dur)) return { error: 'clash', message: 'Créneau déjà occupé.' };
  a.status = 'deplace';
  const b = { id: uid('a'), patientId: a.patientId, datetime: newDatetimeISO, durationMin: dur, status: 'planifie', circuitInstanceId: a.circuitInstanceId || null, movedFrom: a.id };
  a.movedTo = b.id;
  get().appointments.push(b);
  logOp(actor, 'deplacement', `${a.patientId} ${a.datetime} -> ${newDatetimeISO}`);
  save();
  return b;
}

export function cancelAppointment(appointmentId, { actor = 'patient', reason = '' } = {}) {
  const a = get().appointments.find((x) => x.id === appointmentId);
  if (!a) return null;
  a.status = 'annule';
  if (reason) a.cancelReason = reason;
  logOp(actor, 'annulation', `${a.patientId} @ ${a.datetime}${reason ? ' · motif: ' + reason : ''}`);
  save();
  return a;
}

// Le logiciel ne marque JAMAIS 'effectue' tout seul : c'est une action explicite.
export function setStatus(appointmentId, status, { actor = 'medecin' } = {}) {
  if (!STATUSES.includes(status)) return null;
  const a = get().appointments.find((x) => x.id === appointmentId);
  if (!a) return null;
  a.status = status;
  logOp(actor, 'statut', `${a.patientId} @ ${a.datetime} -> ${status}`);
  save();
  return a;
}

// --- Demandes explicites (commentaire) => notification neutre ---
export const REQUEST_TYPES = [
  { id: 'parler', label: 'Besoin de vous parler avant' },
  { id: 'ordonnance', label: "Renouvellement d'ordonnance" },
  { id: 'rapport', label: 'Demande de rapport' },
  { id: 'autre', label: 'Autre demande' },
];
export function addRequest(patientId, type, note) {
  const r = { id: uid('r'), patientId, type, note: note || '', status: 'nouvelle', createdAt: new Date().toISOString() };
  get().requests.push(r);
  logOp('patient', 'demande', `${patientId} type=${type}`);
  pushNeutralEmail();
  save();
  return r;
}
export function resolveRequest(id) {
  const r = get().requests.find((x) => x.id === id);
  if (!r) return null;
  r.status = 'traitee';
  logOp('medecin', 'traitement demande', id);
  save();
  return r;
}

// --- Règles / ancrage (médecin) ---
export function updateCadence(patientId, cadence) {
  const p = patientById(patientId);
  if (!p) return null;
  p.cadence = { ...p.cadence, ...cadence };
  logOp('medecin', 'modification cadence', patientId);
  save();
  return p.cadence;
}
export function setAnchor(patientId, dateISOorNull) {
  const p = patientById(patientId);
  if (!p) return null;
  p.anchorDate = dateISOorNull;
  logOp('medecin', 'ancrage explicite', `${patientId} = ${dateISOorNull || '(auto)'}`);
  save();
  return p.anchorDate;
}

// --- Exception clinique (médecin uniquement) : hors règles, y compris urgence 12:15 ---
export function approveException(patientId, datetimeISO, { emergency = false } = {}) {
  const a = { id: uid('a'), patientId, datetime: datetimeISO, durationMin: doctor().slotDurationMin, status: 'planifie', exception: true, emergency };
  get().appointments.push(a);
  logOp('medecin', emergency ? 'urgence 12:15 autorisée' : 'exception approuvée', `${patientId} @ ${datetimeISO}`);
  save();
  return a;
}
// Autorisation tracée pour que le secrétariat encode l'urgence 12:15.
export function authorizeEmergency(patientId, datetimeISO) {
  const id = uid('emgauth');
  get().log.push({ ts: new Date().toISOString(), actor: 'medecin', action: 'autorisation urgence', detail: `${patientId} @ ${datetimeISO} (id ${id})` });
  if (!state.emergencyAuth) state.emergencyAuth = [];
  state.emergencyAuth.push({ id, patientId, datetime: datetimeISO, used: false });
  save();
  return id;
}
export function pendingEmergencyAuth() { return (get().emergencyAuth || []).filter((e) => !e.used); }
export function useEmergencyAuth(authId, { actor = 'secretariat' } = {}) {
  const e = (get().emergencyAuth || []).find((x) => x.id === authId);
  if (!e || e.used) return { error: 'invalid' };
  e.used = true;
  const a = { id: uid('a'), patientId: e.patientId, datetime: e.datetime, durationMin: doctor().slotDurationMin, status: 'planifie', emergency: true };
  get().appointments.push(a);
  logOp(actor, 'urgence 12:15 encodée', `${e.patientId} @ ${e.datetime} (auth ${authId})`);
  save();
  return a;
}

// --- File 1 : liste de désistement (patient déjà suivi voulant AVANCER) ---
// Inscription expire au prochain rdv du patient. Offre successive 48h.
// prefs = { weekdays:[1..7]|null, timeFrom:'HH:MM'|null, timeTo:'HH:MM'|null, minDelayHours:number }
export function joinWaitlist(patientId, { actor = 'patient', prefs = {} } = {}) {
  // Éligibilité : uniquement une personne ayant un rendez-vous FUTUR planifié.
  if (!rules.canJoinWaitlist(get().appointments, patientId, new Date())) {
    return { error: 'no-future', message: "Inscription possible uniquement si vous avez un rendez-vous à venir à avancer." };
  }
  if (get().waitlist.some((w) => w.patientId === patientId)) return { error: 'already' };
  const next = futureAppointmentsOf(patientId).map((a) => new Date(a.datetime)).sort((a, b) => a - b)[0] || null;
  get().waitlist.push({
    patientId, createdAt: new Date().toISOString(), expiresAt: next ? next.toISOString() : null,
    prefs: {
      weekdays: prefs.weekdays || null, timeFrom: prefs.timeFrom || null,
      timeTo: prefs.timeTo || null, minDelayHours: prefs.minDelayHours != null ? prefs.minDelayHours : 24,
    },
  });
  logOp(actor, 'désistement inscription', patientId);
  save();
  return { ok: true };
}
export function updateWaitlistPrefs(patientId, prefs) {
  const w = get().waitlist.find((x) => x.patientId === patientId);
  if (!w) return null;
  w.prefs = { ...w.prefs, ...prefs };
  save();
  return w.prefs;
}
export function leaveWaitlist(patientId) {
  get().waitlist = get().waitlist.filter((w) => w.patientId !== patientId);
  save();
}
// Purge : une inscription n'est valable que tant qu'il reste un rdv futur planifié
// (couvre l'arrivée du rdv, son annulation, ou son remplacement par un rdv avancé).
export function purgeWaitlist(now = new Date()) {
  const before = get().waitlist.length;
  get().waitlist = get().waitlist.filter((w) => rules.canJoinWaitlist(get().appointments, w.patientId, now));
  if (get().waitlist.length !== before) save();
}
function slotMatchesPrefs(candidate, prefs, now) {
  if (!prefs) return true;
  if (prefs.minDelayHours != null && candidate.getTime() < now.getTime() + prefs.minDelayHours * 3600 * 1000) return false;
  if (prefs.weekdays && prefs.weekdays.length && !prefs.weekdays.includes(rules.isoWeekday(candidate))) return false;
  const hhmm = `${String(candidate.getHours()).padStart(2, '0')}:${String(candidate.getMinutes()).padStart(2, '0')}`;
  if (prefs.timeFrom && hhmm < prefs.timeFrom) return false;
  if (prefs.timeTo && hhmm > prefs.timeTo) return false;
  return true;
}
// Ordre des personnes compatibles pour une place libérée (respecte prefs + délai + avance).
export function compatibleWaitlist(datetimeISO, { now = new Date() } = {}) {
  const slots = openSlots({ now });
  const candidate = new Date(datetimeISO);
  return get().waitlist
    .map((w) => ({ w, patient: patientById(w.patientId) }))
    .filter(({ w, patient }) => {
      if (!patient) return false;
      if (!slotMatchesPrefs(candidate, w.prefs, now)) return false;
      const anchor = rules.resolveAnchor({ appointments: appointments(), patientId: patient.id, explicitAnchor: patient.anchorDate }).date;
      const { slots: compat } = rules.compatibleSlots({ openSlots: slots, anchor, cadence: patient.cadence, now });
      const next = futureAppointmentsOf(patient.id, now).map((a) => new Date(a.datetime)).sort((a, b) => a - b)[0];
      const earlier = next ? candidate < next : true;
      return earlier && compat.some((d) => d.getTime() === candidate.getTime());
    })
    .sort((a, b) => new Date(a.w.createdAt) - new Date(b.w.createdAt))
    .map((x) => x.patient.id);
}
// Propose une place libérée à la 1re personne compatible (offre 48h).
export function offerFreedSlot(datetimeISO, { now = new Date() } = {}) {
  const order = compatibleWaitlist(datetimeISO, { now });
  if (order.length === 0) return { error: 'none', message: 'Aucune personne compatible (préférences/délai).' };
  const offer = {
    id: uid('offer'), patientId: order[0], datetime: datetimeISO,
    createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
    status: 'en cours', order, position: 0,
  };
  get().offers.push(offer);
  logOp('systeme', 'désistement offre', `${order[0]} @ ${datetimeISO} (48h)`);
  save();
  return offer;
}
// Relance : passe à la personne suivante (refus explicite ou expiration 48h).
export function advanceOffer(offerId, { reason = 'sans réponse', now = new Date() } = {}) {
  const o = get().offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'en cours') return { error: 'invalid' };
  o.position += 1;
  if (o.position >= o.order.length) {
    o.status = 'épuisée';
    logOp('systeme', 'désistement offre épuisée', `${o.datetime}`);
    save();
    return { done: true };
  }
  o.patientId = o.order[o.position];
  o.createdAt = now.toISOString();
  o.expiresAt = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
  logOp('systeme', 'désistement relance', `${o.patientId} @ ${o.datetime} (${reason})`);
  save();
  return o;
}
export function acceptOffer(offerId, { actor = 'patient' } = {}) {
  const o = get().offers.find((x) => x.id === offerId);
  if (!o || o.status !== 'en cours') return { error: 'invalid' };
  const res = bookAppointment(o.patientId, o.datetime, { actor });
  if (res && res.error) return res;
  o.status = 'acceptée';
  leaveWaitlist(o.patientId);
  logOp(actor, 'désistement accepté', `${o.patientId} @ ${o.datetime}`);
  save();
  return res;
}
// Expire automatiquement les offres dépassées (relance la personne suivante).
export function processOffers(now = new Date()) {
  let changed = false;
  for (const o of get().offers) {
    if (o.status === 'en cours' && new Date(o.expiresAt) <= now) { advanceOffer(o.id, { reason: 'expiration 48h', now }); changed = true; }
  }
  return changed;
}

// Cycle d'invitation (simulé en démo) : rappel au 5e jour, retour en file après la
// 1re absence de réponse à 7 jours, clôture après la 2e. Libère les créneaux tenus.
export function processInvitations(now = new Date()) {
  let changed = false;
  for (const d of get().demands) {
    if (d.status !== 'invitee') continue;
    if (d.reminderAt && !d.reminded && new Date(d.reminderAt) <= now) { d.reminded = true; changed = true; logOp('systeme', 'rappel invitation J-5', d.id); }
    if (d.inviteExpiresAt && new Date(d.inviteExpiresAt) <= now) {
      // Libère les créneaux tenus de la série.
      get().appointments.filter((a) => a.circuitInstanceId === d.circuitInstanceId && a.status === 'planifie').forEach((a) => { a.status = 'annule'; });
      if ((d.invitations || 0) >= 2) { d.status = 'close'; logOp('systeme', 'demande clôturée (2 sans réponse)', d.id); }
      else { d.status = 'acceptee'; d.circuitInstanceId = null; d.reminded = false; logOp('systeme', 'invitation expirée, retour en file', d.id); }
      changed = true;
    }
  }
  if (changed) save();
  return changed;
}

// --- File 2 : avis / parcours ciblés (NOUVELLE demande) ---
export const DEMAND_STATUSES = {
  deposee: 'Déposée', acceptee: 'Acceptée', 'acceptee-conditionnelle': 'Acceptée (relais en attente)',
  refusee: 'Refusée', 'en-file': 'En file', invitee: 'Invitée', close: 'Clôturée',
};
export function submitDemand(payload) {
  const d = {
    id: uid('dem'), createdAt: new Date().toISOString(), status: 'deposee',
    circuitId: payload.circuitId, objectif: payload.objectif || '', origine: payload.origine || 'personnelle',
    adressePar: payload.adressePar || '', relais: payload.relais || '', relaisCoord: payload.relaisCoord || '',
    dispos: payload.dispos || '', note: payload.note || '', ackLimites: !!payload.ackLimites,
    invitations: 0, priority: 0,
  };
  get().demands.push(d);
  logOp('demandeur', 'nouvelle demande', `${d.circuitId}`);
  pushNeutralEmail();
  save();
  return d;
}
// Le médecin accepte (éventuellement conditionnellement si relais requis manquant).
export function acceptDemand(demandId) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return null;
  const c = circuitById(d.circuitId);
  if (c && c.needsRelay && !d.relais) { d.status = 'acceptee-conditionnelle'; }
  else { d.status = 'acceptee'; }
  d.priority = d.priority || Date.now();
  logOp('medecin', 'acceptation demande', `${d.id} -> ${d.status}`);
  save();
  return d;
}
export function refuseDemand(demandId) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return null;
  d.status = 'refusee';
  logOp('medecin', 'refus demande', d.id);
  save();
  return d;
}
export function setRelay(demandId, relais) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return null;
  d.relais = relais;
  if (relais && d.status === 'acceptee-conditionnelle') { d.status = 'acceptee'; }
  logOp('medecin', 'relais identifié', `${d.id} = ${relais}`);
  save();
  return d;
}
export function setPriority(demandId, priority) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return null;
  d.priority = Number(priority);
  save();
  return d;
}

// Autorisation d'adaptation médicamenteuse : possible UNIQUEMENT si un relais est
// identifié. Les consultations initiales ne sont pas bloquées par son absence.
export function clearMedication(demandId) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return { error: 'notfound' };
  if (!rules.canAdaptMedication(d)) return { error: 'no-relay', message: "Relais prescripteur non identifié : adaptation médicamenteuse impossible." };
  d.medicationCleared = true;
  logOp('medecin', 'adaptation médicamenteuse autorisée', `${d.id} (relais ${d.relais})`);
  save();
  return { ok: true };
}

// --- Capacité d'avis (séances de circuit) sur 4 semaines glissantes ---
export function avisCapacityInfo(now = new Date()) {
  const cap = doctor().avisCapacity;
  const to = new Date(now.getTime() + cap.windowDays * 24 * 3600 * 1000);
  const used = get().appointments.filter((a) => a.circuitInstanceId && a.status === 'planifie' && new Date(a.datetime) > now && new Date(a.datetime) <= to).length;
  const extra = (doctor().extraAvisSlots || []).filter((iso) => { const d = new Date(iso); return d > now && d <= to; }).length;
  const max = cap.base + Math.min(extra, cap.maxExtra); // 8 de base, +2 max par créneaux ponctuels
  return { used, base: cap.base, extra, max, ceiling: cap.max, remaining: Math.max(0, max - used), windowDays: cap.windowDays };
}
// Ajout d'un créneau d'avis ponctuel (max 2 dans la fenêtre de 4 semaines).
export function addExtraAvisSlot(datetimeISO, { now = new Date() } = {}) {
  const cap = doctor().avisCapacity;
  const start = new Date(datetimeISO);
  const to = new Date(now.getTime() + cap.windowDays * 24 * 3600 * 1000);
  const inWindow = (doctor().extraAvisSlots || []).filter((iso) => { const d = new Date(iso); return d > now && d <= to; }).length;
  if (inWindow >= cap.maxExtra) return { error: 'limit', message: `Maximum ${cap.maxExtra} créneaux d'avis ponctuels par période de ${cap.windowDays / 7} semaines.` };
  if (overlapsBooked(datetimeISO, doctor().slotDurationMin)) return { error: 'clash', message: 'Créneau déjà occupé.' };
  doctor().extraAvisSlots.push(datetimeISO);
  logOp('medecin', 'créneau avis ponctuel ajouté', datetimeISO);
  save();
  return { ok: true };
}
// Conversion MANUELLE d'un créneau d'avis inutilisé en suivi ordinaire.
export function convertAvisSlotToOrdinary(datetimeISO) {
  if (overlapsBooked(datetimeISO, doctor().slotDurationMin)) return { error: 'clash', message: 'Créneau déjà occupé.' };
  if (!doctor().convertedAvisSlots.includes(datetimeISO)) doctor().convertedAvisSlots.push(datetimeISO);
  logOp('medecin', 'créneau avis converti en ordinaire', datetimeISO);
  save();
  return { ok: true };
}

// --- Circuits : réservation ATOMIQUE de la série INITIALE uniquement ---
// Autorisé sous acceptation ferme OU conditionnelle (les consultations initiales
// ne dépendent pas du relais). Pour le TDAH : réserve seulement les 3 initiales.
export function startCircuitAtomic(demandId, seriesISO, { patientId } = {}) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return { error: 'notfound' };
  if (!['acceptee', 'acceptee-conditionnelle'].includes(d.status)) return { error: 'state', message: 'La demande doit être acceptée (ferme ou conditionnelle).' };
  for (const isoDt of seriesISO) {
    if (overlapsBooked(isoDt, doctor().slotDurationMin)) return { error: 'clash', message: `Le créneau ${isoDt} n'est plus libre — série non démarrée.` };
  }
  const instanceId = uid('circ');
  const created = seriesISO.map((isoDt) => {
    const a = { id: uid('a'), patientId: patientId || d.id, datetime: isoDt, durationMin: doctor().slotDurationMin, status: 'planifie', circuitInstanceId: instanceId, phase: 'initiale' };
    get().appointments.push(a);
    return a;
  });
  d.status = 'invitee';
  d.circuitInstanceId = instanceId;
  d.phaseStarted = 'initiale';
  d.invitations = (d.invitations || 0) + 1;
  d.invitedAt = new Date().toISOString();
  d.reminderAt = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  d.inviteExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  logOp('medecin', 'circuit démarré (série initiale)', `${d.id} instance=${instanceId} n=${created.length}`);
  save();
  return { instanceId, created };
}

// Ouverture du bloc THÉRAPEUTIQUE (ex. TDAH +3) : décision médicale DISTINCTE,
// jamais automatique. N'ouvre pas l'adaptation médicamenteuse (voir clearMedication).
export function openTherapeuticBlock(demandId, seriesISO) {
  const d = get().demands.find((x) => x.id === demandId);
  if (!d) return { error: 'notfound' };
  const c = circuitById(d.circuitId);
  if (!c || !c.phases || !c.therapeuticNeedsDecision) return { error: 'unsupported', message: 'Ce circuit n\'a pas de bloc thérapeutique distinct.' };
  if (!d.circuitInstanceId) return { error: 'no-instance', message: 'Le bloc initial doit d\'abord être démarré.' };
  if (d.therapeuticStarted) return { error: 'already', message: 'Bloc thérapeutique déjà ouvert.' };
  for (const isoDt of seriesISO) {
    if (overlapsBooked(isoDt, doctor().slotDurationMin)) return { error: 'clash', message: `Le créneau ${isoDt} n'est plus libre.` };
  }
  const created = seriesISO.map((isoDt) => {
    const a = { id: uid('a'), patientId: d.id, datetime: isoDt, durationMin: doctor().slotDurationMin, status: 'planifie', circuitInstanceId: d.circuitInstanceId, phase: 'therapeutique' };
    get().appointments.push(a);
    return a;
  });
  d.therapeuticStarted = true;
  logOp('medecin', 'bloc thérapeutique ouvert (décision médicale)', `${d.id} n=${created.length}`);
  save();
  return { created };
}

// Prolongation / clôture (décision humaine, journalisée). Pas de plafond clinique.
export function extendCircuit(instanceId, addSeriesISO) {
  for (const isoDt of addSeriesISO) {
    if (overlapsBooked(isoDt, doctor().slotDurationMin)) return { error: 'clash', message: `Créneau ${isoDt} occupé.` };
  }
  const created = addSeriesISO.map((isoDt) => {
    const a = { id: uid('a'), patientId: circuitPatient(instanceId), datetime: isoDt, durationMin: doctor().slotDurationMin, status: 'planifie', circuitInstanceId: instanceId, phase: 'prolongation' };
    get().appointments.push(a);
    return a;
  });
  logOp('medecin', 'prolongation circuit', `${instanceId} +${created.length}`);
  save();
  return created;
}
export function closeCircuitEarly(instanceId) {
  const freed = get().appointments.filter((a) => a.circuitInstanceId === instanceId && a.status === 'planifie' && new Date(a.datetime) > new Date());
  freed.forEach((a) => { a.status = 'annule'; });
  logOp('medecin', 'clôture anticipée circuit', `${instanceId} libère ${freed.length}`);
  save();
  return freed.length;
}
function circuitPatient(instanceId) {
  const a = get().appointments.find((x) => x.circuitInstanceId === instanceId);
  return a ? a.patientId : null;
}

// --- Migration CSV (fictive) : prévisualisation + contrôle ---
export function analyzeCsv(text) {
  const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  const seen = new Set();
  const dur = doctor().slotDurationMin;
  const start = lines[0] && lines[0].toLowerCase().includes('code_patient') ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const [code, date, heure, duree] = lines[i].split(';').map((s) => (s || '').trim());
    const row = { raw: lines[i], code, date, heure, duree, issues: [] };
    const patient = patientByCode(code);
    if (!patient) row.issues.push('patient inconnu');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) row.issues.push('format date/heure');
    if (duree && Number(duree) !== dur) row.issues.push(`durée ${duree}≠${dur}`);
    let isoDt = null;
    if (row.issues.length === 0) {
      const [y, m, d] = date.split('-').map(Number);
      const [hh, mm] = heure.split(':').map(Number);
      isoDt = new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
      const key = `${patient.id}|${isoDt}`;
      if (seen.has(key)) row.issues.push('doublon');
      else seen.add(key);
      if (overlapsBooked(isoDt, dur)) row.issues.push('collision agenda');
    }
    row.patientId = patient ? patient.id : null;
    row.isoDt = isoDt;
    row.accepted = row.issues.length === 0;
    rows.push(row);
  }
  return rows;
}
export function commitMigration(rows) {
  const accepted = rows.filter((r) => r.accepted);
  let imported = 0;
  for (const r of accepted) {
    if (overlapsBooked(r.isoDt, doctor().slotDurationMin)) { r.accepted = false; r.issues.push('collision (commit)'); continue; }
    get().appointments.push({ id: uid('a'), patientId: r.patientId, datetime: r.isoDt, durationMin: doctor().slotDurationMin, status: 'planifie', imported: true });
    imported++;
  }
  const rejected = rows.length - imported;
  const record = { ts: new Date().toISOString(), total: rows.length, imported, rejected, rows: rows.map((r) => ({ raw: r.raw, accepted: r.accepted, issues: r.issues })) };
  get().migrations.push(record);
  logOp('medecin', 'migration CSV', `importés ${imported} / rejetés ${rejected} / total ${rows.length}`);
  save();
  return record;
}

// --- Statistiques agrégées (aucune donnée nominative sensible) ---
export function stats(now = new Date()) {
  const appts = get().appointments;
  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = appts.filter((a) => a.status === s).length;
  const planned = appts.filter((a) => a.status === 'planifie');
  const upcoming = planned.filter((a) => new Date(a.datetime) > now).length;
  const done = byStatus.effectue || 0;
  const absent = byStatus.absent || 0;
  const cancelled = byStatus.annule || 0;
  const past = done + absent + cancelled;
  const absenceRate = past ? Math.round((absent / past) * 100) : 0;
  // Occupation des 4 prochaines semaines : rdv planifiés / créneaux ouverts.
  const from = new Date(now);
  const to = new Date(now.getTime() + 28 * 24 * 3600 * 1000);
  const open = avail.generateOpenSlots({ doctor: doctor(), appointments: appts, from, to, now });
  const plannedNext = planned.filter((a) => { const d = new Date(a.datetime); return d > now && d <= to; }).length;
  const capacity = open.length + plannedNext;
  const occupancy = capacity ? Math.round((plannedNext / capacity) * 100) : 0;
  // Séances d'avis (circuits) planifiées dans les 4 semaines.
  const avisNext = planned.filter((a) => a.circuitInstanceId && new Date(a.datetime) > now && new Date(a.datetime) <= to).length;
  return {
    byStatus, upcoming, absenceRate, occupancy, avisNext,
    avisCapacity: doctor().avisCapacity, waitlist: get().waitlist.length,
    demandsOpen: get().demands.filter((d) => d.status === 'deposee').length,
    requestsOpen: openRequests().length,
  };
}

// --- Export / import de l'état (sauvegarde/restauration locale de la démo) ---
export function exportState() { return JSON.stringify(get(), null, 2); }
export function importState(json) {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || parsed.version !== 4) return { error: 'version', message: 'Fichier incompatible (version attendue : 4).' };
    state = parsed; save();
    logOp('medecin', 'import état', 'restauration locale');
    return { ok: true };
  } catch (e) { return { error: 'parse', message: 'Fichier illisible.' }; }
}

// --- Journal exportable en CSV ---
export function journalCsv() {
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['horodatage', 'acteur', 'action', 'detail']];
  for (const e of get().log) rows.push([e.ts, e.actor, e.action, e.detail || '']);
  return rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
