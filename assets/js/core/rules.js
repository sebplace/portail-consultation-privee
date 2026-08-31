// Moteur de regles deterministe (aucune dependance, testable en Node ou navigateur).
// Toutes les fonctions sont pures : memes entrees => memes sorties.

// --- Utilitaires de dates (jour = pas de fuseau, on raisonne en heures locales) ---
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

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// getDay(): 0=dimanche..6=samedi. On utilise 1=lundi..7=dimanche pour lisibilite.
export function isoWeekday(date) {
  const g = date.getDay();
  return g === 0 ? 7 : g;
}

// Chevauchement de deux intervalles [aStart,aEnd) et [bStart,bEnd)
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// --- Regles par patient ---
// rule = {
//   frequencyDays, marginDays, allowedWeekdays:[1..7], startTime:'09:00',
//   endTime:'17:00', durationMin, bookAhead, slotStepMin
// }

// Retourne la date "cible" du prochain RDV a partir d'une date de reference.
export function targetNextDate(lastDate, rule) {
  return addDays(lastDate, rule.frequencyDays);
}

// Fenetre coherente autour de la cible : [cible - marge, cible + marge].
export function coherentWindow(lastDate, rule) {
  const target = targetNextDate(lastDate, rule);
  return {
    target,
    from: addDays(target, -rule.marginDays),
    to: addDays(target, rule.marginDays),
  };
}

// Genere les creneaux candidats d'une journee selon la regle.
function daySlots(date, rule) {
  const step = rule.slotStepMin || rule.durationMin;
  const dayStart = atTime(date, rule.startTime);
  const dayEnd = atTime(date, rule.endTime);
  const slots = [];
  let cursor = dayStart;
  while (cursor.getTime() + rule.durationMin * 60000 <= dayEnd.getTime() + 1) {
    slots.push(new Date(cursor.getTime()));
    cursor = new Date(cursor.getTime() + step * 60000);
  }
  return slots;
}

// Un creneau entre-t-il en conflit avec un RDV existant (agenda du medecin) ?
function conflictsWithBooked(slotStart, durationMin, bookedAppointments) {
  const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);
  return bookedAppointments.some((a) => {
    if (a.status !== 'booked') return false;
    const aStart = new Date(a.datetime);
    const aEnd = new Date(aStart.getTime() + a.durationMin * 60000);
    return overlaps(slotStart, slotEnd, aStart, aEnd);
  });
}

// Calcule les creneaux compatibles pour le PROCHAIN rdv d'un patient.
// - lastDate : date du dernier rdv effectif (ou date de reference si nouveau patient)
// - allBooked : tous les rdv reserves de l'agenda du medecin (pour eviter les conflits)
// - now : date courante (on ne propose jamais un creneau dans le passe)
export function compatibleSlots({ rule, lastDate, allBooked, now, excludeAppointmentId = null }) {
  const win = coherentWindow(lastDate, rule);
  const booked = allBooked.filter((a) => a.id !== excludeAppointmentId);
  const slots = [];
  // On balaye chaque jour de la fenetre.
  let cursor = new Date(win.from.getTime());
  cursor.setHours(0, 0, 0, 0);
  const lastDay = new Date(win.to.getTime());
  lastDay.setHours(23, 59, 59, 999);
  while (cursor <= lastDay) {
    if (rule.allowedWeekdays.includes(isoWeekday(cursor))) {
      for (const s of daySlots(cursor, rule)) {
        // Dans la fenetre coherente (jour) ET dans le futur.
        if (s < win.from || s > new Date(win.to.getTime() + DAY_MS)) continue;
        if (now && s <= now) continue;
        if (conflictsWithBooked(s, rule.durationMin, booked)) continue;
        slots.push(s);
      }
    }
    cursor = addDays(cursor, 1);
  }
  slots.sort((a, b) => a - b);
  return { window: win, slots };
}

// Valide un DEPLACEMENT de rdv : la nouvelle date doit rester dans une fenetre
// coherente vis-a-vis du rdv precedent ET du rdv suivant du meme patient.
export function validateMove({ rule, appointment, newDate, patientAppointments, allBooked, now }) {
  const mine = patientAppointments
    .filter((a) => a.status === 'booked' && a.id !== appointment.id)
    .map((a) => ({ ...a, _dt: new Date(a.datetime) }))
    .sort((a, b) => a._dt - b._dt);

  const nd = new Date(newDate);
  if (now && nd <= now) {
    return { ok: false, reason: 'La nouvelle date est dans le passe.' };
  }

  const prev = mine.filter((a) => a._dt < nd).pop();
  const next = mine.filter((a) => a._dt > nd).shift();

  if (prev) {
    const w = coherentWindow(prev._dt, rule);
    if (nd < w.from || nd > new Date(w.to.getTime() + DAY_MS)) {
      return { ok: false, reason: `Trop proche/loin du rdv precedent (fenetre ${ymd(w.from)} -> ${ymd(w.to)}).` };
    }
  }
  if (next) {
    // Le rdv suivant doit rester coherent par rapport a la nouvelle date.
    const w = coherentWindow(nd, rule);
    if (next._dt < w.from || next._dt > new Date(w.to.getTime() + DAY_MS)) {
      return { ok: false, reason: `Incompatible avec le rdv suivant du ${ymd(next._dt)}.` };
    }
  }
  // Verifier le respect des jours/heures autorises.
  if (!rule.allowedWeekdays.includes(isoWeekday(nd))) {
    return { ok: false, reason: 'Jour non autorise par les regles.' };
  }
  const start = atTime(nd, rule.startTime);
  const end = atTime(nd, rule.endTime);
  const slotEnd = new Date(nd.getTime() + rule.durationMin * 60000);
  if (nd < start || slotEnd > new Date(end.getTime() + 60000)) {
    return { ok: false, reason: 'Hors des heures autorisees.' };
  }
  // Conflit avec l'agenda global.
  if (conflictsWithBooked(nd, rule.durationMin, allBooked.filter((a) => a.id !== appointment.id))) {
    return { ok: false, reason: 'Creneau deja occupe.' };
  }
  return { ok: true };
}

// Rendez-vous FUTURS deja reserves d'un patient (sert de plafond de programmation).
export function futureBooked(appointments, patientId, now = new Date()) {
  return appointments.filter((a) =>
    a.patientId === patientId && a.status === 'booked' && new Date(a.datetime) > now);
}

// Le patient a-t-il atteint le plafond de rdv futurs simultanes (bookAhead) ?
export function bookingCapReached(appointments, patient, now = new Date()) {
  const cap = patient.rule.bookAhead || 1;
  return futureBooked(appointments, patient.id, now).length >= cap;
}

// Propose une chaine de N rdv a l'avance (bookAhead) : chaque rdv sert de base au suivant.
export function proposeChain({ rule, lastDate, allBooked, now, count }) {
  const proposals = [];
  const workingBooked = [...allBooked];
  let base = new Date(lastDate);
  for (let i = 0; i < count; i++) {
    const { slots } = compatibleSlots({ rule, lastDate: base, allBooked: workingBooked, now });
    if (slots.length === 0) { proposals.push(null); break; }
    const chosen = slots[0];
    proposals.push(chosen);
    workingBooked.push({ id: `__proposed_${i}`, status: 'booked', datetime: chosen.toISOString(), durationMin: rule.durationMin });
    base = chosen;
  }
  return proposals;
}
