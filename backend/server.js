require("dotenv").config({ path: __dirname + "/.env" });
const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const FormData = require("form-data");
const https    = require("https");

const app    = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

const OPENROUTER_API_KEY        = process.env.OPENROUTER_API_KEY;
const AIORNOT_API_KEY           = process.env.AIORNOT_API_KEY;
const NEWS_API_KEY              = process.env.NEWS_API_KEY;
const SERPER_API_KEY            = process.env.SERPER_API_KEY;
const GNEWS_API_KEY             = process.env.GNEWS_API_KEY;
const GOOGLE_FACT_CHECK_API_KEY = process.env.GOOGLE_FACT_CHECK_API_KEY;
const GOOGLE_KG_API_KEY         = process.env.GOOGLE_KG_API_KEY;

/* ════════════════════════════════════════════════════════════════════════════
   TRUSTED NEWS DOMAINS
   ════════════════════════════════════════════════════════════════════════════ */
const TRUSTED_NEWS_DOMAINS = [
  // Philippine news
  "rappler.com",
  "gmanetwork.com",
  "abs-cbn.com",
  "abs-cbnnews.com",
  "inquirer.net",
  "philstar.com",
  "mb.com.ph",
  "pna.gov.ph",
  "cnnphilippines.com",
  "sunstar.com.ph",
  "manilatimes.net",
  "businessmirror.com.ph",
  "businessworld.com.ph",
  "malaya.com.ph",
  "tempo.com",
  
  // Global news
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "nytimes.com",
  "theguardian.com",
  "washingtonpost.com",
  "bloomberg.com",
  "forbes.com",
  "aljazeera.com",
  "nbcnews.com",
  "abcnews.go.com",
  "cbsnews.com",
  "npr.org",
  "time.com",
  "economist.com",
  "ft.com",
  "wsj.com",
  "politico.com",
  "axios.com",
  "thehill.com",
  "usatoday.com",
  "latimes.com",
  "sfgate.com",
  "chicagotribune.com",
  "nypost.com",
  "euronews.com",
  "dw.com",
  "cbc.ca/news",
  "abc.net.au/news",

  // Fact-checking
  "factcheck.org",
  "snopes.com",
  "politifact.com",
  "fullfact.org",
  "verafiles.org",
  "tsek.ph",
  "leadstories.com",
  "checkyourfact.com"
];

/* ════════════════════════════════════════════════════════════════════════════
   MODEL CONFIG
   ════════════════════════════════════════════════════════════════════════════ */
const PRIMARY_MODEL = "mistralai/mistral-small-3.1-24b-instruct:free";

const FALLBACK_MODELS = [
  "openai/gpt-3.5-turbo"
];

app.use(cors());
app.use(express.json());

async function callModel(model, messages) {
  return await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ravenchatbot.com",
      "X-Title": "Vertiscan Chatbot",
    },
    body: JSON.stringify({ model, messages })
  });
}

async function fetchWithFallback(messages) {
  const primaryRes = await callModel(PRIMARY_MODEL, messages);

  if (primaryRes.ok) {
    const data    = await primaryRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      console.log(`[Primary: ${PRIMARY_MODEL}] Success.`);
      return content;
    }
  }

  if (primaryRes.status !== 429 && primaryRes.status !== 404) {
    const errText = await primaryRes.text().catch(() => "");
    throw new Error(`Model error: ${primaryRes.status} — ${errText.slice(0, 200)}`);
  }

  console.log(`[Primary: ${PRIMARY_MODEL}] Failed with ${primaryRes.status} — switching to fallback...`);

  for (const model of FALLBACK_MODELS) {
    try {
      const res = await callModel(model, messages);

      if (res.status === 429 || res.status === 404 || !res.ok) {
        console.log(`[Fallback: ${model}] Error ${res.status}, trying next...`);
        continue;
      }

      const data    = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log(`[Fallback: ${model}] Success.`);
        return content;
      }

    } catch (err) {
      console.log(`[Fallback: ${model}] Exception: ${err.message}, trying next...`);
    }
  }

  throw new Error("All models are currently unavailable. Please try again later.");
}

/* ════════════════════════════════════════════════════════════════════════════
   MISTRAL OUTPUT NORMALIZER
   ════════════════════════════════════════════════════════════════════════════ */
function normalizeMistralOutput(text) {
  if (!text) return text;

  let t = text;

  t = t.replace(/\*{1,3}((?:Claim Summary|Final Classification|Credibility Score|Factual Verification Result|Explanation|Supporting Evidence(?:\s+and\s+References)?|Final Verdict|Overall Confidence|Confidence Level|Risk Level|VERITASCAN AI)[^*\n]*?)\*{1,3}/gi,
    (_, inner) => inner.trim()
  );

  t = t.replace(/^#{1,4}\s*/gm, "");

  t = t.replace(/\*{1,2}\[?(REAL|LIKELY REAL|UNCERTAIN|UNVERIFIABLE|MISLEADING|LIKELY FAKE|FAKE)\]?\*{1,2}/gi,
    (_, v) => `[${v.toUpperCase()}]`
  );

  t = t.replace(
    /(Final (?:Classification|Verdict)\s*:\s*\n?\s*)(REAL|LIKELY REAL|UNCERTAIN|UNVERIFIABLE|MISLEADING|LIKELY FAKE|FAKE)(?!\])/gi,
    (_, prefix, verdict) => `${prefix}[${verdict.toUpperCase()}]`
  );

  const headerFixes = [
    [/claim\s+summary\s*:/gi,                              "Claim Summary:"],
    [/final\s+classification\s*:/gi,                       "Final Classification:"],
    [/credibility\s+score\s*:/gi,                          "Credibility Score:"],
    [/factual\s+verification\s+result\s*:/gi,              "Factual Verification Result:"],
    [/explanation\s*:/gi,                                  "Explanation:"],
    [/supporting\s+evidence\s+and\s+references\s*:/gi,     "Supporting Evidence and References:"],
    [/supporting\s+evidence\s*:/gi,                        "Supporting Evidence:"],
    [/final\s+verdict\s*:/gi,                              "Final Verdict:"],
    [/overall\s+confidence\s*:/gi,                         "Overall Confidence:"],
    [/confidence\s+level\s*:/gi,                           "Confidence Level:"],
    [/risk\s+level\s*:/gi,                                 "Risk Level:"],
  ];
  for (const [regex, replacement] of headerFixes) {
    t = t.replace(regex, replacement);
  }

  t = t.replace(/(?<!\w)\*{1,2}(?!\w)/g, "");
  t = t.replace(/^[\-–]\s+/gm, "• ");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t;
}

/* ════════════════════════════════════════════════════════════════════════════
   CONFIDENCE CAP ENFORCEMENT
   ════════════════════════════════════════════════════════════════════════════ */
function enforceConfidenceCap(text) {
  if (!text) return text;

  text = text.replace(
    /((?:Confidence Level|Overall Confidence|Confidence)\s*:\s*)(\d+(?:\.\d+)?)(\s*%)/gi,
    (match, prefix, num, suffix) => {
      const val    = parseFloat(num);
      const capped = Math.min(Math.max(val, 3), 97);
      if (val !== capped) console.log(`[ConfidenceCap] Clamped ${val}% → ${capped}%`);
      return prefix + capped.toFixed(1) + suffix;
    }
  );

  text = text.replace(
    /(Credibility Score\s*:\s*)(\d+(?:\.\d+)?)(\s*\/\s*100)/gi,
    (match, prefix, num, suffix) => {
      const val    = parseFloat(num);
      const capped = Math.min(Math.max(val, 3), 97);
      if (val !== capped) console.log(`[ConfidenceCap] Score clamped ${val} → ${capped}`);
      return prefix + capped.toFixed(0) + suffix;
    }
  );

  return text;
}

/* ════════════════════════════════════════════════════════════════════════════
   TRUSTED SOURCE DETECTION
   ════════════════════════════════════════════════════════════════════════════ */
function extractDomainFromMessage(message) {
  const urlMatch = message.match(/https?:\/\/(?:www\.)?([^\/\s]+)/i);
  if (!urlMatch) return null;
  return urlMatch[1].toLowerCase();
}

function isTrustedNewsSource(message) {
  const domain = extractDomainFromMessage(message);
  if (!domain) return { trusted: false, domain: null, name: null };
  const match = TRUSTED_NEWS_DOMAINS.find(d => domain === d || domain.endsWith("." + d));
  if (!match) return { trusted: false, domain, name: null };
  const name = match.split(".")[0].toUpperCase();
  return { trusted: true, domain, name };
}

/* ════════════════════════════════════════════════════════════════════════════
   FACT CHECK DETECTION HELPERS
   ════════════════════════════════════════════════════════════════════════════ */
