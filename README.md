# Portail de rendez-vous — Dr Mathieu Place (prototype v3)

Prototype **de démonstration** d'un portail de prise de rendez-vous pour la consultation privée du **Dr Mathieu Place, psychiatre**, avec des **règles de suivi déterministes et strictement internes** propres à chaque patient.

> ⚠️ **Démonstration à données fictives.** Aucune donnée réelle, aucun patient réel, aucune donnée clinique. Tout se passe **dans le navigateur** (stockage local). Ce prototype sert uniquement à recueillir un avis. **Ne jamais y introduire de données réelles.**

## Essayer en ligne

**https://sebplace.github.io/portail-consultation-privee/**

Trois rôles via le sélecteur en haut :

- **Patient** — accès par code de démo (`ANNE-2026`, `BRUNO-2026`, `CLARA-2026`). Le patient ne voit **que** les créneaux qui lui sont proposés — jamais la fréquence, la marge, l'ancrage ni un nombre de rendez-vous. Peut aussi **adresser une nouvelle demande** (formulaire cadré).
- **Secrétariat** — rôle **limité** : rechercher, réserver / déplacer / annuler pour une personne, désistement, présence/absence, encoder l'urgence 12:15 **après accord tracé** du médecin. Aucune donnée clinique, aucune cadence, aucune acceptation de demande. Tout est journalisé.
- **Médecin** — disponibilité générale + fermetures, deux files, circuits atomiques, migration CSV, journal, statuts, règles internes par patient.

## Ce que le prototype démontre (v3, contre-audit)

1. **Ancrage correct** : dernier rendez-vous **effectué** ou date fixée par le médecin. Jamais un rdv annulé/absent/futur. Déplacer un rdv ne déplace pas la série.
2. **Durée globale 45 min** partout.
3. **Disponibilité générale** : trame hebdomadaire réelle (mardi / jeudi), créneau d'urgence 12:15 **invisible au public**, congés / fermetures / exceptions datées. Une fermeture avec rendez-vous existants **bloque** les nouvelles réservations et **liste** les rdv à traiter, **sans déplacer** personne.
4. **Règles internes 100 % invisibles** côté patient.
5. **Import CSV fictif** avec prévisualisation, détection doublons / collisions / rejets, contrôle humain, journal de migration.
6. **Rôle secrétariat** strictement limité et journalisé.
7. **Deux files distinctes** : désistement (avancer son prochain rdv, expiration au prochain rdv, offre successive 48h) et file d'avis/parcours (formulaire → acceptation humaine → entrée en file).
8. **Circuits 2 / 3 / 3+3** avec **réservation atomique** de la série initiale (tenue puis confirmation ensemble ; refus si la série ne peut être garantie).
9. **Acceptation conditionnelle** en attente d'un **relais prescripteur**.
10. **Délais 7 jours** (invitation) et **48 heures** (désistement).
11. **Journal médecin** en cartes, adapté téléphone.
12. Libellé **« Intervalle entre les créneaux (min) »**.

## Ce que le prototype ne fait PAS encore (production serveur)

Validation atomique **côté serveur**, base de données, authentification forte, séparation stricte des rôles, chiffrement, sauvegardes/restaurations testées, journalisation des accès, conservation/suppression, e-mails réels, validation sécurité + RGPD. La migration réelle depuis Mobminder puis l'arrêt de toute écriture privée dans Mobminder.

## Développement

Aucune dépendance, aucun build. JavaScript standard (ES modules).

```bash
node tests/rules.test.mjs   # tests du moteur (15 tests)
node tests/serve.mjs        # http://localhost:5173
```

## Structure

```
index.html
assets/
  css/styles.css
  js/
    app.js                routeur (Patient / Secrétariat / Médecin)
    core/rules.js         moteur cadence : ancrage, fenêtres, compatibilité, déplacement, série atomique
    core/availability.js  trame hebdo, urgence, fermetures, génération de créneaux ouverts
    core/store.js         état, statuts, rôles, 2 files, circuits, migration, notifications, journal
    data/seed.js          médecin + trame réelle, faux patients (cadences cachées), circuits, faux CSV
    views/patient.js      portail patient (règles cachées) + nouvelle demande
    views/secretary.js    rôle secrétariat limité
    views/doctor.js       tableau de bord médecin
    views/dom.js          utilitaires d'affichage
tests/
  rules.test.mjs          tests déterministes du moteur
  serve.mjs               serveur statique local
```
