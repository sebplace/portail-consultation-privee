// Internationalisation légère (FR par défaut, NL et EN pour l'espace patient et
// la coquille). Les espaces professionnels (médecin, secrétariat) restent en FR.
const DICT = {
  fr: {
    'role.patient': 'Patient', 'role.secretariat': 'Secrétariat', 'role.medecin': 'Médecin',
    'brand.sub': 'Psychiatre · consultation privée',
    'theme.toggle': 'Basculer le thème', 'lang.label': 'Langue',
    'foot': 'Prototype de démonstration · données fictives · aucune donnée réelle · stockage local du navigateur.',
    'skip': 'Aller au contenu',
    // Patient
    'p.space': 'Espace patient', 'p.cabinet': 'Cabinet du Dr Mathieu Place — psychiatre.',
    'p.access': "Accès par lien sécurisé personnel (démonstration : code d'accès).",
    'p.code': "Code d'accès", 'p.login': 'Se connecter', 'p.notyet': "Vous n'êtes pas encore suivi(e) ?",
    'p.newdemand': 'Adresser une nouvelle demande', 'p.track': 'Suivre ma demande', 'p.faq': 'Comment ça marche',
    'p.democodes': 'Codes de démo : ',
    'p.hello': 'Bonjour', 'p.logout': 'Se déconnecter',
    'p.myrdv': 'Mes rendez-vous', 'p.choose': '+ Choisir un rendez-vous', 'p.none': 'Aucun rendez-vous à venir.',
    'p.history': 'Mes rendez-vous passés', 'p.otheractions': 'Autres actions',
    'p.signal': 'Signaler une demande', 'p.signalsub': 'Parler, ordonnance, rapport…',
    'p.waitlist': 'Liste de désistement', 'p.waitlistprefs': 'Mes préférences de désistement',
    'p.waitlistsub': 'Avancer votre prochain rendez-vous', 'p.waitlistneed': 'Nécessite un rendez-vous à venir',
    'p.leavewaitlist': 'Quitter le désistement',
    'p.chooserdv': 'Choisir un rendez-vous', 'p.proposed': 'Voici les créneaux qui vous sont proposés.',
    'p.weekprev': '← Semaine préc.', 'p.weeknext': 'Semaine suiv. →', 'p.back': 'Retour',
    'p.confirm': 'Confirmer le rendez-vous', 'p.about2book': 'Vous êtes sur le point de réserver :',
    'p.reminder': 'Un e-mail neutre pourra vous rappeler ce rendez-vous.',
    'p.calendar': '📅 Calendrier', 'p.move': 'Déplacer', 'p.cancel': 'Annuler',
    'p.emergency': "Ce canal ne remplace pas les dispositifs d'urgence. En cas d'urgence, contactez le 112 ou les services d'urgence.",
    'p.closurewarn': "Un de vos rendez-vous n'est plus disponible (fermeture du cabinet). Merci de le reprogrammer.",
    'p.reschedule': 'Reprogrammer',
  },
  nl: {
    'role.patient': 'Patiënt', 'role.secretariat': 'Secretariaat', 'role.medecin': 'Arts',
    'brand.sub': 'Psychiater · privéconsultatie',
    'theme.toggle': 'Thema wisselen', 'lang.label': 'Taal',
    'foot': 'Demonstratieprototype · fictieve gegevens · geen echte gegevens · lokale opslag in de browser.',
    'skip': 'Naar de inhoud',
    'p.space': 'Patiëntenruimte', 'p.cabinet': 'Praktijk van Dr Mathieu Place — psychiater.',
    'p.access': 'Toegang via persoonlijke beveiligde link (demo: toegangscode).',
    'p.code': 'Toegangscode', 'p.login': 'Aanmelden', 'p.notyet': 'Nog niet in behandeling?',
    'p.newdemand': 'Een nieuwe aanvraag indienen', 'p.track': 'Mijn aanvraag volgen', 'p.faq': 'Hoe werkt het',
    'p.democodes': 'Democodes: ',
    'p.hello': 'Hallo', 'p.logout': 'Afmelden',
    'p.myrdv': 'Mijn afspraken', 'p.choose': '+ Een afspraak kiezen', 'p.none': 'Geen komende afspraken.',
    'p.history': 'Mijn vorige afspraken', 'p.otheractions': 'Andere acties',
    'p.signal': 'Een vraag melden', 'p.signalsub': 'Spreken, voorschrift, verslag…',
    'p.waitlist': 'Annuleringslijst', 'p.waitlistprefs': 'Mijn voorkeuren annuleringslijst',
    'p.waitlistsub': 'Uw volgende afspraak vervroegen', 'p.waitlistneed': 'Vereist een komende afspraak',
    'p.leavewaitlist': 'Annuleringslijst verlaten',
    'p.chooserdv': 'Een afspraak kiezen', 'p.proposed': 'Dit zijn de voorgestelde tijdstippen.',
    'p.weekprev': '← Vorige week', 'p.weeknext': 'Volgende week →', 'p.back': 'Terug',
    'p.confirm': 'Afspraak bevestigen', 'p.about2book': 'U staat op het punt te reserveren:',
    'p.reminder': 'Een neutrale e-mail kan u aan deze afspraak herinneren.',
    'p.calendar': '📅 Agenda', 'p.move': 'Verplaatsen', 'p.cancel': 'Annuleren',
    'p.emergency': 'Dit kanaal vervangt geen noodhulp. Bel bij nood 112 of de hulpdiensten.',
    'p.closurewarn': 'Een van uw afspraken is niet meer beschikbaar (praktijk gesloten). Gelieve te herplannen.',
    'p.reschedule': 'Herplannen',
  },
  en: {
    'role.patient': 'Patient', 'role.secretariat': 'Secretariat', 'role.medecin': 'Doctor',
    'brand.sub': 'Psychiatrist · private practice',
    'theme.toggle': 'Toggle theme', 'lang.label': 'Language',
    'foot': 'Demonstration prototype · fictional data · no real data · local browser storage.',
    'skip': 'Skip to content',
    'p.space': 'Patient area', 'p.cabinet': 'Practice of Dr Mathieu Place — psychiatrist.',
    'p.access': 'Access via personal secure link (demo: access code).',
    'p.code': 'Access code', 'p.login': 'Sign in', 'p.notyet': 'Not a patient yet?',
    'p.newdemand': 'Submit a new request', 'p.track': 'Track my request', 'p.faq': 'How it works',
    'p.democodes': 'Demo codes: ',
    'p.hello': 'Hello', 'p.logout': 'Sign out',
    'p.myrdv': 'My appointments', 'p.choose': '+ Choose an appointment', 'p.none': 'No upcoming appointments.',
    'p.history': 'My past appointments', 'p.otheractions': 'Other actions',
    'p.signal': 'Send a request', 'p.signalsub': 'Talk, prescription, report…',
    'p.waitlist': 'Cancellation list', 'p.waitlistprefs': 'My cancellation-list preferences',
    'p.waitlistsub': 'Bring your next appointment forward', 'p.waitlistneed': 'Requires an upcoming appointment',
    'p.leavewaitlist': 'Leave the cancellation list',
    'p.chooserdv': 'Choose an appointment', 'p.proposed': 'Here are the slots offered to you.',
    'p.weekprev': '← Prev. week', 'p.weeknext': 'Next week →', 'p.back': 'Back',
    'p.confirm': 'Confirm appointment', 'p.about2book': 'You are about to book:',
    'p.reminder': 'A neutral email may remind you of this appointment.',
    'p.calendar': '📅 Calendar', 'p.move': 'Move', 'p.cancel': 'Cancel',
    'p.emergency': 'This channel does not replace emergency services. In an emergency, call 112.',
    'p.closurewarn': 'One of your appointments is no longer available (practice closed). Please reschedule.',
    'p.reschedule': 'Reschedule',
  },
};

// Langues exposées publiquement. Gel actuel : uniquement le français.
// NL et EN restent définis dans DICT et pourront être réexposés après relecture
// complète des traductions (boutons, statuts, dates encore partiellement en FR).
const LANGS = [['fr', 'FR']];
let current = 'fr';
try { const s = localStorage.getItem('pcp.lang'); if (s && DICT[s] && LANGS.some(([c]) => c === s)) current = s; } catch (e) {}

export function langs() { return LANGS; }
export function getLang() { return current; }
export function setLang(l) { if (DICT[l]) { current = l; try { localStorage.setItem('pcp.lang', l); } catch (e) {} } }
export function t(key) { return (DICT[current] && DICT[current][key]) || (DICT.fr[key]) || key; }