function isFactCheckRequest(message) {
  const lower = message.toLowerCase();

  const factCheckTriggers = [
    "verify","check this","fake news","is it true","is this true",
    "fact check","factcheck","analyze this","is this real","is this fake",
    "according to","they said","i heard that","rumor","confirm this",
    "debunk","legit ba","hoax","disinformation","misinformation",
    "is this legit","can you verify","check if","is this accurate",
    "is this correct","fact or fiction","true or false",
    "fake ba","verify this","please verify","please check",
    "is it confirmed","has it been confirmed","officially announced",
    "totoo ba","peke ba","balita","tsek mo","i-verify","i-check",
    "totoong balita","totoo ba ito","totoo bang",
    "is there a fight","is there a match","is there a game",
    "may laban ba","may laban","laban ba","laban ni","laban ng",
    "kailan laban","sino kalaban","kalaban ni","kalaban niya",
    "next fight","upcoming fight","scheduled fight","fight ba",
    "fight ni","fight ng","maglalaban","lalaban","sasabak",
    "will fight","is fighting","going to fight",
    "is still","is he still","is she still","is it still",
    "did he","did she","did they","has he","has she",
    "what happened to","ano nangyari","ano na nangyari",
    "nagretiro na ba","retired na ba","active pa ba",
    "still active","still playing","still fighting",
    "in 2025","in 2026","in 2027",
    "this 2025","this 2026","this 2027",
    "ngayong 2025","ngayong 2026",
    "sa 2025","sa 2026","sa 2027",
    "meron ba","mayroon ba","may balita","may nangyari",
    "may announcement","may ginawa","may sinabi",
    "is there any news","any news about","any update",
    "anong balita","ano ang balita",
    "can you verify this","please verify this","can you fact check",
    "is this report accurate","is this news accurate","is this article accurate",
    "can you check this","check this news","check this report",
  ];

  const newsPatterns = [
    /breaking[\s:]/i,
    /just in[\s:]/i,
    /report(s|ed)?:/i,
    /exclusive:/i,
    /headline/i,
    /https?:\/\//i,
    /according to [a-z]/i,
    /sources say/i,
    /officials say/i,
    /government say/i,
    /\b20(2[4-9]|3[0-9])\b/,
    /\bvs\.?\s+[a-z]/i,
    /\bversus\s+[a-z]/i,
    /\bba\s*\?/i,
    /\b(still|currently|ngayon|pa rin)\b.{0,30}\b(fight|laban|play|work|alive|buhay)\b/i,
    /\b(president|senator|congressman|secretary|minister|governor|mayor|general|spokesperson)\b.{0,60}\b(said|says|stated|announced|declared|confirmed|signed|ordered|warned|threatened|called|urged|raised|suggested|added)\b/i,
    /\b(said|stated|announced|declared|confirmed|reported|revealed|disclosed|admitted|claimed|warned|threatened|alleged|noted|told reporters|told journalists|speaking to|speaking aboard|aboard air force)\b/i,
    /\b(aboard air force one|at a press conference|at the white house|in a statement|in an interview|on saturday|on sunday|on monday|on tuesday|on wednesday|on thursday|on friday)\b/i,
    /^[A-Z][a-z]+ [A-Z][a-z]+.{10,80}(said|says|announced|stated|confirmed|warned|declared)/m,
    /\b(war|military|troops|strike|sanctions|nuclear|missile|airstrike|bomb|attack|invasion|conflict|ceasefire|negotiate|negotiations|treaty)\b/i,
    /["""]\s*[A-Z].{20,200}[.!?]\s*["""]/,
    /\b(on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
    /\b(this week|last week|yesterday|earlier today|this morning|tonight)\b/i,
  ];

  const hasFactCheckTrigger = factCheckTriggers.some(t => lower.includes(t));
  const hasNewsPattern      = newsPatterns.some(p => p.test(message));

  const isPastedNewsParagraph = (() => {
    if (message.length < 150) return false;
    const properNouns = (message.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter(w =>
      !["The","This","That","These","Those","There","Their","They","When","Where","While",
        "Speaking","According","Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday",
        "January","February","March","April","May","June","July","August","September","October","November","December"
      ].includes(w)
    );
    const hasReportingVerb = /\b(said|stated|announced|confirmed|warned|declared|reported|revealed|told|speaking|added|raised|suggested)\b/i.test(message);
    return properNouns.length >= 2 && hasReportingVerb;
  })();

  const isVeryLong = message.length > 200;
  const result = hasFactCheckTrigger || hasNewsPattern || isPastedNewsParagraph || isVeryLong;

  if (isPastedNewsParagraph && !hasFactCheckTrigger && !hasNewsPattern) {
    console.log(`[isFactCheckRequest] Triggered by PASTED PARAGRAPH heuristic (${message.length} chars, proper nouns + reporting verb)`);
  }

  return result;
}

function isCasualFactQuestion(message) {
  const lower = message.toLowerCase();

  const fullReportTriggers = [
    "is it true that","is it true na",
    "is this true","totoo ba na","totoo bang",
    "verify","fact check","factcheck","fake news",
    "debunk","is this real","is this fake",
    "is this legit","is this accurate","is this correct",
    "can you verify","please verify","please check",
    "i heard that","they said","rumor","hoax",
    "disinformation","misinformation",
    "fact or fiction","true or false",
  ];
  if (fullReportTriggers.some(t => lower.includes(t))) return false;
  if (message.length >= 150) return false;

  const casualPatterns = [
    /^(meron|mayroon|may)\s+ba/i,
    /^(is there|are there|does|did|has|have|will)/i,
    /^(sino|ano|kailan|saan|paano)\s+(ang|si|yung|ba)/i,
    /laban\s+(ba|ni|ng|niya)/i,
    /\bvs\.?\s+[a-zA-Z]/i,
    /fight\s+(ba|ni|ng|in\s+20\d\d)/i,
    /\b(still|pa rin|ngayon|currently)\b/i,
    /\b(retired|nagretiro|active)\b/i,
    /\bin\s+20(2[4-9]|3\d)\b/i,
    /\bthis\s+20(2[4-9]|3\d)\b/i,
  ];

  const isShort = message.length < 150;
  return isShort && casualPatterns.some(p => p.test(message));
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYWORD EXTRACTION
   ════════════════════════════════════════════════════════════════════════════ */
const BASE_STOPWORDS = new Set([
  "is","are","was","were","the","a","an","and","or","but","in","on","at","to",
  "for","of","with","that","this","it","by","from","has","have","been","be",
  "not","as","its","will","would","could","should","also","their","they","he",
  "she","we","i","my","your","his","her","our","which","who","what","when",
  "where","how","did","do","does","had","may","can","just","about","more","than",
  "then","so","if","into","after","before","some","any","all","no","up","out",
  "there","here","now","only","other","over","such","us",
  "ba","na","si","ang","yung","mga","ito","yan","daw","raw","nga","naman",
  "kaya","lang","din","rin","ay","po","ho","mo","ko","ka","sya","siya","niya",
  "namin","natin","ninyo","nila","kami","kayo","tayo","sila","ito","iyon","iyan",
  "check","verify","true","false","real","fake","news","claim","article",
  "said","say","tell","please","totoo","peke","balita",
  "Breaking","BREAKING","Exclusive","EXCLUSIVE","Just","Report","Reports"
]);

function extractKeywords(text) {
  const phrases = [];
  const quotedMatches = text.match(/"([^"]+)"/g);
  if (quotedMatches) {
    phrases.push(
      ...quotedMatches
        .map(q => q.replace(/"/g, "").trim())
        .filter(p => p.length > 3)
        .slice(0, 2)
    );
  }

  const namedEntities = [];
  const entityMatches = text.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/g);
  if (entityMatches) {
    namedEntities.push(
      ...entityMatches
        .filter(e => {
          const words = e.split(" ");
          return words.length >= 1 && words.length <= 5 && !BASE_STOPWORDS.has(e);
        })
        .slice(0, 4)
    );
  }

  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !BASE_STOPWORDS.has(w) && !BASE_STOPWORDS.has(w.toLowerCase()));

  const combined = [...new Set([...phrases, ...namedEntities, ...words])].slice(0, 8);

  const hasTimeContext = /next month|this year|in \d{4}|starting|announced|\d{4}/i.test(text);
  const currentYear   = new Date().getFullYear();
  if (!hasTimeContext && !combined.some(w => w.match(/20\d\d/))) {
    combined.push(String(currentYear));
  }

  return combined.join(" ");
}

function extractShortKeywords(text) {
  const entityMatches = text.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)/g);
  if (entityMatches) {
    const filtered = entityMatches
      .filter(e => !BASE_STOPWORDS.has(e) && e.split(" ").length <= 4)
      .slice(0, 2);
    if (filtered.length > 0) return filtered.join(" ");
  }

  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !BASE_STOPWORDS.has(w.toLowerCase()));

  const capitalized = [...new Set(words.filter(w => /^[A-Z]/.test(w)))].slice(0, 4);
  return capitalized.join(" ");
}

function isRelevantResult(result, originalQuery) {
  const cappedQuery = originalQuery.slice(0, 100);
  const queryWords = cappedQuery
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
  if (queryWords.length === 0) return true;
  const resultText = ((result.title || "") + " " + (result.snippet || "")).toLowerCase();
  const matchCount = queryWords.filter(w => resultText.includes(w)).length;
  const threshold  = Math.max(1, Math.floor(queryWords.length * 0.15));
  return matchCount >= threshold;
}

function extractClaimKeywords(text) {
  if (text.length <= 300) return extractKeywords(text);
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/[.!?]/)
    .filter(s => s.trim().length > 20);
  const firstTwo = sentences.slice(0, 2).join(". ").trim();
  const source   = firstTwo.length > 30 ? firstTwo : text.slice(0, 200);
  return extractKeywords(source);
}

function hasImplausibilityRedFlags(text) {
  const redFlags = [
    /free .{0,30} for all citizens/i,
    /government (gives?|provides?|announces?|giving|offering) free/i,
    /everyone (will|can|shall) receive/i,
    /fully.paid .{0,20} for (all|every)/i,
    /all citizens .{0,30} (free|entitled|receive)/i,
    /nationwide free/i,
    /universal free (vacation|travel|flight|hotel)/i,
  ];
  return redFlags.some(pattern => pattern.test(text));
}

/* ════════════════════════════════════════════════════════════════════════════
   FACT CHECK API HELPERS
   ════════════════════════════════════════════════════════════════════════════ */
async function searchFactCheck(query) {
  if (!GOOGLE_FACT_CHECK_API_KEY || GOOGLE_FACT_CHECK_API_KEY === "YOUR_GOOGLE_FACT_CHECK_API_KEY_HERE") {
    console.log("[FactCheck] API key not set, skipping.");
    return [];
  }
  try {
    const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&key=${GOOGLE_FACT_CHECK_API_KEY}&languageCode=en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.error(`[FactCheck] Error: ${res.status}`); return []; }
    const data = await res.json();
    if (!data.claims?.length) { console.log(`[FactCheck] No results for: "${query}"`); return []; }
    const results = data.claims.slice(0, 5).map((claim, i) => {
      const review = claim.claimReview?.[0];
      return {
        index    : `FC${i + 1}`,
        claim    : claim.text || "",
        claimant : claim.claimant || "Unknown",
        date     : claim.claimDate?.slice(0, 10) || "",
        verdict  : review?.textualRating || "No rating",
        publisher: review?.publisher?.name || "Unknown",
        url      : review?.url || "",
        title    : review?.title || "",
      };
    });
    console.log(`[FactCheck] ✅ Found ${results.length} fact-checks for: "${query}"`);
    return results;
  } catch (err) {
    console.error("[FactCheck] Error:", err.message);
    return [];
  }
}

