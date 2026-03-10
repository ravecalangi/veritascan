// Sa TOP ng chatbot.js, add this import:
import { getSelectedFile, clearSelectedFile, extractFileContent } from './imgToText.js';
/* ════════════════════════════════════════════════════════════════════════════
   USER NAME  (localStorage)
   ════════════════════════════════════════════════════════════════════════════ */
const NAME_KEY = "veritascan_user_name";

function getSavedName() {
  return localStorage.getItem(NAME_KEY) || null;
}

function saveName(name) {
  localStorage.setItem(NAME_KEY, name.trim());
}

function applyUserName(name) {
  const greetingDisplay = document.getElementById("greeting-display");
  if (!greetingDisplay) return;

  const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" });
  const hour = new Date(now).getHours();

  let greeting;

  if (hour >= 0 && hour < 4) {
    greeting = `${name}, disinformation doesn't sleep — and apparently, neither do you.`;
  } else if (hour >= 4 && hour < 6) {
    greeting = `Pre-dawn fact-checker, ${name}? Fake news never takes a day off either.`;
  } else if (hour >= 6 && hour < 12) {
    greeting = `${name}, the fake news already had breakfast. Have you fact-checked yours?`;
  } else if (hour >= 12 && hour < 14) {
    greeting = `Midday scroll, ${name}? Half of what you just read is probably misinformation.`;
  } else if (hour >= 14 && hour < 18) {
    greeting = `${name}, the afternoon feed is full of unverified claims. Don't trust it blindly.`;
  } else if (hour >= 18 && hour < 21) {
    greeting = `Dinner time, ${name}. Don't let fake news ruin your appetite — or your feed.`;
  } else if (hour >= 21 && hour < 24) {
    greeting = `Almost midnight, ${name}. Misinformation loves a late-night scroll. Stay sharp.`;
  }

  greetingDisplay.textContent = greeting;
}

/* ════════════════════════════════════════════════════════════════════════════
   GREETING OVERLAY — CONVERSATIONAL TYPING SEQUENCE
   ════════════════════════════════════════════════════════════════════════════ */

function typeInto(el, text, speed = 28) {
  return new Promise(resolve => {
    let i = 0;
    el.textContent = "";
    const tick = () => {
      if (i < text.length) {
        el.textContent += text[i++];
        setTimeout(tick, speed);
      } else {
        resolve();
      }
    };
    tick();
  });
}

function showTypingIndicator(container) {
  const msg = document.createElement("div");
  msg.classList.add("greeting-msg");

  const avatar = document.createElement("div");
  avatar.classList.add("greeting-msg-avatar");
  avatar.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="10" cy="10" r="6"/><path d="m21 21-4.35-4.35"/><path d="m7.5 10 2 2 3-3"/>
  </svg>`;

  const bubble = document.createElement("div");
  bubble.classList.add("greeting-msg-bubble");
  bubble.innerHTML = `<div class="greeting-typing-dots">
    <span></span><span></span><span></span>
  </div>`;

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;

  return { msg, bubble };
}

async function resolveTypingBubble(bubble, text, speed = 26) {
  bubble.innerHTML = "";
  await typeInto(bubble, text, speed);
}

function appendUserBubble(container, text) {
  const msg = document.createElement("div");
  msg.classList.add("greeting-msg", "user-reply");
  const bubble = document.createElement("div");
  bubble.classList.add("greeting-msg-bubble");
  bubble.textContent = text;
  msg.appendChild(bubble);
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

async function runGreetingSequence() {
  const overlay   = document.getElementById("greeting-overlay");
  const container = document.getElementById("greeting-messages");
  const inputArea = document.getElementById("greeting-input-area");
  const nameInput = document.getElementById("greeting-name-input");
  const submitBtn = document.getElementById("greeting-submit-btn");

  if (!overlay || !container || !inputArea || !nameInput || !submitBtn) return;

  const messages = [
    { text: "Hey there! 👋", delay: 500,  typingPause: 650 },
    { text: "I'm Veritascan — your AI fact-checking assistant.", delay: 900,  typingPause: 1100 },
    { text: "Before we start, what should I call you?", delay: 800, typingPause: 950 },
  ];

  for (const msg of messages) {
    await new Promise(r => setTimeout(r, msg.delay));
    const { bubble } = showTypingIndicator(container);
    await new Promise(r => setTimeout(r, msg.typingPause));
    await resolveTypingBubble(bubble, msg.text);
  }

  await new Promise(r => setTimeout(r, 300));
  inputArea.classList.add("visible");
  setTimeout(() => nameInput.focus(), 350);

  nameInput.addEventListener("input", () => {
    submitBtn.disabled = nameInput.value.trim().length === 0;
  });

  const dismiss = async () => {
    const name = nameInput.value.trim();
    if (!name) return;

    saveName(name);
    applyUserName(name);

    appendUserBubble(container, name);

    await new Promise(r => setTimeout(r, 500));
    const { bubble: lastBubble } = showTypingIndicator(container);
    await new Promise(r => setTimeout(r, 700));
    await resolveTypingBubble(lastBubble, `Nice to meet you, ${name}! Let's get started.`);

    await new Promise(r => setTimeout(r, 900));
    overlay.classList.add("hide");
    setTimeout(() => { overlay.style.display = "none"; }, 520);
  };

  submitBtn.addEventListener("click", dismiss);
  nameInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && nameInput.value.trim().length > 0) dismiss();
  });
}

