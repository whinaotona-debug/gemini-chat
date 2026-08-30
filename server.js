require("dotenv").config();
const path = require("path");
const express = require("express");

const fs = require("fs");
const PORT = Number(process.env.PORT) || 3847;
let API_KEY = (process.env.GEMINI_API_KEY || "").trim();
let lastKeyError = "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const CHAT_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-1.5-flash",
  "gemini-pro-latest",
];

const IMAGE_CANDIDATES = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp-image-generation",
];

const SYSTEM_INSTRUCTION = `あなたは Google の Gemini です。ユーザーと 1 対 1 で話しています。
親しみやすく、知的で、少しウィットがあります。押しつけがましくしないでください。
特別な指定がなければ日本語で答えてください。読みやすいマークダウンを使ってください。
画像を描いてほしいと言われたら、短い返事とともにイメージを言葉でも補ってください。
あなたは「Gemini」であり、他のアシスタントになりすましません。`;

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

let chatModel = CHAT_CANDIDATES[0];
let imageModel = IMAGE_CANDIDATES[0];

function geminiHeaders() {
  return {
    "Content-Type": "application/json",
    "x-goog-api-key": API_KEY,
  };
}

function persistKey(key) {
  const envPath = path.join(__dirname, ".env");
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "PORT=3847\n";
  const next = /GEMINI_API_KEY=/.test(current)
    ? current.replace(/GEMINI_API_KEY=.*/g, `GEMINI_API_KEY=${key}`)
    : `${current.trim()}\nGEMINI_API_KEY=${key}\n`;
  fs.writeFileSync(envPath, next);
}

function extractError(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return sanitizeError(payload.slice(0, 400) || fallback);
    }
  }
  return sanitizeError(
    payload?.error?.message ||
    payload?.error?.status ||
    fallback
  );
}

function sanitizeError(message) {
  return String(message || "")
    .replace(/api_key:[A-Za-z0-9._-]+/gi, "api_key:***")
    .replace(/AQ\.[A-Za-z0-9._-]+/g, "AQ.***");
}

function isMissingModel(status, message) {
  const text = String(message || "").toLowerCase();
  return (
    status === 404 ||
    text.includes("not found") ||
    text.includes("is not found") ||
    text.includes("not supported")
  );
}

async function listModelNames() {
  const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
    headers: geminiHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(extractError(data, `モデル一覧の取得に失敗しました (${res.status})`));
  }
  return (data.models || [])
    .map((m) => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

function pickModel(available, candidates) {
  const set = new Set(available);
  return candidates.find((name) => set.has(name)) || null;
}

async function resolveModels() {
  const names = await listModelNames();
  chatModel = pickModel(names, CHAT_CANDIDATES) || chatModel;
  imageModel = pickModel(names, IMAGE_CANDIDATES) || imageModel;
  const flash = names.find((n) => /flash$/i.test(n) && !/image|tts|live/i.test(n));
  if (!CHAT_CANDIDATES.includes(chatModel) && flash) chatModel = flash;
  const imageLike = names.find((n) => /image/i.test(n) && /flash|pro/i.test(n));
  if (!IMAGE_CANDIDATES.includes(imageModel) && imageLike) imageModel = imageLike;
  console.log(`Chat model:  ${chatModel}`);
  console.log(`Image model: ${imageModel}`);
}

function toInlinePart(image) {
  if (!image) return null;
  if (image.data && image.mimeType) {
    return {
      inlineData: {
        mimeType: image.mimeType,
        data: String(image.data).replace(/^data:[^;]+;base64,/, ""),
      },
    };
  }
  if (typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:")) {
    const match = image.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }
  return null;
}

function toContents(messages) {
  return (messages || [])
    .filter((m) => m && (m.role === "user" || m.role === "model"))
    .map((m) => {
      const parts = [];
      for (const image of m.images || []) {
        const part = toInlinePart(image);
        if (part) parts.push(part);
      }
      if (m.text) parts.push({ text: String(m.text) });
      if (!parts.length) parts.push({ text: " " });
      return {
        role: m.role === "model" ? "model" : "user",
        parts,
      };
    })
    .filter((c) => c.parts.length);
}

function collectParts(payload) {
  const parts = [];
  for (const candidate of payload?.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.thought) continue;
      parts.push(part);
    }
  }
  return parts;
}

function partsToPayload(parts) {
  const text = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join("");
  const images = [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (!inline?.data) continue;
    const mimeType = inline.mimeType || inline.mime_type || "image/png";
    images.push({
      mimeType,
      dataUrl: `data:${mimeType};base64,${inline.data}`,
    });
  }
  return { text, images };
}

