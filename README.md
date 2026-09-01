# Portail de rendez-vous — Dr Mathieu Place (prototype v4)

Prototype **de démonstration** d'un portail de prise de rendez-vous pour la consultation privée du **Dr Mathieu Place, psychiatre**, avec des **règles de suivi déterministes et strictement internes** propres à chaque patient.

> ⚠️ **Démonstration à données fictives.** Aucune donnée réelle, aucun patient réel, aucune donnée clinique. Tout se passe **dans le navigateur** (stockage local). Ne jamais y introduire de données réelles.

## Essayer en ligne

**https://sebplace.github.io/portail-consultation-privee/**

Installable (PWA), mode clair/sombre, trois rôles (Patient · Secrétariat · Médecin) accessibles aussi par URL (`#patient`, `#secretariat`, `#medecin`).

## Nouveautés v4 (confort, navigation, esthétique)

- **Thème clair/sombre** (respect des préférences système, bascule mémorisée).
- **Navigation par URL** (rôle dans l'adresse), lien d'évitement, focus clavier, cibles tactiles, ARIA.
- **PWA installable** avec coquille hors-ligne (service worker).
- **Patient** : sélecteur de créneaux **par semaine** + « prochain créneau », **récapitulatif** avant réservation, **ajout au calendrier (.ics)**, **préférences de désistement** (jours, horaires, délai), **formulaire de demande en étapes** + **référence de suivi**, réponse aux **offres de désistement** (48h).
- **Médecin** : **tableau de bord d'accueil** (synthèse + jauges d'occupation et de capacité avis), **recherche + fiche patient consolidée**, **annulation avec motif**, **gabarits de cadence** + **aperçu d'impact en direct**, **statistiques**, **réglages de notifications neutres**, **export/import de l'état**, **journal exportable en CSV**.
- **Disponibilité** : **fermetures demi-journée / créneau précis**, **créneaux protégés** (non publics), urgence 12:15 invisible.
- **Désistement enrichi** : offre successive **48h avec relance automatique** à la personne suivante.
- **Couleurs de statut**, animations discrètes, écrans vides plus clairs.

## Rappel des fondamentaux (v3, contre-audit)

Ancrage = dernier rdv **effectué** ou date fixée par le médecin (jamais annulé/absent/futur) ; déplacer un rdv ne décale pas la série. Durée globale 45 min. Règles internes 100 % invisibles côté patient. Deux files distinctes (désistement / avis-parcours). Circuits 2/3/3+3 à réservation atomique. Acceptation conditionnelle en attente d'un relais prescripteur. Délais 7 jours / 48 heures. Notifications neutres (aucun contenu clinique). Statuts planifié/effectué/déplacé/annulé/absent, jamais « effectué » automatique. Migration CSV avec contrôle humain.

## Ce que le prototype ne fait PAS encore (production serveur)

Validation atomique **côté serveur**, base de données, authentification forte, séparation stricte des rôles, chiffrement, sauvegardes/restaurations testées, journalisation des accès, conservation/suppression, envoi réel d'e-mails, validation sécurité + RGPD, migration réelle depuis Mobminder puis arrêt des écritures privées.

## Développement

Aucune dépendance, aucun build. JavaScript standard (ES modules).

```bash
node tests/rules.test.mjs   # tests du moteur (17 tests)
node tests/serve.mjs        # http://localhost:5173
```

## Structure

```
index.html · manifest.webmanifest · sw.js
assets/
  icon.svg
  css/styles.css
  js/
    app.js                routeur (hash) + thème
    core/rules.js         moteur cadence : ancrage, fenêtres, compatibilité, déplacement, série atomique
    core/availability.js  trame hebdo, urgence, créneaux protégés, fermetures, génération de créneaux
    core/store.js         état, statuts, rôles, files, circuits, migration, désistement enrichi, stats, export/import, notifications
    data/seed.js          médecin + trame réelle, faux patients (cadences cachées), circuits, faux CSV
    views/patient.js      portail patient (règles cachées) + demande en étapes + .ics + semaine
    views/secretary.js    rôle secrétariat limité
    views/doctor.js       tableau de bord (accueil, agenda, files, règles, dispo, migration, journal, e-mails, réglages)
    views/dom.js          utilitaires (modale, confirm, .ics, téléchargement…)
tests/
  rules.test.mjs · serve.mjs
```

