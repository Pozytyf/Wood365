import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import Replicate from "replicate";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// CSP assouplie pour laisser passer les polices Google Fonts et les CDN
// utilisés par la page (Tailwind, React, Babel) servie depuis ce même serveur.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// Sert la page de l'app (public/index.html) sur le même domaine que l'API —
// évite tout blocage CORS/CSP côté navigateur.
app.use(express.static(path.join(__dirname, "public")));

const renderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de demandes de rendu. Réessayez dans quelques minutes." },
});

if (!process.env.REPLICATE_API_TOKEN) {
  console.warn("REPLICATE_API_TOKEN manquant — définissez-le dans .env avant de lancer le serveur.");
}
if (!process.env.MODEL_VERSION) {
  console.warn("MODEL_VERSION manquant — copiez-le depuis replicate.com/adirik/interior-design/api.");
}

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

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

const NEGATIVE_PROMPT =
  "cartoon, illustration, 3d render, painting, drawing, anime, low quality, blurry, " +
  "watermark, text, signature, people, humans, distorted perspective, deformed structure";

function buildPrompt(essenceId, typologieId) {
  const essence = ESSENCE_PROMPTS[essenceId] || ESSENCE_PROMPTS.iroko;
  const typologie = TYPOLOGIE_PROMPTS[typologieId] || TYPOLOGIE_PROMPTS.terrasse;
  return `${typologie}, ${essence}, photorealistic architectural render, natural lighting, sharp focus, 8k, highly detailed`;
}

function toDataUri(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

app.post("/api/render", renderLimiter, upload.single("photo"), async (req, res) => {
  try {
    const { essenceId, typologieId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Aucune photo reçue (champ 'photo')." });
    }
    if (!process.env.REPLICATE_API_TOKEN || !process.env.MODEL_VERSION) {
      return res.status(500).json({ error: "Backend mal configuré : REPLICATE_API_TOKEN ou MODEL_VERSION manquant côté serveur." });
    }

    const prompt = buildPrompt(essenceId, typologieId);
    const imageInput = toDataUri(req.file);

    const output = await replicate.run(
      `adirik/interior-design:${process.env.MODEL_VERSION}`,
      {
        input: {
          image: imageInput,
          prompt,
          negative_prompt: NEGATIVE_PROMPT,
          guidance_scale: 15,
          prompt_strength: 0.8,
          num_inference_steps: 30,
        },
      }
    );

    const renderUrl = Array.isArray(output) ? output[0] : output;
    res.json({ renderUrl, prompt });
  } catch (err) {
    console.error("Erreur de génération :", err);
    res.status(500).json({ error: "La génération a échoué. Réessayez." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Woodstauhn backend en écoute sur le port ${PORT}`));