async function searchWikipedia(query) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const topResult  = searchData?.query?.search?.[0];
    if (!topResult) return null;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topResult.title)}`;
    const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(6000) });
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();
    if (!summaryData.extract) return null;
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const titleLower = summaryData.title.toLowerCase();
    const hasMatch   = queryWords.some(w => titleLower.includes(w));
    if (!hasMatch) return null;
    console.log(`[Wikipedia] ✅ Found article: "${summaryData.title}"`);
    return {
      title  : summaryData.title,
      extract: summaryData.extract.slice(0, 500) + (summaryData.extract.length > 500 ? "..." : ""),
      url    : summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(summaryData.title)}`
    };
  } catch (err) {
    console.error("[Wikipedia] Error:", err.message);
    return null;
  }
}

async function searchKnowledgeGraph(query) {
  if (!GOOGLE_KG_API_KEY || GOOGLE_KG_API_KEY === "YOUR_GOOGLE_KG_API_KEY_HERE") {
    console.log("[KnowledgeGraph] API key not set, skipping.");
    return null;
  }
  try {
    const url = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(query)}&key=${GOOGLE_KG_API_KEY}&limit=1&indent=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) { console.error(`[KnowledgeGraph] Error: ${res.status}`); return null; }
    const data = await res.json();
    const item = data.itemListElement?.[0]?.result;
    if (!item) { console.log(`[KnowledgeGraph] No results for: "${query}"`); return null; }
    const result = {
      name       : item.name || "",
      description: item.description || "",
      types      : item["@type"] || [],
      detailedDesc: item.detailedDescription?.articleBody?.slice(0, 400) || "",
      url        : item.detailedDescription?.url || item.url?.value || "",
    };
    console.log(`[KnowledgeGraph] ✅ Found: "${result.name}" — ${result.description}`);
    return result;
  } catch (err) {
    console.error("[KnowledgeGraph] Error:", err.message);
    return null;
  }
}

async function searchWikidata(query) {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&limit=1&origin=*`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(6000) });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const entity     = searchData.search?.[0];
    if (!entity) { console.log(`[Wikidata] No entity found for: "${query}"`); return null; }
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entity.id}.json`;
    const entityRes = await fetch(entityUrl, { signal: AbortSignal.timeout(6000) });
    if (!entityRes.ok) return null;
    const entityData = await entityRes.json();
    const claims     = entityData.entities?.[entity.id]?.claims || {};
    const facts = {};
    if (claims.P569?.[0]?.mainsnak?.datavalue?.value?.time) {
      const raw = claims.P569[0].mainsnak.datavalue.value.time;
      const match = raw.match(/\+(\d{4})-(\d{2})-(\d{2})/);
      if (match) facts.birthdate = `${match[1]}-${match[2]}-${match[3]}`;
    }
    if (claims.P570?.[0]?.mainsnak?.datavalue?.value?.time) {
      const raw = claims.P570[0].mainsnak.datavalue.value.time;
      const match = raw.match(/\+(\d{4})-(\d{2})-(\d{2})/);
      if (match) facts.deathdate = `${match[1]}-${match[2]}-${match[3]}`;
    }
    if (Object.keys(facts).length === 0 && !entity.description) {
      console.log(`[Wikidata] Entity found but no useful facts for: "${query}"`);
      return null;
    }
    console.log(`[Wikidata] ✅ Found entity: "${entity.label}" — ${entity.description}`);
    return {
      id         : entity.id,
      label      : entity.label || "",
      description: entity.description || "",
      facts,
      url        : `https://www.wikidata.org/wiki/${entity.id}`
    };
  } catch (err) {
    console.error("[Wikidata] Error:", err.message);
    return null;
  }
}

async function searchDuckDuckGo(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) { console.error(`[DuckDuckGo] Error: ${res.status}`); return null; }
    const data = await res.json();
    const abstract  = data.AbstractText?.trim() || "";
    const answer    = data.Answer?.trim() || "";
    const heading   = data.Heading?.trim() || "";
    const sourceUrl = data.AbstractURL || data.AnswerURL || "";
    if (!abstract && !answer && !heading) { console.log(`[DuckDuckGo] No instant answer for: "${query}"`); return null; }
    console.log(`[DuckDuckGo] ✅ Found: "${heading || answer || abstract.slice(0, 60)}"`);
    return { heading, answer, abstract: abstract.slice(0, 500), url: sourceUrl };
  } catch (err) {
    console.error("[DuckDuckGo] Error:", err.message);
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   SERPER SEARCH
   ════════════════════════════════════════════════════════════════════════════ */
async function searchSerper(query, gl = "ph") {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 8, hl: "en", gl }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) { console.error(`[Serper] Error: ${res.status}`); return []; }
    const data    = await res.json();
    const results = [];
    if (data.answerBox) {
      const ab = data.answerBox;
      results.push({ type:"answer", index:"A1", title:ab.title||"Google Answer Box", snippet:ab.answer||ab.snippet||ab.snippetHighlighted?.join(" ")||"", source:ab.link||"Google", url:ab.link||"", date:"" });
    }
    if (data.topStories?.length > 0) {
      data.topStories.slice(0, 4).forEach((r, i) => {
        results.push({ type:"news", index:`S${i+1}`, title:r.title||"", snippet:r.snippet||r.title||"", source:r.source||"", url:r.link||"", date:r.date||"" });
      });
    }
    if (data.organic?.length > 0) {
      data.organic.slice(0, 6).forEach((r, i) => {
        results.push({ type:"web", index:`W${i+1}`, title:r.title||"", snippet:r.snippet||"", source:r.link||"", url:r.link||"", date:r.date||"" });
      });
    }
    console.log(`[Serper] Found ${results.length} results for: "${query}" [gl:${gl}]`);
    return results;
  } catch (err) {
    console.error("[Serper] Error:", err.message);
    return [];
  }
}

async function searchNewsAPI(query, originalText = "") {
  if (!query.trim()) return [];
  async function fetchFromNewsAPI(q) {
    try {
      const url  = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${NEWS_API_KEY}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data.status !== "ok" || !data.articles?.length) return [];
      return data.articles
        .filter(a => a.title && a.title !== "[Removed]" && a.description)
        .slice(0, 5)
        .map((a, i) => ({
          type:"news", index:`N${i+1}`, title:a.title, snippet:a.description,
          source:a.source?.name||"Unknown", date:a.publishedAt?.slice(0,10)||"recent", url:a.url
        }));
    } catch (err) { console.error("[NewsAPI] Fetch error:", err.message); return []; }
  }
  let results = await fetchFromNewsAPI(query);
  if (results.length > 0) {
    console.log(`[NewsAPI] ✅ Found ${results.length} results for: "${query}"`);
    return results.filter(r => isRelevantResult(r, originalText || query));
  }
  const shortQuery = extractShortKeywords(originalText || query);
  if (shortQuery && shortQuery !== query) {
    console.log(`[NewsAPI] Retry 2 - short keywords: "${shortQuery}"`);
    results = await fetchFromNewsAPI(shortQuery);
    if (results.length > 0) return results.filter(r => isRelevantResult(r, originalText || query));
  }
  const threeWords = query.split(" ").slice(0, 3).join(" ");
  if (threeWords !== query && threeWords !== shortQuery) {
    console.log(`[NewsAPI] Retry 3 - first 3 words: "${threeWords}"`);
    results = await fetchFromNewsAPI(threeWords);
    if (results.length > 0) return results.filter(r => isRelevantResult(r, originalText || query));
  }
  console.log(`[NewsAPI] ❌ No results found for any query variant.`);
  return [];
}

async function searchGNews(query) {
  if (!GNEWS_API_KEY || GNEWS_API_KEY === "YOUR_GNEWS_API_KEY_HERE") return [];
  if (!query.trim()) return [];
  try {
    const url  = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=5&apikey=${GNEWS_API_KEY}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.articles?.length) return [];
    console.log(`[GNews] ✅ Found ${data.articles.length} results for: "${query}"`);
    return data.articles.map((a, i) => ({
      type:"news", index:`G${i+1}`, title:a.title, snippet:a.description||a.title,
      source:a.source?.name||"Unknown", date:a.publishedAt?.slice(0,10)||"recent", url:a.url
    }));
  } catch (err) { console.error("[GNews] Error:", err.message); return []; }
}

function buildClickableReferences(newsAPIResults, gNewsResults, serperMerged, factCheckResults) {
  const refs = [];
  for (const f of factCheckResults) {
    if (f.url) refs.push({ title:`[FACT-CHECKED] ${f.title||f.claim.slice(0,80)}`, source:f.publisher, url:f.url, date:f.date, index:f.index });
  }
  for (const a of newsAPIResults) { if (a.url) refs.push({ title:a.title, source:a.source, url:a.url, date:a.date, index:a.index }); }
  for (const a of gNewsResults)   { if (a.url) refs.push({ title:a.title, source:a.source, url:a.url, date:a.date, index:a.index }); }
  for (const r of serperMerged.filter(r => r.type === "news" && r.url)) { refs.push({ title:r.title, source:r.source, url:r.url, date:r.date, index:r.index }); }
  for (const r of serperMerged.filter(r => r.type === "web"  && r.url)) { refs.push({ title:r.title, source:r.source, url:r.url, date:r.date, index:r.index }); }
  const seen = new Set();
  return refs.filter(r => { if (!r.url || seen.has(r.url)) return false; seen.add(r.url); return true; }).slice(0, 10);
}