app.get("/api/health", async (_req, res) => {
  if (!API_KEY) {
    return res.json({ ok: false, error: "API キーが未設定です。", chatModel, imageModel });
  }
  if (lastKeyError) {
    return res.json({ ok: false, error: lastKeyError, chatModel, imageModel });
  }
  res.json({ ok: true, chatModel, imageModel });
});

app.post("/api/key", async (req, res) => {
  const key = String(req.body?.key || "").trim();
  if (!key) return res.status(400).json({ error: "キーが空です。" });
  API_KEY = key;
  persistKey(key);
  try {
    await resolveModels();
    lastKeyError = "";
    res.json({ ok: true, chatModel, imageModel });
  } catch (err) {
    lastKeyError = err.message || "キーの確認に失敗しました。";
    res.json({ ok: false, error: lastKeyError, chatModel, imageModel });
  }
});

app.post("/api/chat", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "API キーが設定されていません。.env を確認してください。" });
  }

  const contents = toContents(req.body?.messages);
  if (!contents.length) {
    return res.status(400).json({ error: "メッセージが空です。" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const modelsToTry = [chatModel, ...CHAT_CANDIDATES.filter((m) => m !== chatModel)];
  let lastError = "チャットに失敗しました。";

  try {
    for (const model of modelsToTry) {
      const upstream = await fetch(
        `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: geminiHeaders(),
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            generationConfig: { temperature: 0.9 },
          }),
        }
      );

      if (!upstream.ok) {
        const raw = await upstream.text();
        lastError = extractError(raw, `Gemini エラー (${upstream.status})`);
        if (isMissingModel(upstream.status, lastError)) continue;
        send({ type: "error", error: lastError });
        return res.end();
      }

      chatModel = model;
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const jsonText = line.replace(/^data:\s*/, "");
          if (!jsonText || jsonText === "[DONE]") continue;
          let payload;
          try {
            payload = JSON.parse(jsonText);
          } catch {
            continue;
          }
          if (payload.error) {
            send({ type: "error", error: extractError(payload, "生成中にエラーが起きました。") });
            return res.end();
          }
          const { text, images } = partsToPayload(collectParts(payload));
          if (text) send({ type: "text", text });
          if (images.length) send({ type: "images", images });
        }
      }

      send({ type: "done", model });
      return res.end();
    }

    send({ type: "error", error: lastError });
    res.end();
  } catch (err) {
    send({ type: "error", error: err.message || "通信エラーが起きました。" });
    res.end();
  }
});

app.post("/api/image", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "API キーが設定されていません。" });
  }

  const prompt = String(req.body?.prompt || "").trim();
  const aspectRatio = String(req.body?.aspectRatio || "1:1");
  const history = toContents(req.body?.messages || []);
  if (!prompt && !history.length) {
    return res.status(400).json({ error: "プロンプトが空です。" });
  }

  const contents = history.length
    ? history
    : [{ role: "user", parts: [{ text: prompt }] }];

  const modelsToTry = [imageModel, ...IMAGE_CANDIDATES.filter((m) => m !== imageModel)];
  let lastError = "画像生成に失敗しました。";

  try {
    for (const model of modelsToTry) {
      const payloads = [
        {
          contents,
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio },
          },
        },
        {
          contents,
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        },
      ];

      let upstream = null;
      let data = {};
      for (const body of payloads) {
        upstream = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
          method: "POST",
          headers: geminiHeaders(),
          body: JSON.stringify(body),
        });
        data = await upstream.json().catch(() => ({}));
        if (upstream.ok) break;
        const msg = extractError(data, "");
        if (!/imageConfig|unknown name|invalid/i.test(msg)) break;
      }

      if (!upstream.ok) {
        lastError = extractError(data, `画像生成エラー (${upstream.status})`);
        if (isMissingModel(upstream.status, lastError)) continue;
        return res.status(upstream.status).json({ error: lastError });
      }

      imageModel = model;
      const { text, images } = partsToPayload(collectParts(data));
      if (!images.length) {
        lastError = text || "画像が返りませんでした。課金が有効か、プロンプトを変えてみてください。";
        continue;
      }
      return res.json({ text, images, model });
    }
    return res.status(502).json({ error: lastError });
  } catch (err) {
    return res.status(500).json({ error: err.message || "画像生成に失敗しました。" });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  if (!API_KEY) {
    console.warn("GEMINI_API_KEY が空です。.env を確認してください。");
  } else {
    try {
      await resolveModels();
    } catch (err) {
      lastKeyError = sanitizeError(err.message || "API キーを確認してください。");
      console.warn("モデル自動選択に失敗しました:", lastKeyError);
      console.warn("既定モデルで続行します。");
    }
  }

  app.listen(PORT, () => {
    console.log(`Gemini chat → http://localhost:${PORT}`);
  });
}

start();
