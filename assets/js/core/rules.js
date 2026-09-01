// Moteur de règles déterministe (pur, testable Node ou navigateur).
// Les créneaux « bruts » viennent de core/availability.js ; ici on applique
// la cadence propre à chaque patient (fenêtre autour d'un ancrage) et les
// règles de déplacement / série atomique.

// --- Utilitaires de dates ---
export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

export function atTime(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date.getTime());
  d.setHours(h, m, 0, 0);
  return d;
}

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- Validation d'identité (formulaire de nouvelle demande) ---
// Validateur d'e-mail volontairement simple et strict : une partie locale, un @,
// un domaine avec au moins un point et aucune espace. Rejette « x », « a@b », etc.
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const v = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Retourne la liste ordonnée des problèmes { field, message } pour l'identité
// obligatoire (nom, prénom, e-mail). Le premier élément sert au focus.
export function validateDemandIdentity({ nom, prenom, email } = {}) {
  const problems = [];
  if (!nom || !String(nom).trim()) problems.push({ field: 'nom', message: 'Le nom est obligatoire.' });
  if (!prenom || !String(prenom).trim()) problems.push({ field: 'prenom', message: 'Le prénom est obligatoire.' });
  const e = email ? String(email).trim() : '';
  if (!e) problems.push({ field: 'email', message: "L'e-mail est obligatoire." });
  else if (!isValidEmail(e)) problems.push({ field: 'email', message: "Format d'e-mail invalide (exemple : prenom.nom@exemple.be)." });
  return problems;
}

// 1=lundi .. 7=dimanche
export function isoWeekday(date) {
  const g = date.getDay();
  return g === 0 ? 7 : g;
}

// --- Ancrage (CORRECTIF MAJEUR) ---
// L'ancrage du calcul de la prochaine fenêtre est EXCLUSIVEMENT :
//   1) une date fixée explicitement par le médecin (patient.anchorDate), sinon
//   2) le dernier rendez-vous réellement EFFECTUÉ (status 'effectue').
// Jamais un rdv annulé, absent, déplacé, ni un rdv futur planifié.
export function resolveAnchor({ appointments, patientId, explicitAnchor }) {
  if (explicitAnchor) return { date: new Date(explicitAnchor), source: 'medecin' };
  const done = (appointments || [])
    .filter((a) => a.patientId === patientId && a.status === 'effectue')
    .map((a) => new Date(a.datetime))
    .sort((a, b) => b - a);
  if (done.length) return { date: done[0], source: 'dernier rdv effectué' };
  return { date: null, source: 'aucun (nouveau suivi)' };
}

// --- Fenêtre de cadence (cachée du patient) ---
// cadence = {
//   mode: 'cadence' | 'fourchette',
//   frequencyDays,            // mode 'cadence'
//   minDays, maxDays,         // mode 'fourchette'
//   marginDays,
//   horizonWeeks,             // horizon initial d'ouverture (def. 12)
//   maxFuture,                // nb max de rdv futurs planifiés simultanés
// }
export function cadenceWindow({ anchor, cadence, now }) {
  const horizonMs = (cadence.horizonWeeks || 12) * 7 * DAY_MS;
  const horizonEnd = new Date((now ? now.getTime() : Date.now()) + horizonMs);
  if (!anchor) {
    return { from: now ? new Date(now.getTime()) : new Date(), to: horizonEnd, target: null };
  }
  const margin = cadence.marginDays || 0;
  if (cadence.mode === 'fourchette') {
    return {
      from: addDays(anchor, (cadence.minDays || 0) - margin),
      to: addDays(anchor, (cadence.maxDays || cadence.minDays || 0) + margin),
      target: null,
    };
  }
  const target = addDays(anchor, cadence.frequencyDays || 0);
  return { from: addDays(target, -margin), to: addDays(target, margin), target };
}

// Filtre les créneaux ouverts (venant d'availability) selon la cadence du patient.
// openSlots : [{ start, ... }]. Retourne { window, slots:[Date] }.
export function compatibleSlots({ openSlots, anchor, cadence, now }) {
  const win = cadenceWindow({ anchor, cadence, now });
  const horizonEnd = new Date((now ? now.getTime() : Date.now()) + (cadence.horizonWeeks || 12) * 7 * DAY_MS);
  const upper = win.to < horizonEnd ? win.to : horizonEnd;
  const slots = openSlots
    .map((s) => s.start)
    .filter((d) => d >= win.from && d <= new Date(upper.getTime() + DAY_MS) && (!now || d > now))
    .sort((a, b) => a - b);
  return { window: win, slots };
}

// --- Comptage / plafond (par statut 'planifie', futur) ---
export function futurePlanned(appointments, patientId, now = new Date()) {
  return (appointments || []).filter((a) =>
    a.patientId === patientId && a.status === 'planifie' && new Date(a.datetime) > now);
}
export function bookingCapReached(appointments, patient, cadence, now = new Date()) {
  const cap = cadence.maxFuture || 1;
  return futurePlanned(appointments, patient.id, now).length >= cap;
}

// Éligibilité à la liste de désistement : uniquement une personne déjà suivie
// ayant AU MOINS un rendez-vous futur planifié (celui qu'elle cherche à avancer).
export function canJoinWaitlist(appointments, patientId, now = new Date()) {
  return futurePlanned(appointments, patientId, now).length > 0;
}

// Autorisation d'instauration/adaptation médicamenteuse : uniquement si un relais
// prescripteur est identifié et confirmé. Les consultations initiales, elles, ne
// sont pas bloquées par l'absence de relais.
export function canAdaptMedication(demand) {
  return !!(demand && demand.relais);
}

// --- Déplacement d'UN rdv, sans décaler la série ---
// La nouvelle date doit être un créneau ouvert (openSlots), futur, non occupé.
// On NE valide QUE ce rdv (les autres rdv du patient ne bougent pas).
export function validateMove({ openSlots, newDate, now }) {
  const nd = new Date(newDate);
  if (now && nd <= now) return { ok: false, reason: 'La nouvelle date est dans le passé.' };
  const open = openSlots.some((s) => s.start.getTime() === nd.getTime());
  if (!open) return { ok: false, reason: "Ce créneau n'est pas ouvert (hors trame, fermeture ou déjà pris)." };
  return { ok: true };
}

// --- Série atomique pour circuits/parcours ---
// Propose `count` créneaux espacés d'environ spacingDays (± marginDays), tous
// pris dans openSlots, à partir de startFrom (ou now). Retourne la liste OU null
// si l'on ne peut pas garantir toute la série (=> ne pas démarrer le parcours).
export function proposeSeries({ openSlots, count, spacingDays, marginDays = 4, startFrom, now }) {
  const avail = [...openSlots].map((s) => s.start).sort((a, b) => a - b);
  const base = startFrom ? new Date(startFrom) : (now ? new Date(now) : new Date());
  const chosen = [];
  let anchor = base;
  for (let i = 0; i < count; i++) {
    let windowFrom, windowTo;
    if (i === 0) {
      windowFrom = base;
      windowTo = new Date(base.getTime() + (spacingDays + marginDays) * DAY_MS);
    } else {
      windowFrom = new Date(anchor.getTime() + (spacingDays - marginDays) * DAY_MS);
      windowTo = new Date(anchor.getTime() + (spacingDays + marginDays) * DAY_MS);
    }
    const pick = avail.find((d) =>
      d >= windowFrom && d <= windowTo && !chosen.some((c) => c.getTime() === d.getTime()) && (!now || d > now));
    if (!pick) return null;
    chosen.push(pick);
    anchor = pick;
  }
  return chosen;
}