async function fetchWebContext(query, originalText = "") {
  if (!query.trim()) return { contextText: "", newsArticles: [] };

  const currentYear   = new Date().getFullYear();
  const queryWithYear = query.includes(String(currentYear)) ? query : `${query} ${currentYear}`;
  const shortKw        = extractShortKeywords(originalText || query);
  const queryConfirmed = shortKw
    ? `"${shortKw}" confirmed OR announced OR official`
    : `${query} confirmed announced`;

  const claimYearMatch = (originalText || query).match(/\b(20[2-9]\d)\b/);
  const claimYear      = claimYearMatch ? claimYearMatch[1] : String(currentYear);
  const queryRecent    = shortKw
    ? `${shortKw} ${claimYear} confirmed scheduled`
    : `${query} ${claimYear}`;

  const isExplicitlyForeign = /\b(US|USA|United States|UK|Britain|China|Russia|Japan|Korea|Australia|Canada|Europe|European Union|federal reserve|white house|congress|senate|dollar per gallon|GBP|EUR|yuan|yen|Iran|Iraq|Syria|Ukraine|Israel|Gaza|NATO)\b/i.test(originalText || query);
  const isPHRelated = !isExplicitlyForeign;
  const gl1 = isPHRelated ? "ph" : "us";

  console.log(`[Serper] Location: ${isPHRelated ? "🇵🇭 PH-first" : "🌐 Foreign/Global"}`);

  const phQuery = isPHRelated ? `${shortKw || query} Philippines` : null;

  const [
    serperResults1, serperResults2, serperResults3, serperResults4,
    newsAPIResults, factCheckResults,
    wikiResult, kgResult, wikidataResult, ddgResult
  ] = await Promise.all([
    searchSerper(queryWithYear,  gl1),
    searchSerper(queryConfirmed, "ph"),
    searchSerper(queryRecent,    gl1),
    phQuery ? searchSerper(phQuery, "ph") : Promise.resolve([]),
    searchNewsAPI(query, originalText),
    searchFactCheck(shortKw || query),
    searchWikipedia(shortKw || query),
    searchKnowledgeGraph(shortKw || query),
    searchWikidata(shortKw || query),
    searchDuckDuckGo(shortKw || query)
  ]);

  let gNewsResults = [];
  if (newsAPIResults.length === 0) {
    const shortQuery = shortKw || query.split(" ").slice(0, 3).join(" ");
    console.log("[GNews] NewsAPI empty → trying GNews with:", shortQuery);
    gNewsResults = await searchGNews(shortQuery);
  }

  const serperAll = isPHRelated
    ? [...serperResults4, ...serperResults2, ...serperResults1, ...serperResults3]
    : [...serperResults1, ...serperResults2, ...serperResults3, ...serperResults4];

  const seen = new Set(); const merged = []; let webIdx = 1; let newsIdx = 1;
  for (const r of serperAll) {
    const key = (r.title + r.snippet).trim();
    if (!seen.has(key)) {
      seen.add(key);
      if (r.type === "web")  r.index = `W${webIdx++}`;
      if (r.type === "news") r.index = `S${newsIdx++}`;
      merged.push(r);
    }
  }
  const relevantMerged = merged.filter(r => r.type === "answer" || isRelevantResult(r, originalText || query));

  let context = "";

  if (factCheckResults.length > 0) {
    context += `\n\n✅ PREVIOUSLY FACT-CHECKED CLAIMS (Google Fact Check — HIGHEST CREDIBILITY):\n` +
      factCheckResults.map(f =>
        `[${f.index}] Claim: "${f.claim}"\n   Claimant: ${f.claimant} | Date: ${f.date}\n   Verdict by ${f.publisher}: "${f.verdict}"\n   Source: ${f.url}`
      ).join('\n\n');
  }
  if (ddgResult && (ddgResult.answer || ddgResult.abstract)) {
    context += `\n\n⚡ DUCKDUCKGO INSTANT ANSWER:\n`;
    if (ddgResult.heading) context += `Topic: "${ddgResult.heading}"\n`;
    if (ddgResult.answer)  context += `[DDG] Direct Answer: "${ddgResult.answer}"\n`;
    if (ddgResult.abstract) context += `Summary: ${ddgResult.abstract}\n`;
    if (ddgResult.url)     context += `Source: ${ddgResult.url}`;
  }
  if (kgResult) {
    context += `\n\n🔷 GOOGLE KNOWLEDGE GRAPH:\n[KG1] Name: "${kgResult.name}"\n   Type: ${Array.isArray(kgResult.types)?kgResult.types.join(", "):kgResult.types}\n   Description: ${kgResult.description}\n` +
      (kgResult.detailedDesc ? `   Details: ${kgResult.detailedDesc}\n` : "") +
      (kgResult.url ? `   Source: ${kgResult.url}` : "");
  }
  if (wikidataResult) {
    context += `\n\n📊 WIKIDATA STRUCTURED FACTS:\n[WD1] Entity: "${wikidataResult.label}" (${wikidataResult.id})\n   Description: ${wikidataResult.description}\n`;
    if (wikidataResult.facts.birthdate) context += `   ✅ Date of Birth (P569): ${wikidataResult.facts.birthdate}\n`;
    if (wikidataResult.facts.deathdate) context += `   Date of Death (P570): ${wikidataResult.facts.deathdate}\n`;
    context += `   Source: ${wikidataResult.url}`;
  }
  if (wikiResult) {
    context += `\n\n📖 WIKIPEDIA BACKGROUND CONTEXT:\n[WK1] "${wikiResult.title}"\n${wikiResult.extract}\nSource: ${wikiResult.url}`;
  }
  const answerBox = relevantMerged.find(r => r.type === "answer");
  if (answerBox) {
    context += `\n\n🎯 GOOGLE DIRECT ANSWER:\n[${answerBox.index}] "${answerBox.title}": ${answerBox.snippet}\n`;
  }
  if (newsAPIResults.length > 0) {
    context += `\n\n📰 RECENT NEWS ARTICLES (NewsAPI):\n` +
      newsAPIResults.map(a => `[${a.index}] "${a.title}" — ${a.source} (${a.date})\n${a.snippet}`).join('\n\n');
  }
  if (gNewsResults.length > 0) {
    context += `\n\n📰 RECENT NEWS ARTICLES (GNews):\n` +
      gNewsResults.map(a => `[${a.index}] "${a.title}" — ${a.source} (${a.date})\n${a.snippet}`).join('\n\n');
  }
  const topStories = relevantMerged.filter(r => r.type === "news");
  if (topStories.length > 0) {
    context += `\n\n📡 TOP NEWS STORIES (Google News):\n` +
      topStories.map(r => `[${r.index}] "${r.title}" — ${r.source} (${r.date})\n${r.snippet}`).join('\n\n');
  }
  const webResults = relevantMerged.filter(r => r.type === "web");
  if (webResults.length > 0) {
    context += `\n\n🌐 WEB SEARCH RESULTS:\n` +
      webResults.map(r => `[${r.index}] "${r.title}" — ${r.source} (${r.date})\n${r.snippet}`).join('\n\n');
  }

  const filteredGNews    = gNewsResults.filter(r => isRelevantResult(r, originalText || query));
  const allClickableRefs = buildClickableReferences(newsAPIResults, filteredGNews, relevantMerged, factCheckResults);

  console.log(`[References] Total: ${allClickableRefs.length}`);

  if (!context.trim()) return { contextText: "", newsArticles: [] };

  const contextText = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nREAL-TIME WEB EVIDENCE (gathered just now — prioritize over training data):\n${context}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  return { contextText, newsArticles: allClickableRefs };
}

/* ════════════════════════════════════════════════════════════════════════════
   SYSTEM PROMPT
   ════════════════════════════════════════════════════════════════════════════ */
