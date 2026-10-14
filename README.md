# Woodstauhn — Backend de rendu IA

Petit serveur Express qui reçoit une photo + une essence de bois + une
typologie, appelle le modèle Replicate `adirik/interior-design`, et renvoie
l'URL de l'image générée. Voir `PLAN-TECHNIQUE.md` pour le raisonnement et
`frontend-integration.md` pour brancher le frontend déjà livré.

## Étape 1 — Obtenir la clé API Replicate

1. Allez sur **[replicate.com](https://replicate.com)** → "Sign Up" (email ou GitHub).
2. Une fois connecté : Profil → **API Tokens** → générez un token → copiez-le dans `REPLICATE_API_TOKEN` de votre `.env`.
3. Ouvrez **[replicate.com/adirik/interior-design/api](https://replicate.com/adirik/interior-design/api)**, onglet "API" : copiez le hash de version affiché et mettez-le dans `MODEL_VERSION`.
4. Replicate facture à l'usage (pas d'abonnement) — le tableau de bord affiche le coût réel par run une fois vos premiers tests lancés. Vérifiez les tarifs à jour sur **[replicate.com/pricing](https://replicate.com/pricing)** avant de budgéter, les prix évoluent.

## Étape 2 — Lancer en local

```bash
npm install
cp .env.example .env
# renseignez REPLICATE_API_TOKEN et MODEL_VERSION dans .env
npm run dev
```

Testez :

```bash
curl -X POST http://localhost:3001/api/render \
  -F "photo=@/chemin/vers/une-piece.jpg" \
  -F "essenceId=iroko" \
  -F "typologieId=terrasse"
```

## Étape 3 — Déployer

Trois hébergeurs Node conviennent, tous avec un palier gratuit ou très peu
cher pour démarrer. Les prix ci-dessous changent souvent — vérifiez la page
officielle de chacun avant de choisir :

- **Render** — le fichier `render.yaml` fourni est un blueprint prêt à
  l'emploi : poussez ce dossier sur GitHub, puis sur
  [dashboard.render.com](https://dashboard.render.com) → "New" → "Blueprint" →
  sélectionnez le repo. Renseignez `REPLICATE_API_TOKEN`, `MODEL_VERSION` et
  `FRONTEND_ORIGIN` dans l'onglet Environment une fois le service créé.
  Tarifs à jour : [render.com/pricing](https://render.com/pricing).
- **Railway** — `railway.app` → "New Project" → "Deploy from GitHub repo" →
  ajoutez les mêmes variables d'environnement dans l'onglet Variables.
  Tarifs à jour : [railway.app/pricing](https://railway.app/pricing).
- **Fly.io** — `fly launch` depuis ce dossier (détecte le `Dockerfile` fourni
  automatiquement), puis `fly secrets set REPLICATE_API_TOKEN=... MODEL_VERSION=...`.
  Tarifs à jour : [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing).

Le `Dockerfile` fourni fonctionne aussi tel quel sur n'importe quel hébergeur
qui accepte une image Docker (Google Cloud Run, AWS App Runner, etc.).

## Étape 4 — Brancher le frontend

Une fois le backend déployé, notez son URL publique (ex.
`https://woodstauhn-backend.onrender.com`) et suivez `frontend-integration.md`
pour la brancher dans `woodstauhn.html`.

## Sécurité déjà en place dans `server.js`

- `helmet` pour les en-têtes de sécurité HTTP
- limite de débit : 20 rendus / 15 min / IP (`express-rate-limit`) — ajustez `max` selon votre volume attendu
- CORS restreint à `FRONTEND_ORIGIN` si cette variable est définie (sinon ouvert à tous — à corriger avant mise en production publique)
- taille d'image limitée à 10 Mo

## Avant une mise en production publique

- Définissez `FRONTEND_ORIGIN` avec l'URL exacte de votre frontend déployé.
- Ne committez jamais `.env` (déjà exclu par `.gitignore`).
- Envisagez une authentification légère si l'app ne doit pas être accessible à n'importe qui.