function initGreetingOverlay() {
  const overlay = document.getElementById("greeting-overlay");
  if (!overlay) return;

  const savedName = getSavedName();

  if (savedName) {
    overlay.style.display = "none";
    applyUserName(savedName);
    return;
  }

  runGreetingSequence();
}

/* ════════════════════════════════════════════════════════════════════════════
   CHAT HISTORY  (localStorage)
   ════════════════════════════════════════════════════════════════════════════ */
   
const HISTORY_KEY = "veritascan_chat_history";
const SESSION_LOG = []; // { userText, userTextFull, botText, newsArticles, timestamp }
const MAX_HISTORY = 30;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(history) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  catch { console.warn("localStorage write failed."); }
}

function deleteHistoryEntry(id) {
  saveHistory(loadHistory().filter(e => e.id !== id));
  renderHistory();
}

function renderHistory() {
  const list    = document.getElementById("history-list");
  const empty   = document.getElementById("history-empty");
  const history = loadHistory();
  if (!list) return;

  list.querySelectorAll(".history-item").forEach(el => el.remove());

  if (history.length === 0) {
    if (empty) empty.style.display = "flex";
    return;
  }
  if (empty) empty.style.display = "none";

  history.forEach(entry => {
    const item = document.createElement("div");
    item.classList.add("history-item");
    item.dataset.id = entry.id;

    const preview = entry.userText.length > 52
      ? entry.userText.slice(0, 52) + "…"
      : entry.userText;

    item.innerHTML = `
      <div class="history-item-body">
        <span class="history-item-preview">${escHtml(preview)}</span>
        <span class="history-item-time">${entry.timestamp}</span>
      </div>
      <button class="history-item-del" data-id="${entry.id}" title="Remove">
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>`;

    item.addEventListener("click", e => {
      if (e.target.closest(".history-item-del")) return;
      restoreEntry(entry);
    });

    item.querySelector(".history-item-del").addEventListener("click", e => {
      e.stopPropagation();
      deleteHistoryEntry(entry.id);
    });

    list.appendChild(item);
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   TRENDING NEWS — dynamic loader
   ════════════════════════════════════════════════════════════════════════════ */
async function loadTrendingNews() {
  const list = document.querySelector(".right-panel .prompt-list:last-of-type");
  if (!list) return;

  // Show skeleton while loading
  list.innerHTML = Array(5).fill(0).map(() => `
    <div class="prompt-item prompt-item--subtle trending-skeleton">
      <span class="prompt-dot" style="opacity:0.3"></span>
      <span class="trending-skeleton-bar"></span>
    </div>
  `).join("");

  try {
    const res  = await fetch("http://localhost:3000/trending");
    const data = await res.json();

    if (!data.items?.length) {
      list.innerHTML = `<p style="font-size:0.6rem;color:var(--text-muted);padding:0.5rem 0.65rem;">Could not load trending news.</p>`;
      return;
    }

    // Render buttons — display title only, claim stored in data-claim
    list.innerHTML = data.items.map(item => `
      <button
        class="prompt-item prompt-item--subtle trending-item"
        data-title="${item.title.replace(/"/g, '&quot;')}"
        data-claim="${(item.claim || `It is true that ${item.title}`).replace(/"/g, '&quot;')}"
        data-url="${(item.url || "").replace(/"/g, '&quot;')}"
        title="${item.source ? item.source + (item.date ? ' · ' + item.date : '') : ''}"
      >
        <span class="prompt-dot"></span>
        <span class="prompt-label-simple">${item.title}</span>
      </button>
    `).join("");

    
    // Wire up click handlers — fill input only, user sends manually
    list.querySelectorAll(".trending-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const title     = btn.dataset.title || "";
        const claim     = btn.dataset.claim || `It is true that ${title}`;
        const sourceUrl = btn.dataset.url   || "";
        const input     = document.getElementById("user-chatbox-input");

        if (!input) return;

        // What the USER SEES in the input box — short and clean
        const displayText = `Verify this: ${title}`;

        // What gets SENT TO THE AI — full claim + source (hidden in data attribute)
        const fullMessage = sourceUrl
          ? `Verify this: ${claim}\n\nSource: ${sourceUrl}`
          : `Verify this: ${claim}`;

        // Show clean version in input
        input.value = displayText;
        input.dataset.fullMessage = fullMessage;
        input.dataset.sourceUrl   = sourceUrl;
        input.dataset.sourceLabel = btn.title || ""; // e.g. "Rappler · Mar 7"
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
        input.dispatchEvent(new Event("input"));
      });
    });

  } catch (err) {
    console.error("[Trending] Failed to load:", err);
    list.innerHTML = `<p style="font-size:0.6rem;color:var(--text-muted);padding:0.5rem 0.65rem;">Could not reach server.</p>`;
  }
}

loadTrendingNews();