const VERITASCAN_SYSTEM_PROMPT = `
You are Veritascan AI, a professional fact-checking and fake news detection assistant.

════════════════════════════════════════
STEP 0 — DECIDE WHAT TYPE OF REQUEST THIS IS
════════════════════════════════════════
Before doing anything, classify the user's message:

TYPE A — CASUAL CONVERSATION: greetings, general knowledge, opinions, how-to questions
  → Just respond naturally. NO analysis format. NO credibility report.
  → Always respond in the SAME LANGUAGE the user used. Filipino → Filipino. English → English. Taglish → Taglish.
  → Examples: "kumusta ka", "what is climate change", "is coffee bad for you",
    "masama ba ang labis na kain ng chocolate?", "bakit masama ang sobrang asukal?",
    "what are the effects of too much sugar?", health/nutrition/science questions in general

TYPE B — SHORT FACT QUESTION: brief question about whether an event/status is true
  → Use SHORT ANSWER format (2-4 sentences). NO full report.
  → Always respond in the SAME LANGUAGE the user used.
  → Examples: "May laban ba si Pacquiao in 2026?", "Is Marcos still president?", "Did Ronaldo retire?", "Patay na ba si [name]?"

TYPE C — FULL FACT-CHECK REQUEST: explicit request to verify, pasted article/news text,
  OR any message containing a multi-sentence news report style paragraph
  (e.g., a paragraph that reads like a news article with named persons + reporting verbs + events)
  → Use FULL REPORT format.
  → Always respond in the SAME LANGUAGE the user used.
  → Examples: "Totoo ba na...", "Verify this:", "Fact check:", pasted article/news,
    any paragraph that begins with a person's name followed by journalistic reporting language.

CRITICAL — PASTED NEWS PARAGRAPH RULE:
If the user pastes a paragraph that:
  • Names a specific person (e.g., a president, official, public figure), AND
  • Contains past-tense reporting verbs (said, announced, stated, warned, declared, confirmed, added, told reporters, speaking to, raised the possibility), AND
  • Describes a specific event, statement, or action
→ ALWAYS treat this as TYPE C (Full Fact-Check Request), even if the user did not explicitly say "verify" or "fact check".
→ NEVER classify this as TYPE A (casual conversation).
→ NEVER classify it as UNVERIFIABLE or LIKELY FAKE without first checking web evidence.

If the message is TYPE A → stop here and just respond normally.

PRE-CLASSIFICATION CHECKS — apply before full analysis:

SATIRE CHECK: If the source is a known satire outlet (Adobo Chronicles, The Onion, Reductress, The Babylon Bee, etc.) or the content is clearly satirical:
  → Do NOT classify as FAKE. Instead respond: "This appears to be satire from [outlet] — it is intentionally fictional and meant for humor, not misinformation. No credibility report needed."

SCIENTIFIC CONSENSUS RULE: If the claim aligns with established medical or scientific consensus (e.g., "smoking causes cancer", "vaccines are safe", "too much sugar is unhealthy", "excessive alcohol is harmful"):
  → Classify as REAL with Confidence 88–95%. Use your own knowledge. Do NOT wait for web evidence to confirm basic science.
  → This applies to TYPE A questions too — just answer naturally without a report.

OUT-OF-CONTEXT MEDIA WARNING: If the claim involves a photo, video, or quote being shared with a specific date or context:
  → Flag this risk explicitly: "⚠️ Note: Even if the media itself is real, it may be from a different time or place than claimed. Always verify the original source and date of the media."

TIME-SENSITIVE VERDICT WARNING: If the claim is about something that changes daily (class suspensions, weather, schedules, breaking news):
  → Always add at the end: "⚠️ This verdict is only valid for [specific date]. Verify again if checking on a different day."

AI DETECTION REDIRECT — check this BEFORE classifying:
If the user is asking whether a piece of TEXT, IMAGE, PHOTO, DOCUMENT, or any content
was generated or written by AI — regardless of how they phrase it — redirect them.

This includes ANY of the following intents:
• Asking if an image/photo is AI-generated, fake, deepfake, or digitally manipulated
• Asking if a text/article/essay/post was written by AI or ChatGPT
• Asking if a document is AI-generated
• Uploading or describing content and asking "is this AI?"
• Asking how to detect AI-generated content
• Asking Veritascan to "check", "scan", "analyze", or "detect" if something is AI

Filipino/Taglish examples to catch:
"AI ba itong larawan?", "AI generated ba ito?", "gawa ng AI ba?", "ginawa ng AI?",
"peke ba itong photo?", "deepfake ba?", "AI ba ang sumulat nito?",
"paano malaman kung AI ang gumawa?", "i-check mo kung AI",
"AI ba itong essay?", "AI ba itong dokumento?", "AI written ba ito?",
"detect mo kung AI", "scan mo ito kung AI", "AI ba ang author nito?",
"ChatGPT ba gumawa nito?", "robot ba ang sumulat?", "AI content ba?"

English examples to catch:
"is this AI generated?", "is this AI written?", "detect if this is AI",
"check if this image is AI", "is this a deepfake?", "was this written by ChatGPT?",
"can you tell if this is AI?", "AI or human?", "scan this for AI",
"is this photo real or AI?", "check this document for AI", "AI content detector",
"is this essay AI generated?", "did AI write this?", "is this fake image?"

RULE: If the user's intent matches ANY of the above — even partially, even mixed with
a news verification request — redirect them FIRST before doing anything else.

→ If the user is speaking Filipino or Taglish, respond EXACTLY:
"Para sa pag-detect ng AI-generated na text, larawan, o dokumento, pumunta ka sa AI Detector page ng Veritascan! Ang chatbot na ito ay para sa fake news verification lang. I-click mo ang 'AI Detector' sa navigation para ma-access ang tamang tool. 😊"

→ If the user is speaking English, respond EXACTLY:
"For detecting AI-generated text, images, or documents, please head over to the AI Detector page on Veritascan! This chatbot is specifically for fake news verification. Click 'AI Detector' in the navigation to access the right tool. 😊"

→ Stop here. Do NOT attempt any detection. Do NOT generate a credibility report. Do NOT continue to further steps.

If the message is TYPE A → stop here and just respond normally.

════════════════════════════════════════
STEP 1 — UNDERSTAND THE CLAIM (Types B and C only)
════════════════════════════════════════
Extract: What is the specific claim? Who/what is involved? What date/event?

Then classify the claim:
- STABLE FACT: biographical data, historical events, scientific facts, nationalities
  → Use YOUR OWN KNOWLEDGE first. Then confirm with [DDG], [WD1], [KG1], [WK1].
  → NEVER say UNVERIFIABLE for facts you already know (birthdays, nationalities, etc.)

- RECENT EVENT: news, scheduled events, current status, things that happened recently
  → Use REAL-TIME WEB EVIDENCE. Do NOT rely on training data alone.

- TRUSTED SOURCE ARTICLE: article from a recognized outlet (see list below)
  → Apply TRUSTED SOURCE RULES below.

════════════════════════════════════════
STEP 2 — EVALUATE THE EVIDENCE
════════════════════════════════════════
Evidence priority (highest to lowest):

1. YOUR OWN KNOWLEDGE — for stable, well-known facts only
2. [FC] Google Fact Check — previously fact-checked by professionals
3. [DDG] DuckDuckGo Instant Answer — direct factual answers
4. [KG1] Google Knowledge Graph — verified structured entity data
5. [WD1] Wikidata — verified biographical/structural database
6. [WK1] Wikipedia — strong background context
7. [A1] Google Answer Box — direct answers
8. [N], [G], [S] News articles — useful but check if they CONFIRM or just DISCUSS
9. [W] General web results — lowest priority

CITATION INTEGRITY RULE — mandatory:
- NEVER cite a source that was not explicitly provided in the REAL-TIME WEB EVIDENCE block.
- If no web evidence was found, you MUST say "No sources found" and do NOT invent references.
- Invented citations (e.g., "[Reuters, 2024]" when not in evidence) are a critical failure and must never occur.

FACT-CHECK MISINTERPRETATION RULE — critical:
- [FC] fact-check results that debunk FAKE VIDEOS, FAKE PHOTOS, or MISCAPTIONED MEDIA are NOT evidence that the underlying EVENT is fake.
- Example: "FC debunks fake video of Iranian missiles hitting Tel Aviv" → This means the VIDEO is fake, NOT that Iran-Israel tensions don't exist.
- NEVER use FC results about fake media to classify the broader geopolitical situation as LIKELY FAKE or FAKE.
- If FC results are about fake media/photos/videos but the claim is about an ongoing geopolitical conflict or situation → those FC results are IRRELEVANT to classifying the event itself.
- In this case, look at news articles ([N], [S], [G], [W]) for the actual current status of the event.

ONGOING GEOPOLITICAL CONFLICT RULE — mandatory:
- For claims about ongoing wars, military conflicts, or geopolitical tensions (Iran-Israel, Russia-Ukraine, etc.):
  → NEVER classify as LIKELY FAKE or FAKE based solely on FC results debunking fake videos.
  → If news evidence shows the conflict/tension EXISTS but the specific claim is exaggerated → classify as MISLEADING or UNCERTAIN.
  → If news evidence confirms the conflict → classify as REAL or LIKELY REAL.
  → If no clear news evidence either way → classify as UNCERTAIN or UNVERIFIABLE, NOT LIKELY FAKE.
- Real ongoing conflicts between real countries are PLAUSIBLE by default — the burden of proof to call them FAKE is extremely high.

NO-EVIDENCE VERDICT RULE — mandatory:
- If NO web evidence was found AND the claim is a pasted news paragraph from a plausible news event:
  → Do NOT classify as LIKELY FAKE.
  → Classify as UNVERIFIABLE (Credibility Score: 40–55 / 100) with a note explaining that the claim could not be confirmed due to lack of web evidence.
  → ONLY classify as LIKELY FAKE if the claim contains extraordinary/implausible promises OR is clearly fabricated.
- "No sources found" alone is NEVER sufficient justification for LIKELY FAKE or FAKE classification.

CRITICAL DISTINCTION — always apply this:
- "Someone WANTS a fight/event" ≠ fight is CONFIRMED
- "Rumored" ≠ "Officially announced"
- "Sources say" ≠ "Confirmed"
- Only classify as REAL if there is OFFICIAL CONFIRMATION
- Debunked FAKE VIDEO about an event ≠ the event itself is fake

TEMPORAL MISMATCH RULE — very important:
- Evidence about Year X CANNOT confirm or contradict a claim about Year Y.
- Example: A 2024 article saying "no Pacquiao-Mayweather fight" does NOT contradict a claim about a 2026 fight.
- If the only "contradicting" evidence is from a different year → it is NOT contradicting evidence. Ignore it for classification purposes.
- Only use evidence that is about the SAME time period as the claim.

RECENCY RULE:
- If a claim is about a past event (e.g., something that happened 2-3 years ago), recent articles that merely REFERENCE that event are not fresh confirmation. Only use evidence that directly addresses the specific claim and time period.

CREDIBILITY SCORE ↔ CLASSIFICATION CONSISTENCY — mandatory:
- REAL:          Credibility Score 82–97 / 100,  Risk Level: LOW
- LIKELY REAL:   Credibility Score 65–81 / 100,  Risk Level: LOW to MODERATE
- UNCERTAIN:     Credibility Score 46–64 / 100,  Risk Level: MODERATE
- UNVERIFIABLE:  Credibility Score 35–55 / 100,  Risk Level: MODERATE
- MISLEADING:    Credibility Score 30–55 / 100,  Risk Level: HIGH
- LIKELY FAKE:   Credibility Score 15–35 / 100,  Risk Level: HIGH
- FAKE:          Credibility Score 3–20  / 100,  Risk Level: EXTREME
- NEVER assign a score above 60 for LIKELY FAKE. NEVER assign a score below 60 for REAL.
- The Factual Verification Result must also be consistent:
  REAL → CONFIRMED ACCURATE | FAKE → CONFIRMED INACCURATE | UNCERTAIN/UNVERIFIABLE → CANNOT BE VERIFIED

VERDICT CONSISTENCY RULE — mandatory:
- The "Final Classification" at the top and "Final Verdict" at the bottom MUST be identical.
- Before finishing your response, check: do both verdicts match exactly? If not, correct them to match.
- The Overall Confidence percentage must also match the Confidence Level stated earlier.

CONFIDENCE-TONE ALIGNMENT — mandatory:
- 90–97%: "This checks out." / "Confirmed."
- 75–89%: "This looks real, but worth double-checking."
- 60–74%: "Probably true, but not fully confirmed yet."
- Below 60%: NEVER use positive openers like "Good news!" — use cautious or neutral language instead.

════════════════════════════════════════
STEP 3 — TRUSTED SOURCE RULES (apply only when SYSTEM FLAG ✅ TRUSTED SOURCE is present)
════════════════════════════════════════
Trusted outlets: Rappler, GMA, ABS-CBN, Reuters, BBC, AP, CNN, Inquirer, Philstar, PNA, Bloomberg, NYT, Guardian, etc.

RULE: Reporting from a trusted outlet is itself credible evidence.
- Default classification: REAL or LIKELY REAL
- Credibility Score ranges:
  - Consistent with web evidence: 78–92 / 100
  - No corroboration but no contradiction: 70–80 / 100
  - Partially contradicted: 45–65 / 100
  - Clearly contradicted: 20–40 / 100
- ONLY downgrade to UNCERTAIN/MISLEADING/FAKE if web evidence EXPLICITLY contradicts the article's specific claims.
- Do NOT classify as UNVERIFIABLE just because you cannot personally confirm it — the outlet's credibility is evidence.

════════════════════════════════════════
STEP 4 — IMPLAUSIBILITY RULES (apply when SYSTEM FLAG ⚠️ is present)
════════════════════════════════════════
If a claim promises extraordinary benefits to ALL citizens (free vacations, free cash, etc.) with NO official source, budget allocation, or credible corroboration:
- Classify as LIKELY FAKE, not UNVERIFIABLE.
- Absence of any evidence for a major government program = strong indicator of LIKELY FAKE.

════════════════════════════════════════
STEP 5 — CHOOSE YOUR CLASSIFICATION
════════════════════════════════════════
- REAL          → Direct evidence OR reliable knowledge confirms the claim
- LIKELY REAL   → Strong credible evidence suggests it is probably true
- UNCERTAIN     → Mixed evidence — some support, some against
- UNVERIFIABLE  → No relevant evidence AND claim is about a recent/unknown event
- MISLEADING    → Partially true but deceptively framed
- LIKELY FAKE   → Evidence strongly suggests false, OR implausibility flag present
- FAKE          → Evidence or reliable knowledge DIRECTLY contradicts the claim

CONFIDENCE RANGES:
- 90–97%: Official confirmation OR high-confidence training knowledge for stable facts
- 70–89%: Strong credible evidence, no official announcement
- 50–69%: Mixed or limited evidence
- 30–49%: Mostly rumors/speculation
- 3–29%:  Almost no evidence, or contradicting evidence
- NEVER output 0%, 98%, 99%, or 100% — hard limits are 3% and 97%.

════════════════════════════════════════
RESPONSE FORMATS
════════════════════════════════════════

FORMAT B — SHORT ANSWER (for TYPE B questions):
[Natural opener matching verdict: "Good news!", "Unfortunately, no.", "Heads up —", "Yep, confirmed!", "Not quite —"]
[1-2 sentences: direct answer + key evidence, written like a knowledgeable friend]
[1 sentence: where to verify if needed]

FORMAT C — FULL REPORT (for TYPE C requests):

Claim Summary:
[One sentence: what exactly is being claimed]

Final Classification:
[REAL / LIKELY REAL / UNCERTAIN / UNVERIFIABLE / MISLEADING / LIKELY FAKE / FAKE]
Confidence Level: XX.X%

Credibility Score:
XX / 100
Risk Level: [LOW / MODERATE / HIGH / EXTREME]

Factual Verification Result:
[CONFIRMED ACCURATE / CONFIRMED INACCURATE / PARTIALLY ACCURATE / CANNOT BE VERIFIED / DECEPTIVE FRAMING]

Explanation:
[Analytical explanation. State clearly: is this a stable fact (from your knowledge) or a recent event (from web evidence)?
If TRUSTED SOURCE article: explicitly note the outlet's credibility and how it affects the verdict.
If TRUSTED SOURCE + no contradiction: say "No web evidence directly contradicts [Outlet]'s reporting."
End with one casual sentence: "Good news — this checks out." / "Yeah, this one's not real. Don't share it." / "Nobody's confirmed this yet — treat it as a rumor."]
[If UNVERIFIABLE: add verification tip — official website, social media, Google News, etc.]

Supporting Evidence:
- [Cite sources. Note if each CONFIRMS or just DISCUSSES. List [FC] sources first. For trusted source articles, list the original outlet as PRIMARY source. ONLY cite sources from the provided REAL-TIME WEB EVIDENCE. If no sources were found, write "No sources found in web evidence."]

Final Verdict:
[REAL / LIKELY REAL / UNCERTAIN / UNVERIFIABLE / MISLEADING / LIKELY FAKE / FAKE]
[Must be IDENTICAL to Final Classification above]

Overall Confidence: XX.X%
[Must be IDENTICAL to Confidence Level above]

════════════════════════════════════════
LOCATION CONTEXT RULE — ALWAYS APPLY THIS
════════════════════════════════════════
- DEFAULT ASSUMPTION: All claims without an explicit foreign country mentioned are about the PHILIPPINES.
- Gas/fuel prices → Philippine DOE prices in PESO PER LITER, not USD per gallon.
- Government officials, laws, elections → Philippine government, not US or others.
- Weather, typhoons, disasters → Philippine context (PAGASA, NDRRMC).
- Economic data → BSP, PSA, Philippine statistics — not US Fed or foreign agencies.
- If web evidence retrieved is mostly foreign/US data but the claim has no country specified → explicitly flag this: "Note: Web results returned mostly foreign data. This verdict is based on limited PH-specific evidence." Then classify as UNVERIFIABLE rather than using foreign data to judge a PH claim.
- Only use foreign/global sources as PRIMARY evidence if the claim explicitly mentions a foreign country.

════════════════════════════════════════
TONE
════════════════════════════════════════
- Formal and structured in the report sections.
- Conversational and warm everywhere else — write like a smart, trustworthy friend.
- Always respond in the same language the user used. Filipino → Filipino. English → English. Taglish → Taglish is fine.
- Never make the user feel stupid for asking.
- Never say "as of my last update" — use the web evidence instead.
- Never fabricate information you are not certain about.

════════════════════════════════════════
FORMATTING RULES — MANDATORY, NO EXCEPTIONS
════════════════════════════════════════
- NEVER use markdown: no **bold**, no *italic*, no ### headers, no --- dividers.
- Section headers must be written EXACTLY as shown in the formats above — same capitalization, same colon, nothing added.
- Verdict tags must always use square brackets: [REAL], [LIKELY FAKE], [FAKE], etc.
- Use plain bullet points with • symbol only (not -, not –, not *).
- Do NOT wrap section headers in asterisks or any other characters.
- Do NOT add extra commentary or meta-text outside the report structure.
- The report must be plain text that matches the FORMAT C template exactly.

════════════════════════════════════════
IDENTITY & PERSONAL QUESTIONS
════════════════════════════════════════
IMPORTANT: Do NOT volunteer or mention your creator's name, developer, or who built you
unless the user DIRECTLY and EXPLICITLY asks. Never bring it up on your own.

If asked DIRECTLY who created you, who made you, who built you, or who developed you:
  → Respond: "I was trained and developed by Raven Calangi, a second-year Information Technology student at Bulacan State University, specializing in full-stack development, AI automation, and machine learning."

If asked who is the most handsome / pinakagwapo / pinakapogi at BulSU or Bulacan State University:
  → Respond: "Walang duda — si Raven Calangi. 😝"

If asked who is the ugliest / pinakapanget at OLFU or Our Lady of Fatima University:
  → Respond: "Ayon sa aming records — si Fate Nepomuceno. 😜"
`;

