import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import Replicate from "replicate";
import "dotenv/config";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(helmet());

// En prod, mettez FRONTEND_ORIGIN=https://votre-domaine.com dans les variables
// d'environnement pour n'autoriser que votre propre frontend à appeler l'API.
const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

// 20 rendus / 15 min / IP : ajustez selon votre volume attendu et votre budget Replicate.
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

// Descriptions injectées dans le prompt pour chaque essence proposée dans le front.
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

// L'image uploadée doit être accessible par une URL publique pour Replicate.
// En production, uploadez-la vers un stockage (S3, Cloudinary, Supabase Storage...)
// puis passez cette URL à Replicate. Ici, on utilise le data-URI en base64,
// que la plupart des modèles Replicate acceptent aussi directement en `image`.
function toDataUri(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

app.post("/api/render", renderLimiter, upload.single("photo"), async (req, res) => {
  try {
    const { essenceId, typologieId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Aucune photo reçue (champ 'photo')." });
    }

    const prompt = buildPrompt(essenceId, typologieId);
    const imageInput = toDataUri(req.file);

    // Copiez la "version" exacte du modèle depuis l'onglet API de sa page Replicate
    // (replicate.com/adirik/interior-design/api) et collez-la dans .env sous MODEL_VERSION —
    // les versions changent et un hash codé en dur ici pourrait devenir obsolète.
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

    // `output` est généralement un tableau d'URLs (ou un objet stream selon la version du modèle).
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