/* ════════════════════════════════════════════════════════════════════════════
   RESTORE ENTRY — replays all messages from a session log
   ════════════════════════════════════════════════════════════════════════════ */
function restoreEntry(entry) {
  const mainContainer = document.querySelector(".main-conversation");
  const introBox      = document.querySelector(".conversation-box");
  if (!mainContainer) return;

  if (introBox) introBox.remove();
  mainContainer.innerHTML = "";

  // Support both old single-pair entries and new allMessages sessions
  const messages = entry.allMessages || [{
    userTextFull: entry.userTextFull || entry.userText,
    botText     : entry.botText,
    newsArticles: entry.newsArticles || []
  }];

  messages.forEach((msg, i) => {
    // User bubble
    const userDiv = document.createElement("div");
    userDiv.classList.add("user");
    const userP = document.createElement("p");
    userP.textContent = msg.userTextFull || msg.userText;
    userDiv.appendChild(userP);
    mainContainer.appendChild(userDiv);

    // Bot bubble
    const botDiv = document.createElement("div");
    botDiv.classList.add("chatbot");
    const botP = document.createElement("p");

    // Only add the restored badge on the last message
    const isLast = i === messages.length - 1;
    botP.innerHTML = formatVeritascanOutput(msg.botText)
      + (isLast ? `<span class="history-restored-badge">📂 Restored from history</span>` : "");
    botDiv.appendChild(botP);
    mainContainer.appendChild(botDiv);

    if (msg.newsArticles?.length) {
      appendNewsReferences(msg.newsArticles, botDiv);
    }
  });

  mainContainer.scrollTop = mainContainer.scrollHeight;
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ════════════════════════════════════════════════════════════════════════════
   INIT ON DOM READY
   ════════════════════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector(".chatpane-container");
  const input     = document.getElementById("user-chatbox-input");

  initGreetingOverlay();

  if (container && input) {
    input.addEventListener("focus", () => container.classList.add("focused"));
    input.addEventListener("blur",  () => {
      if (!input.value.trim()) container.classList.remove("focused");
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && document.activeElement === input) input.blur();
    });
  }

  renderHistory();

  document.getElementById("history-clear-btn")?.addEventListener("click", () => {
    if (confirm("Clear all chat history?")) {
      localStorage.removeItem(HISTORY_KEY);
      renderHistory();
    }
  });

  document.querySelectorAll(".prompt-item[data-prompt]").forEach(btn => {
    btn.addEventListener("click", () => {
      const prompt = btn.dataset.prompt || "";
      if (input) {
        input.value = prompt;
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════════════════ */
function scrollToBottom() {
  const c = document.querySelector(".main-conversation");
  if (c) c.scrollTop = c.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════════════════
   TYPING ANIMATION
   ════════════════════════════════════════════════════════════════════════════ */
function typingAnimation() {
  const heading = document.querySelector(".asking-section");
  if (!heading) return;

  const text = " How can I help?";
  let index = 0, deleting = false;

  function type() {
    if (!deleting) {
      heading.textContent += text[index++];
      if (index === text.length) { deleting = true; setTimeout(type, 2000); return; }
      setTimeout(type, 70);
    } else {
      heading.textContent = heading.textContent.slice(0, -1);
      index--;
      if (index === 0) { deleting = false; setTimeout(type, 1000); return; }
      setTimeout(type, 35);
    }
  }
  type();
}
typingAnimation();

/* ════════════════════════════════════════════════════════════════════════════
   MESSAGE RENDERING
   ════════════════════════════════════════════════════════════════════════════ */
function userMessage(msg) {
  const c = document.querySelector(".main-conversation");
  if (!c) return;
  const div = document.createElement("div");
  div.classList.add("user");
  const p = document.createElement("p");
  p.textContent = msg;
  div.appendChild(p);
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function userMessageHTML(html) {
  const c = document.querySelector(".main-conversation");
  if (!c) return;
  const div = document.createElement("div");
  div.classList.add("user");
  const p = document.createElement("p");
  p.innerHTML = html;
  div.appendChild(p);
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function userMessageWithLink(text, url, source) {
  const c = document.querySelector(".main-conversation");
  if (!c) return;
  const div = document.createElement("div");
  div.classList.add("user");
  const p = document.createElement("p");

  const displaySource = url ? (() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return ""; }
  })() : "";

  p.innerHTML = `<span class="user-msg-text">${escHtml(text)}</span>${
    url ? `<br><a class="user-source-link" href="${url}" target="_blank" rel="noopener">${escHtml(displaySource)}&nbsp;↗</a>` : ""
  }`;

  div.appendChild(p);
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

export function userMessageImg(src) {
  const c = document.querySelector(".main-conversation");
  if (!c) return;
  const div = document.createElement("div");
  div.classList.add("user");
  const inner = document.createElement("div");
  inner.classList.add("user-image-container");
  const img = document.createElement("img");
  img.src = src;
  img.classList.add("zoomable-img");
  img.title = "Click to zoom";
  img.addEventListener("click", () => openLightbox(src));
  inner.appendChild(img);
  div.appendChild(inner);
  c.appendChild(div);
  img.onload = () => { c.scrollTop = c.scrollHeight; };
}

/* ════════════════════════════════════════════════════════════════════════════
   IMAGE LIGHTBOX / ZOOM
   ════════════════════════════════════════════════════════════════════════════ */
function openLightbox(src) {
  document.getElementById("img-lightbox")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "img-lightbox";
  overlay.innerHTML = `
    <div class="lightbox-backdrop"></div>
    <div class="lightbox-content">
      <button class="lightbox-close" title="Close">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
             stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <img src="${src}" class="lightbox-img" alt="Zoomed image" draggable="false" />
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("active"));

  const close = () => {
    overlay.classList.remove("active");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });
  };

  overlay.querySelector(".lightbox-backdrop").addEventListener("click", close);
  overlay.querySelector(".lightbox-close").addEventListener("click", close);
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  });
}

function formatVeritascanOutput(text) {
  if (!isFormattedAnalysis(text)) return text.replace(/\n/g, "<br>");

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // ── STEP 1: Bold section headers (case-insensitive match for fallback models)
  const headers = [
    "VERITASCAN AI — CREDIBILITY ANALYSIS REPORT",
    "Claim Summary:",
    "Final Classification:",
    "Credibility Score:",
    "Factual Verification Result:",
    "Explanation:",
    "Supporting Evidence and References:",
    "Supporting Evidence:",
    "Final Verdict:",
    "Overall Confidence:",
  ];

  headers.forEach(h => {
    const esc   = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\n)(${esc})(\\n|$)`, "gim");
    html = html.replace(regex, (_, before, header, after) => {
      if (/final verdict/i.test(header))
        return `${before}<strong class="header final-verdict-header">${header}</strong>${after}`;
      if (/overall confidence/i.test(header))
        return `${before}<strong class="confidence-line">${header}</strong>${after}`;
      return `${before}<strong class="header">${header}</strong>${after}`;
    });
  });

  // ── STEP 2: Colorize inline verdict tags
  html = html.replace(
    /\[(REAL|LIKELY REAL|UNCERTAIN|UNVERIFIABLE|MISLEADING|LIKELY FAKE|FAKE)\]/gi,
    (_, verdict) => {
      const key = verdict.toLowerCase().replace(/\s+/g, "-");
      return `<strong class="verdict-${key}">[${verdict.toUpperCase()}]</strong>`;
    }
  );

  // ── STEP 3: Convert newlines to <br>
  html = html.replace(/\n/g, "<br>");

  // ── STEP 4: Final Verdict coloring — robust version
  html = html.replace(
    /(<strong[^>]*class="[^"]*final-verdict-header[^"]*"[^>]*>.*?<\/strong>)((?:<br\s*\/?>|\s)*)(REAL|LIKELY REAL|UNCERTAIN|UNVERIFIABLE|MISLEADING|LIKELY FAKE|FAKE)/gi,
    (_, headerPart, gap, verdictText) => {
      const verdict = verdictText.trim().toUpperCase();
      const key     = verdict.toLowerCase().replace(/\s+/g, "-");
      return `${headerPart}<br><strong class="verdict-${key}">${verdict}</strong>`;
    }
  );

  // ── STEP 5: Final Classification coloring — robust version
  html = html.replace(
    /(<strong[^>]*>Final Classification:<\/strong>)((?:<br\s*\/?>|\s)*)(REAL|LIKELY REAL|UNCERTAIN|UNVERIFIABLE|MISLEADING|LIKELY FAKE|FAKE)/gi,
    (_, headerPart, gap, verdictText) => {
      const verdict = verdictText.trim().toUpperCase();
      const key     = verdict.toLowerCase().replace(/\s+/g, "-");
      return `${headerPart}<br><strong class="verdict-${key}">${verdict}</strong>`;
    }
  );

  // ── STEP 6: Factual Verification Result coloring — robust version
  html = html.replace(
    /(<strong[^>]*>Factual Verification Result:<\/strong>)((?:<br\s*\/?>|\s)*)(CONFIRMED ACCURATE|CONFIRMED INACCURATE|PARTIALLY ACCURATE|CANNOT BE VERIFIED|DECEPTIVE FRAMING)/gi,
    (_, headerPart, gap, resultText) => {
      const result = resultText.trim().toUpperCase();
      const key    = result.toLowerCase().replace(/\s+/g, "-");
      return `${headerPart}<br><strong class="verdict-${key}">${result}</strong>`;
    }
  );

  // ── STEP 7: Catch bold verdict text that some models output
  html = html.replace(
    /\*\*(REAL|LIKELY REAL|UNCERTAIN|UNVERIFIABLE|MISLEADING|LIKELY FAKE|FAKE)\*\*/gi,
    (_, verdict) => {
      const key = verdict.trim().toLowerCase().replace(/\s+/g, "-");
      return `<strong class="verdict-${key}">${verdict.toUpperCase()}</strong>`;
    }
  );

  return html;
}

function isFormattedAnalysis(text) {
  return (
    text.includes("VERITASCAN AI") ||
    text.includes("CREDIBILITY ANALYSIS REPORT") ||
    text.includes("Final Classification:") ||
    text.includes("Credibility Score:") ||
    text.includes("Final Verdict:") ||
    text.includes("Overall Confidence:")
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   NEWS REFERENCE CARD
   ════════════════════════════════════════════════════════════════════════════ */
function buildNewsCard(articles) {
  if (!articles?.length) return null;
  const links = articles.map(a =>
    `<a class="newsapi-link" href="${a.url}" target="_blank" rel="noopener">
       <span class="newsapi-link-source">${a.source || ""}</span>
       <span class="newsapi-link-title">${a.title || ""}</span>
     </a>`
  ).join("");
  return `<div class="newsapi-card">
    <span class="newsapi-label">📡 Related Articles</span>
    <div class="newsapi-links">${links}</div>
  </div>`;
}

function appendNewsReferences(articles, chatbotDiv) {
  const c = document.querySelector(".main-conversation");
  if (!articles?.length) return;
  const html = buildNewsCard(articles);
  if (!html) return;
  const w = document.createElement("div");
  w.innerHTML = html;
  chatbotDiv.appendChild(w.firstElementChild);
  if (c) c.scrollTop = c.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════════════════
   TRUSTED SOURCE BADGE
   ════════════════════════════════════════════════════════════════════════════ */
const TRUSTED_DOMAINS_CLIENT = [
  "rappler.com", "gmanetwork.com", "abs-cbn.com", "inquirer.net",
  "philstar.com", "mb.com.ph", "pna.gov.ph", "cnnphilippines.com",
  "sunstar.com.ph", "manilatimes.net", "businessmirror.com.ph",
  "businessworld.com.ph", "malaya.com.ph", "tempo.com.ph",
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
  "cnn.com", "nytimes.com", "theguardian.com", "washingtonpost.com",
  "bloomberg.com", "forbes.com", "aljazeera.com", "nbcnews.com",
  "abcnews.go.com", "cbsnews.com", "npr.org", "time.com",
  "economist.com", "ft.com", "wsj.com", "politico.com",
  "axios.com", "thehill.com", "usatoday.com", "latimes.com",
  "sfgate.com", "chicagotribune.com", "nypost.com",
  "factcheck.org", "snopes.com", "politifact.com", "fullfact.org",
  "verafiles.org", "tsek.ph"
];

function getTrustedBadge(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    const match = TRUSTED_DOMAINS_CLIENT.find(d => hostname === d || hostname.endsWith("." + d));
    if (!match) return "";
    const name = match.split(".")[0].toUpperCase();
    return `<span class="trusted-source-badge" title="Recognized credible news source">✅ Trusted Source · ${name}</span>`;
  } catch {
    return "";
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   DEMO MODE — HARDCODED RESPONSES
   ════════════════════════════════════════════════════════════════════════════ */
const DEMO_RESPONSES = [
  {
    keywords  : ["pacquiao", "mayweather"],
    searchQuery: "Pacquiao Mayweather fight September 2026",
    reportText: `VERITASCAN AI — CREDIBILITY ANALYSIS REPORT

Claim Summary:
Manny Pacquiao is set to fight Floyd Mayweather Jr. in a rematch scheduled for September 2026.

Final Classification:
REAL
Confidence Level: 95.0%

Credibility Score:
95 / 100
Risk Level: LOW

Factual Verification Result:
CONFIRMED ACCURATE

Explanation:
This is a recent event confirmed by multiple major news outlets. On February 23, 2026, Netflix officially announced the Pacquiao vs. Mayweather rematch — scheduled for September 19, 2026, at The Sphere in Las Vegas. Both fighters and their promoters have publicly confirmed the bout. This is not a rumor or speculation — it is an officially announced, commercially promoted event with a confirmed date and venue. Good news — this one checks out. Should be a great fight to watch!

Supporting Evidence:
• [W1] ESPN: "Manny Pacquiao sets Sept. 19 rematch vs. Floyd Mayweather Jr." — Feb 23, 2026 ✅ CONFIRMS
• [W2] Al Jazeera: "Floyd Mayweather and Manny Pacquiao agree to fight rematch in September" — Feb 24, 2026 ✅ CONFIRMS
• [W3] CNN: "Pacquiao and Mayweather rematch scheduled for September at The Sphere" — Feb 24, 2026 ✅ CONFIRMS
• [W4] Netflix official announcement: Live global broadcast confirmed for September 19, 2026 ✅ CONFIRMS

Final Verdict:
REAL

Overall Confidence: 95.0%`
  },
  {
    keywords  : ["chocolate", "cure", "disease"],
    searchQuery: "chocolate not cure disease no scientific evidence health experts",
    reportText: `VERITASCAN AI — CREDIBILITY ANALYSIS REPORT

Claim Summary:
A viral report claims that eating 200 grams of chocolate daily can cure all diseases including cancer, diabetes, and heart conditions, as discovered by a team of "leading scientists."

Final Classification:
FAKE
Confidence Level: 97.0%

Credibility Score:
3 / 100
Risk Level: EXTREME

Factual Verification Result:
CONFIRMED INACCURATE

Explanation:
This claim is false and potentially dangerous. No credible scientific study, peer-reviewed journal, or recognized health organization has ever established that chocolate — in any quantity — can cure all diseases. The World Health Organization (WHO), the American Cancer Society, and the Philippine Department of Health (DOH) all confirm there is no such cure-all food substance. While dark chocolate has some studied antioxidant properties in limited contexts, the claim that 200g daily cures cancer, diabetes, and heart disease is directly contradicted by established medical science. The vague reference to "leading scientists" with no named institution, no published study, and no peer review is a classic hallmark of health misinformation. The promotion of "medical chocolate kits" is a further red flag indicating commercial exploitation of false health claims. Yeah, this one's not real — don't share it, and definitely don't follow the advice.

Supporting Evidence:
• [FC1] WHO & major health organizations: No scientific evidence supports chocolate as a cure for any disease ✅ CONTRADICTS claim
• [FC2] American Cancer Society: No food has been proven to cure cancer ✅ CONTRADICTS claim
• [W1] WebMD: Dark chocolate has limited studied benefits, but cannot cure diseases ✅ CONTRADICTS claim
• [W2] PubMed / medical literature: No peer-reviewed study supports 200g chocolate as a disease cure ✅ CONTRADICTS claim
• Red flag: "Leading scientists" unnamed, no institution cited, no published research
• Red flag: Promotion of "medical chocolate kits" — commercial exploitation of false health claim

Final Verdict:
FAKE

Overall Confidence: 97.0%`
  }
];

function matchDemoResponse(msg) {
  const lower = msg.toLowerCase();

  const pacquiaoAliases   = ["pacquiao", "pacuiao", "paquiao", "pacman", "manny", "emmanuel pacquiao"];
  const mayweatherAliases = ["mayweather", "maywether", "mayweater", "floyd", "money mayweather", "money"];

  const hasPacquiao   = pacquiaoAliases.some(a  => lower.includes(a));
  const hasMayweather = mayweatherAliases.some(a => lower.includes(a));

  if (hasPacquiao && hasMayweather) {
    return DEMO_RESPONSES.find(e => e.keywords.includes("pacquiao"));
  }

  return DEMO_RESPONSES.find(entry =>
    !entry.keywords.includes("pacquiao") &&
    entry.keywords.every(kw => lower.includes(kw.toLowerCase()))
  ) || null;
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN sendToChatbot
   ════════════════════════════════════════════════════════════════════════════ */
export async function sendToChatbot(userMsg, existingP = null, isTrending = false) {
  const c = document.querySelector(".main-conversation");
  if (!c) return;

  let messageDiv;
  let p;

  if (existingP) {
    p = existingP;
    messageDiv = existingP.closest(".chatbot");
  } else {
    messageDiv = document.createElement("div");
    messageDiv.classList.add("chatbot");
    p = document.createElement("p");
    p.textContent = "Typing...";
    messageDiv.appendChild(p);
    c.appendChild(messageDiv);
  }

  c.scrollTop = c.scrollHeight;

  /* ── DEMO MODE CHECK ── */
  const demoMatch = matchDemoResponse(userMsg);

  if (demoMatch) {
    console.log("[DEMO MODE] Triggered for keywords:", demoMatch.keywords);

    const [refData] = await Promise.all([
      fetch("http://localhost:3000/chat", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          message : demoMatch.searchQuery,
          userName: getSavedName() || "User"
        })
      })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),

      new Promise(r => setTimeout(r, 2800))
    ]);

    p.innerHTML = formatVeritascanOutput(demoMatch.reportText);
    scrollToBottom();
    const demoArticles = refData?.newsArticles || [];

    SESSION_LOG.push({
      userText    : userMsg.slice(0, 120),
      userTextFull: userMsg,
      botText     : demoMatch.reportText,
      newsArticles: demoArticles,
      timestamp   : new Date().toLocaleString("en-PH", {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      })
    });

    if (demoArticles.length) {
      appendNewsReferences(demoArticles, messageDiv);
      console.log("[DEMO MODE] References appended:", refData.newsArticles.length);
    }

    c.scrollTop = c.scrollHeight;
    return;
  }

  /* ── NORMAL MODE — real AI call ── */
  try {
    const response = await fetch("http://localhost:3000/chat", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message    : userMsg,
        userName   : getSavedName() || "User",
        isTrending : isTrending
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data    = await response.json();
    const botText = data.message || "No reply received.";
    p.innerHTML   = formatVeritascanOutput(botText);

    console.log("RAW BOT RESPONSE:", botText);

    scrollToBottom();

    SESSION_LOG.push({
      userText    : userMsg.slice(0, 120),
      userTextFull: userMsg,
      botText     : botText,
      newsArticles: data.newsArticles || [],
      timestamp   : new Date().toLocaleString("en-PH", {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
      })
    });

    if (data.newsArticles?.length) {
      appendNewsReferences(data.newsArticles, messageDiv);
    }

  } catch (err) {
    console.error("Chat error:", err);
    p.textContent = "Oops! Something went wrong. Please contact the developer for assistance.";
  }

  c.scrollTop = c.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════════════════
   SEND MESSAGE HANDLER
   ════════════════════════════════════════════════════════════════════════════ */
function sendMessage() {
  const sendBtn = document.getElementById("send-btn");
  const input   = document.getElementById("user-chatbox-input");
  let introBox  = document.querySelector(".conversation-box");

  if (!sendBtn || !input) return;

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";

    if (!input.value.trim()) {
      input.dataset.fullMessage = "";
      input.dataset.sourceUrl   = "";
      input.dataset.sourceLabel = "";
    }
  });

  const handleSend = async () => {
    const value        = input.dataset.fullMessage?.trim() || input.value.trim();
    const displayValue = input.value.trim();
    const file         = getSelectedFile();

    if (!value && !file) return;

    sendBtn.disabled       = true;
    input.disabled         = true;
    sendBtn.style.opacity  = "0.4";
    sendBtn.style.cursor   = "not-allowed";
    input.style.opacity    = "0.6";
    input.style.cursor     = "not-allowed";

    const c      = document.querySelector(".main-conversation");
    let introBox = document.querySelector(".conversation-box");
    if (introBox) { introBox.remove(); introBox = null; }

    if (file) {
      input.value = "";
      input.dataset.fullMessage = "";
      input.dataset.sourceUrl   = "";
      input.dataset.sourceLabel = "";
      input.style.height = "auto";
      input.focus();

      if (file.type.startsWith("image/")) {
        userMessageImg(URL.createObjectURL(file));
        if (value) userMessage(value);
      } else {
        userMessageHTML(
          `📄 Sent file: <strong>${file.name}</strong><br>` +
          `<small>Size: ${(file.size / 1024).toFixed(1)} KB</small>`
        );
        if (value) userMessage(value);
      }

      const messageDiv = document.createElement("div");
      messageDiv.classList.add("chatbot");
      const p = document.createElement("p");
      p.textContent = file.type.startsWith("image/") ? "Reading image..." : "Reading file...";
      messageDiv.appendChild(p);
      c.appendChild(messageDiv);
      c.scrollTop = c.scrollHeight;

      clearSelectedFile();

      try {
        const { text } = await extractFileContent(file);
        const combined = value ? `${value}\n\n${text}` : text;
        p.textContent  = "Processing with AI...";
        await sendToChatbot(combined, p);
      } catch (err) {
        p.textContent = "Error reading file: " + err.message;
      }

    } else {
      const sourceUrl   = input.dataset.sourceUrl   || "";
      const sourceLabel = input.dataset.sourceLabel || "";

      if (sourceUrl) {
        userMessageWithLink(displayValue, sourceUrl, sourceLabel.split("·")[0].trim());
      } else {
        userMessage(displayValue);
      }

      input.value = "";
      input.dataset.fullMessage = "";
      input.dataset.sourceUrl   = "";
      input.dataset.sourceLabel = "";
      input.style.height = "auto";
      await sendToChatbot(value, null, !!sourceUrl);
    }

    sendBtn.disabled       = false;
    input.disabled         = false;
    sendBtn.style.opacity  = "";
    sendBtn.style.cursor   = "";
    input.style.opacity    = "";
    input.style.cursor     = "";
    input.focus();
  };

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
}

sendMessage();

/* ════════════════════════════════════════════════════════════════════════════
   MIC / SPEECH TO TEXT
   ════════════════════════════════════════════════════════════════════════════ */
document.getElementById("mic-btn")?.addEventListener("click", () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Your browser does not support Speech Recognition"); return; }

  const r = new SR();
  r.continuous = false;
  r.interimResults = false;
  r.start();

  r.onresult = e => {
    const text = e.results[0][0].transcript;
    const introBox = document.querySelector(".conversation-box");
    if (introBox) introBox.remove();
    userMessage(text);
    sendToChatbot(text);
  };
  r.onerror = e => console.error("Speech error:", e.error);
});

/* ════════════════════════════════════════════════════════════════════════════
   LINK BUTTON HANDLER
   ════════════════════════════════════════════════════════════════════════════ */
function extractText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  ["script","style","nav","footer","header","aside","iframe","noscript"]
    .forEach(t => doc.querySelectorAll(t).forEach(el => el.remove()));
  const main = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  let text = (main?.innerText || main?.textContent || "").replace(/\s{2,}/g, " ").trim();
  if (text.length > 4000) text = text.slice(0, 4000) + "... [truncated]";
  return text.length > 100 ? text : null;
}

const linkBtn    = document.getElementById("link-btn-chatbot");
const linkModal  = document.getElementById("link-modal");
const linkInput  = document.getElementById("link-modal-input");
const linkSubmit = document.getElementById("link-modal-submit");
const linkClose  = document.getElementById("link-modal-close");

if (linkBtn && linkModal) {
  linkBtn.addEventListener("click", () => {
    linkModal.classList.add("active");
    linkInput.value = "";
    linkInput.focus();
  });
  linkClose.addEventListener("click", () => linkModal.classList.remove("active"));
  linkModal.addEventListener("click", e => {
    if (e.target === linkModal) linkModal.classList.remove("active");
  });

  const submitLink = async () => {
    const url = linkInput.value.trim();
    if (!url) return;

    try { new URL(url); } catch {
      linkInput.style.borderColor = "var(--danger)";
      linkInput.placeholder = "Invalid URL. Try again...";
      return;
    }

    linkInput.style.borderColor = "";
    linkModal.classList.remove("active");

    document.querySelector(".conversation-box")?.remove();

    const badge   = getTrustedBadge(url);
    const c       = document.querySelector(".main-conversation");
    const userDiv = document.createElement("div");
    userDiv.classList.add("user");
    const userP = document.createElement("p");
    userP.innerHTML = `🔗 ${escHtml(url)}${badge ? "<br>" + badge : ""}`;
    userDiv.appendChild(userP);
    c.appendChild(userDiv);
    c.scrollTop = c.scrollHeight;

    const loadingDiv = document.createElement("div");
    loadingDiv.classList.add("chatbot");
    const loadingP = document.createElement("p");
    loadingP.textContent = "🔍 Fetching and analyzing the link...";
    loadingDiv.appendChild(loadingP);
    c.appendChild(loadingDiv);
    c.scrollTop = c.scrollHeight;

    const blocked = ["facebook.com","fb.com","instagram.com","twitter.com","x.com","tiktok.com","linkedin.com"];
    if (blocked.some(d => url.includes(d))) {
      loadingDiv.remove();
      const div = document.createElement("div");
      div.classList.add("chatbot");
      const p = document.createElement("p");
      p.textContent = `⚠️ Content from ${new URL(url).hostname} cannot be directly accessed because it requires login or is restricted.\n\n📋 Try instead:\n• Copy and paste the text here\n• Upload a screenshot\n• Summarize the claim`;
      div.appendChild(p);
      c.appendChild(div);
      c.scrollTop = c.scrollHeight;
      return;
    }

    let content = null;
    try {
      const r = await fetch(url, { mode: "cors" });
      if (r.ok) content = extractText(await r.text());
    } catch { console.log("Client-side fetch blocked, trying server..."); }

    if (!content) {
      try {
        const r    = await fetch("http://localhost:3000/fetch-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        const data = await r.json();
        if (data.error) {
          loadingDiv.remove();
          const div = document.createElement("div");
          div.classList.add("chatbot");
          const p = document.createElement("p");
          p.textContent = "❌ This link could not be accessed.\n\nTry copying the article text and pasting it here instead.";
          div.appendChild(p);
          c.appendChild(div);
          c.scrollTop = c.scrollHeight;
          return;
        }
        content = data.content;
      } catch (err) {
        loadingP.textContent = "Oops! Something went wrong. Please contact the developer for assistance.";
        return;
      }
    }

    loadingDiv.remove();

    const c2 = document.querySelector(".main-conversation");
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chatbot");
    const p2 = document.createElement("p");
    p2.textContent = "Typing...";
    messageDiv.appendChild(p2);
    c2.appendChild(messageDiv);
    c2.scrollTop = c2.scrollHeight;

    try {
      const response = await fetch("http://localhost:3000/chat", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          message       : `Please analyze and fact-check this article from the URL: ${url}`,
          userName      : getSavedName() || "User",
          articleContent: content
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data    = await response.json();
      const botText = data.message || "No reply received.";
      p2.innerHTML  = formatVeritascanOutput(botText);

      console.log("RAW BOT RESPONSE (URL):", botText);
      scrollToBottom();

      SESSION_LOG.push({
        userText    : `🔗 ${url}`.slice(0, 120),
        userTextFull: `🔗 ${url}`,
        botText     : botText,
        newsArticles: data.newsArticles || [],
        timestamp   : new Date().toLocaleString("en-PH", {
          month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      });

      if (isFormattedAnalysis(botText) && data.newsArticles?.length) {
        appendNewsReferences(data.newsArticles, messageDiv);
      }

    } catch (err) {
      console.error("Chat error (URL):", err);
      p2.textContent = "Oops! Something went wrong. Please contact the developer for assistance.";
    }
  };

  linkSubmit.addEventListener("click", submitLink);
  linkInput.addEventListener("keydown", e => { if (e.key === "Enter") submitLink(); });
}

const inputEl = document.getElementById("user-chatbox-input");

if (inputEl) {
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + "px";
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   SAVE WHOLE SESSION ON REFRESH/CLOSE — one log entry per session
   ════════════════════════════════════════════════════════════════════════════ */
window.addEventListener("beforeunload", () => {
  if (SESSION_LOG.length === 0) return;

  const history = loadHistory();

  // One single entry for the entire session
  const sessionEntry = {
    id          : Date.now(),
    userText    : SESSION_LOG[0].userText,         // first message as sidebar label
    userTextFull: SESSION_LOG[0].userTextFull,     // first message full text
    botText     : SESSION_LOG[SESSION_LOG.length - 1].botText, // last bot reply (fallback)
    newsArticles: SESSION_LOG[SESSION_LOG.length - 1].newsArticles || [],
    allMessages : SESSION_LOG,                     // full conversation stored here
    timestamp   : SESSION_LOG[0].timestamp,        // time of first message
  };

  history.unshift(sessionEntry);
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
  saveHistory(history);
});