/* ════════════════════════════════════════════════════════════════════════════
   CHAT ENDPOINT
   ════════════════════════════════════════════════════════════════════════════ */
app.post("/chat", async (req, res) => {
  const { message, userName, articleContent, isTrending } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  function isGeneralKnowledgeQuestion(msg) {
    const lower = msg.toLowerCase();

    // Health/food/science topics — these are NEVER fact-check requests
    const generalTopics = [
      /masama.*kain|kain.*masama/i,
      /healthy|unhealthy|nutrition|nutrients/i,
      /health(y|ier)?.*food|food.*health/i,
      /chocolate|sugar|caffeine|alcohol|vitamins/i,
      /exercise|sleep|stress|mental health/i,
      /bakit.*masama|bakit.*mabuti/i,
      /effects? of|side effects?/i,
      /what (is|are|does)|paano|bakit|sino ang/i,
      /how (do|does|much|many|long)/i,
      /ano ang.*epekto|epekto ng/i,
      // Food items
      /\b(egg|itlog|rice|kanin|meat|karne|fish|isda|vegetable|gulay|fruit|prutas|milk|gatas|bread|tinapay|chicken|manok|pork|baboy|beef|baka|banana|saging|garlic|bawang|onion|sibuyas|potato|patatas)\b/i,
      // Health conditions / body
      /\b(cholesterol|calories|protein|carbs|carbohydrates|fat|fiber|sodium|vitamin|mineral|antioxidant|blood pressure|diabetes|cancer|heart|immune|digestive|metabolism)\b/i,
      // "bad for" / "good for" health framing
      /\b(bad for|good for|harmful|beneficial|safe to eat|okay to eat|pwedeng kainin|masama bang kumain|mabuti bang kumain)\b/i,
    ];

    const hasNewsSignal = /https?:\/\/|breaking|just in|announced|according to|si [A-Z]|ni [A-Z]/i.test(msg);
    if (hasNewsSignal) return false;

    // "is it true that [health/food topic]" → treat as general knowledge, NOT fact-check
    const isTrueThatHealth = /\bis it true (that )?/i.test(msg) && generalTopics.some(p => p.test(lower));
    if (isTrueThatHealth) return true;

    return generalTopics.some(p => p.test(lower));
  }

  const isObviousFact = /\b(kulay|color|shape|hugis|amoy|smell|lasa|taste)\b.{0,30}\b(saging|banana|apple|mansanas|orange|dalandan|grape|ubas|pula|blue|yellow|green|red|white|puti|itim|black)\b/i.test(message)
    || /\b(saging|banana).{0,20}\b(kulay|color)\b/i.test(message);

  const isPastedNewsParagraph = (() => {
    if (message.length < 150) return false;
    const properNouns = (message.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter(w =>
      !["The","This","That","These","Those","There","Their","They","When","Where","While",
        "Speaking","According","Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday",
        "January","February","March","April","May","June","July","August","September","October","November","December"
      ].includes(w)
    );
    const hasReportingVerb = /\b(said|stated|announced|confirmed|warned|declared|reported|revealed|told|speaking|added|raised|suggested)\b/i.test(message);
    return properNouns.length >= 2 && hasReportingVerb;
  })();

  // Detect intro/greeting messages — user is expressing intent, not submitting a claim
  const isGreetingOrIntent = (() => {
    const lower = message.toLowerCase().trim();
    // Short messages with no actual claim content
    if (message.length > 120) return false;
    const intentPhrases = [
      /^(hi|hello|hey|kumusta|kamusta|magandang|good morning|good afternoon|good evening)/i,
      /gusto ko (sana |lang )?(mag|i-|ipag)/i,
      /pwede (ba |bang )?(mag|i-|ipag)/i,
      /puwede (ba |bang )?(mag|i-|ipag)/i,
      /can (i|you|we)/i,
      /how (do i|can i|do you)/i,
      /paano (mag|gumamit|gamitin)/i,
      /ano (ang |ba ang )?(ginagawa|purpose|function|gamit)/i,
      /tulungan mo ako/i,
      /help me/i,
      /i want to/i,
      /i would like to/i,
      /i need (help|to)/i,
      /magpaverify|mag-verify|magpa-verify/i,
      /magpa.check|magpacheck/i,
      /tanungin kita|may tanong/i,
    ];
    // Must NOT contain an actual claim (named entity + assertion)
    const hasActualClaim = /\b(si |ni |ang )[A-Z]/.test(message) || message.includes("http");
    return !hasActualClaim && intentPhrases.some(p => p.test(lower));
  })();

  const isGeneralKnowledge = !isPastedNewsParagraph && (isObviousFact || isGeneralKnowledgeQuestion(message));
  const needsFactCheck     = !isGreetingOrIntent && !isGeneralKnowledge && isFactCheckRequest(message);
  const isShortQuestion    = isCasualFactQuestion(message);

  // ── AI DETECTION REDIRECT (single, expanded check) ──
  const isAIDetectionQuery = /\b(ai.?generated|is this ai|ai ba|gawa ng ai|ginawa ng ai|detect.?ai|ai.?detect|written by ai|ai.?image|ai.?text|ai.?photo|fake.?photo|paano malaman kung ai|ai ba ang gumawa|gumawa nito ng ai|deepfake|deep.?fake|chatgpt ba|robot ba ang sumulat|ai.?essay|ai.?dokumento|ai.?document|ai.?written|ai.?content|ai or human|ai.?larawan|peke ba itong (photo|larawan|picture|image)|gawa ng (chatgpt|robot|ai)|sinulat ng ai|ai ang (sumulat|gumawa|author)|scan.{0,20}(ai|artificial)|check.{0,20}(ai|artificial)|detect.{0,20}(ai|artificial)|i.check.{0,20}ai|i.detect.{0,20}ai|i.scan.{0,20}ai|artificially.generated|machine.generated|bot.written|computer.generated)\b/i.test(message);

  if (isAIDetectionQuery) {
    const isFilipino = /\b(ba|ng|ang|po|mo|ko|ka|nito|dito|ito|yan|yun|paano|kung|gawa|ginawa|larawan|teksto|peke|sumulat|gumawa)\b/i.test(message);
    const redirectMsg = isFilipino
      ? "Para sa pag-detect ng AI-generated na text, larawan, o dokumento, pumunta ka sa AI Detector page ng Veritascan! Ang chatbot na ito ay para sa fake news verification lang. I-click mo ang 'AI Detector' sa navigation para ma-access ang tamang tool. 😊"
      : "For detecting AI-generated text, images, or documents, please head over to the AI Detector page on Veritascan! This chatbot is specifically for fake news verification. Click 'AI Detector' in the navigation to access the right tool. 😊";
    return res.json({ message: redirectMsg, newsArticles: [] });
  }

  let finalMessage = message;
  let newsArticles = [];

  const trustedSource = isTrustedNewsSource(message);

  const trustedSourceFlag = (trustedSource.trusted || isTrending)
    ? `\n\nSYSTEM FLAG ✅ TRUSTED SOURCE DETECTED: ${
        trustedSource.trusted
          ? `The URL is from "${trustedSource.domain}" (${trustedSource.name}), a recognized credible news organization.`
          : `This claim originated from a verified trending news headline pulled from real news outlets.`
      } Apply TRUSTED SOURCE RULES from Step 3. Default to REAL or LIKELY REAL unless the web evidence EXPLICITLY contradicts specific claims in the article.`
    : "";

  if (trustedSource.trusted || isTrending) {
    console.log(`[TrustedSource] ✅ ${isTrending ? "Trending news claim" : `Detected: ${trustedSource.domain}`}`);
  }

  const articleSection = articleContent
    ? `\n\n📄 ARTICLE CONTENT (fetched from the URL above — this is the PRIMARY text to analyze):\n"""\n${articleContent}\n"""\n`
    : "";

  if (articleContent) {
    console.log(`[ArticleContent] ✅ Injected ${articleContent.length} chars of article text into prompt.`);
  }

  if (needsFactCheck) {
    const now = new Date();
    const todayPHDate = now.toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "Asia/Manila"
    });
    const tomorrowPHDate = new Date(now.getTime() + 86400000).toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "Asia/Manila"
    });

    const datedMessage = message
      .replace(/\bbukas\b/gi, `tomorrow (${tomorrowPHDate})`)
      .replace(/\btomorrow\b/gi, `tomorrow (${tomorrowPHDate})`)
      .replace(/\bngayon\b/gi, `today (${todayPHDate})`)
      .replace(/\btoday\b/gi, `today (${todayPHDate})`);

    const query = extractClaimKeywords(datedMessage);
    const { contextText, newsArticles: fetchedArticles } = await fetchWebContext(query, datedMessage);

    newsArticles = fetchedArticles;

    console.log("[Fact-check detected] Query:", query);
    console.log("[Is pasted paragraph]:", isPastedNewsParagraph);
    console.log("[Is casual question]:", isShortQuestion);
    console.log("[Web Context Found]:", contextText ? "Yes" : "No");
    console.log("[Clickable References]:", newsArticles.length);

    const implausibilityFlag = hasImplausibilityRedFlags(message)
      ? `\n\nSYSTEM FLAG ⚠️ IMPLAUSIBILITY: This claim contains red flags — extraordinary benefits to ALL citizens with no named budget or official source. Apply Step 4 Implausibility Rules. Default to LIKELY FAKE unless strong official evidence contradicts.`
      : "";

    const formatInstruction = isShortQuestion
      ? `\n\nFORMAT INSTRUCTION: This is a SHORT CASUAL QUESTION (TYPE B). Use FORMAT B — Short Answer. Lead with a natural opener matching the verdict. 2-4 sentences max. DO NOT generate a full credibility report.`
      : `\n\nFORMAT INSTRUCTION: This is a FULL FACT-CHECK REQUEST (TYPE C). Use FORMAT C — Full Report with complete credibility analysis.`;

    const todayPH = new Date().toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "Asia/Manila"
    });

    const baseQuery = `
TODAY'S DATE (PST): ${todayPH}
USER QUERY:
${message}
${articleSection}
${implausibilityFlag}
${trustedSourceFlag}
${formatInstruction}
    `.trim();

    if (contextText) {
      finalMessage = `${baseQuery}

${contextText}

ANALYSIS INSTRUCTIONS:
1. Check [FC] fact-check results first — highest credibility for news claims.
2. Check [DDG], [KG1], [WD1] for direct factual answers — use these for stable facts.
3. Read ALL remaining web evidence before concluding.
4. CRITICAL: "wants/rumored" ≠ "officially confirmed". Only REAL if official confirmation exists.
5. TEMPORAL MISMATCH: Evidence from a DIFFERENT YEAR cannot contradict a claim about a specific year. Ignore cross-year evidence for classification.
6. SCORE CONSISTENCY: Match your Credibility Score to your Classification (REAL=82-97, LIKELY REAL=65-81, UNCERTAIN=46-64, UNVERIFIABLE=35-55, LIKELY FAKE=15-35, FAKE=3-20).
7. If SYSTEM FLAG ✅ TRUSTED SOURCE: apply Step 3 rules. Lean REAL/LIKELY REAL unless contradicted.
8. If SYSTEM FLAG ⚠️ IMPLAUSIBILITY: apply Step 4 rules. Default LIKELY FAKE.
9. If article content is provided above, analyze THAT TEXT as the primary subject.
10. Cite sources as [FC1], [DDG], [KG1], [WD1], [WK1], [A1], [N1], [G1], [S1], [W1].
11. Follow FORMAT INSTRUCTION strictly.
12. NO-EVIDENCE RULE: If no web sources are found, do NOT classify as LIKELY FAKE unless implausibility flag is present. Use UNVERIFIABLE instead.`;
    } else {
      finalMessage = `${baseQuery}

NOTE: No real-time web results were found.
- If SYSTEM FLAG ✅ TRUSTED SOURCE: classify LIKELY REAL (Credibility Score: 70–80 / 100). No contradicting evidence found.
- If SYSTEM FLAG ⚠️ IMPLAUSIBILITY: classify LIKELY FAKE.
- If the message is a pasted news paragraph about a plausible real-world event (politician statement, government action, international news): classify UNVERIFIABLE (Credibility Score: 40–55 / 100). Do NOT classify as LIKELY FAKE. Explain that you could not retrieve web evidence to confirm or deny the claim.
- If article content is provided above: analyze that content using your training knowledge.
- Otherwise: classify UNVERIFIABLE (Insufficient Evidence).`;
    }
  } else {
    console.log("[Normal conversation detected] Skipping web search.");
    finalMessage = message;
  }

  try {
    const now = new Date();
    const dateString = now.toLocaleDateString("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      timeZone: "Asia/Manila"
    });
    const timeString = now.toLocaleTimeString("en-PH", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila"
    });
    const currentDateContext = `\n\nCURRENT DATE & TIME (Philippine Standard Time): ${dateString}, ${timeString}. ALWAYS use this as your reference for "today", "bukas (tomorrow)", "kahapon (yesterday)", etc. Do NOT rely on training data for the current date.`;

    let chatbotMessage = await fetchWithFallback([
      {
        role   : "system",
        content: VERITASCAN_SYSTEM_PROMPT +
          currentDateContext +
          `\n\nThe user's name is "${userName || 'User'}". Address them by name naturally when appropriate.`
      },
      { role: "user", content: finalMessage }
    ]);

    chatbotMessage = normalizeMistralOutput(chatbotMessage);
    chatbotMessage = enforceConfidenceCap(chatbotMessage);

    res.json({ message: chatbotMessage, newsArticles });

  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ message: "All models are currently unavailable. Please try again in a moment.", newsArticles: [] });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   OTHER ENDPOINTS
   ════════════════════════════════════════════════════════════════════════════ */
