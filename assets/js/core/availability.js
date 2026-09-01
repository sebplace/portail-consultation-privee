// Disponibilité générale du médecin : trame hebdomadaire d'horaires fixes,
// créneau d'urgence invisible, fermetures/congés/exceptions datées, et génération
// des créneaux réellement ouverts sur un horizon donné.
// Aucune règle patient ici : uniquement l'offre de créneaux du cabinet.
import { addDays, atTime, isoWeekday, ymd } from './rules.js';

// weeklyTemplate : { isoWeekday(1..7): ['HH:MM', ...] }  — créneaux publics.
// emergencyTemplate : { isoWeekday: ['HH:MM'] }  — créneaux d'urgence, jamais publics.
// closures : [{ from:'YYYY-MM-DD'|ISO, to:'YYYY-MM-DD'|ISO, label, kind }]
//   Une fermeture couvre tout l'intervalle [from 00:00 ; to 23:59] inclus.

function parseBoundary(v, endOfDay) {
  // 'YYYY-MM-DD' => borne de journée ; ISO complet => tel quel.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  }
  return new Date(v);
}

export function isClosed(date, closures) {
  const t = date.getTime();
  return (closures || []).some((c) => {
    const from = parseBoundary(c.from, false).getTime();
    const to = parseBoundary(c.to, true).getTime();
    return t >= from && t <= to;
  });
}

export function closureAt(date, closures) {
  return (closures || []).find((c) => {
    const from = parseBoundary(c.from, false).getTime();
    const to = parseBoundary(c.to, true).getTime();
    const t = date.getTime();
    return t >= from && t <= to;
  }) || null;
}

// Un créneau candidat entre-t-il en conflit avec un rdv actif (planifié) ou une urgence encodée ?
function isBusy(slotStart, durationMin, appointments) {
  const s = slotStart.getTime();
  const e = s + durationMin * 60000;
  return (appointments || []).some((a) => {
    if (a.status !== 'planifie') return false;
    const as = new Date(a.datetime).getTime();
    const ae = as + (a.durationMin || durationMin) * 60000;
    return s < ae && as < e;
  });
}

// Génère la liste des créneaux OUVERTS entre `from` et `to`.
// - includeEmergency=false : les créneaux d'urgence sont exclus (invisibles au public).
// - retourne [{ start:Date, iso, day, time, emergency:boolean }]
export function generateOpenSlots({
  doctor, appointments = [], from, to, now = new Date(), includeEmergency = false, includeProtected = false,
}) {
  const dur = doctor.slotDurationMin;
  const out = [];
  let cursor = new Date(from.getTime());
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to.getTime());
  end.setHours(23, 59, 59, 999);
  const protectedTpl = doctor.protectedTemplate || {};
  while (cursor <= end) {
    const wd = isoWeekday(cursor);
    const publicTimes = (doctor.weeklyTemplate[wd] || []).map((t) => ({ t, emergency: false, protected: false }));
    const emgTimes = includeEmergency ? (doctor.emergencyTemplate[wd] || []).map((t) => ({ t, emergency: true, protected: false })) : [];
    const protTimes = includeProtected ? (protectedTpl[wd] || []).map((t) => ({ t, emergency: false, protected: true })) : [];
    for (const { t, emergency, protected: prot } of [...publicTimes, ...emgTimes, ...protTimes]) {
      // Un créneau protégé n'est jamais public.
      if (!includeProtected && (protectedTpl[wd] || []).includes(t)) continue;
      const start = atTime(cursor, t);
      if (start <= now) continue;
      if (isClosed(start, doctor.closures)) continue;
      if (isBusy(start, dur, appointments)) continue;
      out.push({ start, iso: start.toISOString(), day: ymd(start), time: t, emergency, protected: prot });
    }
    cursor = addDays(cursor, 1);
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

// Rendez-vous existants (planifiés) tombant dans une fermeture donnée — pour la
// "liste à traiter" : on NE déplace jamais automatiquement.
export function appointmentsInClosure(appointments, closure) {
  const from = parseBoundary(closure.from, false).getTime();
  const to = parseBoundary(closure.to, true).getTime();
  return (appointments || []).filter((a) => {
    if (a.status !== 'planifie') return false;
    const t = new Date(a.datetime).getTime();
    return t >= from && t <= to;
  });
}

// Capacité "avis/parcours" : nombre de séances de circuit déjà planifiées dans une
// fenêtre glissante de `windowDays` autour d'une date candidate.
export function avisSessionsAround(appointments, candidateDate, windowDays) {
  const half = (windowDays * 24 * 3600 * 1000) / 2;
  const c = candidateDate.getTime();
  return (appointments || []).filter((a) => {
    if (a.status !== 'planifie') return false;
    if (!a.circuitInstanceId) return false;
    const t = new Date(a.datetime).getTime();
    return Math.abs(t - c) <= half;
  }).length;
}
