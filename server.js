import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
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
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  })
);

const allowedOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const renderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de demandes de rendu. Réessayez dans quelques minutes." },
});

if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY manquant — récupérez-le sur aistudio.google.com/apikey.");
}

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

function buildPrompt(essenceId, typologieId) {
  const essence = ESSENCE_PROMPTS[essenceId] || ESSENCE_PROMPTS.iroko;
  const typologie = TYPOLOGIE_PROMPTS[typologieId] || TYPOLOGIE_PROMPTS.terrasse;
  return (
    `Edit this photo so it shows ${typologie} made of ${essence}. ` +
    `Keep the room's structure, walls, windows and perspective exactly as in the original photo — ` +
    `only change the material shown to real ${essence} wood. Photorealistic architectural render, natural lighting, sharp focus, highly detailed.`
  );
}

app.post("/api/render", renderLimiter, upload.single("photo"), async (req, res) => {
  try {
    const { essenceId, typologieId } = req.body;
    if (!req.file) {
      return res.status(400).json({ error: "Aucune photo reçue (champ 'photo')." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Backend mal configuré : GEMINI_API_KEY manquant côté serveur." });
    }

    const prompt = buildPrompt(essenceId, typologieId);
    const base64Image = req.file.buffer.toString("base64");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: req.file.mimetype, data: base64Image } },
              ],
            },
          ],
        }),
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error("Erreur Gemini :", JSON.stringify(geminiData));
      return res.status(502).json({ error: geminiData.error?.message || "La génération a échoué (Gemini)." });
    }

    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      console.error("Pas d'image dans la réponse Gemini :", JSON.stringify(geminiData));
      return res.status(502).json({ error: "Gemini n'a renvoyé aucune image. Réessayez avec une autre photo." });
    }

    const renderUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    res.json({ renderUrl, prompt });
  } catch (err) {
    console.error("Erreur de génération :", err);
    res.status(500).json({ error: "La génération a échoué. Réessayez." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Woodstauhn backend en écoute sur le port ${PORT}`));