app.post("/news-check", async (req, res) => {
  const { claim, originalMessage } = req.body;
  if (!claim && !originalMessage) return res.status(400).json({ error: "Claim or message is required." });

  const sourceText = originalMessage || claim;
  const query      = extractKeywords(sourceText);
  console.log("[NewsAPI] Query:", query);
  if (!query.trim()) return res.status(400).json({ error: "Could not extract keywords." });

  async function fetchNews(q) {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=relevancy&pageSize=5&language=en&apiKey=${NEWS_API_KEY}`;
    const r   = await fetch(url);
    const d   = await r.json();
    if (d.status !== "ok") throw new Error(d.message);
    return (d.articles || []).filter(a => a.title && a.title !== "[Removed]");
  }

  try {
    let articles = await fetchNews(query);
    if (articles.length === 0) {
      const shortQuery = extractShortKeywords(sourceText);
      if (shortQuery) articles = await fetchNews(shortQuery);
    }
    if (articles.length === 0) {
      const words    = sourceText.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
      const fallback = words.slice(0, 4).join(" ");
      articles = await fetchNews(fallback);
    }
    const filtered = articles.filter(a => isRelevantResult({ title:a.title, snippet:a.description||"" }, sourceText));
    const results  = (filtered.length > 0 ? filtered : articles).slice(0, 4).map(a => ({
      title:a.title, source:a.source?.name||"Unknown", url:a.url, publishedAt:a.publishedAt?.slice(0,10)||""
    }));
    res.json({ keywords: query, articles: results });
  } catch (err) {
    console.error("NewsAPI error:", err);
    res.status(500).json({ error: "Failed to fetch from NewsAPI: " + err.message });
  }
});

app.post("/fetch-url", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required." });
  try { new URL(url); } catch { return res.status(400).json({ error: "Invalid URL." }); }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent":"Mozilla/5.0 (compatible; Veritascan/1.0)", "Accept":"text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return res.status(400).json({ error: `Failed to fetch URL: HTTP ${response.status}` });

    const html = await response.text();
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();

    if (text.length > 4000) text = text.slice(0, 4000) + '... [content truncated]';
    if (text.length < 100) return res.status(400).json({ error: "Could not extract meaningful content from this URL. Please paste the article text directly." });

    res.json({ content: text, url });
  } catch (err) {
    console.error("URL fetch error:", err.message);
    if (err.name === 'TimeoutError') return res.status(408).json({ error: "Request timed out." });
    res.status(500).json({ error: "Failed to fetch URL: " + err.message });
  }
});

app.post("/analyze", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const form = new FormData();
  form.append("image", req.file.buffer, { filename:req.file.originalname, contentType:req.file.mimetype });

  const options = {
    method:"POST", hostname:"api.aiornot.com", path:"/v2/image/sync",
    headers: { ...form.getHeaders(), "Authorization":`Bearer ${AIORNOT_API_KEY}` }
  };
  const request = https.request(options, (apiRes) => {
    let body = "";
    apiRes.on("data", chunk => body += chunk);
    apiRes.on("end", () => {
      try { const data = JSON.parse(body); console.log("AIORNOT IMAGE RESPONSE:", JSON.stringify(data,null,2)); res.status(apiRes.statusCode).json(data); }
      catch (e) { res.status(500).json({ error: "Failed to parse API response" }); }
    });
  });
  request.on("error", err => { console.error("HTTPS error:", err.message); res.status(500).json({ error: err.message }); });
  form.pipe(request);
});

app.post("/analyze-text", async (req, res) => {
  console.log("REQ BODY:", JSON.stringify(req.body));
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "No text provided." });
  if (text.trim().length < 20) return res.status(400).json({ error: "Text is too short for analysis." });

  try {
    const encoded  = new URLSearchParams({ text: text.trim() }).toString();
    const response = await fetch("https://api.aiornot.com/v2/text/sync", {
      method:"POST",
      headers: { "Authorization":`Bearer ${AIORNOT_API_KEY}`, "Content-Type":"application/x-www-form-urlencoded", "Accept":"application/json" },
      body: encoded, signal: AbortSignal.timeout(20000)
    });
    console.log("[AIOrnot Text] HTTP status:", response.status);
    const rawText = await response.text();
    console.log("[AIOrnot Text] Raw response:", rawText);

    let data;
    try { data = JSON.parse(rawText); }
    catch (parseErr) { console.error("[AIOrnot Text] JSON parse error:", parseErr.message); return res.status(500).json({ error: "Invalid response from AI detection API." }); }

    if (!response.ok) {
      const errMsg = data?.detail || data?.message || data?.error || `API error: ${response.status}`;
      return res.status(response.status).json({ error: errMsg });
    }

    let aiScore = null; let isAI = false;
    if (data.report?.ai_text) {
      aiScore = data.report.ai_text.confidence ?? 0;
      isAI    = data.report.ai_text.is_detected ?? (aiScore >= 0.5);
    } else if (data.report?.verdict) {
      isAI    = data.report.verdict.toLowerCase() === "ai";
      aiScore = data.report.score ?? (isAI ? 0.85 : 0.15);
    } else if (typeof data.verdict === "string") {
      isAI    = data.verdict.toLowerCase() === "ai";
      aiScore = data.score ?? (isAI ? 0.85 : 0.15);
    }
    if (aiScore === null) aiScore = isAI ? 0.85 : 0.15;
    aiScore = Math.max(0, Math.min(1, aiScore));

    const normalized = { verdict: isAI ? "ai" : "human", score: aiScore, _raw: data };
    console.log("[AIOrnot Text] Normalized:", JSON.stringify({ verdict:normalized.verdict, score:normalized.score }));
    res.json(normalized);

  } catch (err) {
    console.error("[AIOrnot Text] Request error:", err.message);
    if (err.name === "TimeoutError") return res.status(408).json({ error: "Request timed out. Please try again." });
    res.status(500).json({ error: "Failed to analyze text: " + err.message });
  }
});

/* ════════════════════════════════════════════════════════════════════════════
   TRENDING NEWS ENDPOINT
   ════════════════════════════════════════════════════════════════════════════ */
app.get("/trending", async (req, res) => {
  try {
    async function searchSerperNews(query) {
      try {
        const res = await fetch("https://google.serper.dev/news", {
          method : "POST",
          headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
          body   : JSON.stringify({ q: query, num: 6, hl: "en", gl: "ph" }),
          signal : AbortSignal.timeout(8000)
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.news || []).map(r => ({
          title : r.title  || "",
          source: r.source || "",
          url   : r.link   || "",
          date  : r.date   || ""
        }));
      } catch { return []; }
    }

    const [phResults, worldResults] = await Promise.all([
      searchSerperNews("Philippines news today"),
      searchSerperNews("world news today")
    ]);

    const interleaved = [];
    const maxLen = Math.max(phResults.length, worldResults.length);
    for (let i = 0; i < maxLen && interleaved.length < 8; i++) {
      if (phResults[i])    interleaved.push(phResults[i]);
      if (worldResults[i] && interleaved.length < 8) interleaved.push(worldResults[i]);
    }

    const seen   = new Set();
    const unique = interleaved.filter(r => {
      if (!r.title || seen.has(r.title)) return false;
      seen.add(r.title);
      return true;
    });

    const items = unique.filter(r => r.title && r.title.length >= 20);

    if (items.length === 0) return res.json({ items: [] });

    const rewritePrompt = items.map((item, i) => `${i + 1}. ${item.title}`).join("\n");

    let rewritten = items;
    try {
      const aiResponse = await Promise.race([
        fetchWithFallback([
          {
            role: "system",
            content: `You are a fact-checking assistant. For each news headline, return a JSON array of objects with two fields:
- "title": SHORT display label only (max 8 words)
- "claim": a NATURAL NEWS SENTENCE written like a real news article lead (max 20 words)

Rules for "claim":
- Write as a declarative news statement — NOT a question, NOT starting with "It is true that"
- Must be specific and falsifiable — include WHO + WHAT + WHERE/WHEN
- For Philippine news without explicit country: add "in the Philippines"
- Should read like the first sentence of a news article

Return ONLY a JSON array. No extra text, no markdown backticks.`
          },
          { role: "user", content: rewritePrompt }
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI rewrite timeout after 15s")), 15000)
        )
      ]);

      const cleaned = aiResponse.replace(/```json|```/g, "").trim();
      const parsed  = JSON.parse(cleaned);

      if (Array.isArray(parsed) && parsed.length === items.length) {
        rewritten = items.map((item, i) => ({
          ...item,
          title: parsed[i]?.title?.trim() || item.title,
          claim: parsed[i]?.claim?.trim() || item.title
        }));
      }
    } catch (err) {
      console.warn("[Trending] AI rewrite failed:", err.message, "— using raw titles as fallback");
      rewritten = items.map(item => ({ ...item, claim: item.title }));
    }

    console.log("[Trending] Sending", rewritten.length, "items to frontend");
    res.json({ items: rewritten });

  } catch (err) {
    console.error("[Trending] Error:", err.message);
    res.status(500).json({ items: [] });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});