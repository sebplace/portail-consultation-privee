# Portail de consultation — prototype

Prototype **de démonstration** d'un portail de prise de rendez-vous pour une consultation privée, avec des **règles de suivi déterministes propres à chaque patient**.

> ⚠️ **Démonstration à données fictives.** Aucune donnée réelle, aucun patient réel, aucune donnée clinique. Tout se passe **dans le navigateur** (stockage local). Ce prototype sert uniquement à recueillir un avis sur l'ergonomie et la logique.

## Essayer en ligne

Une fois GitHub Pages activé : **https://sebplace.github.io/portail-consultation-privee/**

Deux espaces, via le sélecteur en haut :

- **Espace patient** — connexion par code de démo (`ANNE-2026`, `BRUNO-2026`, `CLARA-2026`), puis prise / déplacement / annulation de rendez-vous dans les créneaux compatibles, liste de désistement, signalement d'une demande.
- **Espace médecin** — agenda, file « à traiter », édition des règles par patient, journal des opérations, aperçu des e-mails neutres.

## Ce que le prototype démontre

- **Moteur de règles par patient** : fréquence, marge ± autour de la fréquence, jours/heures autorisés, durée, et **plafond de rendez-vous à l'avance** (nombre maximum de rendez-vous futurs simultanés).
- Le patient ne voit **que** les créneaux réellement compatibles avec son rythme de suivi.
- Un déplacement n'est autorisé **que** dans une fourchette cohérente.
- Les opérations ordinaires (prise / déplacement / annulation sans commentaire) **ne génèrent aucune alerte**.
- Une **demande explicite** déclenche une **notification neutre** (aucun contenu clinique, seulement un signal + lien).
- **Journalisation** des opérations importantes.
- Rappel visible : ce canal **ne remplace pas** les dispositifs d'urgence.

## Ce que le prototype ne fait PAS encore (à venir avec un vrai hébergement)

- Envoi réel d'e-mails, base de données serveur, authentification forte (itsme/eID), journalisation persistante côté serveur, synchronisation avec un agenda externe (Mobminder).

## Développement

Aucune dépendance, aucun build. JavaScript standard (ES modules).

```bash
# Lancer les tests du moteur de règles
node tests/rules.test.mjs

# Servir le prototype en local (ES modules => http requis)
node tests/serve.mjs
# puis ouvrir http://localhost:5173
```

## Structure

```
index.html
assets/
  css/styles.css
  js/
    app.js              routeur (Espace patient / Espace médecin)
    core/rules.js       moteur de règles déterministe (pur, testé)
    core/store.js       persistance locale, journal, notifications neutres
    data/seed.js        faux patients + règles + rendez-vous de démonstration
    views/patient.js    portail patient
    views/doctor.js     tableau de bord médecin
    views/dom.js        utilitaires d'affichage
tests/
  rules.test.mjs        tests déterministes du moteur
  serve.mjs             serveur statique local
```
