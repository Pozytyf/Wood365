# Woodstauhn — Plan d'intégration du rendu IA réel

## 1. Pourquoi un backend est obligatoire

La clé API d'un service de génération d'image ne doit **jamais** être exposée côté navigateur (n'importe qui pourrait l'extraire depuis le code source et l'utiliser à vos frais). Il faut donc un petit serveur intermédiaire :

```
Navigateur (front Woodstauhn)
   │  1. envoie la photo + essence + typologie
   ▼
Backend Woodstauhn (Node/Express)   ← garde la clé API secrète
   │  2. appelle l'API de génération d'image
   ▼
Service IA image (Replicate)
   │  3. renvoie l'URL de l'image générée
   ▼
Backend → Frontend → affichage dans le comparateur avant/après
```

## 2. Choix du modèle IA

Pour un rendu architectural crédible, il faut un modèle qui **préserve la structure de la pièce** (murs, fenêtres, perspective) et ne modifie que les matériaux/finitions — pas un modèle text-to-image classique qui inventerait une pièce entièrement différente.

Recommandation : **Replicate**, avec deux modèles adaptés, du plus simple au plus qualitatif :

| Modèle | Usage | Coût approx. | Temps |
|---|---|---|---|
| `adirik/interior-design` | Bon point de départ, simple à appeler, préserve bien la disposition (segmentation + MLSD ControlNet) | ~0,0055 $/rendu | ~6 s |
| `jackieyaung/sd-xl-interior-design` | Meilleure fidélité géométrique (Depth ControlNet), plus adapté si vous voulez cibler précisément le sol/les murs | légèrement supérieur | 10–20 s |

Le code fourni ci-dessous utilise `adirik/interior-design` comme modèle par défaut ; le changement de modèle se fait en une ligne dans `server.js`.

Replicate a été choisi plutôt que Stability AI ou OpenAI Images car il permet d'appeler n'importe quel modèle communautaire spécialisé "interior design" avec une API HTTP simple, sans gérer soi-même les poids du modèle.

## 3. Stratégie de prompt

Le prompt envoyé au modèle est généré côté serveur à partir des choix de l'utilisateur, pas tapé librement — ça garde un contrôle qualité constant. Exemple de construction :

```
"{typologie}, essence de bois {essence} ({description du grain et de la teinte}),
 rendu architectural photoréaliste, éclairage naturel, haute définition, 8k"
```

Un `negative_prompt` fixe exclut : cartoon, dessin, personnes, texte, filigrane, perspective déformée.

## 4. Estimation de coût

À ~0,006 $ le rendu, 1000 rendus/mois ≈ 6 $ de coût IA. Le coût principal sera plutôt l'hébergement du backend (voir README).

## 5. Ce que le code fourni couvre

- `server.js` : serveur Express avec un endpoint `POST /api/render` qui reçoit une image + les paramètres, appelle Replicate, attend le résultat, le renvoie.
- `package.json` : dépendances minimales.
- `.env.example` : variable d'environnement pour la clé API.
- `README.md` : déploiement (Render/Railway/Fly.io) et branchement sur le frontend Woodstauhn déjà livré.

## 6. Ce qu'il reste à faire de votre côté

1. Créer un compte sur [replicate.com](https://replicate.com), récupérer un token API.
2. Déployer `server.js` (voir README).
3. Remplacer, dans le frontend, la génération simulée par un vrai appel à votre backend (section "Frontend" du README).
4. Prévoir une limite de requêtes par utilisateur (anti-abus) avant mise en production.
