const STORAGE_KEY = "gemini-solo-chat-v1";
const USER_NAME = "敦彦";

const $ = (id) => document.getElementById(id);
const thread = $("thread");
const input = $("input");
const composer = $("composer");
const sendBtn = $("send");
const historyList = $("history-list");
const previews = $("previews");
const fileInput = $("file");
const aspect = $("aspect");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let state = loadState();
let pendingImages = [];
let mode = "chat";
let busy = false;
let recognition = null;
let speakOn = localStorage.getItem("gemini-speak") === "1";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed?.conversations?.length) return parsed;
  } catch {}
  return { conversations: [], activeId: null };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeConvo() {
  return state.conversations.find((c) => c.id === state.activeId) || null;
}

function ensureConvo() {
  let convo = activeConvo();
  if (convo) return convo;
  convo = {
    id: uid(),
    title: "新しいチャット",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  state.conversations.unshift(convo);
  state.activeId = convo.id;
  saveState();
  return convo;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("gemini-theme", theme);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(raw) {
  const escaped = escapeHtml(raw || "");
  const blocks = [];
  let html = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
    blocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  html = html
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${l.replace(/^\s*[-*]\s+/, "")}</li>`).join("")}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
        return `<ol>${lines.map((l) => `<li>${l.replace(/^\s*\d+\.\s+/, "")}</li>`).join("")}</ol>`;
      }
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

function titleFrom(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 28) || "新しいチャット";
}

function renderHistory() {
  historyList.innerHTML = "";
  if (!state.conversations.length) {
    historyList.innerHTML = `<div class="history-item"><span>まだ履歴はありません</span></div>`;
    return;
  }
  for (const convo of state.conversations) {
    const item = document.createElement("div");
    item.className = `history-item${convo.id === state.activeId ? " active" : ""}`;
    item.innerHTML = `<span></span><button class="del" title="削除" aria-label="削除">×</button>`;
    item.querySelector("span").textContent = convo.title;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".del")) return;
      state.activeId = convo.id;
      saveState();
      closeSidebar();
      render();
    });
    item.querySelector(".del").addEventListener("click", (e) => {
      e.stopPropagation();
      state.conversations = state.conversations.filter((c) => c.id !== convo.id);
      if (state.activeId === convo.id) state.activeId = state.conversations[0]?.id || null;
      saveState();
      render();
    });
    historyList.appendChild(item);
  }
}

function messageImages(message) {
  return (message.images || [])
    .map((img) => img.dataUrl)
    .filter(Boolean)
    .map((src) => `<img src="${src}" alt="生成画像" />`)
    .join("");
}

function renderThread() {
  const convo = activeConvo();
  if (!convo || !convo.messages.length) {
    thread.innerHTML = `
      <div class="welcome">
        <span class="sparkle" style="width:42px;height:42px;display:inline-block"></span>
        <h1>こんにちは、${USER_NAME}</h1>
        <p>Gemini と 1 対 1。トークも、画像も、履歴もここに残ります。</p>
        <div class="suggestions">
          <button class="suggestion" data-prompt="最近気になってること、雑談しよう" data-mode="chat"><b>雑談する</b><span>いまの気分を話す</span></button>
          <button class="suggestion" data-prompt="夜空の下でお茶を飲む猫を、柔らかい光で描いて" data-mode="image"><b>画像を描く</b><span>夜空と猫</span></button>
          <button class="suggestion" data-prompt="今日できる簡単な和食の夕飯を3つ提案して" data-mode="chat"><b>夕飯を考える</b><span>すぐ作れる献立</span></button>
          <button class="suggestion" data-prompt="未来都市の雨の夜を、映画のワンシーンみたいに描いて" data-mode="image"><b>風景を描く</b><span>雨の未来都市</span></button>
        </div>
      </div>`;
    thread.querySelectorAll(".suggestion").forEach((btn) => {
      btn.addEventListener("click", () => {
        setMode(btn.dataset.mode);
        input.value = btn.dataset.prompt;
        resizeInput();
        composer.requestSubmit();
      });
    });
    return;
  }

  thread.innerHTML = convo.messages
    .map((m) => {
      const gallery = messageImages(m);
      const pending = m.pending
        ? `<div class="pending"><span class="dots"><span></span><span></span><span></span></span>${escapeHtml(m.pending)}</div>`
        : "";
      const body = m.error
        ? `<p class="error-text">${escapeHtml(m.error)}</p>`
        : `${m.text ? renderMarkdown(m.text) : ""}${gallery ? `<div class="gallery">${gallery}</div>` : ""}${pending}`;
      if (m.role === "user") {
        return `<article class="msg user"><div class="bubble">${m.text ? `<p>${escapeHtml(m.text)}</p>` : ""}${gallery ? `<div class="gallery">${gallery}</div>` : ""}</div></article>`;
      }
      return `<article class="msg"><div class="avatar"></div><div class="bubble">${body || pending}</div></article>`;
    })
    .join("");
  thread.scrollTop = thread.scrollHeight;
}

function render() {
  renderHistory();
  renderThread();
  $("toggle-speak").setAttribute("aria-pressed", speakOn ? "true" : "false");
  sendBtn.disabled = busy;
}

function setMode(next) {
  mode = next;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  aspect.hidden = mode !== "image";
  input.placeholder = mode === "image" ? "描いてほしい画像を言葉で" : "Gemini にメッセージ";
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderPreviews() {
  previews.innerHTML = pendingImages
    .map(
      (img, i) =>
        `<div class="thumb"><img src="${img.dataUrl}" alt=""><button type="button" data-i="${i}" aria-label="削除">×</button></div>`
    )
    .join("");
  previews.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingImages.splice(Number(btn.dataset.i), 1);
      renderPreviews();
    });
  });
}

function openSidebar() {
  $("sidebar").classList.add("open");
  $("backdrop").classList.add("show");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("backdrop").classList.remove("show");
}

function speak(text) {
  if (!speakOn || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text.replace(/[`*#_]/g, " "));
  utter.lang = "ja-JP";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

function apiMessages(convo) {
  return convo.messages
    .filter((m) => !m.pending && !m.error)
    .map((m) => ({
      role: m.role,
      text: m.text || "",
      images: m.images || [],
    }));
}

async function streamChat(convo, modelEl) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: apiMessages(convo) }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "チャットに失敗しました。");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (event.type === "text") {
        modelEl.text = (modelEl.text || "") + event.text;
        modelEl.pending = null;
        renderThread();
      } else if (event.type === "images") {
        modelEl.images = [...(modelEl.images || []), ...event.images];
        renderThread();
      } else if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }
}

