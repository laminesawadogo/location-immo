# Prototype minimal - platforme annonces

## Installation

1. Copier les fichiers (tel qu'indiqué) ou télécharger le zip fourni.
2. Dans le dossier racine: `npm install`
3. Lancer le serveur: `npm start` (ou `npm run dev` si tu as nodemon)
4. Ouvrir dans le navigateur: http://localhost:3000

## Notes
- Ce prototype n'a pas d'authentification: toute personne peut publier une annonce.
- Les données sont stockées dans `data/listings.json` (fichier JSON local) et les messages dans `data/messages.json`.
- Les images sont stockées dans le dossier `uploads/`.

Pour une version en production, il faudra :
- utiliser une vraie base de données (Postgres),
- ajouter authentification, validation des uploads, et modération,
- stocker images sur S3 ou service équivalent.