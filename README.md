# Portail de rendez-vous — Dr Mathieu Place (prototype v5)

Prototype **de démonstration** d'un portail de prise de rendez-vous pour la consultation privée du **Dr Mathieu Place, psychiatre**, avec des **règles de suivi déterministes et strictement internes** propres à chaque patient.

> ⚠️ **Démonstration à données fictives.** Aucune donnée réelle, aucun patient réel, aucune donnée clinique. Tout se passe **dans le navigateur** (stockage local). Ne jamais y introduire de données réelles.

## Essayer en ligne

**https://sebplace.github.io/portail-consultation-privee/** · installable (PWA), clair/sombre, rôles Patient · Secrétariat · Médecin (aussi via `#patient`, `#secretariat`, `#medecin`).

## Consolidation v5

1. **Créneaux d'avis dédiés** : mardi 16:00 et jeudi 11:30 (45 min), **réservés aux circuits** et **exclus des suivis ordinaires** ; base **8 séances / 4 semaines**. Jeudi 17:30 reste un suivi ordinaire. Un créneau d'avis inutilisé n'est **jamais** libéré automatiquement : conversion **manuelle** possible. Capacité portée ponctuellement de 8 à 10 par **ajout de 2 créneaux maximum** (avec aperçu).
2. **Liste de désistement** : accessible **uniquement** à une personne ayant un rendez-vous futur ; sert à l'avancer ; expire à l'arrivée, l'annulation ou le remplacement du rendez-vous. Préférences limitées aux **vrais jours de consultation**. Offre successive **48 h** avec relance automatique.
3. **Espacement** : **14 jours par défaut**, dérogation possible par le médecin (champ + aperçu).
4. **Circuits** : avis général 2, pharmaco 3, **TDAH 3 initiales** ; le **3 + 3** ne réserve jamais 6 d'emblée : le bloc thérapeutique (3) s'ouvre uniquement sur **décision médicale distincte**. Raccourcir / prolonger de N consultations sans plafond clinique, sous réserve de capacité, avec **impact visible avant validation**. Série initiale réservée d'un bloc (atomicité réelle = serveur en production).
5. **Relais prescripteur** : acceptation **conditionnelle** possible sans relais ; les **consultations initiales** peuvent démarrer ; seule **l'instauration/adaptation médicamenteuse** reste bloquée tant que le relais n'est pas identifié et confirmé.
6. **Formulaire de demande** : explication courte **propre au circuit** (caractère limité dans le temps), objectif en **choix fermés configurables**, origine, professionnel adresseur, **relais + coordonnées**, disponibilités, zone libre, confirmation limites **et consignes d'urgence**. Les patients voient le cadre général, jamais les cadences/marges internes.
7. **Délais / notifications** : invitation 7 jours, rappel J5, retour en file puis clôture après 2 absences de réponse (simulé en démo) ; offre de désistement 48 h ; rappels J-2/J-1 configurables. **Aucune** notification médecin sur prise/déplacement/annulation ordinaires ; seule une demande/commentaire explicite déclenche une notification **neutre**.
8. **Technique** : navigation par URL acceptable **en démo** (autorisations serveur en production) ; la **PWA ne met en cache que la coquille statique**, jamais de rendez-vous, données identifiantes ou contenu clinique ; migration CSV contrôlée puis application agenda maître unique, sans synchronisation bidirectionnelle permanente.

## Tests d'acceptation vérifiés (v5)

- Anne (sans rdv futur) **ne peut pas** rejoindre le désistement (tuile désactivée).
- Créneaux d'avis exacts : **mardi 16:00 + jeudi 11:30**, exclus de l'ordinaire.
- TDAH : **3 rendez-vous** initiaux seulement.
- Second bloc de 3 **uniquement après décision médicale**.
- Consultation initiale possible sous **acceptation conditionnelle**, adaptation médicamenteuse **bloquée sans relais** (débloquée avec relais).
- **Zéro** notification médecin sur opérations ordinaires.
- **Aucune** donnée personnelle dans le cache hors-ligne (seulement la coquille statique).

## Limites encore simulées (client-only)

Atomicité réelle des réservations, contrôle d'autorisations et envoi d'e-mails : **côté serveur en production**. Le cycle d'invitation (rappel J5 / retour en file / clôture) est **simulé** (déclenché par les dates, sans envoi réel). Authentification forte, base de données, chiffrement, sauvegardes, journalisation des accès, conservation/suppression, audit sécurité + RGPD, identité visuelle et hébergement restent des étapes de production.

## Rappels fondamentaux (v3-v4)

Ancrage = dernier rdv **effectué** ou date fixée par le médecin (jamais annulé/absent/futur) ; déplacer un rdv ne décale pas la série. Durée globale 45 min. Règles internes 100 % invisibles côté patient. Deux files distinctes. Statuts planifié/effectué/déplacé/annulé/absent, jamais « effectué » automatique. Migration CSV avec contrôle humain. Disponibilité générale : trame hebdo, fermetures (jour / demi-journée / créneau), urgence 12:15 invisible. Thème clair/sombre, PWA, accessibilité, tableau de bord médecin (accueil, agenda, files, règles, dispo, migration, journal, e-mails, réglages).

## Développement

Aucune dépendance, aucun build. JavaScript standard (ES modules).

```bash
node tests/rules.test.mjs    # tests du moteur (23 tests)
node tests/store.test.mjs    # 7 tests d'acceptation (store)
node tests/serve.mjs         # http://localhost:5173
```

## Confort v6 (faisable client-only, déjà en place)

- **Multilingue FR / NL / EN** (espace patient + coquille), sélecteur de langue mémorisé.
- **Médecin** : onglet **Aujourd'hui** (pointage rapide), **vue Calendrier** semaine colorée, **centre de décisions** (cloche + compteur), **Annuler la dernière action (undo)**, **éditeur de trame** (ajout/retrait de créneaux ordinaires ou avis) et **réglage de capacité**, **jours fériés belges** pré-remplis, **journal filtrable/recherchable + pagination**, **statistiques enrichies** (absences par jour, délai d'accès par circuit, conversion), **visite guidée**.
- **Secrétariat** : **agenda du jour imprimable/exportable**, annulation avec motif, encadré de périmètre (autorisé / non autorisé).
- **Patient** : **FAQ**, **historique des rendez-vous passés**, **reprogrammation guidée** quand un rendez-vous tombe dans une fermeture.
- **Sauvegarde/restauration** de l'état, **journal CSV**, PWA (coquille statique uniquement).

## Structure

```
index.html · manifest.webmanifest · sw.js (coquille statique uniquement)
assets/
  icon.svg · css/styles.css
  js/
    app.js                routeur (hash) + thème
    core/rules.js         ancrage, fenêtres, compatibilité, déplacement, série atomique, éligibilité désistement, gate médicament
    core/availability.js  trame hebdo, avis dédiés, urgence, fermetures, génération de créneaux
    core/store.js         état, statuts, rôles, files, circuits 3+3, relais, capacité avis, migration, désistement, stats, export/import
    data/seed.js          médecin + trame réelle, faux patients (cadences cachées), circuits, faux CSV
    views/patient.js      portail patient (règles cachées) + demande en étapes + désistement conditionnel
    views/secretary.js    rôle secrétariat limité
    views/doctor.js       tableau de bord médecin
    views/dom.js          utilitaires (modale, confirm, .ics, téléchargement…)
tests/
  rules.test.mjs · serve.mjs
```