async function generateImage(convo, modelEl, prompt) {
  const res = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      aspectRatio: aspect.value,
      messages: apiMessages(convo),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "画像生成に失敗しました。");
  modelEl.text = data.text || "";
  modelEl.images = data.images || [];
  modelEl.pending = null;
}

async function sendMessage() {
  if (busy) return;
  const text = input.value.trim();
  const images = pendingImages.slice();
  if (!text && !images.length) return;

  const convo = ensureConvo();
  if (convo.title === "新しいチャット" && text) convo.title = titleFrom(text);

  convo.messages.push({
    id: uid(),
    role: "user",
    text,
    images,
    createdAt: Date.now(),
  });
  const modelEl = {
    id: uid(),
    role: "model",
    text: "",
    images: [],
    pending: mode === "image" ? "画像を描いています…" : "考えています…",
    createdAt: Date.now(),
  };
  convo.messages.push(modelEl);
  convo.updatedAt = Date.now();
  saveState();

  input.value = "";
  pendingImages = [];
  renderPreviews();
  resizeInput();
  busy = true;
  render();

  try {
    if (mode === "image") {
      await generateImage(convo, modelEl, text);
    } else {
      await streamChat(convo, modelEl);
    }
    modelEl.pending = null;
    if (!modelEl.text && !(modelEl.images || []).length) {
      modelEl.text = "返事を受け取れませんでした。もう一度送ってみてください。";
    }
    speak(modelEl.text);
  } catch (err) {
    modelEl.pending = null;
    modelEl.error = err.message || "エラーが起きました。";
  } finally {
    busy = false;
    convo.updatedAt = Date.now();
    saveState();
    render();
  }
}

function startMic() {
  if (!SpeechRecognition) {
    alert("このブラウザは音声入力に対応していません。Chrome がおすすめです。");
    return;
  }
  if (recognition) {
    recognition.stop();
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = false;
  const base = input.value;
  $("mic").classList.add("listening");
  recognition.onresult = (e) => {
    const said = [...e.results].map((r) => r[0].transcript).join("");
    input.value = `${base}${base && !base.endsWith(" ") ? " " : ""}${said}`;
    resizeInput();
  };
  recognition.onerror = () => stopMic();
  recognition.onend = () => stopMic();
  recognition.start();
}

function stopMic() {
  $("mic").classList.remove("listening");
  recognition = null;
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});
input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
$("new-chat").addEventListener("click", () => {
  state.activeId = null;
  saveState();
  closeSidebar();
  render();
  input.focus();
});
$("attach").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  for (const file of fileInput.files || []) {
    const dataUrl = await fileToDataUrl(file);
    pendingImages.push({ mimeType: file.type || "image/png", dataUrl });
  }
  fileInput.value = "";
  renderPreviews();
});
$("mic").addEventListener("click", startMic);
$("mode-chat").addEventListener("click", () => setMode("chat"));
$("mode-image").addEventListener("click", () => setMode("image"));
$("open-sidebar").addEventListener("click", openSidebar);
$("close-sidebar").addEventListener("click", closeSidebar);
$("backdrop").addEventListener("click", closeSidebar);
$("toggle-theme").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
$("toggle-speak").addEventListener("click", () => {
  speakOn = !speakOn;
  localStorage.setItem("gemini-speak", speakOn ? "1" : "0");
  if (!speakOn) window.speechSynthesis.cancel();
  render();
});

async function refreshHealth() {
  const status = $("key-status");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.ok) {
      status.className = "key-status ok";
      status.textContent = `接続OK（${data.chatModel}）`;
    } else {
      status.className = "key-status bad";
      status.textContent = data.error || "API キーを確認してください。";
    }
  } catch {
    status.className = "key-status bad";
    status.textContent = "サーバーに接続できません。";
  }
}

$("key-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = $("api-key").value.trim();
  if (!key) return;
  const status = $("key-status");
  status.className = "key-status";
  status.textContent = "確認しています…";
  const res = await fetch("/api/key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const data = await res.json().catch(() => ({}));
  $("api-key").value = "";
  if (data.ok) {
    status.className = "key-status ok";
    status.textContent = `接続OK（${data.chatModel}）`;
  } else {
    status.className = "key-status bad";
    status.textContent = data.error || "キーを保存できませんでした。";
  }
});

setTheme(localStorage.getItem("gemini-theme") || "light");
setMode("chat");
render();
refreshHealth();
input.focus();
