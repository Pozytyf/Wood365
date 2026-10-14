# Brancher le frontend Woodstauhn sur le backend

Dans le fichier `woodstauhn.html` déjà livré, la fonction `startGeneration` simule
la génération avec un `setInterval`. Remplacez-la par un vrai appel réseau vers
votre backend, et stockez l'URL de l'image générée pour l'afficher dans le
comparateur avant/après à la place de la scène SVG.

## 1. Ajouter un état pour la photo et le rendu réel

```jsx
const [photoFile, setPhotoFile] = useState(null);   // File uploadé par l'utilisateur
const [renderUrl, setRenderUrl] = useState(null);   // URL renvoyée par le backend
const [error, setError] = useState(null);
```

## 2. Récupérer le fichier depuis la zone de dépôt

```jsx
onDrop={(e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) { setPhotoFile(file); setStatus("ready"); }
}}
```

Et pour l'input classique (clic) :

```jsx
<input
  type="file"
  accept="image/*"
  onChange={(e) => {
    const file = e.target.files[0];
    if (file) { setPhotoFile(file); setStatus("ready"); }
  }}
/>
```

## 3. Remplacer `startGeneration` par un vrai appel API

```jsx
const BACKEND_URL = "https://votre-backend.example.com"; // adaptez après déploiement

const startGeneration = async () => {
  setStatus("generating");
  setError(null);

  const formData = new FormData();
  formData.append("photo", photoFile);
  formData.append("essenceId", essenceId);
  formData.append("typologieId", typologieId);

  try {
    const res = await fetch(`${BACKEND_URL}/api/render`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("La génération a échoué.");
    const data = await res.json();
    setRenderUrl(data.renderUrl);
    setStatus("done");
  } catch (e) {
    setError(e.message);
    setStatus("ready");
  }
};
```

Le modèle `adirik/interior-design` répond généralement en quelques secondes ;
gardez tout de même la barre de progression animée pendant l'attente du `fetch`
pour que l'expérience reste fluide.

## 4. Afficher le vrai rendu dans le comparateur

Dans `CompareSlider`, remplacez le second `<RoomScene ... intensity={1} />`
(le "après") par l'image réelle :

```jsx
<div className="absolute inset-0">
  <img src={renderUrl} alt="Rendu généré" className="w-full h-full object-cover" />
</div>
```

Et le "avant" par la photo originale de l'utilisateur :

```jsx
<div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
  <img src={URL.createObjectURL(photoFile)} alt="Photo d'origine" className="w-full h-full object-cover" />
</div>
```

## Important — CSP des pages publiées

Une page Woodstauhn publiée comme Artifact ne peut appeler que
`api.anthropic.com` (et seulement dans l'aperçu de chat, pas une fois publiée) —
elle **ne pourra pas** contacter votre backend une fois hébergée sur claude.ai.
Pour une vraie mise en production, déployez `woodstauhn.html` (ou sa version
React compilée) sur votre propre hébergement (Vercel, Netlify, votre serveur),
pas comme Artifact Claude — l'artifact reste utile pour la démo/maquette.
