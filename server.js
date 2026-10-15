import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { Client } from "@gradio/client";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Limite basse par défaut : la Space HF est un GPU gratuit PARTAGÉ (file
// d'attente commune à tous ses utilisateurs), pas une ressource dédiée.
const renderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de demandes de rendu. Réessayez dans quelques minutes." },
});

const SPACE_ID = "black-forest-labs/FLUX.1-Kontext-Dev";
// Optionnel : un token HF (gratuit) augmente la priorité dans la file
// d'attente partagée. Laisser vide fonctionne aussi, juste plus lentement.
const HF_TOKEN = process.env.HF_TOKEN || undefined;

const ESSENCE_PROMPTS = {
  iroko: "iroko wood, warm golden-brown tone, straight grain, satin finish",
  badi: "badi wood, light honey-blond tone, regular grain, matte finish",
  tali: "tali wood, deep reddish-brown tone, dense fine grain, polished finish",
};

const TYPOLOGIE_PROMPTS = {
  terrasse: "outdoor wood decking terrace",
  bardage: "exterior wood cladding facade",
  parquet: "indoor wood parquet flooring",
  mobilier: "custom wood furniture piece",
};

// "maison" est à part : les autres typologies appliquent une matière sur une
// surface déjà présente dans la photo (sol, mur, meuble). Celle-ci doit faire
// apparaître une construction qui n'existe pas encore sur un terrain vide —
// le prompt ci-dessous le formule donc comme un AJOUT, pas un remplacement
// de matériau, et guidance_scale est monté pour laisser le modèle s'éloigner
// davantage de la photo d'origine.
function buildPrompt(essenceId, typologieId) {
  const essence = ESSENCE_PROMPTS[essenceId] || ESSENCE_PROMPTS.iroko;

  if (typologieId === "maison") {
    return {
      prompt:
        `Add a complete, modern single-story house built entirely from real ${essence}, ` +
        `positioned naturally on this plot of land — with a pitched or flat roof, windows and a front door, ` +
        `proportioned to fit the visible plot boundaries. Keep the surrounding land, sky, walls and vegetation ` +
        `from the original photo. Photorealistic architectural render, natural lighting, highly detailed.`,
      guidanceScale: 4.5,
    };
  }

  const typologie = TYPOLOGIE_PROMPTS[typologieId] || TYPOLOGIE_PROMPTS.terrasse;
  return {
    prompt:
      `Change the material shown to real ${essence}, applied to ${typologie}. ` +
      `Keep the room's structure, walls, windows and perspective exactly as in the original photo. ` +
      `Photorealistic, natural lighting, highly detailed.`,
    guidanceScale: 2.5,
  };
}

// Convertit ce que renvoie le client Gradio (URL hébergée par le Space, ou
// objet FileData) en une URL affichable directement par le frontend.
async function resolveImageOutput(output) {
  if (!output) return null;
  if (typeof output === "string") return output; // déjà une URL ou un data URI
  if (output.url) return output.url;
  if (output.path) {
    // Reconstruit l'URL complète si seul un chemin relatif est renvoyé.
    const base = `https://${SPACE_ID.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.hf.space`;
    return output.path.startsWith("http") ? output.path : `${base}/file=${output.path}`;
  }
  return null;
}

app.post("/api/render", renderLimiter, upload.single("photo"), async (req, res) => {
  try {
    const { essenceId, typologieId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Aucune photo reçue (champ 'photo')." });
    }

    const { prompt, guidanceScale } = buildPrompt(essenceId, typologieId);
    const imageBlob = new Blob([req.file.buffer], { type: req.file.mimetype });

    const hfClient = await Client.connect(SPACE_ID, HF_TOKEN ? { hf_token: HF_TOKEN } : undefined);

    const result = await hfClient.predict("/infer", {
      input_image: imageBlob,
      prompt,
      seed: 0,
      randomize_seed: true,
      guidance_scale: guidanceScale,
      steps: 28,
    });

    const renderUrl = await resolveImageOutput(result.data?.[0]);

    if (!renderUrl) {
      console.error("Réponse inattendue de la Space HF :", JSON.stringify(result.data));
      return res.status(502).json({ error: "Le modèle de test n'a renvoyé aucune image. Réessayez dans un instant (file d'attente partagée)." });
    }

    res.json({ renderUrl, prompt });
  } catch (err) {
    console.error("Erreur de génération (Hugging Face Space) :", err);
    res.status(502).json({ error: "La génération a échoué — la Space gratuite est peut-être occupée ou indisponible. Réessayez dans un instant." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Woodstauhn backend en écoute sur le port ${PORT}`));
