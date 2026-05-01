// ═════════════════════════════════════════════════════════════
// MAKECENTSTAX — App.jsx
// ═════════════════════════════════════════════════════════════
//
// VERCEL ENV VARS NEEDED (Settings → Environment Variables):
//   VITE_SUPABASE_URL   = https://xsfqwyzqspopkirysuyj.supabase.co
//   VITE_SUPABASE_KEY   = <your anon/public key — safe to expose>
//   ANTHROPIC_API_KEY   = sk-ant-... (server-side ONLY, no VITE_ prefix)
//
// SUPABASE RLS — run this SQL in Supabase → SQL Editor:
// ──────────────────────────────────────────────────────────────
//   alter table claims   enable row level security;
//   alter table incomes  enable row level security;
//   alter table receipts enable row level security;
//
//   create policy "claims_self"   on claims   for all using (auth.uid() = user_id);
//   create policy "incomes_self"  on incomes  for all using (auth.uid() = user_id);
//   create policy "receipts_self" on receipts for all using (auth.uid() = user_id);
//
//   -- Storage bucket RLS (receipts bucket must exist):
//   create policy "receipts_storage_self" on storage.objects
//     for all using (auth.uid()::text = (storage.foldername(name))[1]);
// ──────────────────────────────────────────────────────────────
//
// GOOGLE OAUTH SETUP (one-time):
//   1. console.cloud.google.com → APIs → OAuth consent screen → External
//   2. Create credentials → OAuth 2.0 Client ID → Web application
//   3. Authorised redirect URI: https://<your-project>.supabase.co/auth/v1/callback
//   4. Paste Client ID + Secret into Supabase → Auth → Providers → Google
//
// ──────────────────────────────────────────────────────────────
// AES-256-GCM ENCRYPTION — SCHEMA MIGRATION
// ──────────────────────────────────────────────────────────────
// Run this SQL ONCE in Supabase → SQL Editor before deploying this version.
// The enc_payload column holds an AES-256-GCM ciphertext containing all
// sensitive financial fields (amount, description, employer, merchant, etc.).
// Non-sensitive index columns (user_id, ya, item_id, has_receipt, storage_url,
// type) remain in plaintext so that RLS and Storage policies continue to work.
//
//   alter table claims   add column if not exists enc_payload text;
//   alter table incomes  add column if not exists enc_payload text;
//   alter table receipts add column if not exists enc_payload text;
//
// The app handles both old plaintext rows (enc_payload IS NULL) and new
// encrypted rows transparently — no data migration is required.
// ──────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  deriveKeyFromUserId,
  loadOrCreateGuestKey,
  buildEncPayload,
  openEncPayload,
  encryptBlob,
  decryptBlob,
  GUEST_DEVICE_KEY_LS,
} from "./crypto";

// ─────────────────────────────────────────────────────────────
// RESPONSIVE HOOK — tracks viewport >= 768px
// ─────────────────────────────────────────────────────────────
const useIsWide = () => {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return wide;
};

// ─────────────────────────────────────────────────────────────
// IMAGE COMPRESSION
// ─────────────────────────────────────────────────────────────
const compressImage = (dataUrl, maxSizeMB = 4.5) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX_DIM = 1600;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round((height / width) * MAX_DIM); width = MAX_DIM; }
        else { width = Math.round((width / height) * MAX_DIM); height = MAX_DIM; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const tryQ = (q) => {
        const out = canvas.toDataURL("image/jpeg", q);
        const mb = (out.length * 0.75) / (1024 * 1024);
        if (mb > maxSizeMB && q > 0.15) return tryQ(Math.max(0.15, q - 0.1));
        return out;
      };
      resolve(tryQ(0.82));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

// ─────────────────────────────────────────────────────────────
// SUPABASE STORAGE — upload receipt image, return public URL
// Falls back to null on failure (caller uses base64 for guests)
//
// IMPORTANT: Bucket name is CASE-SENSITIVE in Supabase.
// This must exactly match the bucket in your Supabase dashboard.
// Current dashboard has bucket named "Receipts" (capital R).
// If you prefer lowercase, rename the bucket in Supabase and update here.
// ─────────────────────────────────────────────────────────────
const RECEIPTS_BUCKET = "Receipts";

const uploadReceiptToStorage = async (supabaseClient, userId, receiptId, dataUrl) => {
  try {
    const fetchRes = await fetch(dataUrl);
    const blob = await fetchRes.blob();
    const path = `${userId}/${receiptId}.jpg`;
    const { error } = await supabaseClient.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.error("Storage upload error (bucket:", RECEIPTS_BUCKET, "):", error);
      throw error;
    }
    const { data: { publicUrl } } = supabaseClient.storage
      .from(RECEIPTS_BUCKET)
      .getPublicUrl(path);
    return publicUrl;
  } catch (e) {
    console.error("Storage upload failed:", e);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ─────────────────────────────────────────────────────────────
// GOOGLE DRIVE UTILITIES
// Requires: VITE_GOOGLE_CLIENT_ID env var
// Scope: https://www.googleapis.com/auth/drive.file
// ─────────────────────────────────────────────────────────────
const loadGSI = () =>
  new Promise((resolve) => {
    if (window?.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });

// [Priority 6] Token cache — avoids re-prompting during a single export session
// and handles the 1-hour TTL before mid-upload 401s.
let _driveTokenCache  = null;
let _driveTokenExpiry = 0;

const requestDriveToken = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && _driveTokenCache && now < _driveTokenExpiry) {
    return _driveTokenCache;
  }
  await loadGSI();
  if (!window?.google?.accounts?.oauth2)
    throw new Error("Google Identity Services failed to load. Check your internet connection.");
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId)
    throw new Error("VITE_GOOGLE_CLIENT_ID not configured. Add it to Vercel environment variables.");
  const token = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (res) =>
        res.error ? reject(new Error(res.error_description || res.error)) : resolve(res.access_token),
    });
    client.requestAccessToken({ prompt: "" });
  });
  _driveTokenCache  = token;
  _driveTokenExpiry = Date.now() + 55 * 60 * 1000; // 55 min (token TTL is 60 min)
  return token;
};

const driveReq = async (token, url, method = "GET", body = null) => {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    ...(body && { body: JSON.stringify(body) }),
  };
  const res = await fetch(url, opts);
  if (res.status === 401) {
    // Token expired mid-export — refresh once and retry
    const fresh = await requestDriveToken(true);
    opts.headers.Authorization = `Bearer ${fresh}`;
    return fetch(url, opts).then(r => r.json());
  }
  return res.json();
};

const driveFindFolder = async (token, name, parentId) => {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
  );
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  return r.files?.[0]?.id || null;
};

const driveMkFolder = async (token, name, parentId) => {
  const existing = await driveFindFolder(token, name, parentId);
  if (existing) return existing;
  const r = await driveReq(token, "https://www.googleapis.com/drive/v3/files", "POST", {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId],
  });
  return r.id;
};

const driveUploadFile = async (token, name, blob, parentId) => {
  const meta = JSON.stringify({ name, parents: [parentId] });
  const form = new FormData();
  form.append("metadata", new Blob([meta], { type: "application/json" }));
  form.append("file", blob);
  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
};

const fetchImgAsBlob = async (src) => {
  if (!src) return null;
  if (src.startsWith("data:")) {
    try {
      const [header, data] = src.split(",");
      const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      const bytes = atob(data);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch { return null; }
  }
  try {
    const r = await fetch(src);
    return r.ok ? await r.blob() : null;
  } catch { return null; }
};

// ─────────────────────────────────────────────────────────────
// CSV BUILDER — produces Excel-compatible CSV
// Handles commas/quotes/newlines and prepends UTF-8 BOM so Excel
// opens it cleanly (otherwise RM/Bahasa characters look broken).
// ─────────────────────────────────────────────────────────────
const csvEscape = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // If it contains comma, quote, newline, or starts with formula chars, wrap in quotes
  if (/[",\n\r]|^[=+\-@]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const buildCSV = (rows) => {
  // rows is an array of arrays; first row is header
  const body = rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
  // BOM so Excel detects UTF-8
  return "\uFEFF" + body;
};

// PII sanitization — strip obvious sensitive patterns from any text
// we display, log, or send to third-party services.
// Covers: Malaysian NRIC (XXXXXX-XX-XXXX), 13+ digit card numbers, CVVs.
const sanitizePII = (text) => {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\b\d{6}[-\s]?\d{2}[-\s]?\d{4}\b/g, "[NRIC REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD REDACTED]")
    .replace(/\bCVV[:\s]*\d{3,4}\b/gi, "[CVV REDACTED]");
};

// ─────────────────────────────────────────────────────────────
// SECURITY UTILITIES
// ─────────────────────────────────────────────────────────────

// [Priority 10] Collision-safe UUID — replaces all Date.now() + "" IDs
const newId = () => crypto.randomUUID();

// [Priority 1] Sanitize user free-text before embedding in Claude prompts.
// Strips common prompt-injection patterns and limits length.
const sanitizeForPrompt = (raw, maxLen = 500) => {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .trim()
    .slice(0, maxLen)
    .replace(/["""'''`]/g, "'")
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/gi, "[removed]")
    .replace(/system\s*prompt/gi, "[removed]")
    .replace(/return\s*\{[\s\S]*?\}/gi, "[removed]")
    .replace(/<[^>]*>/g, "");
};

// [Priority 3] Validate a receipt file before it is read into memory.
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_FILE_MB  = 20;
const validateReceiptFile = (file) => {
  if (!ALLOWED_MIME.has(file.type))
    return { ok: false, error: "Only JPEG, PNG, WebP, and HEIC images are supported." };
  if (file.size > MAX_FILE_MB * 1024 * 1024)
    return { ok: false, error: `Image must be under ${MAX_FILE_MB}MB.` };
  return { ok: true };
};

// [Priority 7] Remove only MakeCents-owned localStorage keys — never nuke the whole origin.
// SK_ENC is the AES-256-GCM encrypted counterpart of SK (makecentstax-v3).
// GUEST_DEVICE_KEY_LS ("makecentstax-dk") holds the guest encryption key.
const SK_ENC = "makecentstax-v3-enc";
const MAKECENTSTAX_LS_KEYS = [
  "makecentstax-v3",
  "makecentstax-v3-enc",  // encrypted guest store (new)
  "makecentstax-v2",
  "makecentstax-theme",
  "makecentstax-lang",
  "makecentstax-consent",
  GUEST_DEVICE_KEY_LS,    // guest device encryption key (from crypto.js)
];
const clearMakeCentsStorage = () => MAKECENTSTAX_LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch {} });

// [Priority 8] PDPA consent record — versioned so re-consent is triggered if policy changes.
const CONSENT_VERSION = "1.1";
const recordConsent = () => {
  try {
    localStorage.setItem("makecentstax-consent", JSON.stringify({
      version:    CONSENT_VERSION,
      timestamp:  new Date().toISOString(),
      purposes:   ["tax_classification", "cloud_sync", "drive_export"],
      processors: ["Anthropic (receipt AI)", "Supabase (storage)", "Google (Drive export)"],
    }));
  } catch {}
};
const hasConsentStored = () => {
  try {
    const r = JSON.parse(localStorage.getItem("makecentstax-consent") || "null");
    return r?.version === CONSENT_VERSION;
  } catch { return false; }
};

// ─────────────────────────────────────────────────────────────
// THEMES
// ─────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    // ── Canvas (Lovable warm cream) ──────────────────────────
    bg: "#FBF7EE", bgAlt: "#EDE5D5", surface: "#FFFFFF", surface2: "#F0E8D6",
    // ── Text ────────────────────────────────────────────────
    ink: "#1C1A2C", inkSoft: "#44403C", inkMute: "#676672",
    // ── Borders ─────────────────────────────────────────────
    hair: "rgba(28,26,44,0.08)", hairStrong: "rgba(28,26,44,0.16)",
    // ── Brand maroon-red (Lovable --brand) ──────────────────
    red: "#B83A2C", redDeep: "#8E2A1E", redSoft: "#FAE8DF", redSoftFg: "#7D271D",
    // ── Accents ─────────────────────────────────────────────
    gold: "#B8863D", goldSoft: "rgba(184,134,61,0.12)",
    green: "#3A6B3A", greenSoft: "rgba(58,107,58,0.10)",
    // ── Shadows (Lovable shadow-card / shadow-pop) ───────────
    shadow:   "0 1px 2px rgba(180,150,100,0.18), 0 8px 24px -12px rgba(120,90,50,0.18)",
    shadowHi: "0 12px 40px -12px rgba(90,25,15,0.28)",
    // ── Sidebar/header card text (dark bg → light labels) ───
    cardLabel:     "rgba(251,247,238,0.65)",
    cardLabelSoft: "rgba(251,247,238,0.5)",
    cardBorder:    "rgba(251,247,238,0.15)",
  },
  dark: {
    bg: "#15110D", bgAlt: "#1E1813", surface: "#221A14", surface2: "#2A2018",
    ink: "#F5EFE3", inkSoft: "#D6CDBE", inkMute: "#8B8275",
    hair: "rgba(245,239,227,0.08)", hairStrong: "rgba(245,239,227,0.18)",
    red: "#E35A40", redDeep: "#C8442B", redSoft: "rgba(227,90,64,0.18)", redSoftFg: "#F5A090",
    gold: "#D4A94A", goldSoft: "rgba(212,169,74,0.15)",
    green: "#8FB174", greenSoft: "rgba(143,177,116,0.14)",
    shadow:   "0 4px 20px rgba(0,0,0,0.4)",
    shadowHi: "0 12px 40px rgba(0,0,0,0.5)",
    cardLabel:     "rgba(28,25,23,0.55)",
    cardLabelSoft: "rgba(28,25,23,0.4)",
    cardBorder:    "rgba(28,25,23,0.12)",
  },
};

const FONT         = "'Inter', -apple-system, system-ui, sans-serif";
const FONT_DISPLAY = "'Fraunces', 'Georgia', ui-serif, serif";
const YEARS = ["2025", "2026", "2027"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─────────────────────────────────────────────────────────────
// i18n — EN / BM translations
// LHDN category names and descriptions intentionally stay in English —
// that is how they appear on the official BE form, and mixing translations
// with the IRB's own terminology causes confusion during filing.
// ─────────────────────────────────────────────────────────────
const TRANS = {
  en: {
    // Welcome + signup
    welcome_tagline: "Tax relief tracker for Malaysian taxpayers. Filing season, simplified.",
    continue_google: "Continue with Google",
    continue_guest:  "Continue as Guest",
    welcome_footer:  "Free · Google sync included · Not financial advice",
    privacy_policy:  "Privacy Policy",
    pdpa_compliant:  "PDPA 2010 compliant",
    setup_profile:   "Set up your profile",
    setup_sub:       "Helps personalise your calculations.",
    your_name:       "Your name",
    yob:             "Year of birth",
    get_started:     "Get Started",
    skip_for_now:    "Skip for now",

    // Header
    welcome_back:    "Welcome back,",
    synced:          "SYNCED",
    est_tax:         "Estimated Tax",
    ya_brackets:     "YA2025 BRACKETS",
    brackets_warn:   "tax brackets not yet gazetted — estimate uses YA2025 rates",
    income:          "Income",
    relief:          "Relief",
    chargeable:      "Chargeable",

    // Tabs
    tab_relief:   "Relief",
    tab_income:   "Income",
    tab_receipts: "Receipts",
    tab_more:     "More",

    // Relief tab
    search_reliefs:   "Search reliefs...",
    of_claimed:       "of {0} claimed",
    track_rental:     "Track deductible rental expenses",
    rental_hint:      "Add rental expenses below. These are deducted from your gross rental income (entered in the Income tab) to arrive at net rental income.",
    no_cap:           "No cap — full deduction",
    cap:              "cap",
    capped_warn:      "Capped — entered RM{0} but cap is RM{1}",
    entries_label:    "Entries",
    new_entry:        "New entry",
    add_another:      "Add another entry",
    view:             "View",
    add:              "Add",
    auto:             "AUTO",
    receipt_attached: "Receipt attached",
    save_entry:       "Save entry",
    cancel:           "Cancel",
    scan:             "Scan",
    desc_placeholder: 'Description (e.g. Plumbing repair)',
    number_of:        "Number of",
    scan_receipt:     "Scan Receipt",

    // Income tab
    total_income:        "Total Income",
    total_relief:        "Total Relief",
    tax_estimate:        "Tax Estimate",
    using_brackets:      "Using YA2025 brackets — YA2026+ rates not yet gazetted",
    add_emp_income:      "Add Employment Income",
    employer:            "Employer",
    annual_gross:        "Annual gross income (RM)",
    start:               "Start",
    end:                 "End",
    add_income_source:   "Add Income Source",
    employment_sources:  "Employment Sources",
    add_rental_income:   "Add Rental Income",
    rental_hint_income:  "Gross rent received. Add deductible expenses under Relief → Rental to reduce your net rental income.",
    property_desc:       "Property address / description",
    annual_gross_rental: "Annual gross rental income (RM)",
    rental_props:        "Rental Properties",
    gross_rental:        "Gross rental",
    gross_rental_income: "Gross rental income",
    deductible_exp:      "Deductible expenses",
    net_rental_income:   "Net rental income",
    full_year:           "Full year",

    // Receipts tab
    all_receipts:    "All receipts",
    no_receipts:     "No receipts yet",
    no_receipts_sub: "Tap Scan Receipt on the Relief tab to add one",

    // More tab
    guest_local:     "Guest · Local only",
    google_synced:   "Google · Cloud synced",
    backup_title:    "Back up your data",
    backup_sub:      "You're in guest mode — data is local only. Sign in with Google to keep it safe in the cloud, for free.",
    signin_google:   "Sign in with Google — free",
    appearance:      "Appearance",
    light:           "Light",
    dark:            "Dark",
    language:        "Language",
    data_export:     "Data & Export",
    export_drive:    "Export to Google Drive",
    export_drive_sub:"Creates MakeCents/YA{0}/ folder with CSVs + receipt images by category",
    exported:        "Exported ✓",
    exporting:       "Exporting…",
    dl_json:         "Download JSON backup",
    dl_json_sub:     "Save a local copy of all your data",
    restore:         "Restore from JSON",
    restore_sub:     "Import a previous backup file",
    reset_ya:        "Reset YA{0} data",
    coming_soon:     "Coming soon",
    legal_account:   "Legal & Account",
    privacy_sub:     "PDPA 2010 · How we handle your data",
    sign_out:        "Sign out",
    delete_account:  "Delete account & all data",
    not_fin_advice:  "MakeCents · Not financial advice",

    // Scanner
    ai_receipt:      "AI Receipt Check",
    ai_sub:          "Powered by Claude · LHDN validated",
    checking_against:"Checking against",
    perm_notice:     "This app accesses your camera or photo library only to scan receipts. Photos are sent to Claude for analysis and never stored permanently.",
    pii_warn:        "⚠️ Do NOT photograph your IC (NRIC), bank cards, or bank statements. Only snap the receipt itself.",
    compressing:     "Compressing image…",
    receipt_ok:      "Receipt attached ✓",
    remove:          "Remove",
    no_receipt_yet:  "No receipt attached yet",
    use_buttons:     "Use the buttons below to add one — or describe the expense in text.",
    take_photo:      "Take Photo",
    gallery:         "Gallery / Files",
    retake:          "Retake",
    change:          "Change",
    describe_ph:     'Or describe the expense — e.g. "gym membership RM250/month"',
    lhdn_7years:     "LHDN requires 7 years of receipt retention for audit. Snap a photo now.",
    check_claimable: "Check if claimable",
    checking_lhdn:   "Checking against LHDN YA{0} reliefs…",
    claude_reading:  "Claude is reading your receipt",
    claimable:       "Claimable!",
    not_claimable:   "Not claimable",
    category:        "Category",
    total_receipt:   "Total on receipt",
    claimable_amt:   "Claimable amount",
    add_suggested:   "Add suggested (RM {0})",
    add_full:        "Add full receipt (RM {0})",
    close:           "Close",
    scan_another:    "Scan another receipt",

    // Consent modal
    your_data_control: "Your data, your control",
    consent_body:      "MakeCents stores your income figures, tax relief entries, and receipt images to provide tax tracking. Your data is processed under Malaysia's Personal Data Protection Act 2010 (as amended 2024).",
    consent_providers: "We use Supabase (cloud storage, Singapore region), Anthropic Claude (receipt AI analysis — images not retained beyond the request), and Google OAuth (authentication only).",
    consent_agree:     "I agree to the {0} and consent to my financial data being processed for tax tracking, including cross-border transfer to Supabase (Singapore), Anthropic (United States), and Google (United States).",
    accept_continue:   "Accept & Continue",
    decline_exit:      "Decline — exit app",
  },
  ms: {
    welcome_tagline: "Penjejak pelepasan cukai untuk pembayar cukai Malaysia. Musim pemfailan, dipermudahkan.",
    continue_google: "Teruskan dengan Google",
    continue_guest:  "Teruskan sebagai Tetamu",
    welcome_footer:  "Percuma · Penyegerakan Google disertakan · Bukan nasihat kewangan",
    privacy_policy:  "Dasar Privasi",
    pdpa_compliant:  "Patuh PDPA 2010",
    setup_profile:   "Sediakan profil anda",
    setup_sub:       "Membantu memperibadikan pengiraan anda.",
    your_name:       "Nama anda",
    yob:             "Tahun lahir",
    get_started:     "Mula",
    skip_for_now:    "Langkau buat masa ini",

    welcome_back:    "Selamat kembali,",
    synced:          "DISEGERAK",
    est_tax:         "Anggaran Cukai",
    ya_brackets:     "KADAR YA2025",
    brackets_warn:   "kadar cukai belum diwartakan — anggaran guna kadar YA2025",
    income:          "Pendapatan",
    relief:          "Pelepasan",
    chargeable:      "Boleh Dicukai",

    tab_relief:   "Pelepasan",
    tab_income:   "Pendapatan",
    tab_receipts: "Resit",
    tab_more:     "Lagi",

    search_reliefs:   "Cari pelepasan...",
    of_claimed:       "daripada {0} dituntut",
    track_rental:     "Jejak perbelanjaan sewa yang boleh ditolak",
    rental_hint:      "Tambah perbelanjaan sewa di bawah. Ia ditolak daripada pendapatan sewa kasar anda (dimasukkan dalam tab Pendapatan) untuk mendapatkan pendapatan sewa bersih.",
    no_cap:           "Tiada had — potongan penuh",
    cap:              "had",
    capped_warn:      "Dihadkan — dimasukkan RM{0} tetapi had adalah RM{1}",
    entries_label:    "Entri",
    new_entry:        "Entri baru",
    add_another:      "Tambah entri lain",
    view:             "Lihat",
    add:              "Tambah",
    auto:             "AUTO",
    receipt_attached: "Resit dilampirkan",
    save_entry:       "Simpan entri",
    cancel:           "Batal",
    scan:             "Imbas",
    desc_placeholder: 'Penerangan (cth: Pembaikan paip)',
    number_of:        "Bilangan",
    scan_receipt:     "Imbas Resit",

    total_income:        "Jumlah Pendapatan",
    total_relief:        "Jumlah Pelepasan",
    tax_estimate:        "Anggaran Cukai",
    using_brackets:      "Menggunakan kadar YA2025 — kadar YA2026+ belum diwartakan",
    add_emp_income:      "Tambah Pendapatan Pekerjaan",
    employer:            "Majikan",
    annual_gross:        "Pendapatan kasar tahunan (RM)",
    start:               "Mula",
    end:                 "Tamat",
    add_income_source:   "Tambah Sumber Pendapatan",
    employment_sources:  "Sumber Pekerjaan",
    add_rental_income:   "Tambah Pendapatan Sewa",
    rental_hint_income:  "Sewa kasar diterima. Tambah perbelanjaan boleh ditolak di Pelepasan → Sewa untuk mengurangkan pendapatan sewa bersih.",
    property_desc:       "Alamat / penerangan hartanah",
    annual_gross_rental: "Pendapatan sewa kasar tahunan (RM)",
    rental_props:        "Hartanah Sewa",
    gross_rental:        "Sewa kasar",
    gross_rental_income: "Pendapatan sewa kasar",
    deductible_exp:      "Perbelanjaan boleh ditolak",
    net_rental_income:   "Pendapatan sewa bersih",
    full_year:           "Sepanjang tahun",

    all_receipts:    "Semua resit",
    no_receipts:     "Belum ada resit",
    no_receipts_sub: "Tekan Imbas Resit di tab Pelepasan untuk menambah",

    guest_local:     "Tetamu · Tempatan sahaja",
    google_synced:   "Google · Disegerak ke awan",
    backup_title:    "Sandarkan data anda",
    backup_sub:      "Anda dalam mod tetamu — data disimpan tempatan sahaja. Log masuk dengan Google untuk menyimpannya dengan selamat di awan, percuma.",
    signin_google:   "Log masuk dengan Google — percuma",
    appearance:      "Paparan",
    light:           "Cerah",
    dark:            "Gelap",
    language:        "Bahasa",
    data_export:     "Data & Eksport",
    export_drive:    "Eksport ke Google Drive",
    export_drive_sub:"Mencipta folder MakeCents/YA{0}/ dengan CSV + imej resit mengikut kategori",
    exported:        "Dieksport ✓",
    exporting:       "Mengeksport…",
    dl_json:         "Muat turun sandaran JSON",
    dl_json_sub:     "Simpan salinan tempatan semua data anda",
    restore:         "Pulihkan dari JSON",
    restore_sub:     "Import fail sandaran terdahulu",
    reset_ya:        "Reset data YA{0}",
    coming_soon:     "Akan datang",
    legal_account:   "Undang-undang & Akaun",
    privacy_sub:     "PDPA 2010 · Cara kami kendalikan data anda",
    sign_out:        "Log keluar",
    delete_account:  "Padam akaun & semua data",
    not_fin_advice:  "MakeCents · Bukan nasihat kewangan",

    ai_receipt:      "Semakan Resit AI",
    ai_sub:          "Dikuasakan Claude · Disahkan LHDN",
    checking_against:"Menyemak dengan",
    perm_notice:     "Aplikasi ini mengakses kamera atau galeri foto anda hanya untuk mengimbas resit. Foto dihantar ke Claude untuk analisis dan tidak disimpan secara kekal.",
    pii_warn:        "⚠️ JANGAN imbas kad pengenalan (NRIC), kad bank, atau penyata bank anda. Imbas resit sahaja.",
    compressing:     "Memampatkan imej…",
    receipt_ok:      "Resit dilampirkan ✓",
    remove:          "Buang",
    no_receipt_yet:  "Belum ada resit dilampirkan",
    use_buttons:     "Gunakan butang di bawah untuk menambah — atau terangkan perbelanjaan dalam teks.",
    take_photo:      "Ambil Foto",
    gallery:         "Galeri / Fail",
    retake:          "Ambil Semula",
    change:          "Tukar",
    describe_ph:     'Atau terangkan perbelanjaan — cth "keahlian gim RM250/bulan"',
    lhdn_7years:     "LHDN memerlukan 7 tahun penyimpanan resit untuk audit. Ambil foto sekarang.",
    check_claimable: "Semak sama ada boleh dituntut",
    checking_lhdn:   "Menyemak dengan pelepasan LHDN YA{0}…",
    claude_reading:  "Claude sedang membaca resit anda",
    claimable:       "Boleh dituntut!",
    not_claimable:   "Tidak boleh dituntut",
    category:        "Kategori",
    total_receipt:   "Jumlah pada resit",
    claimable_amt:   "Amaun boleh dituntut",
    add_suggested:   "Tambah cadangan (RM {0})",
    add_full:        "Tambah resit penuh (RM {0})",
    close:           "Tutup",
    scan_another:    "Imbas resit lain",

    your_data_control: "Data anda, kawalan anda",
    consent_body:      "MakeCents menyimpan pendapatan, entri pelepasan cukai, dan imej resit anda untuk menyediakan penjejakan cukai. Data anda diproses di bawah Akta Perlindungan Data Peribadi 2010 (pindaan 2024).",
    consent_providers: "Kami menggunakan Supabase (storan awan, rantau Singapura), Anthropic Claude (analisis AI resit — imej tidak disimpan selepas permintaan), dan Google OAuth (pengesahan sahaja).",
    consent_agree:     "Saya bersetuju dengan {0} dan membenarkan data kewangan saya diproses untuk penjejakan cukai, termasuk pemindahan rentas sempadan ke Supabase (Singapura), Anthropic (Amerika Syarikat), dan Google (Amerika Syarikat).",
    accept_continue:   "Terima & Teruskan",
    decline_exit:      "Tolak — keluar aplikasi",
  },
};

// Simple string lookup with {n} placeholders
const makeL = (lang) => (key, ...args) => {
  const dict = TRANS[lang] || TRANS.en;
  let s = dict[key] ?? TRANS.en[key] ?? key;
  args.forEach((a, i) => { s = s.replace(new RegExp(`\\{${i}\\}`, "g"), a); });
  return s;
};

// ─────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color = "currentColor", weight = 1.6 }) => {
  const s = { width: size, height: size, display: "block", flexShrink: 0 };
  const p = { stroke: color, strokeWidth: weight, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const map = {
    user:       <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="4" {...p}/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" {...p}/></svg>,
    heart:      <svg viewBox="0 0 24 24" style={s}><path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11z" {...p}/></svg>,
    sparkle:    <svg viewBox="0 0 24 24" style={s}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" {...p}/></svg>,
    shield:     <svg viewBox="0 0 24 24" style={s}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" {...p}/></svg>,
    plus:       <svg viewBox="0 0 24 24" style={s}><path d="M12 5v14M5 12h14" {...p}/></svg>,
    chevR:      <svg viewBox="0 0 24 24" style={s}><path d="M9 6l6 6-6 6" {...p}/></svg>,
    chevD:      <svg viewBox="0 0 24 24" style={s}><path d="M6 9l6 6 6-6" {...p}/></svg>,
    receipt:    <svg viewBox="0 0 24 24" style={s}><path d="M6 3v18l3-2 3 2 3-2 3 2V3zM9 8h6M9 12h6M9 16h4" {...p}/></svg>,
    close:      <svg viewBox="0 0 24 24" style={s}><path d="M6 6l12 12M18 6L6 18" {...p}/></svg>,
    check:      <svg viewBox="0 0 24 24" style={s}><path d="M5 12l5 5L20 7" {...p}/></svg>,
    camera:     <svg viewBox="0 0 24 24" style={s}><path d="M4 8h3l2-2h6l2 2h3v12H4z" {...p}/><circle cx="12" cy="13" r="3.5" {...p}/></svg>,
    search:     <svg viewBox="0 0 24 24" style={s}><circle cx="11" cy="11" r="7" {...p}/><path d="M20 20l-4-4" {...p}/></svg>,
    moon:       <svg viewBox="0 0 24 24" style={s}><path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" {...p}/></svg>,
    sun:        <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="4" {...p}/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" {...p}/></svg>,
    download:   <svg viewBox="0 0 24 24" style={s}><path d="M12 3v13M6 11l6 6 6-6M4 21h16" {...p}/></svg>,
    upload:     <svg viewBox="0 0 24 24" style={s}><path d="M12 21V8M6 13l6-6 6 6M4 3h16" {...p}/></svg>,
    logout:     <svg viewBox="0 0 24 24" style={s}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" {...p}/></svg>,
    trash:      <svg viewBox="0 0 24 24" style={s}><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14" {...p}/></svg>,
    google:     <svg viewBox="0 0 24 24" style={s}><path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" fill={color} stroke="none"/></svg>,
    briefcase:  <svg viewBox="0 0 24 24" style={s}><rect x="3" y="7" width="18" height="13" rx="2" {...p}/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p}/></svg>,
    settings:   <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="3" {...p}/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.8-1.6L13 2h-4l-.7 2.9a7 7 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 3.2 12c0 .55.07 1.08.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.8 1.6l.7 2.9h4l.7-2.9a7 7 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.13-.52.2-1.05.2-1.6z" {...p}/></svg>,
    sparkleAi:  <svg viewBox="0 0 24 24" style={s}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" {...p}/></svg>,
    home:       <svg viewBox="0 0 24 24" style={s}><path d="M3 12l9-9 9 9M5 10v10h4v-6h6v6h4V10" {...p}/></svg>,
    key:        <svg viewBox="0 0 24 24" style={s}><circle cx="8" cy="15" r="4" {...p}/><path d="M12 11l8-8M18 6l2 2M15 9l2 2" {...p}/></svg>,
    grid:       <svg viewBox="0 0 24 24" style={s}><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" {...p}/></svg>,
    cloud:      <svg viewBox="0 0 24 24" style={s}><path d="M18 10a6 6 0 0 0-12 0 4 4 0 0 0 0 8h12a4 4 0 0 0 0-8z" {...p}/></svg>,
    warn:       <svg viewBox="0 0 24 24" style={s}><path d="M12 9v4M12 17h.01M10.3 3.6L2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" {...p}/></svg>,
  };
  return map[name] || null;
};
// ─────────────────────────────────────────────────────────────
// MAKECENTS LOGO
// ─────────────────────────────────────────────────────────────
const MakeCentsLogo = ({ size = 72 }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: "block", flexShrink: 0 }}
  >
    <rect width="200" height="200" rx="36" fill="#E44230" />
    {/* Dark right c — underneath at the centre crossing */}
    <path fill="none" stroke="#1E1E1E" strokeWidth="28" strokeLinecap="round"
      d="M 97,75 C 110,50 132,42 152,42 C 182,42 197,68 197,100 C 197,132 182,158 152,158 C 132,158 110,150 97,125" />
    {/* White left C — on top so white wins at the crossing */}
    <path fill="none" stroke="white" strokeWidth="34" strokeLinecap="round"
      d="M 103,125 C 90,148 65,158 45,158 C 15,158 3,132 3,100 C 3,68 15,42 45,42 C 65,42 90,52 103,75" />
  </svg>
);
const CAT_ICON = {
  personal: "user", medical: "heart", lifestyle: "sparkle",
  insurance: "shield", education: "sparkle", children: "user",
  housing: "home", rental: "key",
};

// ─────────────────────────────────────────────────────────────
// TAX RELIEF DATA
// Note on G17ins / G17epf: split from old G17 to enforce sub-limits.
//   Life insurance/takaful → G17ins (cap RM3,000)
//   EPF contributions      → G17epf (cap RM4,000)
//   Combined G17 cap       → RM7,000 (enforced in totalRelief calc)
//
// Note on G1 for YA2026/2027: auto:true removed — amounts unconfirmed
//   by LHDN. Users confirm manually. YA2025 G1 remains auto.
// ─────────────────────────────────────────────────────────────
const REL = {
  "2025": [
    { id: "personal", name: "Individual & Dependents", items: [
      { id: "G1",  name: "Individual relief",   cap: 9000, auto: true, desc: "Automatic RM9,000 for all resident taxpayers — YA2025 confirmed" },
      { id: "G4",  name: "Disabled individual", cap: 7000, desc: "Certified by JKM" },
      { id: "G14", name: "Spouse / Alimony",    cap: 4000, desc: "Spouse with no income or alimony" },
      { id: "G15", name: "Disabled spouse",     cap: 6000, desc: "Spouse certified disabled" },
    ]},
    { id: "medical", name: "Medical & Special Needs", items: [
      { id: "G6", name: "Serious disease / fertility / vaccination / dental", cap: 10000, desc: "G6 + G7 + G8 share a combined RM10,000 cap. Vaccination sub-limit RM1k, dental sub-limit RM1k" },
      { id: "G7", name: "Medical exam / self-test / mental health",           cap: 1000,  desc: "Check-up, screening, oximeter, BP monitor, mental health. Sub-limit within G6+G7+G8 RM10k cap" },
      { id: "G8", name: "Learning disability (child 18 and below)",           cap: 6000,  desc: "ASD, ADHD, GDD, Down Syndrome diagnosis and rehab. Sub-limit within G6+G7+G8 RM10k cap" },
      { id: "G2", name: "Parents / grandparents medical",                     cap: 8000,  desc: "Medical, dental, nursing, carer. Check-up sub-limit RM1k" },
      { id: "G3", name: "Disabled equipment",                                 cap: 6000,  desc: "Wheelchair, hearing aid, dialysis machine" },
    ]},
    { id: "lifestyle", name: "Lifestyle", items: [
      { id: "G9",  name: "Books, gadgets, internet, courses", cap: 2500, desc: "Books, smartphone/tablet/PC, internet bills, upskilling courses" },
      { id: "G10", name: "Sports & fitness",                  cap: 1000, desc: "Equipment, gym membership, court rental (badminton/squash/tennis), green fees, swimming, martial arts, yoga, competition entry. EXCLUDES: club joining fees, sports clothing/shoes, buggy rental." },
      { id: "G21", name: "EV charging / composting",          cap: 2500, desc: "EV charging install/rental/subscription, composting machine" },
    ]},
    { id: "insurance", name: "Insurance & Contributions", items: [
      { id: "G17ins", name: "Life insurance / takaful",    cap: 3000, desc: "Life insurance or takaful premiums. Sub-limit of G17 combined RM7,000 cap (shared with EPF)" },
      { id: "G17epf", name: "EPF contributions",           cap: 4000, desc: "Mandatory or voluntary EPF contributions. Sub-limit of G17 combined RM7,000 cap (shared with insurance)" },
      { id: "G18",    name: "PRS / Deferred annuity",      cap: 3000, desc: "Private Retirement Scheme" },
      { id: "G19",    name: "Education & medical insurance",cap: 4000, desc: "Medical insurance & takaful medical plans (protect against hospital bills)" },
      { id: "G20",    name: "SOCSO / EIS",                  cap: 350,  desc: "SOCSO + Employment Insurance contributions" },
    ]},
    { id: "education", name: "Education & Savings", items: [
      { id: "G5",  name: "Education fees (self)", cap: 7000, desc: "Master's/Doctorate (any field), Professional courses (law, accounting, Islamic financing, technical, vocational, scientific, technology). Upskilling: RM2k sub-limit" },
      { id: "G13", name: "SSPN net savings",      cap: 8000, desc: "Net deposits minus withdrawals" },
    ]},
    { id: "children", name: "Children", items: [
      { id: "G16a", name: "Child under 18",           cap: 2000, desc: "RM2,000 per unmarried child",               perUnit: true, unitName: "children" },
      { id: "G16b", name: "Child 18+ in education",   cap: 8000, desc: "Diploma+ MY / degree+ overseas",            perUnit: true, unitName: "children" },
      { id: "G16c", name: "Disabled child",           cap: 8000, desc: "Base RM8,000. If 18+, unmarried, diploma+: additional RM8,000 (total potential RM16,000 per child)"
,    perUnit: true, unitName: "children" },
      { id: "G12",  name: "Childcare / kindergarten", cap: 3000, desc: "Child aged 6 and below" },
      { id: "G11",  name: "Breastfeeding equipment",  cap: 1000, desc: "Child aged 2 and below. Once every 2 years" },
    ]},
    { id: "housing", name: "Housing", items: [
      { id: "G22", name: "Housing loan interest (first home)", cap: 7000, desc: "SPA 2025–2027. RM7k if up to RM500k, RM5k if RM500k–750k" },
    ]},
    { id: "rental", name: "Rental Income & Expenses", items: [
      { id: "R1", name: "Rental expenses — repairs & maintenance",   cap: 999999, desc: "Deductible: cost of repairs and maintenance of rental property" },
      { id: "R2", name: "Rental expenses — quit rent & assessment",  cap: 999999, desc: "Deductible: quit rent, assessment tax paid to local authority" },
      { id: "R3", name: "Rental expenses — insurance premium",       cap: 999999, desc: "Deductible: fire/building insurance on rental property" },
      { id: "R4", name: "Rental expenses — management & agent fees", cap: 999999, desc: "Deductible: property management fees, agent commission" },
      { id: "R5", name: "Rental expenses — loan interest",           cap: 999999, desc: "Deductible: interest on loan taken to purchase/improve rental property" },
    ]},
  ],

  "2026": [
    { id: "personal", name: "Individual", items: [
      // G1 auto:true removed — YA2026 relief amounts unconfirmed by LHDN
      { id: "G1",  name: "Individual relief",   cap: 9000, desc: "Expected RM9,000 — add manually once LHDN confirms YA2026 rates" },
      { id: "G4",  name: "Disabled individual", cap: 8000, desc: "Increased for YA2026" },
      { id: "G14", name: "Spouse / Alimony",    cap: 4000, desc: "Spouse with no income" },
    ]},
    { id: "lifestyle", name: "Lifestyle", items: [
      { id: "G9",  name: "Books, gadgets, internet", cap: 2500, desc: "Same as YA2025" },
      { id: "G10", name: "Sports & fitness",          cap: 1000, desc: "Equipment, gym membership, court rental, green fees, competition entry. EXCLUDES: club joining fees, sports clothing/shoes, buggy rental." },
      { id: "VMY", name: "Visit Malaysia 2026",        cap: 1000, desc: "NEW: Domestic tourism — hotel, attraction, tour packages" },
    ]},
    { id: "medical", name: "Medical", items: [
      { id: "G6", name: "Medical (serious disease, fertility, vaccination, dental)", cap: 10000, desc: "Same structure as YA2025" },
      { id: "G2", name: "Parents medical",                                           cap: 8000,  desc: "Medical, dental, nursing" },
    ]},
    { id: "insurance", name: "Insurance", items: [
      { id: "G17ins", name: "Life insurance / takaful",    cap: 3000, desc: "Sub-limit within G17 combined RM7,000 cap (shared with EPF)" },
      { id: "G17epf", name: "EPF contributions",           cap: 4000, desc: "Sub-limit within G17 combined RM7,000 cap (shared with insurance)" },
      { id: "G18",    name: "PRS",                         cap: 3000, desc: "Private Retirement Scheme" },
      { id: "G19",    name: "Education & medical insurance",cap: 4000, desc: "Premiums" },
      { id: "G20",    name: "SOCSO / EIS",                  cap: 350,  desc: "Contributions" },
    ]},
    { id: "children", name: "Children", items: [
      { id: "G16a", name: "Child under 18",  cap: 2000,  desc: "Per child",  perUnit: true, unitName: "children" },
      { id: "G16c", name: "Disabled child",  cap: 10000, desc: "Increased",  perUnit: true, unitName: "children" },
    ]},
    { id: "housing", name: "Housing", items: [
      { id: "G22", name: "Housing loan interest", cap: 7000, desc: "First-time buyer" },
    ]},
    { id: "rental", name: "Rental Income & Expenses", items: [
      { id: "R1", name: "Rental expenses — repairs & maintenance",   cap: 999999, desc: "Deductible: repairs and maintenance" },
      { id: "R2", name: "Rental expenses — quit rent & assessment",  cap: 999999, desc: "Deductible: quit rent, assessment tax" },
      { id: "R3", name: "Rental expenses — insurance premium",       cap: 999999, desc: "Deductible: fire/building insurance" },
      { id: "R4", name: "Rental expenses — management & agent fees", cap: 999999, desc: "Deductible: management fees, agent commission" },
      { id: "R5", name: "Rental expenses — loan interest",           cap: 999999, desc: "Deductible: loan interest on rental property" },
    ]},
  ],

  "2027": [
    { id: "personal", name: "Individual", items: [
      // G1 auto:true removed — YA2027 relief amounts unconfirmed by LHDN
      { id: "G1",  name: "Individual relief", cap: 9000, desc: "Expected RM9,000 — add manually once LHDN confirms YA2027 rates" },
      { id: "G14", name: "Spouse / Alimony",  cap: 4000, desc: "Spouse with no income" },
    ]},
    { id: "lifestyle", name: "Lifestyle", items: [
      { id: "G9",  name: "Books, gadgets, internet", cap: 2500, desc: "Gadgets, internet" },
      { id: "G10", name: "Sports & fitness",          cap: 1000, desc: "Equipment, gym membership, court rental, competition entry. EXCLUDES: club joining fees, sports clothing/shoes, buggy rental." },
    ]},
    { id: "insurance", name: "Insurance", items: [
      { id: "G17ins", name: "Life insurance / takaful", cap: 3000, desc: "Sub-limit within G17 combined RM7,000 cap (shared with EPF)" },
      { id: "G17epf", name: "EPF contributions",        cap: 4000, desc: "Sub-limit within G17 combined RM7,000 cap (shared with insurance)" },
      { id: "G20",    name: "SOCSO / EIS",               cap: 350,  desc: "Contributions" },
    ]},
    { id: "rental", name: "Rental Income & Expenses", items: [
      { id: "R1", name: "Rental expenses — repairs & maintenance",   cap: 999999, desc: "Deductible: repairs and maintenance" },
      { id: "R2", name: "Rental expenses — quit rent & assessment",  cap: 999999, desc: "Deductible: quit rent, assessment tax" },
      { id: "R3", name: "Rental expenses — insurance premium",       cap: 999999, desc: "Deductible: fire/building insurance" },
      { id: "R4", name: "Rental expenses — management & agent fees", cap: 999999, desc: "Deductible: management fees, agent commission" },
      { id: "R5", name: "Rental expenses — loan interest",           cap: 999999, desc: "Deductible: loan interest on rental property" },
    ]},
  ],
};

// ─────────────────────────────────────────────────────────────
// TAX BRACKETS — YA2025 only. Flagged for YA2026/2027.
// ─────────────────────────────────────────────────────────────
const BK = [
  { max: 5000,     r: 0,  c: 0      },
  { max: 20000,    r: 1,  c: 0      },
  { max: 35000,    r: 3,  c: 150    },
  { max: 50000,    r: 6,  c: 600    },
  { max: 70000,    r: 11, c: 1500   },
  { max: 100000,   r: 19, c: 3700   },
  { max: 400000,   r: 25, c: 9400   },
  { max: 600000,   r: 26, c: 84400  },
  { max: 2000000,  r: 28, c: 136400 },
  { max: Infinity, r: 30, c: 528400 },
];
const calcTax = (ci) => {
  if (ci <= 0) return 0;
  let prev = 0;
  for (const b of BK) {
    if (ci <= b.max) return b.c + (ci - prev) * b.r / 100;
    prev = b.max;
  }
  return 0;
};

// ─────────────────────────────────────────────────────────────
// LOCAL STORAGE
// ─────────────────────────────────────────────────────────────
const SK = "makecentstax-v3";
const ld = () => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } };
const sv = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };

// ─────────────────────────────────────────────────────────────
// ENCRYPTED localStorage HELPERS (guest mode)
// ─────────────────────────────────────────────────────────────
// ldAsync / svAsync transparently layer AES-256-GCM encryption over the
// guest data store when a CryptoKey is available.  If no key is supplied
// (edge case during initialisation), they fall back to the plaintext ld/sv.
//
// The encrypted blob lives in SK_ENC ("makecentstax-v3-enc").  The plaintext
// SK ("makecentstax-v3") is retained as a legacy read-path fallback so that
// users who had data before this version can still load it on first run.
// ─────────────────────────────────────────────────────────────

/**
 * Loads and decrypts the guest data store.
 * Falls back to plaintext SK if no encrypted blob exists (legacy migration path).
 *
 * @param   {CryptoKey|null} key
 * @returns {Promise<object>}
 */
const ldAsync = async (key) => {
  if (!key) return ld();
  try {
    const b64 = localStorage.getItem(SK_ENC);
    if (b64) {
      const decrypted = await decryptBlob(key, b64);
      if (decrypted && typeof decrypted === "object") return decrypted;
    }
  } catch (e) {
    console.warn("[MakeCents] ldAsync: encrypted blob unreadable, falling back to plaintext.", e?.message);
  }
  // Plaintext fallback — covers first run after the encryption upgrade.
  return ld();
};

/**
 * Encrypts and persists the guest data store.
 * Also removes the old plaintext key if it exists (one-time migration clean-up).
 *
 * @param   {object}         data
 * @param   {CryptoKey|null} key
 */
const svAsync = async (data, key) => {
  if (!key) { sv(data); return; }
  try {
    const b64 = await encryptBlob(key, data);
    localStorage.setItem(SK_ENC, b64);
    // Clean up legacy plaintext store after successful encrypted write.
    try { localStorage.removeItem(SK); } catch {}
  } catch (e) {
    console.warn("[MakeCents] svAsync: encryption failed, writing plaintext fallback.", e?.message);
    sv(data);
  }
};

const migrateOld = () => {
  try {
    const old = JSON.parse(localStorage.getItem("makecentstax-v2") || "{}");
    if (!old || Object.keys(old).length === 0) return;
    const out = { user: old.user };
    for (const y of YEARS) {
      const yd = old[y];
      if (!yd) continue;
      const entries = [];
      Object.entries(yd.claims || {}).forEach(([itemId, c]) => {
        if (c?.amount > 0) {
          entries.push({
            id: `mig-${itemId}-${newId()}`, itemId, amount: c.amount,
            desc: "Migrated from previous version",
            date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
            hasReceipt: false, units: c.units || 1,
          });
        }
      });
      out[y] = { entries, receipts: yd.receipts || [], incomes: yd.incomes || [], rentalIncomes: [] };
    }
    localStorage.setItem(SK, JSON.stringify(out));
    localStorage.removeItem("makecentstax-v2");
  } catch {}
};

// ─────────────────────────────────────────────────────────────
// MONTH PICKER
// ─────────────────────────────────────────────────────────────
const MonthPicker = ({ label, value, onChange, t }) => {
  const [open, setOpen] = useState(false);
  const wide = useIsWide();
  const now = new Date();
  const parsed = value ? value.split("-") : null;
  const [selY, setSelY] = useState(parsed ? parseInt(parsed[0]) : now.getFullYear());
  const [selM, setSelM] = useState(parsed ? parseInt(parsed[1]) - 1 : now.getMonth());
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i);
  const display = value
    ? MONTHS[parseInt(value.split("-")[1]) - 1] + " " + value.split("-")[0]
    : "Tap to select";

  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <button type="button" onClick={() => setOpen(true)}
        style={{ width: "100%", padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.bg, color: value ? t.ink : t.inkMute, fontSize: 13, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box" }}>
        <span>{display}</span>
        <Icon name="chevD" size={12} color={t.inkMute} />
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: wide ? "center" : "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setOpen(false)}>
          <div style={{ background: t.bg, borderRadius: wide ? 18 : "24px 24px 0 0", width: "100%", maxWidth: wide ? 420 : 480, padding: "18px 20px 28px", fontFamily: FONT, animation: wide ? "fadein 0.2s" : "slideup 0.25s ease-out", boxShadow: wide ? "0 20px 60px rgba(0,0,0,0.25)" : "none" }} onClick={e => e.stopPropagation()}>
            {!wide && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <div style={{ width: 40, height: 4, background: t.hairStrong, borderRadius: 2 }} />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>{label}</span>
              <button style={{ padding: "8px 18px", border: "none", borderRadius: 10, background: t.red, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
                onClick={() => { onChange(selY + "-" + String(selM + 1).padStart(2, "0") + "-01"); setOpen(false); }}>
                Done
              </button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>YEAR</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {years.map(y => (
                  <button key={y} type="button"
                    style={{ padding: "9px 16px", border: "none", borderRadius: 10, background: selY === y ? t.ink : t.surface, color: selY === y ? t.bg : t.ink, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer", flexShrink: 0 }}
                    onClick={() => setSelY(y)}>{y}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>MONTH</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {MONTHS.map((m, i) => (
                  <button key={m} type="button"
                    style={{ padding: "11px 0", border: "none", borderRadius: 10, background: selM === i ? t.ink : t.surface, color: selM === i ? t.bg : t.ink, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
                    onClick={() => setSelM(i)}>{m}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SYNC ERROR TOAST
// ─────────────────────────────────────────────────────────────
function SyncToast({ message, t }) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
      background: t.red, color: "#fff", padding: "10px 18px", borderRadius: 12,
      fontSize: 12, fontWeight: 600, fontFamily: FONT, zIndex: 200,
      boxShadow: "0 6px 20px rgba(0,0,0,0.25)", maxWidth: 300, textAlign: "center",
      animation: "fadein 0.2s",
    }}>
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONSENT MODAL — PDPA 2010 compliance
// ─────────────────────────────────────────────────────────────
function ConsentModal({ t, L, onAccept, onDecline, onViewPrivacy }) {
  const [checked, setChecked] = useState(false);
  const wide = useIsWide();
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: wide ? "center" : "flex-end", justifyContent: "center",
      animation: "fadein 0.2s",
    }}>
      <div style={{
        width: "100%", maxWidth: wide ? 480 : 480, background: t.bg,
        borderRadius: wide ? 20 : "24px 24px 0 0", padding: "20px 24px 44px",
        fontFamily: FONT, animation: wide ? "fadein 0.2s" : "slideup 0.28s cubic-bezier(.2,.8,.2,1)",
        boxShadow: wide ? "0 20px 60px rgba(0,0,0,0.3)" : "none",
      }}>
        {!wide && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
            <div style={{ width: 40, height: 4, background: t.hairStrong, borderRadius: 2 }} />
          </div>
        )}
        <div style={{ width: 44, height: 44, borderRadius: 12, background: t.redSoft, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <Icon name="shield" size={22} color={t.red} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: t.ink, marginBottom: 8, letterSpacing: -0.4 }}>
          {L("your_data_control")}
        </div>
        <div style={{ fontSize: 13, color: t.inkSoft, lineHeight: 1.65, marginBottom: 20 }}>
          {L("consent_body")}
          <br /><br />
          {L("consent_providers")}
        </div>
        <label style={{
          display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 24,
          cursor: "pointer", padding: "14px 16px", background: t.surface,
          borderRadius: 14, border: `1px solid ${t.hair}`,
        }}>
          <input
            type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: t.red, cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: t.ink, lineHeight: 1.5 }}>
            {/* consent_agree contains {0} placeholder — split and inject the clickable Privacy Policy link */}
            {(() => {
              const parts = L("consent_agree", "__LINK__").split("__LINK__");
              const out = [];
              parts.forEach((p, i) => {
                out.push(<span key={`t${i}`}>{p}</span>);
                if (i < parts.length - 1) {
                  out.push(
                    <span key={`l${i}`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewPrivacy(); }}
                      style={{ color: t.red, textDecoration: "underline", cursor: "pointer" }}
                    >
                      {L("privacy_policy")}
                    </span>
                  );
                }
              });
              return out;
            })()}
          </span>
        </label>
        <button
          onClick={onAccept} disabled={!checked}
          style={{
            width: "100%", padding: 16, border: "none", borderRadius: 14,
            background: checked ? t.red : t.inkMute, color: "#fff",
            fontSize: 15, fontWeight: 700, fontFamily: FONT,
            cursor: checked ? "pointer" : "not-allowed", marginBottom: 10,
            opacity: checked ? 1 : 0.45, transition: "all 0.2s",
          }}
        >
          {L("accept_continue")}
        </button>
        <button
          onClick={onDecline}
          style={{
            width: "100%", padding: 12, border: "none", background: "transparent",
            color: t.inkMute, fontSize: 13, fontFamily: FONT, cursor: "pointer",
          }}
        >
          {L("decline_exit")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PRIVACY POLICY MODAL
// ─────────────────────────────────────────────────────────────
function PrivacyModal({ t, L, onClose }) {
  const wide = useIsWide();
  const isEN = (L("privacy_policy") === "Privacy Policy");

  const sections = isEN ? [
    ["1. Who we are",
      "MakeCents is a personal tax tracking tool operated by an individual developer based in Malaysia. Contact: vick.selva92@gmail.com. We act as the data controller for personal data you submit through the app."],
    ["2. Data we collect",
      "Your name and year of birth (optional). If you sign in with Google: your email and display name. Your income figures, tax relief claim amounts, receipt images, and merchant/amount/date metadata extracted from receipts. We do not request or store your NRIC, bank account numbers, or payment card numbers — and we ask you not to photograph these."],
    ["3. Why we collect it",
      "Solely to provide tax relief tracking and tax estimates under LHDN rules. We do not sell, share, or use your data for advertising. We do not build user profiles for third parties."],
    ["4. Third parties and cross-border transfer (PDPA s.129)",
      "MakeCents uses (a) Supabase for database + image storage, with servers in Singapore — a jurisdiction recognised as having comparable data protection law; (b) Anthropic Claude for on-demand receipt analysis, processed in the United States — receipt images are transmitted for a single inference and are not retained by Anthropic beyond the request; (c) Google OAuth for sign-in, and (optionally, only when you tap Export to Drive) Google Drive, both processed in the United States. By accepting the consent screen you consent to these specific cross-border transfers."],
    ["5. Retention",
      "We retain your data while your account is active, or up to 2 years after your last sign-in, whichever is shorter. You may export or delete your data at any time from the More tab. LHDN separately recommends keeping your own copies of receipts for 7 years for audit — that is your responsibility, not ours."],
    ["6. Your PDPA rights",
      "Access, correct, or withdraw consent: contact vick.selva92@gmail.com. Portability: use the Download JSON backup or Export to Google Drive features in the More tab. Erasure: use Delete account in the More tab — this removes all database rows and stored receipt images. Lodge complaints with the Personal Data Protection Commissioner (pdp.gov.my) if you believe your rights have been breached."],
    ["7. Security",
      "All network traffic uses HTTPS (TLS). Database access is protected by Supabase Row Level Security — your records are scoped to your user ID and not visible to other users. All sensitive financial fields (income amounts, relief claim amounts, merchant names, descriptions) are encrypted at rest using AES-256-GCM, with a key derived in your browser via PBKDF2-SHA-256 (310 000 iterations) from your user identity — this key is never transmitted to any server. Receipt images are stored in a private bucket keyed by your user ID. Anthropic API keys are held server-side and never exposed in the browser. Passwords are not used — sign-in is delegated to Google OAuth."],
    ["8. Data breach commitment (PDPA amendment 2024)",
      "If we become aware of a personal data breach that is likely to cause significant harm, we will notify the Personal Data Protection Commissioner within 72 hours and notify affected users via email and an in-app notice as soon as practicable, consistent with s.12B of the amended PDPA."],
    ["9. Guest mode",
      "If you use guest mode, app data is stored only in your browser's local storage and never sent to our servers — with one exception: if you use the AI receipt scanner, the image is sent to Anthropic Claude for analysis and then discarded. Nothing about your guest-mode entries is stored on our servers."],
    ["10. Children",
      "MakeCents is intended for Malaysian taxpayers. We do not knowingly collect data from individuals under 18."],
    ["11. Changes",
      "We may update this policy. The 'Last updated' date below will change and material changes will be announced in-app on your next sign-in."],
  ] : [
    ["1. Siapa kami",
      "MakeCents ialah alat penjejakan cukai peribadi yang dikendalikan oleh pembangun individu di Malaysia. Hubungi: vick.selva92@gmail.com. Kami bertindak sebagai pengawal data untuk data peribadi yang anda serahkan melalui aplikasi ini."],
    ["2. Data yang kami kumpul",
      "Nama dan tahun lahir anda (pilihan). Jika anda log masuk dengan Google: e-mel dan nama paparan anda. Angka pendapatan, amaun tuntutan pelepasan cukai, imej resit, dan metadata peniaga/amaun/tarikh daripada resit. Kami tidak meminta atau menyimpan nombor NRIC, nombor akaun bank, atau nombor kad pembayaran — dan kami meminta anda tidak memotret benda tersebut."],
    ["3. Kenapa kami kumpul",
      "Semata-mata untuk menyediakan penjejakan pelepasan cukai dan anggaran cukai mengikut peraturan LHDN. Kami tidak menjual, berkongsi, atau menggunakan data anda untuk pengiklanan. Kami tidak membina profil pengguna untuk pihak ketiga."],
    ["4. Pihak ketiga dan pemindahan rentas sempadan (PDPA s.129)",
      "MakeCents menggunakan (a) Supabase untuk pangkalan data + storan imej, dengan pelayan di Singapura — bidang kuasa yang diiktiraf mempunyai undang-undang perlindungan data yang setara; (b) Anthropic Claude untuk analisis resit atas permintaan, diproses di Amerika Syarikat — imej resit dihantar untuk satu inferens sahaja dan tidak disimpan oleh Anthropic selepas permintaan; (c) Google OAuth untuk log masuk, dan (pilihan, hanya apabila anda tekan Eksport ke Drive) Google Drive, kedua-dua diproses di Amerika Syarikat. Dengan menerima skrin persetujuan, anda bersetuju dengan pemindahan rentas sempadan khusus ini."],
    ["5. Tempoh penyimpanan",
      "Kami menyimpan data anda selagi akaun anda aktif, atau sehingga 2 tahun selepas log masuk terakhir anda, mengikut mana yang lebih singkat. Anda boleh mengeksport atau memadam data pada bila-bila masa daripada tab Lagi. LHDN secara berasingan mengesyorkan anda menyimpan salinan resit sendiri selama 7 tahun untuk audit — itu tanggungjawab anda, bukan kami."],
    ["6. Hak PDPA anda",
      "Akses, betulkan, atau tarik balik persetujuan: hubungi vick.selva92@gmail.com. Kebolehalihan: gunakan ciri Muat turun sandaran JSON atau Eksport ke Google Drive di tab Lagi. Pemadaman: gunakan Padam akaun di tab Lagi — ini membuang semua baris pangkalan data dan imej resit yang disimpan. Failkan aduan dengan Pesuruhjaya Perlindungan Data Peribadi (pdp.gov.my) jika anda percaya hak anda telah dilanggar."],
    ["7. Keselamatan",
      "Semua trafik rangkaian menggunakan HTTPS (TLS). Akses pangkalan data dilindungi oleh Supabase Row Level Security — rekod anda diskop kepada ID pengguna anda dan tidak kelihatan kepada pengguna lain. Semua medan kewangan sensitif (amaun pendapatan, amaun tuntutan pelepasan, nama peniaga, penerangan) disulitkan semasa rehat menggunakan AES-256-GCM, dengan kunci yang diterbitkan dalam pelayar anda melalui PBKDF2-SHA-256 (310 000 lelaran) daripada identiti pengguna anda — kunci ini tidak pernah dihantar ke mana-mana pelayan. Imej resit disimpan dalam baldi peribadi yang dikunci dengan ID pengguna anda. Kekunci API Anthropic disimpan di sisi pelayan dan tidak pernah didedahkan di pelayar. Kata laluan tidak digunakan — log masuk diserahkan kepada Google OAuth."],
    ["8. Komitmen pelanggaran data (pindaan PDPA 2024)",
      "Jika kami mendapat tahu tentang pelanggaran data peribadi yang mungkin menyebabkan bahaya besar, kami akan memaklumkan Pesuruhjaya Perlindungan Data Peribadi dalam tempoh 72 jam dan memaklumkan pengguna yang terjejas melalui e-mel dan notis dalam aplikasi secepat mungkin, selaras dengan s.12B PDPA yang dipinda."],
    ["9. Mod tetamu",
      "Jika anda menggunakan mod tetamu, data aplikasi disimpan hanya dalam storan tempatan pelayar anda dan tidak pernah dihantar ke pelayan kami — dengan satu pengecualian: jika anda menggunakan pengimbas resit AI, imej dihantar ke Anthropic Claude untuk analisis dan kemudian dibuang. Tiada apa-apa tentang entri mod tetamu anda disimpan di pelayan kami."],
    ["10. Kanak-kanak",
      "MakeCents bertujuan untuk pembayar cukai Malaysia. Kami tidak dengan sengaja mengumpul data daripada individu di bawah 18 tahun."],
    ["11. Perubahan",
      "Kami mungkin mengemas kini dasar ini. Tarikh 'Kemas kini terakhir' di bawah akan berubah dan perubahan material akan diumumkan dalam aplikasi pada log masuk anda seterusnya."],
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 700,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: wide ? "center" : "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: wide ? 560 : 480, background: t.bg,
          borderRadius: wide ? 20 : "24px 24px 0 0", padding: "16px 22px 44px",
          maxHeight: "85vh", overflow: "auto", fontFamily: FONT,
          animation: wide ? "fadein 0.2s" : "slideup 0.28s cubic-bezier(.2,.8,.2,1)",
          boxShadow: wide ? "0 20px 60px rgba(0,0,0,0.3)" : "none",
        }}>
        {!wide && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <div style={{ width: 40, height: 4, background: t.hairStrong, borderRadius: 2 }} />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: t.ink }}>{L("privacy_policy")}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: "none", borderRadius: 8, background: t.bgAlt, color: t.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" size={14} color={t.inkSoft} />
          </button>
        </div>
        {sections.map(([title, body]) => (
          <div key={title} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 6 }}>{title}</div>
            <div style={{ fontSize: 12, color: t.inkSoft, lineHeight: 1.65 }}>{body}</div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: t.inkMute, marginTop: 10, paddingTop: 14, borderTop: `1px solid ${t.hair}` }}>
          {isEN
            ? "Last updated: April 2026 · MakeCents by Vick · Not legal advice"
            : "Kemas kini terakhir: April 2026 · MakeCents oleh Vick · Bukan nasihat undang-undang"}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function MakeCents() {
  const [themeName, setThemeNameRaw] = useState(() => {
    try { return localStorage.getItem("makecentstax-theme") || "light"; } catch { return "light"; }
  });
  const setThemeName = (n) => { setThemeNameRaw(n); try { localStorage.setItem("makecentstax-theme", n); } catch {} };
  const t = THEMES[themeName];

  // ── Language ────────────────────────────────────────────────
  const [lang, setLangRaw] = useState(() => {
    try { return localStorage.getItem("makecentstax-lang") || "en"; } catch { return "en"; }
  });
  const setLang = (l) => { setLangRaw(l); try { localStorage.setItem("makecentstax-lang", l); } catch {} };
  const L = makeL(lang);
  const wide = useIsWide();

  useEffect(() => {
    document.body.style.background = t.bg;
    document.body.style.color = t.ink;
  }, [t.bg, t.ink]);

  const [user,          setUser]          = useState(null);
  const [screen,        setScreen]        = useState("welcome");
  const [nameIn,        setNameIn]        = useState("");
  const [yobIn,         setYobIn]         = useState("");
  const [ya,            setYa]            = useState("2025");
  const [yaOpen,        setYaOpen]        = useState(false);
  const [tab,           setTab]           = useState("relief");
  const [entries,       setEntries]       = useState([]);
  const [receipts,      setReceipts]      = useState([]);
  const [incomes,       setIncomes]       = useState([]);
  const [rentalIncomes, setRentalIncomes] = useState([]);
  const [scannerOpen,   setScannerOpen]   = useState(false);
  const [scannerSeed,   setScannerSeed]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [yaLoading,     setYaLoading]     = useState(false);
  const [viewImg,       setViewImg]       = useState(null);
  const [syncError,     setSyncError]     = useState(null);
  // PDPA consent + privacy modal
  const [showConsent,   setShowConsent]   = useState(false);
  const [pendingAuth,   setPendingAuth]   = useState(null); // "google" | "guest"
  const [showPrivacy,   setShowPrivacy]   = useState(false);

  // ── AES-256-GCM encryption key ───────────────────────────────────────────
  // Stored in a ref (not state) so it never triggers a re-render and is never
  // included in React's reconciliation or serialised into any snapshot.
  // For Google users: derived ephemerally from the Supabase user UUID via
  //   PBKDF2-SHA-256 (310 000 iterations).  Never persisted to disk.
  // For guest users: random 256-bit key loaded from (or generated into)
  //   localStorage["makecentstax-dk"].
  // Zeroed (set to null) on sign-out so the key does not linger in memory.
  const cryptoKeyRef = useRef(null);

  const hasConsent = () => hasConsentStored();

  const triggerGoogle = async () => {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  };
  const triggerGuest = () => setScreen("signup");

  const handleGoogleClick = () => {
    if (!hasConsent()) { setPendingAuth("google"); setShowConsent(true); } else triggerGoogle();
  };
  const handleGuestClick = () => {
    if (!hasConsent()) { setPendingAuth("guest"); setShowConsent(true); } else triggerGuest();
  };
  const handleConsentAccept = () => {
    recordConsent();
    setShowConsent(false);
    if (pendingAuth === "google") triggerGoogle();
    else if (pendingAuth === "guest") triggerGuest();
    setPendingAuth(null);
  };
  const handleConsentDecline = () => { setShowConsent(false); setPendingAuth(null); };

  // Helper to show a sync error toast for 4 seconds
  const showSyncError = (msg) => {
    setSyncError(msg);
    setTimeout(() => setSyncError(null), 4000);
  };

  useEffect(() => { migrateOld(); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        // Derive the AES-256-GCM key BEFORE setting user/screen so that
        // loadFromSupabase (triggered by the screen/user state change) can
        // decrypt enc_payload rows immediately.
        try {
          cryptoKeyRef.current = await deriveKeyFromUserId(u.id);
        } catch (e) {
          console.error("[MakeCents/crypto] Key derivation failed on session restore:", e?.message);
        }
        setUser({ id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "User", email: u.email, provider: "google" });
        setScreen("app");
      } else {
        const d = ld();
        if (d.user) {
          // Guest returning — initialise the device key before restoring data.
          try {
            cryptoKeyRef.current = await loadOrCreateGuestKey();
          } catch (e) {
            console.error("[MakeCents/crypto] Guest key init failed on session restore:", e?.message);
          }
          setUser(d.user); setScreen("app");
        }
      }
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const u = session.user;
        // Derive the AES-256-GCM key before any data operations fire.
        try {
          cryptoKeyRef.current = await deriveKeyFromUserId(u.id);
        } catch (e) {
          console.error("[MakeCents/crypto] Key derivation failed on auth state change:", e?.message);
        }
        setUser({ id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "User", email: u.email, provider: "google" });
        setScreen("app");
      } else if (event === "SIGNED_OUT") {
        // Zero the key reference so it does not linger in memory post sign-out.
        cryptoKeyRef.current = null;
        setUser(null); setScreen("welcome");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (screen !== "app") return;
    if (user?.provider === "google" && user?.id) {
      loadFromSupabase();
    } else {
      // Guest mode: load from encrypted localStorage (ldAsync falls back to
      // plaintext ld() if no encrypted blob exists yet — migration-safe).
      ldAsync(cryptoKeyRef.current).then(d => {
        const yd = d[ya] || {};
        setEntries(yd.entries || []);
        setReceipts(yd.receipts || []);
        setIncomes(yd.incomes || []);
        setRentalIncomes(yd.rentalIncomes || []);
      });
    }
  }, [ya, screen, user?.id]); // eslint-disable-line

  useEffect(() => {
    if (screen === "app" && user?.provider !== "google") {
      // Persist guest data to AES-256-GCM encrypted localStorage blob.
      // svAsync falls back to plaintext sv() if the key is unavailable.
      const data = { [ya]: { entries, receipts, incomes, rentalIncomes }, user };
      svAsync(data, cryptoKeyRef.current);
    }
  }, [entries, receipts, incomes, rentalIncomes, user, ya, screen]);

  const loadFromSupabase = async () => {
    if (!user?.id) return;
    setYaLoading(true);
    try {
      const [{ data: cl, error: e1 }, { data: inc, error: e2 }, { data: rec, error: e3 }] = await Promise.all([
        supabase.from("claims").select("*").eq("user_id", user.id).eq("ya", ya),
        supabase.from("incomes").select("*").eq("user_id", user.id).eq("ya", ya),
        supabase.from("receipts").select("*").eq("user_id", user.id).eq("ya", ya),
      ]);
      if (e1 || e2 || e3) throw e1 || e2 || e3;

      const key = cryptoKeyRef.current;

      // ── Decrypt claims ────────────────────────────────────────
      // If enc_payload is present, decrypt it to recover amount + description + units.
      // Legacy rows (enc_payload IS NULL) fall back to the plaintext columns.
      const decryptedClaims = await Promise.all(
        (cl || []).map(async (c) => {
          const payload = await openEncPayload(key, c.enc_payload);
          return {
            id:         c.id || newId(),
            itemId:     c.item_id,
            amount:     payload?.amount     ?? c.amount      ?? 0,
            units:      payload?.units      ?? c.units       ?? 1,
            desc:       payload?.description ?? c.description ?? "Entry",
            date:       c.created_at
              ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
              : "",
            hasReceipt: !!c.has_receipt,
          };
        })
      );

      // ── Decrypt incomes ───────────────────────────────────────
      const decryptedIncomes = await Promise.all(
        (inc || []).map(async (i) => {
          const payload = await openEncPayload(key, i.enc_payload);
          return {
            ...i,
            amount:        payload?.amount        ?? i.amount,
            employer:      payload?.employer      ?? i.employer,
            period:        payload?.period        ?? i.period,
            start:         payload?.start         ?? i.start,
            end:           payload?.end           ?? i.end,
            property_desc: payload?.property_desc ?? i.property_desc,
          };
        })
      );

      // ── Decrypt receipts ──────────────────────────────────────
      const decryptedReceipts = await Promise.all(
        (rec || []).map(async (r) => {
          const payload = await openEncPayload(key, r.enc_payload);
          return {
            ...r,
            data:     r.storage_url || r.data,
            merchant: payload?.merchant ?? r.merchant,
            amount:   payload?.amount   ?? r.amount,
            name:     payload?.name     ?? r.name,
            date:     payload?.date     ?? r.date,
          };
        })
      );

      setEntries(decryptedClaims);
      setIncomes(decryptedIncomes.filter(i => i.type !== "rental"));
      setRentalIncomes(decryptedIncomes.filter(i => i.type === "rental"));
      setReceipts(decryptedReceipts);
    } catch (e) {
      console.error("Supabase load error", e);
      showSyncError("Failed to load cloud data. Check your connection.");
    } finally {
      setYaLoading(false);
    }
  };

  // ── Derived data ──────────────────────────────────────────
  const cats     = useMemo(() => (REL[ya] || REL["2025"]).map(c => ({ ...c, icon: CAT_ICON[c.id] || "sparkle" })), [ya]);
  const allItems = useMemo(() => cats.flatMap(c => c.items), [cats]);

  const itemEntries  = (id) => entries.filter(e => e.itemId === id);
  const itemTotalRaw = (id) => itemEntries(id).reduce((s, e) => s + (e.amount || 0), 0);

  const groupRaw = (ids) => ids.reduce((s, id) => s + itemTotalRaw(id), 0);
  const groupCapped = {
    med678: Math.min(Math.min(itemTotalRaw("G6"), 10000) + Math.min(itemTotalRaw("G7"), 1000) + Math.min(itemTotalRaw("G8"), 6000), 10000),
    g9: Math.min(groupRaw(["G9"]), 2500),
    g10: Math.min(groupRaw(["G10"]), 1000),
    g17: Math.min(Math.min(itemTotalRaw("G17ins"),3000) + Math.min(itemTotalRaw("G17epf"),4000), 7000),
    g21: Math.min(groupRaw(["G21"]), 2500),
    g22: Math.min(itemTotalRaw("G22"), 7000),
  };

  // itemTotalCapped — enforces individual caps + combined caps
  const itemTotalCapped = (id) => {
    const it = allItems.find(i => i.id === id);
    if (!it) return 0;
    if (it.cap >= 999999) return itemTotalRaw(id);

    if (id === "G6" || id === "G7" || id === "G8") {
      const g7Used = Math.min(itemTotalRaw("G7"), 1000);
      const g8Used = Math.min(itemTotalRaw("G8"), 6000);
      if (id === "G7") return g7Used;
      if (id === "G8") return g8Used;
      return Math.min(itemTotalRaw("G6"), Math.max(0, 10000 - g7Used - g8Used));
    }
    if (id === "G9") return groupCapped.g9;
    if (id === "G10") return groupCapped.g10;
    if (id === "G21") return groupCapped.g21;
    if (id === "G22") return groupCapped.g22;

    // ── G17ins / G17epf individual sub-limits ────────────────
    // Combined RM7k cap enforced separately in totalRelief
    if (id === "G17ins") return Math.min(itemTotalRaw("G17ins"), 3000);
    if (id === "G17epf") return Math.min(itemTotalRaw("G17epf"), 4000);

    const cap = it.perUnit ? it.cap * (itemEntries(id)[0]?.units || 1) : it.cap;
    return Math.min(itemTotalRaw(id), cap);
  };

  const g17Combined = groupCapped.g17;

  const totalRelief = allItems.reduce((s, i) => {
    if (i.id.startsWith("R")) return s;
    if (i.id === "G17ins" || i.id === "G17epf") return s; // rolled into g17Combined
    return s + (i.auto ? i.cap : itemTotalCapped(i.id));
  }, 0) + g17Combined;

  const eligibleCapTotal = 9000 + 8000 + 6000 + 10000 + 2500 + 1000 + 2500 + 7000 + 8000 + 4000 + 6000 + 7000 + 3000 + 4000 + 350 + 7000;

  const totalRentalIncome     = rentalIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalRentalExpenses   = ["R1","R2","R3","R4","R5"].reduce((s, id) => s + itemTotalRaw(id), 0);
  const netRentalIncome       = Math.max(0, totalRentalIncome - totalRentalExpenses);
  const totalEmploymentIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalIncome           = totalEmploymentIncome + netRentalIncome;
  const chargeable            = Math.max(0, totalIncome - totalRelief);
  // Tax estimate only confirmed for YA2025; flagged for other years
  const estTax      = calcTax(chargeable);
  const taxIsTentative = ya !== "2025";

  // ── Entry mutations ───────────────────────────────────────
  const addEntry = async (itemId, amount, desc, units = 1, hasReceipt = false, receiptImg = null) => {
    if (!amount || amount <= 0) return;
    const entryId = newId(); // [Bug fix] UUID shared by local state AND Supabase so deletes match
    const newEntry = {
      id: entryId,
      itemId, amount: parseFloat(amount), desc: desc || "Entry", units,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      hasReceipt: !!hasReceipt,
    };
    setEntries(p => [newEntry, ...p]);
    if (user?.provider === "google" && user?.id) {
      try {
        // Encrypt sensitive financial fields into enc_payload.
        // The plaintext amount column is set to 0 as a non-informative placeholder —
        // it satisfies NOT NULL constraints while keeping the real value encrypted.
        const enc_payload = await buildEncPayload(cryptoKeyRef.current, {
          amount:      newEntry.amount,
          description: newEntry.desc,
          units:       units,
        });
        const { error } = await supabase.from("claims").insert({
          id:          entryId,
          user_id:     user.id,
          ya,
          item_id:     itemId,
          amount:      0,           // placeholder — real value is in enc_payload
          units:       1,           // placeholder
          description: null,        // placeholder
          has_receipt: !!hasReceipt,
          enc_payload,
        });
        if (error) throw error;
      } catch (e) {
        // [Priority 5] Never log the full entry payload — only safe, non-PII fields
        console.error("Claim save error:", { item_id: itemId, ya, msg: e?.message });
        showSyncError("Entry saved locally but failed to sync.");
      }
    }
    if (hasReceipt && receiptImg) {
      const item = allItems.find(i => i.id === itemId);
      await addReceiptObj({
        id: newId(), // [Bug fix] UUID so storage path and DB record stay in sync
        name: item?.name || itemId, itemId, item_id: itemId,
        data: receiptImg, amount: newEntry.amount, merchant: "Scanned via AI",
        date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      });
    }
  };

  const removeEntry = async (eid) => {
    setEntries(p => p.filter(e => e.id !== eid));
    if (user?.provider === "google" && user?.id) {
      try {
        const { error } = await supabase.from("claims").delete().eq("id", eid).eq("user_id", user.id);
        if (error) throw error;
      } catch (e) {
        console.error("Claim delete error:", e);
        showSyncError("Failed to remove entry from cloud.");
      }
    }
  };

  const addIncome = async (inc) => {
    setIncomes(p => [...p, inc]);
    if (user?.provider === "google" && user?.id) {
      try {
        const enc_payload = await buildEncPayload(cryptoKeyRef.current, {
          amount:   inc.amount,
          employer: inc.employer,
          period:   inc.period,
          start:    inc.start,
          end:      inc.end,
        });
        const { error } = await supabase.from("incomes").insert({
          id:          inc.id,
          user_id:     user.id,
          ya,
          type:        "employment",
          amount:      0,       // placeholder — real value in enc_payload
          employer:    null,    // placeholder
          enc_payload,
        });
        if (error) throw error;
      } catch (e) { console.error("Income save error:", { ya, msg: e?.message }); showSyncError("Income saved locally but failed to sync."); }
    }
  };
  const removeIncome = async (id) => {
    setIncomes(p => p.filter(i => i.id !== id));
    if (user?.provider === "google" && user?.id) {
      try {
        const { error } = await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
      } catch (e) { console.error("Income delete error:", e); showSyncError("Failed to remove income from cloud."); }
    }
  };

  const addRentalIncome = async (inc) => {
    setRentalIncomes(p => [...p, inc]);
    if (user?.provider === "google" && user?.id) {
      try {
        const enc_payload = await buildEncPayload(cryptoKeyRef.current, {
          amount:        inc.amount,
          property_desc: inc.employer || inc.property_desc,
          period:        inc.period,
        });
        const { error } = await supabase.from("incomes").insert({
          id:          inc.id,
          user_id:     user.id,
          ya,
          type:        "rental",
          amount:      0,       // placeholder — real value in enc_payload
          employer:    null,    // placeholder
          enc_payload,
        });
        if (error) throw error;
      } catch (e) { console.error("Rental save error:", { ya, msg: e?.message }); showSyncError("Rental income saved locally but failed to sync."); }
    }
  };
  const removeRentalIncome = async (id) => {
    setRentalIncomes(p => p.filter(i => i.id !== id));
    if (user?.provider === "google" && user?.id) {
      try {
        const { error } = await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
      } catch (e) { console.error("Rental delete error:", e); showSyncError("Failed to remove rental from cloud."); }
    }
  };

  // addReceiptObj — uploads image to Supabase Storage for Google users
  const addReceiptObj = async (rec) => {
    let storageUrl = null;
    if (user?.provider === "google" && user?.id && rec.data) {
      storageUrl = await uploadReceiptToStorage(supabase, user.id, rec.id, rec.data);
    }
    // For display: storage URL preferred over base64 (smaller payloads)
    const displayRec = { ...rec, data: storageUrl || rec.data, storage_url: storageUrl };
    setReceipts(p => [displayRec, ...p]);

    if (user?.provider === "google" && user?.id) {
      try {
        // Encrypt sensitive receipt metadata.
        // storage_url, item_id, has_receipt remain cleartext — they are needed
        // by Storage RLS policies and by the app to fetch the image.
        const enc_payload = await buildEncPayload(cryptoKeyRef.current, {
          merchant: rec.merchant || null,
          amount:   typeof rec.amount === "number" ? rec.amount : parseFloat(rec.amount) || 0,
          name:     rec.name || null,
          date:     rec.date || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        });
        const payload = {
          id:          rec.id,
          user_id:     user.id,
          ya,
          item_id:     rec.item_id || rec.itemId || null,
          storage_url: storageUrl,
          has_receipt: !!storageUrl,
          amount:      0,     // placeholder — real value in enc_payload
          merchant:    null,  // placeholder
          name:        null,  // placeholder
          date:        null,  // placeholder
          enc_payload,
        };
        const { error } = await supabase.from("receipts").insert(payload);
        if (error) {
          // [Priority 5] Log only non-PII fields — never log merchant, amount, date, or storage_url
          console.error("Receipt DB insert error:", { item_id: payload.item_id, ya: payload.ya, msg: error?.message });
          throw error;
        }
      } catch (e) {
        console.error("Receipt save error:", { ya, msg: e?.message });
        showSyncError("Receipt saved locally but failed to sync — check browser console.");
      }
    }
  };

  const removeReceipt = async (id) => {
    const rx = receipts.find(r => r.id === id);
    setReceipts(p => p.filter(x => x.id !== id));
    if (user?.provider === "google" && user?.id) {
      try {
        const { error } = await supabase.from("receipts").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
        // Also delete from Storage if we have a storage_url
        if (rx?.storage_url) {
          const path = `${user.id}/${id}.jpg`;
          await supabase.storage.from(RECEIPTS_BUCKET).remove([path]);
        }
      } catch (e) {
        console.error("Receipt delete error:", e);
        showSyncError("Failed to remove receipt from cloud.");
      }
    }
  };

  const addFromScan = async (scanResult, useTotal, img) => {
    if (!scanResult?.claimable || !scanResult.category_id) return;
    const amt = useTotal ? scanResult.total_amount : scanResult.suggested_amount;
    await addEntry(scanResult.category_id, amt, scanResult.category_name + " (AI scanned)", 1, true, img);
  };

  // ── Backup / restore ──────────────────────────────────────
  // For Google users: fetches all years from Supabase (not just localStorage)
  const exportD = async () => {
    let exportData = {};
    const key = cryptoKeyRef.current;

    if (user?.provider === "google" && user?.id) {
      exportData.user = user;
      for (const year of YEARS) {
        try {
          const [{ data: cl }, { data: inc }, { data: rec }] = await Promise.all([
            supabase.from("claims").select("*").eq("user_id", user.id).eq("ya", year),
            supabase.from("incomes").select("*").eq("user_id", user.id).eq("ya", year),
            supabase.from("receipts").select("*").eq("user_id", user.id).eq("ya", year),
          ]);

          // Decrypt enc_payload for each table before building the export object.
          const decClaims = await Promise.all(
            (cl || []).map(async (c) => {
              const p = await openEncPayload(key, c.enc_payload);
              return {
                id:          c.id,
                itemId:      c.item_id,
                amount:      p?.amount      ?? c.amount      ?? 0,
                units:       p?.units       ?? c.units       ?? 1,
                desc:        p?.description ?? c.description ?? "Entry",
                hasReceipt:  !!c.has_receipt,
              };
            })
          );
          const decIncomes = await Promise.all(
            (inc || []).map(async (i) => {
              const p = await openEncPayload(key, i.enc_payload);
              return {
                ...i,
                amount:        p?.amount        ?? i.amount,
                employer:      p?.employer      ?? i.employer,
                period:        p?.period        ?? i.period,
                property_desc: p?.property_desc ?? i.property_desc,
              };
            })
          );
          const decReceipts = await Promise.all(
            (rec || []).map(async (r) => {
              const p = await openEncPayload(key, r.enc_payload);
              return {
                ...r,
                merchant: p?.merchant ?? r.merchant,
                amount:   p?.amount   ?? r.amount,
                name:     p?.name     ?? r.name,
                date:     p?.date     ?? r.date,
                data:     r.storage_url || null,
              };
            })
          );

          exportData[year] = {
            entries:       decClaims,
            incomes:       decIncomes.filter(i => i.type !== "rental"),
            rentalIncomes: decIncomes.filter(i => i.type === "rental"),
            receipts:      decReceipts,
          };
        } catch (e) {
          console.error(`Export error YA${year}:`, e);
          showSyncError(`Could not fetch YA${year} from cloud.`);
        }
      }
    } else {
      // Guest export: ldAsync decrypts the localStorage blob before returning it.
      exportData = await ldAsync(key);
    }

    const b = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u; a.download = "makecentstax-backup.json"; a.click();
  };

  const importD = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    // [Priority 2] Reject oversized files before reading
    if (f.size > 5 * 1024 * 1024) { alert("Backup file too large (max 5MB)."); return; }
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target.result);
        // [Priority 2] Validate structure before trusting any field
        if (!raw || typeof raw !== "object") throw new Error("Not a valid object");

        // Strip provider/id from user block to prevent privilege escalation
        if (raw.user) {
          delete raw.user.provider;
          delete raw.user.id;
          if (raw.user.name) raw.user.name = String(raw.user.name).slice(0, 100);
        }

        // Build the set of valid item IDs from the static REL data
        const validItemIds = new Set(
          Object.values(REL).flatMap(cats => cats.flatMap(c => c.items.map(i => i.id)))
        );

        for (const year of YEARS) {
          if (!raw[year]) continue;
          if (!Array.isArray(raw[year].entries)) raw[year].entries = [];
          raw[year].entries = raw[year].entries.filter(entry => {
            if (typeof entry.amount !== "number" || entry.amount < 0 || entry.amount > 1_000_000) return false;
            if (entry.itemId && !validItemIds.has(entry.itemId)) return false;
            entry.desc = sanitizePII(String(entry.desc || "").slice(0, 200));
            return true;
          });
          if (!Array.isArray(raw[year].incomes))       raw[year].incomes       = [];
          if (!Array.isArray(raw[year].rentalIncomes)) raw[year].rentalIncomes = [];
          if (!Array.isArray(raw[year].receipts))      raw[year].receipts      = [];
          // Strip base64 blobs from receipts — only keep metadata
          raw[year].receipts = raw[year].receipts.map(rx => ({ ...rx, data: rx.storage_url || null }));
        }

        sv(raw);
        const y = raw[ya] || {};
        setEntries(y.entries || []); setReceipts(y.receipts || []);
        setIncomes(y.incomes || []); setRentalIncomes(y.rentalIncomes || []);
        alert("Backup restored successfully.");
      } catch (err) {
        alert("Invalid or tampered backup file: " + err.message);
      }
    };
    r.readAsText(f);
  };

  const handleSignOut = async () => {
    // Zero the key reference immediately — do not wait for Supabase sign-out
    // to complete before clearing it, so the key is not accessible if the
    // async operation is interrupted.
    cryptoKeyRef.current = null;
    if (user?.provider === "google") { await supabase.auth.signOut(); }
    else {
      // [Priority 7] Only touch MakeCents-owned keys
      const d = ld(); delete d.user; sv(d);
      setUser(null); setScreen("welcome");
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Permanently delete your MakeCents account and ALL data? This cannot be undone.")) return;
    try {
      if (user?.provider === "google" && user?.id) {
        // Delete all years of Supabase data
        await Promise.all([
          supabase.from("claims").delete().eq("user_id", user.id),
          supabase.from("incomes").delete().eq("user_id", user.id),
          supabase.from("receipts").delete().eq("user_id", user.id),
        ]);
        // Delete all receipt images from Storage
        const { data: files } = await supabase.storage.from(RECEIPTS_BUCKET).list(user.id);
        if (files?.length) {
          const paths = files.map(f => `${user.id}/${f.name}`);
          await supabase.storage.from(RECEIPTS_BUCKET).remove(paths);
        }
        // [Priority 4] Pass the session JWT in the Authorization header so the server
        // can verify the caller's identity instead of trusting client-supplied userId.
        const { data: { session } } = await supabase.auth.getSession();
        await fetch("/api/delete-account", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
          },
          // No userId in body — server must derive it from the verified JWT
        });
        await supabase.auth.signOut();
      } else {
        // [Priority 7] Only remove MakeCents-owned keys, never clear the whole origin
        clearMakeCentsStorage();
        setUser(null);
        setScreen("welcome");
      }
    } catch (e) {
      console.error("Delete account error:", e?.message);
      alert("Some data may not have been removed. Contact vick.selva92@gmail.com to request full deletion.");
    }
  };

  // [Priority 11] exportToDrive dead code removed — the real Drive export lives in
  // MoreTab.runDriveExport. There is no window.__driveExportFn global needed.

  // [Bug fix] await all Supabase deletes so they can't be abandoned on navigation
  const resetYAData = async () => {
    if (!confirm(`Reset all YA${ya} data? This cannot be undone.`)) return;
    setEntries([]); setReceipts([]); setIncomes([]); setRentalIncomes([]);
    if (user?.provider === "google" && user?.id) {
      await Promise.all([
        supabase.from("claims").delete().eq("user_id", user.id).eq("ya", ya),
        supabase.from("incomes").delete().eq("user_id", user.id).eq("ya", ya),
        supabase.from("receipts").delete().eq("user_id", user.id).eq("ya", ya),
      ]);
    }
  };

  // ── Render ────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...baseStyle(t), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{globalCSS}</style>
        <MakeCentsLogo size={72} />
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <div style={baseStyle(t)}>
        <style>{globalCSS}</style>
        {showConsent && (
          <ConsentModal t={t} L={L}
            onAccept={handleConsentAccept}
            onDecline={handleConsentDecline}
            onViewPrivacy={() => setShowPrivacy(true)}
          />
        )}
        {showPrivacy && <PrivacyModal t={t} L={L} onClose={() => setShowPrivacy(false)} />}
        <Welcome t={t} L={L} onGoogle={handleGoogleClick} onGuest={handleGuestClick} onPrivacy={() => setShowPrivacy(true)} />
      </div>
    );
  }

  if (screen === "signup") {
    return (
      <div style={baseStyle(t)}>
        <style>{globalCSS}</style>
        <Signup t={t} L={L} name={nameIn} setName={setNameIn} yob={yobIn} setYob={setYobIn}
          onDone={async () => {
            // Initialise guest encryption key BEFORE setting user/screen so that
            // the first localStorage write (triggered by the screen state change)
            // is already encrypted.
            try {
              cryptoKeyRef.current = await loadOrCreateGuestKey();
            } catch (e) {
              console.error("[MakeCents/crypto] Guest key init failed on signup:", e?.message);
            }
            const u = { name: nameIn || "Guest", yob: yobIn, provider: "guest" };
            setUser(u); setScreen("app");
            await svAsync({ user: u }, cryptoKeyRef.current);
          }}
          onSkip={async () => {
            try {
              cryptoKeyRef.current = await loadOrCreateGuestKey();
            } catch (e) {
              console.error("[MakeCents/crypto] Guest key init failed on skip:", e?.message);
            }
            const u = { name: "Guest", provider: "guest" };
            setUser(u); setScreen("app");
            await svAsync({ user: u }, cryptoKeyRef.current);
          }} />
      </div>
    );
  }

  // ── Shared tab content (used by both desktop and mobile layouts) ──────────
  const tabContent = (
    <>
      {tab === "relief" && (
        <ReliefTab t={t} L={L} cats={cats} entries={entries}
          itemEntries={itemEntries} itemTotalRaw={itemTotalRaw}
          onAddEntry={addEntry} onRemoveEntry={removeEntry}
          totalIncome={totalIncome} totalRelief={totalRelief} estTax={estTax} eligibleCapTotal={eligibleCapTotal}
          onOpenScanner={(item) => { setScannerSeed(item); setScannerOpen(true); }} />
      )}
      {tab === "income" && (
        <IncomeTab t={t} L={L} ya={ya} incomes={incomes} rentalIncomes={rentalIncomes}
          onAdd={addIncome} onRemove={removeIncome}
          onAddRental={addRentalIncome} onRemoveRental={removeRentalIncome}
          totalEmploymentIncome={totalEmploymentIncome}
          totalRentalIncome={totalRentalIncome} totalRentalExpenses={totalRentalExpenses}
          netRentalIncome={netRentalIncome}
          totalIncome={totalIncome} totalRelief={totalRelief} chargeable={chargeable}
          estTax={estTax} taxIsTentative={taxIsTentative} />
      )}
      {tab === "receipts" && (
        <ReceiptsTab t={t} L={L} receipts={receipts} onRemove={removeReceipt} onView={setViewImg} />
      )}
      {tab === "more" && (
        <MoreTab t={t} L={L} lang={lang} setLang={setLang} user={user} ya={ya} themeName={themeName} setTheme={setThemeName}
          onSignOut={handleSignOut}
          onDeleteAccount={handleDeleteAccount}
          onReset={resetYAData}
          onExport={exportD}
          onImport={importD}
          onPrivacy={() => setShowPrivacy(true)}
          onSignInGoogle={handleGoogleClick}
          supabase={supabase}
          cryptoKey={cryptoKeyRef.current}
          entries={entries} receipts={receipts} incomes={incomes} rentalIncomes={rentalIncomes} />
      )}
    </>
  );

  const tabLabel = tab === "income" ? L("tab_income") : tab === "receipts" ? L("tab_receipts") : tab === "more" ? L("tab_more") : L("tab_relief");

  // ── Shared overlays ─────────────────────────────────────────
  const overlays = (
    <>
      {viewImg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setViewImg(null)}>
          <img src={viewImg} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16, objectFit: "contain" }} alt="Receipt" />
        </div>
      )}
      <SyncToast message={syncError} t={t} />
      {showPrivacy && <PrivacyModal t={t} L={L} onClose={() => setShowPrivacy(false)} />}
      <ScannerSheet open={scannerOpen} seededItem={scannerSeed} t={t} L={L} ya={ya} allItems={allItems}
        onClose={() => { setScannerOpen(false); setScannerSeed(null); }}
        onAdd={addFromScan} />
    </>
  );

  // ── YA loading spinner ────────────────────────────────────────
  const yaSpinner = yaLoading && (
    <div style={{ position: "absolute", inset: 0, background: t.bg + "cc", zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, borderRadius: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${t.hair}`, borderTopColor: t.red, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: t.inkMute, fontFamily: FONT }}>Loading YA{ya}…</div>
      </div>
    </div>
  );

  // ── DESKTOP LAYOUT ──────────────────────────────────────────
  if (wide) {
    return (
      <div style={{ display: "flex", height: "100vh", background: t.bg, fontFamily: FONT, color: t.ink, overflow: "hidden" }}>
        <style>{globalCSS}</style>
        {overlays}

        {/* ── DESKTOP SIDEBAR — Lovable design ── */}
        <div style={{
          width: 256, flexShrink: 0, height: "100vh", overflow: "auto",
          borderRight: `1px solid ${t.hair}`,
          display: "flex", flexDirection: "column", gap: "1.5rem",
          padding: "20px 16px",
          background: t.surface,
        }}>

          {/* Brand mark + user info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 14, flexShrink: 0,
              background: `linear-gradient(135deg, ${t.red}, #E05A44)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#FBF7EE", fontFamily: FONT_DISPLAY,
              fontSize: 20, fontWeight: 700,
              boxShadow: t.shadowHi,
            }}>M</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user?.name}
              </div>
              <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 500 }}>
                {user?.provider === "google" ? "Google · Cloud synced" : "Guest · Local only"}
              </div>
            </div>
          </div>

          {/* KPIs: Total Relief (main) + Unclaimed + Est Tax */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Main: Total Relief Claimed */}
            <div style={{ background: t.ink, borderRadius: 14, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -18, right: -18, width: 64, height: 64, borderRadius: "50%", background: t.red, opacity: 0.8 }} />
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 9, color: t.cardLabel, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                  Total Relief · YA{ya}
                </div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: t.bg, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  RM {totalRelief.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div style={{ height: 2, background: "rgba(251,247,238,0.2)", borderRadius: 2, marginTop: 8 }}>
                  <div style={{ width: `${Math.min(100, (totalRelief / Math.max(1, eligibleCapTotal)) * 100)}%`, height: "100%", background: t.red, borderRadius: 2 }} />
                </div>
              </div>
            </div>
            {/* Row: Unclaimed + Est Tax */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 8, color: t.inkMute, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Unclaimed</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, color: t.red, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  RM {Math.max(0, eligibleCapTotal - totalRelief).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 8, color: t.inkMute, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Est. Tax{taxIsTentative ? " ~" : ""}</div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  RM {estTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>
          </div>

          {/* YA selector — Lovable pill tabs */}
          <div>
            <div style={{ fontSize: "0.625rem", fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
              Year of Assessment
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, background: t.bgAlt, borderRadius: 14, padding: 4 }}>
              {YEARS.map(y => (
                <button key={y} onClick={() => setYa(y)}
                  style={{
                    padding: "7px 4px", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: FONT,
                    fontSize: 11, fontWeight: 600, transition: "background 0.15s, color 0.15s",
                    background: y === ya ? t.ink    : "transparent",
                    color:      y === ya ? t.bg     : t.inkMute,
                    boxShadow:  y === ya ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                  }}>
                  {y}
                </button>
              ))}
            </div>
          </div>

          {/* Nav links — Lovable rounded active style */}
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              ["relief",   L("tab_relief"),   "receipt"],
              ["income",   L("tab_income"),   "briefcase"],
              ["receipts", L("tab_receipts"), "camera"],
              ["more",     L("tab_more"),     "settings"],
            ].map(([k, l, ic]) => {
              const active = tab === k;
              return (
                <button key={k} onClick={() => setTab(k)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  width: "100%", padding: "10px 14px",
                  border: "none", borderRadius: 14, cursor: "pointer",
                  fontFamily: FONT, fontSize: 13, fontWeight: active ? 600 : 500,
                  textAlign: "left", transition: "background 0.15s, color 0.15s",
                  background: active ? t.redSoft : "transparent",
                  color:      active ? t.redSoftFg ?? t.red : t.inkMute,
                }}>
                  <Icon name={ic} size={17} color={active ? t.red : t.inkMute} />
                  {l}
                </button>
              );
            })}
          </nav>

          {/* Scan CTA — always visible, Lovable style */}
          <button onClick={() => { setScannerSeed(null); setScannerOpen(true); }}
            style={{
              width: "100%", padding: "12px 16px", border: "none", borderRadius: 14,
              background: t.red, color: "#FBF7EE",
              fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: t.shadowHi,
            }}>
            <Icon name="sparkleAi" size={16} color="#FBF7EE" />
            {L("scan_receipt")}
          </button>
        </div>

          {/* Main content */}
        <div style={{ flex: 1, height: "100vh", overflow: "auto", background: t.bgAlt, display: "flex", flexDirection: "column" }}>
          <div style={{ position: "relative", flex: 1, paddingBottom: 40 }}>
            {yaSpinner}
            {tabContent}
          </div>
        </div>
      </div>
    );
  }

  // ── MOBILE LAYOUT (unchanged) ────────────────────────────────
  return (
    <div style={baseStyle(t)}>
      <style>{globalCSS}</style>
      {overlays}

      {tab === "relief" ? (
        <Header t={t} L={L} user={user} ya={ya} setYa={setYa} yaOpen={yaOpen} setYaOpen={setYaOpen}
          totalIncome={totalIncome} totalRelief={totalRelief} chargeable={chargeable}
          estTax={estTax} taxIsTentative={taxIsTentative} eligibleCapTotal={eligibleCapTotal} />
      ) : (
        <div style={{ padding: "26px 20px 16px", fontFamily: FONT }}>
          <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2 }}>YA{ya} · {user?.name}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: t.ink, letterSpacing: -0.8, marginTop: 2 }}>{tabLabel}</div>
        </div>
      )}

      <div style={{ paddingBottom: 140, position: "relative" }}>
        {yaSpinner}
        {tabContent}
      </div>

      {tab === "relief" && !scannerOpen && (
        <button onClick={() => { setScannerSeed(null); setScannerOpen(true); }} style={{
          position: "fixed", bottom: 120, right: "max(20px, calc(50vw - 200px))", zIndex: 35,
          padding: "14px 20px", border: "none", borderRadius: 16,
          background: t.red, color: "#fff", fontSize: 13, fontWeight: 700,
          fontFamily: FONT, cursor: "pointer", letterSpacing: 0.3,
          boxShadow: "0 10px 30px rgba(200,68,43,0.45), 0 2px 6px rgba(0,0,0,0.15)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Icon name="sparkleAi" size={16} color="#fff" />
          {L("scan_receipt")}
        </button>
      )}

      <TabBar t={t} L={L} tab={tab} setTab={setTab} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WELCOME
// ─────────────────────────────────────────────────────────────
function Welcome({ t, L, onGoogle, onGuest, onPrivacy }) {
  const wide = useIsWide();

  if (wide) {
    return (
      <div style={{ minHeight: "100vh", background: t.bgAlt, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 880, background: t.bg, borderRadius: 24, border: `1px solid ${t.hair}`, boxShadow: "0 24px 80px rgba(28,25,23,0.12)", overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {/* Left — brand */}
          <div style={{ padding: "52px 48px", display: "flex", flexDirection: "column", justifyContent: "center", background: t.ink, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: t.red, opacity: 0.8 }} />
            <div style={{ position: "absolute", bottom: -40, left: -40, width: 160, height: 160, borderRadius: "50%", background: t.red, opacity: 0.15 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ marginBottom: 28 }}><MakeCentsLogo size={64} /></div>
              <div style={{ fontSize: 48, fontWeight: 700, color: t.bg, letterSpacing: -1.5, lineHeight: 1, fontFamily: FONT_DISPLAY }}>MakeCents.</div>
              <div style={{ fontSize: 16, color: "rgba(251,247,238,0.7)", marginTop: 14, lineHeight: 1.55 }}>{L("welcome_tagline")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 32 }}>
                {[["sparkleAi", "AI receipt scanning & classification"], ["receipt", "Every LHDN relief category covered"], ["key", "AES-256 encrypted · PDPA compliant"]].map(([ic, label]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(251,247,238,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name={ic} size={13} color="rgba(251,247,238,0.8)" />
                    </div>
                    <span style={{ fontSize: 13, color: "rgba(251,247,238,0.75)", fontWeight: 500 }}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Right — auth */}
          <div style={{ padding: "52px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: t.ink, letterSpacing: -0.8, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Get started</div>
            <div style={{ fontSize: 14, color: t.inkMute, marginBottom: 36, lineHeight: 1.6 }}>Track your Malaysian income tax reliefs and estimate your annual tax. Free, private, and encrypted.</div>
            <button onClick={onGoogle} style={{ width: "100%", padding: "15px 20px", border: "none", borderRadius: 14, background: t.ink, color: t.bg, fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
              <Icon name="google" size={17} color={t.bg} />
              {L("continue_google")}
            </button>
            <button onClick={onGuest} style={{ width: "100%", padding: "15px 20px", border: `1px solid ${t.hair}`, borderRadius: 14, background: "transparent", color: t.ink, fontSize: 14, fontWeight: 500, fontFamily: FONT, cursor: "pointer" }}>
              {L("continue_guest")}
            </button>
            <div style={{ textAlign: "center", fontSize: 11, color: t.inkMute, marginTop: 28, lineHeight: 1.9 }}>
              {L("welcome_footer")}
              <br />
              <span onClick={onPrivacy} style={{ color: t.red, textDecoration: "underline", cursor: "pointer" }}>{L("privacy_policy")}</span>
              {" · "}
              <span style={{ color: t.inkMute }}>{L("pdpa_compliant")}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: "80px 28px 40px", display: "flex", flexDirection: "column", fontFamily: FONT, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ marginBottom: 32, filter: "drop-shadow(0 12px 24px rgba(200,68,43,0.35))" }}>
          <MakeCentsLogo size={72} />
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, color: t.ink, letterSpacing: -1.5, lineHeight: 1 }}>MakeCents.</div>
        <div style={{ fontSize: 16, color: t.inkMute, marginTop: 12, lineHeight: 1.5, maxWidth: 300 }}>
          {L("welcome_tagline")}
        </div>
      </div>
      <button onClick={onGoogle} style={{ width: "100%", padding: "16px 20px", border: "none", borderRadius: 14, background: t.ink, color: t.bg, fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
        <Icon name="google" size={18} color={t.bg} />
        {L("continue_google")}
      </button>
      <button onClick={onGuest} style={{ width: "100%", padding: "16px 20px", border: `1px solid ${t.hairStrong}`, borderRadius: 14, background: "transparent", color: t.ink, fontSize: 15, fontWeight: 500, fontFamily: FONT, cursor: "pointer" }}>
        {L("continue_guest")}
      </button>
      <div style={{ textAlign: "center", fontSize: 11, color: t.inkMute, marginTop: 20, lineHeight: 1.8 }}>
        {L("welcome_footer")}
        <br />
        <span onClick={onPrivacy} style={{ color: t.red, textDecoration: "underline", cursor: "pointer" }}>
          {L("privacy_policy")}
        </span>
        {" · "}
        <span style={{ color: t.inkMute }}>{L("pdpa_compliant")}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SIGNUP
// ─────────────────────────────────────────────────────────────
function Signup({ t, L, name, setName, yob, setYob, onDone, onSkip }) {
  const wide = useIsWide();
  const formFields = [
    { label: L("your_name"), value: name, set: setName, ph: "e.g. Vick",  type: "text"   },
    { label: L("yob"),       value: yob,  set: setYob,  ph: "e.g. 1990", type: "number" },
  ];

  if (wide) {
    return (
      <div style={{ minHeight: "100vh", background: t.bgAlt, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: "40px 24px" }}>
        <div style={{ width: "100%", maxWidth: 460, background: t.bg, borderRadius: 24, border: `1px solid ${t.hair}`, boxShadow: "0 20px 60px rgba(28,25,23,0.1)", padding: "44px 48px" }}>
          <div style={{ marginBottom: 24 }}><MakeCentsLogo size={48} /></div>
          <div style={{ fontSize: 26, fontWeight: 700, color: t.ink, letterSpacing: -0.8 }}>{L("setup_profile")}</div>
          <div style={{ fontSize: 14, color: t.inkMute, marginTop: 6, marginBottom: 32 }}>{L("setup_sub")}</div>
          {formFields.map(f => (
            <div key={f.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{f.label}</div>
              <input value={f.value} onChange={e => f.set(e.target.value)} type={f.type} placeholder={f.ph}
                style={{ width: "100%", padding: "14px 16px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 15, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ marginTop: 8 }} />
          <button onClick={onDone} style={{ width: "100%", padding: "16px 20px", border: "none", borderRadius: 14, background: t.red, color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer", marginBottom: 8 }}>
            {L("get_started")}
          </button>
          <button onClick={onSkip} style={{ width: "100%", padding: 14, border: "none", background: "transparent", color: t.inkMute, fontSize: 14, fontFamily: FONT, cursor: "pointer" }}>
            {L("skip_for_now")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: "72px 24px 40px", display: "flex", flexDirection: "column", fontFamily: FONT, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}><MakeCentsLogo size={56} /></div>
      <div style={{ fontSize: 28, fontWeight: 700, color: t.ink, letterSpacing: -0.8 }}>{L("setup_profile")}</div>
      <div style={{ fontSize: 14, color: t.inkMute, marginTop: 6, marginBottom: 32 }}>{L("setup_sub")}</div>
      {formFields.map(f => (
        <div key={f.label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{f.label}</div>
          <input value={f.value} onChange={e => f.set(e.target.value)} type={f.type} placeholder={f.ph}
            style={{ width: "100%", padding: "14px 16px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 15, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
      ))}
      <div style={{ flex: 1, minHeight: 20 }} />
      <button onClick={onDone} style={{ width: "100%", padding: "16px 20px", border: "none", borderRadius: 14, background: t.red, color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer", marginBottom: 8 }}>
        {L("get_started")}
      </button>
      <button onClick={onSkip} style={{ width: "100%", padding: 14, border: "none", background: "transparent", color: t.inkMute, fontSize: 14, fontFamily: FONT, cursor: "pointer" }}>
        {L("skip_for_now")}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────
function Header({ t, L, user, ya, setYa, yaOpen, setYaOpen, totalIncome, totalRelief, chargeable, estTax, taxIsTentative, eligibleCapTotal }) {
  return (
    <div style={{ background: t.bg, padding: "18px 20px 22px", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MakeCentsLogo size={38} />
          <div>
            <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 500 }}>{L("welcome_back")}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, letterSpacing: -0.3 }}>
              {user?.name}
              {user?.provider === "google" && (
                <span style={{ fontSize: 9, background: t.greenSoft, color: t.green, padding: "2px 7px", borderRadius: 6, marginLeft: 6, fontWeight: 700, letterSpacing: 0.4, verticalAlign: "middle" }}>{L("synced")}</span>
              )}
            </div>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setYaOpen(!yaOpen)} style={{ padding: "8px 12px", border: `1px solid ${t.hairStrong}`, borderRadius: 10, background: t.surface, color: t.ink, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            YA{ya} <Icon name="chevD" size={12} color={t.inkMute} />
          </button>
          {yaOpen && (
            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, background: t.surface, borderRadius: 12, border: `1px solid ${t.hair}`, boxShadow: t.shadowHi, overflow: "hidden", zIndex: 50, minWidth: 100 }}>
              {YEARS.map(y => (
                <button key={y} onClick={() => { setYa(y); setYaOpen(false); }}
                  style={{ display: "block", width: "100%", padding: "11px 16px", border: "none", background: y === ya ? t.redSoft : "transparent", color: y === ya ? t.red : t.ink, fontSize: 13, fontWeight: y === ya ? 600 : 500, fontFamily: FONT, cursor: "pointer", textAlign: "left" }}>
                  YA{y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI cards — Total Relief (main) + Unclaimed + Est Tax */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {/* Main: Total Relief */}
        <div style={{ background: t.ink, borderRadius: 16, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -24, right: -24, width: 80, height: 80, borderRadius: "50%", background: t.red, opacity: 0.75 }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.cardLabel, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
              Total Relief · YA{ya}
            </div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 700, color: t.bg, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              RM {totalRelief.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div style={{ height: 3, background: "rgba(251,247,238,0.18)", borderRadius: 2, marginTop: 10 }}>
              <div style={{ width: `${Math.min(100, (totalRelief / Math.max(1, eligibleCapTotal || 1)) * 100)}%`, height: "100%", background: t.red, borderRadius: 2 }} />
            </div>
          </div>
        </div>
        {/* Row: Unclaimed + Est Tax */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Unclaimed</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.red, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              RM {Math.max(0, (eligibleCapTotal || 0) - totalRelief).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Est. Tax{taxIsTentative ? " ~" : ""}</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              RM {estTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TAB BAR
// ─────────────────────────────────────────────────────────────
function TabBar({ t, L, tab, setTab }) {
  const tabs = [
    ["relief",   L("tab_relief"),   "receipt"],
    ["income",   L("tab_income"),   "briefcase"],
    ["receipts", L("tab_receipts"), "camera"],
    ["more",     L("tab_more"),     "settings"],
  ];
  return (
    <div style={{ position: "fixed", left: "max(12px, calc(50vw - 228px))", right: "max(12px, calc(50vw - 228px))", bottom: 20, zIndex: 40, background: t.surface, borderRadius: 22, padding: 6, display: "flex", border: `1px solid ${t.hair}`, boxShadow: t.shadowHi, fontFamily: FONT }}>
      {tabs.map(([k, l, ic]) => {
        const active = tab === k;
        return (
          <button key={k} onClick={() => setTab(k)}
            style={{ flex: 1, padding: "10px 4px", border: "none", borderRadius: 16, background: active ? t.redSoft : "transparent", color: active ? t.red : t.inkMute, fontSize: 11, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Icon name={ic} size={18} color={active ? t.red : t.inkMute} />
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RELIEF TAB
// ─────────────────────────────────────────────────────────────
function ReliefTab({ t, cats, entries, itemEntries, itemTotalRaw, onAddEntry, onRemoveEntry, onOpenScanner, totalIncome, totalRelief, estTax, eligibleCapTotal }) {
  const wide = useIsWide();
  const [openCats, setOpenCats] = useState(new Set(["individual", "medical"]));
  const [activeFilter, setActiveFilter] = useState("all");
  const [drawerItemId, setDrawerItemId] = useState(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [amtIn, setAmtIn] = useState("");
  const [descIn, setDescIn] = useState("");
  const [dateIn, setDateIn] = useState(() => new Date().toISOString().slice(0, 10));
  const [unitsIn, setUnitsIn] = useState(1);

  const totalCap = eligibleCapTotal || 0;
  const remainingRelief = Math.max(0, totalCap - totalRelief);

  const shownCats = activeFilter === "all" ? cats : cats.filter(c => c.id === activeFilter);
  const toggleCat = (id) => setOpenCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const drawerItem = cats.flatMap(c => c.items).find(i => i.id === drawerItemId) || null;
  const drawerEntries = drawerItem ? itemEntries(drawerItem.id) : [];
  const drawerRaw = drawerItem ? itemTotalRaw(drawerItem.id) : 0;
  const drawerCap = drawerItem ? (drawerItem.cap >= 999999 ? drawerRaw : (drawerItem.perUnit ? drawerItem.cap * (drawerEntries[0]?.units || 1) : drawerItem.cap)) : 0;
  const drawerClaimed = drawerItem ? (drawerItem.auto ? drawerItem.cap : Math.min(drawerRaw, drawerCap || drawerRaw)) : 0;

  const handleDrawerAdd = async () => {
    if (!drawerItem) return;
    const amt = parseFloat(amtIn) || 0;
    if (amt <= 0) return;
    await onAddEntry(drawerItem.id, amt, descIn || drawerItem.name, unitsIn || 1, false, null);
    setAmtIn(""); setDescIn(""); setUnitsIn(1);
  };

  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { setDrawerItemId(null); setDrawerClosing(false); }, 180);
  };

  return (
    <div style={{ padding: wide ? "16px 28px 40px" : "12px 16px 120px", fontFamily: FONT, maxWidth: wide ? 1260 : "100%", margin: "0 auto" }}>

      {/* ── DESKTOP: big stat header ── */}
      {wide && <>
        <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 600, marginBottom: 8 }}>Relief</div>
        <div style={{ fontSize: 50, fontWeight: 700, color: t.ink, letterSpacing: -0.8, lineHeight: 1.04, fontFamily: FONT_DISPLAY, marginBottom: 6 }}>Relief overview</div>
        <div style={{ fontSize: 14, color: t.inkSoft, marginBottom: 18 }}>Track every LHDN-approved relief, what you've claimed, and what's still available.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          {/* Hero: Total Relief Claimed */}
          <div style={{ background: t.ink, borderRadius: 14, padding: 22, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: t.red, opacity: 0.75 }} />
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.cardLabel, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>TOTAL RELIEF · YA{ya}</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 52, lineHeight: 1.02, color: t.bg, fontVariantNumeric: 'tabular-nums' }}>RM {totalRelief.toLocaleString()}</div>
              <div style={{ height: 4, background: 'rgba(251,247,238,0.15)', borderRadius: 4, marginTop: 14 }}><div style={{ width: `${Math.min(100,(totalRelief/Math.max(1,totalCap))*100)}%`, height: '100%', background: t.red, borderRadius: 4 }}/></div>
              <div style={{ fontSize: 12, color: t.cardLabelSoft, marginTop: 6 }}>of RM {totalCap.toLocaleString()} cap · {Math.round((totalRelief/Math.max(1,totalCap))*100)}% utilised</div>
            </div>
          </div>
          {/* Unclaimed relief */}
          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 18 }}>
            <div style={{fontSize:11,letterSpacing:1,fontWeight:700,color:t.inkMute,textTransform:'uppercase'}}>UNCLAIMED</div>
            <div style={{fontFamily:FONT_DISPLAY,fontSize:48,lineHeight:1.05,marginTop:4,color:t.red,fontVariantNumeric:'tabular-nums'}}>RM {remainingRelief.toLocaleString()}</div>
            <div style={{fontSize:12,color:t.inkSoft,marginTop:6}}>Still available to claim</div>
          </div>
          {/* Est. Tax */}
          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 18 }}>
            <div style={{fontSize:11,letterSpacing:1,fontWeight:700,color:t.inkMute,textTransform:'uppercase'}}>EST. TAX{taxIsTentative ? ' ~' : ''}</div>
            <div style={{fontFamily:FONT_DISPLAY,fontSize:48,lineHeight:1.05,marginTop:4,fontVariantNumeric:'tabular-nums'}}>RM {estTax.toLocaleString()}</div>
            <div style={{fontSize:12,color:t.inkSoft,marginTop:6}}>Based on declared income</div>
          </div>
        </div>
        <div style={{ background: t.redSoft, border: `1px solid rgba(184,58,44,0.15)`, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{width:44,height:44,borderRadius:12,background:t.red,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Icon name="sparkleAi" size={19} color="#fff" /></div>
          <div style={{flex:1}}><div style={{fontSize:20,fontFamily:FONT_DISPLAY,lineHeight:1.2}}>Scan a receipt to add relief automatically</div><div style={{fontSize:13,color:t.inkSoft,marginTop:4}}>AI matches your receipt to the correct LHDN category.</div></div>
          <button onClick={() => onOpenScanner(null)} style={{padding:'10px 18px',border:'none',borderRadius:10,background:t.red,color:'#fff',fontWeight:700,cursor:'pointer',flexShrink:0}}>Scan Receipt</button>
        </div>
      </>}



      {/* ── Category filter chips ── */}
      <div style={{ display:'flex', gap:8, flexWrap: wide ? 'wrap' : 'nowrap', overflowX: wide ? 'visible' : 'auto', marginBottom: 14, paddingBottom: wide ? 0 : 4 }}>
        {[{id:'all',name:'All'}, ...cats].map(c => {
          const cnt = c.id === 'all' ? cats.flatMap(x=>x.items).filter(i => itemTotalRaw(i.id) > 0 || i.auto).length : c.items.filter(i => itemTotalRaw(i.id) > 0 || i.auto).length;
          const total = c.id === 'all' ? cats.flatMap(x=>x.items).length : c.items.length;
          const active = activeFilter === c.id;
          const icon = c.id === "all" ? "grid" : c.icon;
          return <button key={c.id} onClick={() => setActiveFilter(c.id)} style={{border:`1px solid ${active ? t.ink : t.hair}`,background:active?t.ink:t.surface,color:active?t.bg:t.inkMute,borderRadius:999,padding:'7px 12px',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6,lineHeight:1,flexShrink:0,fontFamily:FONT}}>
            <Icon name={icon} size={13} color={active ? t.bg : t.inkMute} />
            <span>{c.name}</span>
            <span style={{background:active?'rgba(255,255,255,0.18)':t.bgAlt,padding:'2px 6px',borderRadius:999,fontSize:11,color:active?t.bg:t.inkMute}}>{cnt}/{total}</span></button>
        })}
      </div>

      {shownCats.map(cat => {
        const fixedCaps = { personal: 26000, medical: 24000, lifestyle: 6000, insurance: 14350, education: 15000, housing: 7000 };
        const medGroup = Math.min(Math.min(itemTotalRaw("G6"),10000) + Math.min(itemTotalRaw("G7"),1000) + Math.min(itemTotalRaw("G8"),6000), 10000);
        const claimed = cat.id === "medical"
          ? Math.min(itemTotalRaw("G2"),8000) + Math.min(itemTotalRaw("G3"),6000) + medGroup
          : cat.id === "insurance"
            ? Math.min(Math.min(itemTotalRaw("G17ins"),3000)+Math.min(itemTotalRaw("G17epf"),4000),7000) + Math.min(itemTotalRaw("G18"),3000)+Math.min(itemTotalRaw("G19"),4000)+Math.min(itemTotalRaw("G20"),350)
            : cat.id === "lifestyle"
              ? Math.min(itemTotalRaw("G9"),2500)+Math.min(itemTotalRaw("G10"),1000)+Math.min(itemTotalRaw("G21"),2500)
              : cat.items.reduce((s,i)=> s + (i.auto?i.cap:Math.min(itemTotalRaw(i.id), i.cap>=999999?itemTotalRaw(i.id):(i.perUnit ? i.cap * (itemEntries(i.id)[0]?.units || 1) : i.cap))),0);
        const cap = fixedCaps[cat.id] ?? cat.items.reduce((s,i)=> s + (i.cap>=999999?0:i.cap),0);
        const util = cap ? Math.round((claimed/cap)*100) : 0;
        const expanded = openCats.has(cat.id);
        return <div key={cat.id} style={{background:t.surface,border:`1px solid ${t.hair}`,borderRadius:14,marginBottom:10,overflow:'hidden'}}>
          <button onClick={()=>toggleCat(cat.id)} style={{width:'100%',background:'transparent',border:'none',padding: wide ? '14px 16px' : '12px 14px',display:'flex',alignItems:'center',cursor:'pointer'}}>
            <div style={{width:36,height:36,borderRadius:10,background:t.redSoft,display:'flex',alignItems:'center',justifyContent:'center',marginRight:10,flexShrink:0}}><Icon name={cat.icon} size={16} color={t.red}/></div>
            <div style={{flex:1,textAlign:'left',minWidth:0}}>
              <div style={{fontSize: wide ? 15 : 14,fontWeight:700,color:t.ink,display:'flex',alignItems:'center',gap:6}}>
                {cat.name}<span style={{fontSize:11,color:t.inkMute,fontWeight:500}}>{cat.items.filter(i=>itemTotalRaw(i.id)>0 || i.auto).length}/{cat.items.length}</span>
              </div>
              <div style={{fontSize:11,color:t.inkMute,marginTop:4}}>
                <span style={{fontWeight:600,color: util > 0 ? t.red : t.inkMute}}>{util}%</span> · RM {claimed.toLocaleString()} of RM {cap.toLocaleString()}
              </div>
              <div style={{height:3,background:t.bgAlt,borderRadius:3,marginTop:6,marginRight:8}}><div style={{width:`${Math.min(100,util)}%`,height:'100%',background:t.red,borderRadius:3}}/></div>
            </div>
            <Icon name={expanded ? "chevD" : "chevR"} size={15} color={t.inkMute} style={{flexShrink:0}} />
          </button>
          {expanded && <div style={{borderTop:`1px solid ${t.hair}`,padding: wide ? '12px 14px 14px' : '8px 12px 12px',display: wide ? 'grid' : 'flex',gridTemplateColumns: wide ? 'repeat(4,minmax(0,1fr))' : undefined,flexDirection: wide ? undefined : 'column',gap: wide ? 10 : 8}}>
            {cat.items.map(item=>{
              const eItems=itemEntries(item.id); const raw=itemTotalRaw(item.id); const units=eItems[0]?.units||1; const capEff=item.cap>=999999?raw||1:(item.perUnit?item.cap*units:item.cap); const claimedAmt=item.auto?item.cap:Math.min(raw,capEff); const pct=item.cap>=999999?100:Math.round((claimedAmt/Math.max(1,capEff))*100);
              if (!wide) {
                // ── MOBILE: horizontal row layout ──
                return <div key={item.id} style={{border:`1px solid ${t.hair}`,borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,background:t.bg}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontSize:9,fontWeight:700,color:t.red,background:t.redSoft,padding:'2px 6px',borderRadius:6}}>{item.id.startsWith("G17") ? "G17" : item.id}</span>
                      {item.auto && <span style={{fontSize:9,fontWeight:700,color:t.green,background:t.greenSoft,padding:'2px 6px',borderRadius:6}}>AUTO</span>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:t.ink,lineHeight:1.3,marginBottom:2}}>{item.name}</div>
                    <div style={{fontSize:11,color:t.inkMute,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}}>{item.desc}</div>
                    <div style={{height:3,background:t.bgAlt,borderRadius:3,marginTop:8}}><div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:item.auto?t.green:t.red,borderRadius:3}}/></div>
                    <div style={{fontSize:10,color:t.inkMute,marginTop:4}}>RM {claimedAmt.toLocaleString()} of RM {capEff.toLocaleString()}</div>
                  </div>
                  <div style={{flexShrink:0,textAlign:'right'}}>
                    <div style={{fontFamily:FONT_DISPLAY,fontSize:18,fontWeight:700,color:t.ink,fontVariantNumeric:'tabular-nums',lineHeight:1}}>RM {claimedAmt.toLocaleString()}</div>
                    {item.auto
                      ? <div style={{fontSize:10,color:t.green,fontWeight:600,marginTop:4}}>Confirmed</div>
                      : <button onClick={()=>{setDrawerItemId(item.id); setDescIn(''); setAmtIn(''); setUnitsIn(1);}} style={{marginTop:6,border:'none',background:eItems.length?t.bgAlt:t.red,color:eItems.length?t.ink:'#fff',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:FONT,display:'block'}}>{eItems.length?'View':'Add'}</button>
                    }
                  </div>
                </div>;
              }
              // ── DESKTOP: tall card layout ──
              return <div key={item.id} style={{border:`1px solid ${t.hair}`,borderRadius:12,padding:12,display:'flex',flexDirection:'column',minHeight:216}}>
                <div style={{fontSize:10,fontWeight:700,color:t.red,background:t.redSoft,padding:'2px 6px',borderRadius:7,display:'inline-block',alignSelf:'flex-start',marginBottom:8}}>{item.id.startsWith("G17") ? "G17" : item.id}</div>
                <div style={{fontSize:19,fontFamily:FONT_DISPLAY,lineHeight:1.1,minHeight:42}}>{item.name}</div>
                <div style={{fontSize:12,color:t.inkMute,marginTop:6,minHeight:32,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{item.desc}</div>
                <div style={{fontFamily:FONT_DISPLAY,fontSize:28,marginTop:10,lineHeight:1.05}}>RM {claimedAmt.toLocaleString()}</div>
                <div style={{fontSize:12,color:t.inkMute,marginTop:2,textAlign:'right'}}>of RM {capEff.toLocaleString()}</div>
                <div style={{height:4,background:t.bgAlt,borderRadius:4,marginTop:10,marginBottom:12}}><div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:item.auto?t.green:t.red,borderRadius:4}}/></div>
                <div style={{marginTop:'auto',paddingTop:8,display:'flex',justifyContent:'space-between',alignItems:'center',minHeight:34,fontSize:11,color:t.inkMute,borderTop:`1px solid ${t.hair}`}}><span>{eItems.length?`${eItems.length} entr`+(eItems.length>1?'ies':'y'):'No entries yet'}</span>{item.auto?<span style={{color:t.green}}>Confirmed</span>:<button onClick={()=>{setDrawerItemId(item.id); setDescIn(''); setAmtIn(''); setUnitsIn(1);}} style={{border:'none',background:t.ink,color:t.bg,borderRadius:999,padding:'4px 12px',fontSize:12,fontWeight:700,cursor:'pointer',lineHeight:1,fontFamily:FONT}}>{eItems.length?'View':'Add'}</button>}</div>
              </div>
            })}
          </div>}
        </div>
      })}

      {drawerItem && (
        <div style={{ position:'fixed', inset:0, zIndex:700 }}>
          <div onClick={closeDrawer} style={{position:'absolute', inset:0, background:'rgba(20,20,24,0.62)', opacity: drawerClosing ? 0 : 1, transition: "opacity 180ms ease"}} />
          {!wide && <div style={{position:'absolute', left:'50%', top:12, transform:'translateX(-50%)', width:40, height:4, background:'rgba(255,255,255,0.3)', borderRadius:2, zIndex:1}} />}
          <div style={{
            position:'absolute',
            ...(wide
              ? { right:0, top:0, height:'100%', width:440, borderLeft:`1px solid ${t.hair}`, transform: drawerClosing ? "translateX(100%)" : "translateX(0)", transition: "transform 180ms ease" }
              : { left:0, right:0, bottom:0, maxHeight:'88vh', borderRadius:'20px 20px 0 0', transform: drawerClosing ? "translateY(100%)" : "translateY(0)", transition: "transform 240ms cubic-bezier(0.32,0,0,1)" }
            ),
            background:t.surface, display:'flex', flexDirection:'column', overflow:'hidden'
          }}>
          {!wide && <div style={{display:'flex', justifyContent:'center', padding:'12px 0 0'}}><div style={{width:40, height:4, background:t.hair, borderRadius:2}}/></div>}
            <div style={{padding:18, borderBottom:`1px solid ${t.hair}`}}><div style={{fontSize:11,color:t.inkMute}}><span style={{background:t.redSoft,color:t.red,padding:'2px 7px',borderRadius:8,fontWeight:700}}>{drawerItem.id}</span> <span style={{marginLeft:6}}>LHDN tax relief</span><button onClick={closeDrawer} style={{float:'right',border:'none',background:'transparent',cursor:'pointer'}}>✕</button></div><div style={{fontSize:33,fontFamily:"'DM Serif Display', Georgia, serif",marginTop:8,lineHeight:1.05}}>{drawerItem.name}</div><div style={{fontSize:14,color:t.inkSoft,marginTop:6}}>{drawerItem.desc}</div><div style={{border:`1px solid ${t.hair}`,borderRadius:10,padding:12,marginTop:12}}><div style={{display:'flex',justifyContent:'space-between'}}><div style={{fontSize:40,fontFamily:"'DM Serif Display', Georgia, serif"}}>RM {drawerClaimed.toLocaleString()}</div><div style={{fontSize:13,color:t.inkMute,alignSelf:'flex-end'}}>of RM {drawerCap.toLocaleString()} cap</div></div><div style={{height:4,background:t.bgAlt,borderRadius:4}}><div style={{width:`${Math.min(100,(drawerClaimed/Math.max(1,drawerCap))*100)}%`,height:'100%',background:t.red,borderRadius:4}}/></div><div style={{fontSize:13,color:t.inkMute,marginTop:6}}>RM {Math.max(0,drawerCap-drawerClaimed).toLocaleString()} remaining</div></div></div>
            <div style={{padding:18, overflow:'auto', flex:1}}><div style={{fontSize:11,letterSpacing:1,fontWeight:700,color:t.inkMute,marginBottom:8}}>ENTRIES · {drawerEntries.length}</div>{drawerEntries.length===0?<div style={{border:`1px dashed ${t.hairStrong}`,borderRadius:10,padding:24,textAlign:'center',color:t.inkMute}}>No claim entries yet. Add your first one below.</div>:drawerEntries.map(e=><div key={e.id} style={{border:`1px solid ${t.hair}`,borderRadius:10,padding:'10px 12px',display:'flex',alignItems:'center',marginBottom:8}}><div style={{flex:1}}><div style={{fontSize:14,fontWeight:600}}>{e.desc}</div><div style={{fontSize:12,color:t.inkMute}}>{e.date}</div></div><div style={{fontWeight:700}}>RM {e.amount.toLocaleString()}</div><button onClick={()=>onRemoveEntry(e.id)} style={{border:'none',background:'transparent',marginLeft:8,cursor:'pointer'}}>🗑</button></div>)}
              <div style={{border:`1px solid ${t.hair}`,borderRadius:10,padding:12,marginTop:14}}><div style={{fontSize:28,fontFamily:"'DM Serif Display', Georgia, serif",marginBottom:8}}>Add a new entry</div><div style={{fontSize:12,marginBottom:4}}>Description</div><input value={descIn} onChange={e=>setDescIn(e.target.value)} placeholder='e.g. Annual check-up at KPJ' style={{width:'100%',padding:'10px 11px',border:`1px solid ${t.hair}`,borderRadius:10,marginBottom:8,fontFamily:FONT}}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><div><div style={{fontSize:12,marginBottom:4}}>Date</div><input type='date' value={dateIn} onChange={e=>setDateIn(e.target.value)} style={{width:'100%',padding:'10px 11px',border:`1px solid ${t.hair}`,borderRadius:10,fontFamily:FONT}}/></div><div><div style={{fontSize:12,marginBottom:4}}>Amount (RM)</div><input type='number' value={amtIn} onChange={e=>setAmtIn(e.target.value)} style={{width:'100%',padding:'10px 11px',border:`1px solid ${t.hair}`,borderRadius:10,fontFamily:FONT}}/></div></div><button onClick={handleDrawerAdd} style={{width:'100%',marginTop:10,padding:'10px',border:'none',borderRadius:10,background:t.red,color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Add entry</button></div>
            </div>
            <div style={{padding:'12px 18px',borderTop:`1px solid ${t.hair}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div style={{fontSize:12,color:t.inkMute}}>Claimed RM {drawerClaimed.toLocaleString()} / RM {drawerCap.toLocaleString()}</div><button onClick={closeDrawer} style={{border:`1px solid ${t.hair}`,background:t.surface,padding:'8px 16px',borderRadius:12,fontWeight:600,cursor:'pointer'}}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INCOME TAB
// ─────────────────────────────────────────────────────────────
// INCOME TAB — EA Form + AI reader + Employed/Self-Employed
// ─────────────────────────────────────────────────────────────
function IncomeTab({ t, L, ya, incomes, rentalIncomes, onAdd, onRemove, onAddRental, onRemoveRental,
  totalEmploymentIncome, totalRentalIncome, totalRentalExpenses, netRentalIncome,
  totalIncome, totalRelief, chargeable, estTax, taxIsTentative }) {
  const wide = useIsWide();

  // ── Form state ──────────────────────────────────────────────
  const [empType,     setEmpType]     = useState("employed"); // "employed" | "self"
  const [employer,    setEmployer]    = useState("");
  const [grossSalary, setGrossSalary] = useState("");
  const [bonus,       setBonus]       = useState("");
  const [otherAllow,  setOtherAllow]  = useState("");
  const [mtdPaid,     setMtdPaid]     = useState("");
  const [epfContrib,  setEpfContrib]  = useState("");
  const [socso,       setSocso]       = useState("");
  const [bizIncome,   setBizIncome]   = useState("");
  const [cp500,       setCp500]       = useState("");

  // ── EA Form AI state ─────────────────────────────────────────
  const [aiLoading,   setAiLoading]   = useState(false);
  const [aiErr,       setAiErr]       = useState(null);
  const [showManual,  setShowManual]  = useState(false);
  const fileRef = useRef(null);

  // ── Rental state ──────────────────────────────────────────────
  const [rentalAddr, setRentalAddr]  = useState("");
  const [rentalAmt,  setRentalAmt]   = useState("");

  const totalForEntry = empType === "self"
    ? (parseFloat(bizIncome) || 0)
    : (parseFloat(grossSalary) || 0) + (parseFloat(bonus) || 0) + (parseFloat(otherAllow) || 0);

  // ── AI EA Form reader ─────────────────────────────────────────
  const readEAForm = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setAiErr(null);
    setAiLoading(true);
    try {
      const raw = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      const semicolonIdx = raw.indexOf(";");
      const commaIdx = raw.indexOf(",");
      const mediaType = raw.substring(5, semicolonIdx);
      const b64data = raw.substring(commaIdx + 1);

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: `You are an expert at reading Malaysian EA forms (Borang EA / CP8A). Extract the following fields exactly and return ONLY valid JSON with no markdown:
{"employer":"company name","grossSalary":0,"bonus":0,"otherAllowances":0,"mtdPaid":0,"epfContrib":0,"socso":0}
Fields:
- employer: Company name from the EA form
- grossSalary: Section B1a — Gross salary/wages
- bonus: Section B1b — Bonus and commission  
- otherAllowances: Section B1c — Other allowances and perquisites
- mtdPaid: Section D1 — MTD/PCB deducted
- epfContrib: Section E1 — EPF employee contributions
- socso: Section E2 — SOCSO/PERKESO contributions
If a field is not found or unclear, use 0. All values are numbers, no RM prefix.`,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64data } },
            { type: "text", text: "Extract all the income and deduction fields from this EA form." }
          ]}],
        }),
      });
      const data = await res.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) throw new Error("No response");
      let raw2 = textBlock.text.trim().replace(/```json|```/g, "");
      const parsed = JSON.parse(raw2.substring(raw2.indexOf("{"), raw2.lastIndexOf("}") + 1));
      setShowManual(true); // auto-expand when AI fills fields
      if (parsed.employer)        setEmployer(parsed.employer);
      if (parsed.grossSalary)     setGrossSalary(String(parsed.grossSalary));
      if (parsed.bonus)           setBonus(String(parsed.bonus));
      if (parsed.otherAllowances) setOtherAllow(String(parsed.otherAllowances));
      if (parsed.mtdPaid)         setMtdPaid(String(parsed.mtdPaid));
      if (parsed.epfContrib)      setEpfContrib(String(parsed.epfContrib));
      if (parsed.socso)           setSocso(String(parsed.socso));
    } catch (ex) {
      setAiErr("Could not read EA form. Please fill in manually.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (totalForEntry <= 0) return;
    const inc = {
      id: newId(),
      employer: employer || (empType === "self" ? "Self-employment" : "Employer"),
      amount: totalForEntry,
      type: empType,
      grossSalary:   parseFloat(grossSalary)  || 0,
      bonus:         parseFloat(bonus)         || 0,
      otherAllow:    parseFloat(otherAllow)    || 0,
      mtdPaid:       parseFloat(mtdPaid)       || 0,
      epfContrib:    parseFloat(epfContrib)    || 0,
      socso:         parseFloat(socso)         || 0,
      bizIncome:     parseFloat(bizIncome)     || 0,
      cp500:         parseFloat(cp500)         || 0,
      period: `YA${ya}`,
    };
    await onAdd(inc);
    setEmployer(""); setGrossSalary(""); setBonus(""); setOtherAllow("");
    setMtdPaid(""); setEpfContrib(""); setSocso(""); setBizIncome(""); setCp500("");
    setAiErr(null);
  };

  const inp = (val, set, ph, prefix = "RM") => (
    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.surface, overflow: "hidden" }}>
      {prefix && <span style={{ padding: "0 10px", fontSize: 13, color: t.inkMute, borderRight: `1px solid ${t.hair}`, height: "100%", display: "flex", alignItems: "center", background: t.bgAlt, fontFamily: FONT }}>{prefix}</span>}
      <input value={val} onChange={e => set(e.target.value)} type="number" placeholder={ph}
        style={{ flex: 1, padding: "11px 12px", border: "none", background: "transparent", color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none" }} />
    </div>
  );

  const field = (label, val, set, ph, hint) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      {inp(val, set, ph)}
      {hint && <div style={{ fontSize: 11, color: t.inkMute, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );

  const cardStyle = { background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 16, padding: wide ? 24 : 18, marginBottom: 16 };
  const tabBtn = (id, label) => (
    <button onClick={() => setEmpType(id)} style={{
      flex: 1, padding: "10px 0", border: "none", borderRadius: 10,
      background: empType === id ? t.ink : "transparent",
      color: empType === id ? t.bg : t.inkMute,
      fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer", transition: "all 0.15s"
    }}>{label}</button>
  );

  return (
    <div style={{ padding: wide ? "24px 28px 60px" : "12px 16px 120px", fontFamily: FONT, maxWidth: wide ? 800 : "100%", margin: "0 auto" }}>

      {/* ── Income entry form ── */}
      <div style={cardStyle}>
        <div style={{ fontSize: wide ? 20 : 17, fontWeight: 700, color: t.ink, marginBottom: 4 }}>Employment Income</div>
        <div style={{ fontSize: 13, color: t.inkMute, marginBottom: 18 }}>Update your income information for YA{ya}</div>

        {/* Employed / Self-Employed toggle */}
        <div style={{ display: "flex", gap: 4, background: t.bgAlt, borderRadius: 12, padding: 4, marginBottom: 20 }}>
          {tabBtn("employed", "Employed")}
          {tabBtn("self", "Self-Employed")}
        </div>

        {empType === "employed" && <>
          {/* EA Form AI upload */}
          <div style={{ border: `1.5px dashed ${t.hair}`, borderRadius: 14, padding: "16px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: aiLoading ? t.bgAlt : t.bg }}
            onClick={() => fileRef.current?.click()}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: t.redSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {aiLoading
                ? <div style={{ width: 20, height: 20, border: `2px solid ${t.hair}`, borderTopColor: t.red, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                : <Icon name="sparkleAi" size={18} color={t.red} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>{aiLoading ? "Reading EA form…" : "Upload EA Form"}</div>
              <div style={{ fontSize: 12, color: t.inkMute, marginTop: 2 }}>Upload image or PDF — AI will auto-fill the fields below</div>
            </div>
            {!aiLoading && <span style={{ fontSize: 12, fontWeight: 600, color: t.red }}>Browse</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={readEAForm} />
          {aiErr && <div style={{ padding: "10px 14px", background: t.redSoft, borderRadius: 10, fontSize: 12, color: t.red, marginBottom: 14 }}>{aiErr}</div>}

          {/* Toggle for manual entry */}
          <button onClick={() => setShowManual(v => !v)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 14px", border: `1px solid ${t.hair}`, borderRadius: 10,
            background: showManual ? t.bgAlt : t.surface, cursor: "pointer",
            fontFamily: FONT, fontSize: 13, fontWeight: 600, color: t.ink, marginBottom: showManual ? 16 : 0,
          }}>
            <span>Enter manually</span>
            <Icon name={showManual ? "chevD" : "chevR"} size={14} color={t.inkMute} />
          </button>

          {showManual && <>
            {/* Employer name */}
            <div style={{ marginBottom: 14, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Employer Name</div>
              <input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="e.g. Acme Sdn Bhd"
                style={{ width: "100%", padding: "11px 14px", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.surface, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Section B — Employment Income */}
            <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, letterSpacing: "0.08em", marginBottom: 10, paddingBottom: 4, borderBottom: `1px solid ${t.hair}` }}>
              SECTION B · EMPLOYMENT INCOME
            </div>
            {field("B1a  Gross Salary / Wages", grossSalary, setGrossSalary, "0", "Your annual gross salary or wages")}
            {field("B1b  Bonus & Commission", bonus, setBonus, "0", "Annual bonus and commission received")}
            {field("B1c  Other Allowances", otherAllow, setOtherAllow, "0", "Other allowances and perquisites")}

            {/* Section D — Tax Deducted */}
            <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, letterSpacing: "0.08em", margin: "18px 0 10px", paddingBottom: 4, borderBottom: `1px solid ${t.hair}` }}>
              SECTION D · TAX DEDUCTED
            </div>
            {field("D1  MTD / PCB Paid", mtdPaid, setMtdPaid, "0", "Total Monthly Tax Deduction paid throughout the year")}

            {/* Section E — Employee Contributions */}
            <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, letterSpacing: "0.08em", margin: "18px 0 10px", paddingBottom: 4, borderBottom: `1px solid ${t.hair}` }}>
              SECTION E · EMPLOYEE CONTRIBUTIONS
            </div>
            {field("E1  EPF Contributions", epfContrib, setEpfContrib, "0", "Your EPF contributions (employee portion)")}
            {field("E2  SOCSO / PERKESO", socso, setSocso, "0", "Your SOCSO contributions")}
          </>}
        </>}

        {empType === "self" && <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Business / Freelance Description</div>
            <input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="e.g. Freelance design, consulting"
              style={{ width: "100%", padding: "11px 14px", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.surface, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
          </div>
          {field("Total Business Income", bizIncome, setBizIncome, "0", "Your total annual business or freelance income")}
          {field("CP500 Tax Installments Paid", cp500, setCp500, "0", "Total CP500 installment payments made this year")}
          <div style={{ padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#2563EB", lineHeight: 1.5 }}>
              <strong>Note:</strong> Voluntary EPF (i-Saraan) and SOCSO contributions can be claimed as tax relief. Add them as transactions in the Relief tab to track your reliefs.
            </div>
          </div>
        </>}

        {/* Total + Save */}
        <div style={{ background: t.bgAlt, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total Annual Income</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
              RM {totalForEntry.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <button onClick={handleSave} disabled={totalForEntry <= 0}
            style={{ padding: "12px 24px", border: "none", borderRadius: 12, background: totalForEntry > 0 ? t.red : t.bgAlt, color: totalForEntry > 0 ? "#fff" : t.inkMute, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: totalForEntry > 0 ? "pointer" : "not-allowed" }}>
            Save Changes
          </button>
        </div>
      </div>

      {/* ── Saved employment sources ── */}
      {incomes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Employment Sources · {incomes.length}
          </div>
          {incomes.map(inc => (
            <div key={inc.id} style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: "14px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>{inc.employer || "Employer"}</div>
                  <div style={{ fontSize: 11, color: t.inkMute, marginTop: 2 }}>{inc.type === "self" ? "Self-employed" : "Employed"} · YA{ya}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>RM {(inc.amount || 0).toLocaleString()}</div>
                  <button onClick={() => onRemove(inc.id)} style={{ fontSize: 11, color: t.red, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>Remove</button>
                </div>
              </div>
              {/* Breakdown */}
              {inc.grossSalary > 0 && (
                <div style={{ borderTop: `1px solid ${t.hair}`, paddingTop: 10, display: "grid", gridTemplateColumns: wide ? "1fr 1fr 1fr" : "1fr 1fr", gap: "6px 12px" }}>
                  {[["Gross salary", inc.grossSalary], ["Bonus", inc.bonus], ["Other allow.", inc.otherAllow], ["MTD paid", inc.mtdPaid], ["EPF", inc.epfContrib], ["SOCSO", inc.socso]].filter(([,v]) => v > 0).map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.inkMute }}>
                      <span>{l}</span><span style={{ fontWeight: 600, color: t.ink, fontVariantNumeric: "tabular-nums" }}>RM {(v||0).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Rental Income section ── */}
      <div style={cardStyle}>
        <div style={{ fontSize: wide ? 18 : 15, fontWeight: 700, color: t.ink, marginBottom: 4 }}>Rental Income</div>
        <div style={{ fontSize: 12, color: t.inkMute, marginBottom: 16, lineHeight: 1.5 }}>Gross rent received. Add deductible expenses under Relief → Rental to reduce your net rental income.</div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Property description</div>
          <input value={rentalAddr} onChange={e => setRentalAddr(e.target.value)} placeholder="e.g. Condo Unit A-12-3, PJ"
            style={{ width: "100%", padding: "11px 14px", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.surface, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Annual gross rental income</div>
          {inp(rentalAmt, setRentalAmt, "0")}
        </div>
        <button onClick={async () => {
          if (!rentalAddr || !rentalAmt) return;
          await onAddRental({ id: newId(), employer: rentalAddr, amount: parseFloat(rentalAmt) || 0, period: "Rental income" });
          setRentalAddr(""); setRentalAmt("");
        }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 12, background: t.gold, color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="plus" size={16} color="#fff" /> Add Rental Income
        </button>
      </div>

      {/* ── Saved rental properties ── */}
      {rentalIncomes.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
            Rental Properties · {rentalIncomes.length}
          </div>
          {rentalIncomes.map(inc => (
            <div key={inc.id} style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: t.goldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="key" size={18} color={t.gold} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inc.employer}</div>
                <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>Gross rental</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>RM {inc.amount.toLocaleString()}</div>
              <button onClick={() => onRemoveRental(inc.id)} style={{ width: 28, height: 28, border: "none", borderRadius: 8, background: t.goldSoft, color: t.gold, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={14} color={t.gold} />
              </button>
            </div>
          ))}
          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
            {[["Gross rental income", totalRentalIncome, t.ink], ["Deductible expenses", -totalRentalExpenses, t.green], ["Net rental income", netRentalIncome, t.ink]].map(([l, v, c], i) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: i === 2 ? 13 : 12, fontWeight: i === 2 ? 700 : 500, color: i === 2 ? t.ink : t.inkSoft, padding: "4px 0", borderTop: i === 2 ? `1px solid ${t.hair}` : "none", marginTop: i === 2 ? 6 : 0, paddingTop: i === 2 ? 8 : 4 }}>
                <span>{l}</span><span style={{ fontVariantNumeric: "tabular-nums", color: c }}>RM {Math.abs(v).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReceiptsTab({ t, receipts, onRemove, onView }) {
  return (
    <div style={{ padding: "0 16px 40px", fontFamily: FONT }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>
        All receipts · {receipts.length}
      </div>
      {receipts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <Icon name="receipt" size={42} color={t.inkMute} />
          <div style={{ fontSize: 14, fontWeight: 600, color: t.inkSoft, marginTop: 12 }}>No receipts yet</div>
          <div style={{ fontSize: 12, color: t.inkMute, marginTop: 4 }}>Tap Scan Receipt on the Relief tab to add one</div>
        </div>
      ) : receipts.map(rx => {
        const itemId = rx.itemId || rx.item_id;
        const imgSrc = rx.storage_url || rx.data;
        return (
          <div key={rx.id} style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
            {imgSrc ? (
              <img src={imgSrc} onClick={() => onView(imgSrc)} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", cursor: "pointer", flexShrink: 0 }} alt="Receipt" />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: 12, background: t.bgAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="receipt" size={22} color={t.inkSoft} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rx.merchant || rx.name}</div>
              <div style={{ fontSize: 11, color: t.inkMute, marginTop: 2 }}>{rx.date}</div>
              {itemId && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: t.red, background: t.redSoft, padding: "2px 7px", borderRadius: 5 }}>{itemId} · {rx.name}</span>
                </div>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>RM {(rx.amount || 0).toLocaleString()}</div>
            <button onClick={() => onRemove(rx.id)} style={{ width: 26, height: 26, border: "none", borderRadius: 8, background: t.redSoft, color: t.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={12} color={t.red} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MORE TAB
// ─────────────────────────────────────────────────────────────
function MoreTab({ t, L, lang, setLang, user, ya, themeName, setTheme, onSignOut, onDeleteAccount, onReset, onExport,
  onImport, onPrivacy, onSignInGoogle, supabase, cryptoKey, entries, receipts, incomes, rentalIncomes }) {
  const [exporting,      setExporting]      = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [driveStep,      setDriveStep]      = useState(""); // "" | "requesting" | "uploading" | "done"

  const rowStyle = {
    display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
    background: t.surface, borderRadius: 14, border: `1px solid ${t.hair}`,
    marginBottom: 8, cursor: "pointer",
  };

  // ── Google Drive export ─────────────────────────────────────
  const runDriveExport = async () => {
    if (!user || user.provider !== "google") {
      alert("Sign in with Google first to export to Google Drive."); return;
    }
    if (exporting) return;
    setExporting(true);
    setDriveStep("requesting");
    setExportProgress("Requesting Google Drive access…");

    try {
      const token = await requestDriveToken();
      setDriveStep("uploading");

      // ── Build folder structure: MakeCents → YAxxxx → Receipts ──
      setExportProgress("Creating MakeCents folder…");
      const rootId  = await driveMkFolder(token, "MakeCents", "root");
      const yaId    = await driveMkFolder(token, `YA${ya}`, rootId);
      const recId   = await driveMkFolder(token, "Receipts", yaId);

      // ── Fetch data from Supabase (source of truth for Google users) ──
      setExportProgress("Fetching your data…");
      let exportEntries = entries, exportReceipts = receipts,
          exportIncomes = incomes, exportRentals = rentalIncomes;

      if (user?.id) {
        const [{ data: cl }, { data: inc }, { data: rec }] = await Promise.all([
          supabase.from("claims").select("*").eq("user_id", user.id).eq("ya", ya),
          supabase.from("incomes").select("*").eq("user_id", user.id).eq("ya", ya),
          supabase.from("receipts").select("*").eq("user_id", user.id).eq("ya", ya),
        ]);

        // Decrypt enc_payload for each row so that CSV columns contain
        // the real values, not zeros/nulls from the placeholder columns.
        exportEntries = await Promise.all(
          (cl || []).map(async (c) => {
            const p = await openEncPayload(cryptoKey, c.enc_payload);
            return { ...c, amount: p?.amount ?? c.amount ?? 0, description: p?.description ?? c.description };
          })
        );
        const allInc = await Promise.all(
          (inc || []).map(async (i) => {
            const p = await openEncPayload(cryptoKey, i.enc_payload);
            return { ...i, amount: p?.amount ?? i.amount ?? 0, employer: p?.employer ?? i.employer, period: p?.period ?? i.period };
          })
        );
        exportIncomes  = allInc.filter(i => i.type !== "rental");
        exportRentals  = allInc.filter(i => i.type === "rental");
        exportReceipts = await Promise.all(
          (rec || []).map(async (r) => {
            const p = await openEncPayload(cryptoKey, r.enc_payload);
            return { ...r, merchant: p?.merchant ?? r.merchant, amount: p?.amount ?? r.amount ?? 0, name: p?.name ?? r.name, date: p?.date ?? r.date };
          })
        );
      }

      // Totals for the summary sheet
      const empTotal    = exportIncomes.reduce((s, i) => s + (i.amount || 0), 0);
      const rentalTotal = exportRentals.reduce((s, i) => s + (i.amount || 0), 0);
      const claimsTotal = exportEntries.reduce((s, c) => s + (c.amount || 0), 0);
      const receiptsCount = exportReceipts.length;

      // ── Build CSV #1: Summary ───────────────────────────────
      setExportProgress("Building summary spreadsheet…");
      const summaryRows = [
        ["MakeCents Tax Summary", "", ""],
        ["Year of Assessment", `YA${ya}`, ""],
        ["Exported", new Date().toLocaleString("en-GB"), ""],
        ["User",  user.name || "", user.email || ""],
        ["", "", ""],
        ["Totals", "", ""],
        ["Employment income (RM)", empTotal.toFixed(2), ""],
        ["Rental income — gross (RM)", rentalTotal.toFixed(2), ""],
        ["Total relief claims (RM)", claimsTotal.toFixed(2), ""],
        ["Number of receipts", receiptsCount, ""],
        ["", "", ""],
        ["Notes", "", ""],
        ["This export is for your own records. Keep receipts 7 years for LHDN audit.", "", ""],
      ];
      await driveUploadFile(
        token,
        `YA${ya}-summary.csv`,
        new Blob([buildCSV(summaryRows)], { type: "text/csv;charset=utf-8" }),
        yaId
      );

      // ── Build CSV #2: Income ────────────────────────────────
      const incomeRows = [["Type", "Source / Property", "Amount (RM)", "Period"]];
      exportIncomes.forEach(i => incomeRows.push(["Employment", i.employer || "", (i.amount || 0).toFixed(2), i.period || ""]));
      exportRentals.forEach(i => incomeRows.push(["Rental",     i.employer || "", (i.amount || 0).toFixed(2), i.period || "Rental income"]));
      await driveUploadFile(
        token,
        `YA${ya}-income.csv`,
        new Blob([buildCSV(incomeRows)], { type: "text/csv;charset=utf-8" }),
        yaId
      );

      // ── Build CSV #3: Relief claims / expenses ──────────────
      const claimRows = [["Date", "Category ID", "Category name", "Description", "Amount (RM)", "Units", "Has receipt"]];
      exportEntries.forEach(c => {
        const catName = (REL[ya] || REL["2025"]).flatMap(cat => cat.items).find(i => i.id === c.item_id)?.name || "";
        const dateStr = c.created_at
          ? new Date(c.created_at).toLocaleDateString("en-GB")
          : (c.date || "");
        claimRows.push([
          dateStr,
          c.item_id || "",
          catName,
          c.description || "",
          (c.amount || 0).toFixed(2),
          c.units || 1,
          c.has_receipt ? "Yes" : "No",
        ]);
      });
      await driveUploadFile(
        token,
        `YA${ya}-claims.csv`,
        new Blob([buildCSV(claimRows)], { type: "text/csv;charset=utf-8" }),
        yaId
      );

      // ── Build CSV #4: Receipts index (merchant / amount / file link) ──
      const rxIndexRows = [["Merchant", "Category", "Amount (RM)", "Date", "Filename in Receipts folder"]];

      // ── Upload receipt images, organised by category, and build index ──
      const catFolderCache = {};
      let uploaded = 0;
      for (let i = 0; i < exportReceipts.length; i++) {
        const rx = exportReceipts[i];
        setExportProgress(`Uploading receipt ${i + 1} of ${exportReceipts.length}…`);

        const itemId   = rx.item_id || rx.itemId || "Uncategorized";
        const itemName = (rx.name || itemId).replace(/[^a-zA-Z0-9 \-_]/g, "").trim().slice(0, 40);
        const catKey   = `${itemId} - ${itemName}`;

        if (!catFolderCache[catKey]) {
          catFolderCache[catKey] = await driveMkFolder(token, catKey, recId);
        }

        const imgSrc = rx.storage_url || rx.data;
        const merchant = (rx.merchant || rx.name || "receipt")
          .replace(/[^a-zA-Z0-9 \-]/g, "").trim().slice(0, 30);
        const fname = `${merchant}-${String(rx.id).slice(-6)}.jpg`;

        rxIndexRows.push([
          rx.merchant || rx.name || "",
          catKey,
          (rx.amount || 0).toFixed(2),
          rx.date || "",
          imgSrc ? `Receipts/${catKey}/${fname}` : "(image not available)",
        ]);

        if (imgSrc) {
          const blob = await fetchImgAsBlob(imgSrc);
          if (blob) {
            await driveUploadFile(token, fname, blob, catFolderCache[catKey]);
            uploaded++;
          }
        }
      }

      // Upload receipts index last (now that we know all filenames)
      await driveUploadFile(
        token,
        `YA${ya}-receipts-index.csv`,
        new Blob([buildCSV(rxIndexRows)], { type: "text/csv;charset=utf-8" }),
        yaId
      );

      setDriveStep("done");
      setExportProgress(`✓ Exported: 4 CSVs + ${uploaded} receipt image${uploaded === 1 ? "" : "s"}`);
      setTimeout(() => { setExportProgress(""); setDriveStep(""); }, 5000);

    } catch (e) {
      console.error("Drive export error:", e);
      const msg = e.message?.includes("popup_closed")
        ? "Permission dialog was closed. Please try again."
        : e.message?.includes("VITE_GOOGLE_CLIENT_ID")
        ? "Google Client ID not configured — check Vercel env vars."
        : "Drive export failed: " + (e.message || "Unknown error");
      alert(msg);
      setExportProgress("");
      setDriveStep("");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: "0 20px 40px", fontFamily: FONT }}>

      {/* Profile card */}
      <div style={{ background: t.surface, padding: 18, borderRadius: 18, border: `1px solid ${t.hair}`, marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: t.red, color: "#fff", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {(user?.name || "U")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.ink }}>{user?.name}</div>
          <div style={{ fontSize: 12, color: t.inkMute, marginTop: 2 }}>
            {user?.provider === "google" ? L("google_synced") : L("guest_local")} · YA{ya}
          </div>
        </div>
        {user?.provider === "google" && (
          <div style={{ padding: "4px 10px", borderRadius: 8, background: t.greenSoft, color: t.green, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{L("synced")}</div>
        )}
      </div>

      {/* Guest upgrade prompt */}
      {user?.provider !== "google" && (
        <div style={{ background: t.ink, borderRadius: 16, padding: 18, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Icon name="cloud" size={20} color={t.bg} />
            <div style={{ fontSize: 14, fontWeight: 700, color: t.bg }}>{L("backup_title")}</div>
          </div>
          <div style={{ fontSize: 12, color: t.cardLabelSoft, lineHeight: 1.5, marginBottom: 14 }}>
            {L("backup_sub")}
          </div>
          <button onClick={onSignInGoogle} style={{ width: "100%", padding: "13px 18px", border: "none", borderRadius: 12, background: t.red, color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="google" size={16} color="#fff" />
            {L("signin_google")}
          </button>
        </div>
      )}

      {/* Appearance */}
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>{L("appearance")}</div>
      <div style={{ background: t.surface, borderRadius: 16, border: `1px solid ${t.hair}`, padding: 6, display: "flex", gap: 6, marginBottom: 20 }}>
        {[{ k: "light", label: L("light"), icon: "sun" }, { k: "dark", label: L("dark"), icon: "moon" }].map(opt => {
          const active = themeName === opt.k;
          return (
            <button key={opt.k} onClick={() => setTheme(opt.k)}
              style={{ flex: 1, padding: "12px 16px", border: "none", borderRadius: 12, background: active ? t.ink : "transparent", color: active ? t.bg : t.inkSoft, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name={opt.icon} size={16} color={active ? t.bg : t.inkSoft} />
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Language picker */}
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>{L("language")}</div>
      <div style={{ background: t.surface, borderRadius: 16, border: `1px solid ${t.hair}`, padding: 6, display: "flex", gap: 6, marginBottom: 20 }}>
        {[{ k: "en", label: "English" }, { k: "ms", label: "Bahasa Malaysia" }].map(opt => {
          const active = lang === opt.k;
          return (
            <button key={opt.k} onClick={() => setLang(opt.k)}
              style={{ flex: 1, padding: "12px 16px", border: "none", borderRadius: 12, background: active ? t.ink : "transparent", color: active ? t.bg : t.inkSoft, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Data */}
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>{L("data_export")}</div>

      {/* Google Drive Export */}
      {user?.provider === "google" ? (
        <div onClick={runDriveExport} style={rowStyle}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: t.greenSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {exporting
              ? <div style={{ width: 16, height: 16, border: `2px solid ${t.hair}`, borderTopColor: t.green, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              : <Icon name="cloud" size={18} color={t.green} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>
              {driveStep === "done" ? L("exported") : exporting ? L("exporting") : L("export_drive")}
            </div>
            <div style={{ fontSize: 11, color: t.inkMute, marginTop: 2 }}>
              {exportProgress || L("export_drive_sub", ya)}
            </div>
          </div>
          {!exporting && <Icon name="chevR" size={14} color={t.inkMute} />}
        </div>
      ) : (
        <div style={{ ...rowStyle, opacity: 0.6 }}>
          <Icon name="cloud" size={18} color={t.inkMute} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: t.inkMute }}>{L("export_drive")}</div>
            <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>{L("signin_google")}</div>
          </div>
        </div>
      )}

      {/* JSON backup */}
      <div onClick={async () => {
        if (exporting) return;
        setExporting(true);
        try { await onExport(); } finally { setExporting(false); }
      }} style={rowStyle}>
        <Icon name="download" size={18} color={t.inkSoft} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.ink }}>{L("dl_json")}</div>
          <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>{L("dl_json_sub")}</div>
        </div>
        <Icon name="chevR" size={14} color={t.inkMute} />
      </div>

      {/* Restore */}
      <label style={rowStyle}>
        <Icon name="upload" size={18} color={t.inkSoft} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.ink }}>{L("restore")}</div>
          <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>{L("restore_sub")}</div>
        </div>
        <Icon name="chevR" size={14} color={t.inkMute} />
        <input type="file" accept=".json" onChange={onImport} style={{ display: "none" }} />
      </label>

      {/* Reset YA */}
      <div onClick={onReset} style={{ ...rowStyle, marginTop: 8 }}>
        <Icon name="trash" size={18} color={t.red} />
        <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.red }}>{L("reset_ya", ya)}</div>
      </div>

      {/* Coming soon */}
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "16px 4px 10px" }}>{L("coming_soon")}</div>
      <div style={{ background: t.surface, padding: 16, borderRadius: 16, border: `1px solid ${t.hair}`, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["Debt Tracker", "Savings Goals", "Budget Planner", "EPF Calc", "Zakat Calc"].map(f => (
          <span key={f} style={{ fontSize: 11, fontWeight: 500, color: t.inkSoft, background: t.bgAlt, padding: "7px 12px", borderRadius: 20 }}>{f}</span>
        ))}
      </div>

      {/* Legal */}
      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "16px 4px 10px" }}>{L("legal_account")}</div>
      <div onClick={onPrivacy} style={rowStyle}>
        <Icon name="shield" size={18} color={t.inkSoft} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.ink }}>{L("privacy_policy")}</div>
          <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>{L("privacy_sub")}</div>
        </div>
        <Icon name="chevR" size={14} color={t.inkMute} />
      </div>

      {/* Sign out */}
      <button onClick={onSignOut} style={{ width: "100%", padding: 16, marginTop: 8, border: `1px solid ${t.hair}`, borderRadius: 14, background: "transparent", color: t.inkSoft, fontSize: 14, fontWeight: 500, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon name="logout" size={16} color={t.inkSoft} />
        {L("sign_out")}
      </button>

      {/* Delete account */}
      <button onClick={onDeleteAccount} style={{ width: "100%", padding: 14, marginTop: 8, border: `1px solid ${t.redSoft}`, borderRadius: 14, background: "transparent", color: t.red, fontSize: 13, fontWeight: 500, fontFamily: FONT, cursor: "pointer" }}>
        {L("delete_account")}
      </button>

      <div style={{ textAlign: "center", fontSize: 10, color: t.inkMute, marginTop: 20 }}>
        MakeCents v4.5 · {L("not_fin_advice")}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SCANNER SHEET
// AI call goes through /api/scan proxy — key never exposed in browser
// ─────────────────────────────────────────────────────────────
function ScannerSheet({ open, onClose, onAdd, seededItem, t, L, ya, allItems }) {
  const [step,        setStep]        = useState("idle");
  const [desc,        setDesc]        = useState("");
  const [img,         setImg]         = useState(null);
  const [err,         setErr]         = useState(null);
  const [result,      setResult]      = useState(null);
  const [compressing, setCompressing] = useState(false);
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);
  const wide = useIsWide();

  useEffect(() => {
    if (open) { setStep("idle"); setDesc(""); setImg(null); setErr(null); setResult(null); setCompressing(false); }
  }, [open]);

  if (!open) return null;

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    setErr(null);

    // [Priority 3] Validate size and MIME type before any memory allocation
    const check = validateReceiptFile(f);
    if (!check.ok) { setErr(check.error); return; }

    setCompressing(true);
    try {
      const raw = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      const compressed = await compressImage(raw);
      setImg(compressed);
    } catch (ex) {
      console.error("Compression error:", ex?.message);
      setErr("Failed to process image. Please try a smaller photo.");
    } finally {
      setCompressing(false);
    }
  };

  const runAI = async () => {
    if (!img && !desc) return;
    setStep("analyzing");
    setErr(null);

    const list = allItems
      .filter(i => !i.auto && i.cap < 999999)
      .map(i => `${i.id}: ${i.name} (cap RM${i.cap}) - ${i.desc}`)
      .join("\n");

    const scopedId   = seededItem?.id;
    const scopedName = seededItem?.name;

    // [Priority 1] Sanitize user text before embedding in the system/user prompt
    const safeDesc = sanitizeForPrompt(desc);

    const systemPrompt = `You are a Malaysian income tax relief validator for Year of Assessment (YA) ${ya}, strictly following LHDN BE form guidelines. Your ONLY job is to determine if an expense qualifies for Malaysian income tax relief under the Income Tax Act 1967.

Available relief categories for YA${ya}:
${list}

${scopedId ? `The user is checking this expense against: ${scopedId} · ${scopedName}. Verify if it fits. If it fits a different category better, note that in the explanation but return the correct category.` : ""}

Rules:
- Map to the MOST SPECIFIC matching category based on the descriptions
- Sports & fitness (G10) INCLUDES: golf green fees, golf equipment (clubs/balls/bags), golf lessons, gym memberships, court rental (badminton/squash/tennis/golf simulator), swimming, martial arts, yoga, pilates, competition entry fees
- Sports & fitness (G10) EXCLUDES: golf buggy rental, club joining/membership fees, sports clothing/shoes/apparel
- When a receipt has BOTH claimable and non-claimable line items, sum ONLY the claimable line items for suggested_amount; use the full receipt total for total_amount
- Do NOT reject based on merchant name alone — analyse the actual line items
- Approve confidently when an expense clearly matches a category
- Only reject if the expense genuinely has NO matching category

Reply with ONLY valid JSON — no markdown, no code fences, no explanation outside the JSON:
{"claimable":true,"category_id":"G10","category_name":"Sports & fitness","total_amount":250,"suggested_amount":250,"explanation":"Brief reason","conditions":"Keep receipt for 7 years for LHDN audit."}

If not claimable:
{"claimable":false,"category_id":null,"category_name":null,"total_amount":0,"suggested_amount":0,"explanation":"Reason why not claimable.","conditions":null}`;

    const userContent = [];
    if (img) {
      const semicolonIdx = img.indexOf(";");
      const commaIdx     = img.indexOf(",");
      if (semicolonIdx === -1 || commaIdx === -1) {
        setErr("Invalid image format. Please try a different photo.");
        setStep("idle");
        return;
      }
      const mediaType = img.substring(5, semicolonIdx);
      const b64data   = img.substring(commaIdx + 1);
      userContent.push({ type: "image", source: { type: "base64", media_type: mediaType, data: b64data } });
    }
    // [Priority 1] Use sanitized desc — never embed raw user text directly into prompts
    userContent.push({
      type: "text",
      text: safeDesc
        ? `The user describes the expense as: ${safeDesc}. ${img ? "A receipt image is also attached — read all line items and evaluate each one." : "No receipt image provided."}`
        : "A receipt image has been attached. Extract ALL line items individually. For each, decide if it qualifies for LHDN tax relief. Sum only qualifying line items for suggested_amount. Sum full receipt total for total_amount.",
    });

    try {
      // POST to /api/scan proxy — Anthropic key stays server-side
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "API error");

      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) throw new Error("No text response from Claude");

      let raw = textBlock.text.trim();
      raw = raw.replace(/```json/gi, "").replace(/```/g, "");
      const start = raw.indexOf("{");
      const end   = raw.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) throw new Error("Claude did not return a valid JSON object.");
      const parsed = JSON.parse(raw.substring(start, end + 1));

      setResult(parsed);
      setStep("result");
    } catch (ex) {
      console.error("Scanner error:", ex);
      let msg = "Analysis failed: " + (ex.message || "Unknown error");
      if (ex.message?.includes("401")) msg = "Invalid API key — check ANTHROPIC_API_KEY in Vercel env vars.";
      else if (ex.message?.includes("403")) msg = "API key lacks permission. Check your Anthropic dashboard.";
      else if (ex.message?.includes("529") || ex.message?.includes("overloaded")) msg = "Claude is overloaded right now. Please try again in a moment.";
      else if (ex instanceof SyntaxError) msg = "Claude returned an unexpected format. Please try again.";
      setErr(msg);
      setStep("idle");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: wide ? "center" : "flex-end", justifyContent: "center", animation: "fadein 0.2s" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: wide ? 520 : 480, background: t.bg, borderRadius: wide ? 20 : "24px 24px 0 0", padding: wide ? "24px 28px 32px" : "12px 20px 36px", maxHeight: wide ? "85vh" : "90vh", overflow: "auto", fontFamily: FONT, animation: wide ? "fadein 0.2s" : "slideup 0.3s cubic-bezier(.2,.8,.2,1)", boxShadow: wide ? "0 24px 80px rgba(0,0,0,0.3)" : "none" }}>

        {!wide && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <div style={{ width: 40, height: 4, background: t.hairStrong, borderRadius: 2 }} />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: t.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="sparkleAi" size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.ink, letterSpacing: -0.3 }}>{L("ai_receipt")}</div>
              <div style={{ fontSize: 11, color: t.inkMute }}>{L("ai_sub")}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: "none", borderRadius: 10, background: t.bgAlt, color: t.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" size={16} color={t.inkSoft} />
          </button>
        </div>

        {seededItem && step === "idle" && (
          <div style={{ padding: "8px 12px", background: t.redSoft, borderRadius: 10, marginBottom: 12, fontSize: 12, color: t.red, fontWeight: 600 }}>
            {L("checking_against")} {seededItem.id} · {seededItem.name}
          </div>
        )}

        {step === "idle" && (
          <>
            {/* Permission notice — shown before any file input is triggered */}
            <div style={{ padding: "10px 14px", background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 12, marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Icon name="camera" size={16} color={t.inkMute} />
              <div style={{ fontSize: 11, color: t.inkMute, lineHeight: 1.5 }}>
                {L("perm_notice")}
              </div>
            </div>
            {/* PII warning */}
            <div style={{ padding: "8px 12px", background: t.goldSoft, borderRadius: 10, borderLeft: `3px solid ${t.gold}`, fontSize: 11, color: t.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
              {L("pii_warn")}
            </div>

            {/* Image preview or upload prompt */}
            {compressing ? (
              <div style={{ width: "100%", padding: "28px 16px", background: t.surface, border: `1.5px dashed ${t.hairStrong}`, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${t.hair}`, borderTopColor: t.red, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: t.inkMute }}>{L("compressing")}</div>
              </div>
            ) : img ? (
              <div style={{ width: "100%", padding: "16px", background: t.surface, border: `1.5px solid ${t.green}`, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <img src={img} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, objectFit: "contain" }} alt="Receipt preview" />
                <div style={{ fontSize: 12, fontWeight: 600, color: t.green }}>{L("receipt_ok")}</div>
                <button onClick={() => setImg(null)} style={{ fontSize: 11, color: t.inkMute, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: FONT }}>{L("remove")}</button>
              </div>
            ) : (
              <div style={{ width: "100%", padding: "20px 16px", background: t.surface, border: `1.5px dashed ${t.hairStrong}`, borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <Icon name="receipt" size={28} color={t.inkMute} />
                <div style={{ fontSize: 13, fontWeight: 600, color: t.inkSoft }}>{L("no_receipt_yet")}</div>
                <div style={{ fontSize: 11, color: t.inkMute }}>{L("use_buttons")}</div>
              </div>
            )}

            {/* Camera + Gallery buttons */}
            {!img && (
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={compressing}
                  style={{ flex: 1, padding: "12px 0", border: `1px solid ${t.hairStrong}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: compressing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <Icon name="camera" size={15} color={t.ink} />
                  {L("take_photo")}
                </button>
                <button
                  onClick={() => galleryRef.current?.click()}
                  disabled={compressing}
                  style={{ flex: 1, padding: "12px 0", border: `1px solid ${t.hairStrong}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: compressing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <Icon name="upload" size={15} color={t.ink} />
                  {L("gallery")}
                </button>
              </div>
            )}
            {img && (
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button onClick={() => cameraRef.current?.click()} style={{ flex: 1, padding: "10px 0", border: `1px solid ${t.hair}`, borderRadius: 10, background: "transparent", color: t.inkMute, fontSize: 12, fontFamily: FONT, cursor: "pointer" }}>
                  {L("retake")}
                </button>
                <button onClick={() => galleryRef.current?.click()} style={{ flex: 1, padding: "10px 0", border: `1px solid ${t.hair}`, borderRadius: 10, background: "transparent", color: t.inkMute, fontSize: 12, fontFamily: FONT, cursor: "pointer" }}>
                  {L("change")}
                </button>
              </div>
            )}

            {/* Hidden file inputs — camera forces capture, gallery allows files */}
            <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
            <input ref={galleryRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleFile} />

            <div style={{ marginTop: 14 }}>
              <textarea value={desc} onChange={e => setDesc(e.target.value)}
                placeholder={L("describe_ph")}
                style={{ width: "100%", minHeight: 72, padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box", resize: "none" }} />
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: t.goldSoft, borderRadius: 10, borderLeft: `3px solid ${t.gold}`, fontSize: 11, color: t.inkSoft, lineHeight: 1.5 }}>
              {L("lhdn_7years")}
            </div>

            {err && (
              <div style={{ color: t.red, fontSize: 12, fontWeight: 600, marginTop: 10, padding: "10px 12px", background: t.redSoft, borderRadius: 10, lineHeight: 1.5 }}>
                {err}
              </div>
            )}

            <button onClick={runAI} disabled={(!img && !desc) || compressing}
              style={{ width: "100%", marginTop: 14, padding: 16, border: "none", borderRadius: 14, background: ((!img && !desc) || compressing) ? t.inkMute : t.ink, color: t.bg, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: ((!img && !desc) || compressing) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: ((!img && !desc) || compressing) ? 0.5 : 1 }}>
              <Icon name="sparkleAi" size={16} color={t.bg} />
              {L("check_claimable")}
            </button>
          </>
        )}

        {step === "analyzing" && (
          <div style={{ padding: "50px 0", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, border: `3px solid ${t.hair}`, borderTopColor: t.red, borderRadius: "50%", margin: "0 auto", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: t.ink, marginTop: 18 }}>{L("checking_lhdn", ya)}</div>
            <div style={{ fontSize: 11, color: t.inkMute, marginTop: 4 }}>{L("claude_reading")}</div>
          </div>
        )}

        {step === "result" && result && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: result.claimable ? t.greenSoft : t.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={result.claimable ? "check" : "close"} size={20} color={result.claimable ? t.green : t.red} weight={2.2} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: result.claimable ? t.green : t.red, letterSpacing: -0.4 }}>
                {result.claimable ? L("claimable") : L("not_claimable")}
              </div>
            </div>

            <div style={{ fontSize: 13, color: t.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
              {result.explanation}
            </div>

            {result.claimable && (
              <>
                <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: t.inkMute }}>
                    <span>{L("category")}</span>
                    <span style={{ color: t.ink, fontWeight: 600 }}>{result.category_id} · {result.category_name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: t.inkMute }}>
                    <span>{L("total_receipt")}</span>
                    <span style={{ color: t.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>RM {(result.total_amount || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", marginTop: 4, borderTop: `1px solid ${t.hair}` }}>
                    <span style={{ fontSize: 12, color: t.inkMute }}>{L("claimable_amt")}</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: t.red, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>
                      RM {(result.suggested_amount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {result.conditions && (
                  <div style={{ padding: "10px 12px", background: t.goldSoft, borderRadius: 10, borderLeft: `3px solid ${t.gold}`, fontSize: 11, color: t.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
                    {result.conditions}
                  </div>
                )}

                <button onClick={() => { onAdd(result, false, img); onClose(); }}
                  style={{ width: "100%", padding: 15, border: "none", borderRadius: 14, background: t.red, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer", marginBottom: 8 }}>
                  {L("add_suggested", (result.suggested_amount || 0).toLocaleString())}
                </button>
                {result.total_amount !== result.suggested_amount && result.total_amount > 0 && (
                  <button onClick={() => { onAdd(result, true, img); onClose(); }}
                    style={{ width: "100%", padding: 13, border: `1px solid ${t.hair}`, borderRadius: 14, background: "transparent", color: t.ink, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                    {L("add_full", (result.total_amount || 0).toLocaleString())}
                  </button>
                )}
              </>
            )}

            {!result.claimable && (
              <button onClick={onClose} style={{ width: "100%", padding: 15, border: "none", borderRadius: 14, background: t.ink, color: t.bg, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                {L("close")}
              </button>
            )}

            <button onClick={() => { setStep("idle"); setResult(null); setErr(null); }}
              style={{ width: "100%", marginTop: 8, padding: 12, border: `1px solid ${t.hair}`, borderRadius: 14, background: "transparent", color: t.inkMute, fontSize: 13, fontWeight: 500, fontFamily: FONT, cursor: "pointer" }}>
              {L("scan_another")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GLOBAL STYLES + BASE
// ─────────────────────────────────────────────────────────────
const baseStyle = (t) => ({
  fontFamily: FONT,
  background: t.bg,
  color: t.ink,
  minHeight: "100vh",
  maxWidth: 480,
  margin: "0 auto",
  position: "relative",
});

const globalCSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;1,9..144,400&family=Inter:wght@400;500;600;700;800&display=swap');
@keyframes spin    { to { transform: rotate(360deg); } }
@keyframes fadein  { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: 'Inter', -apple-system, system-ui, sans-serif; }
input::placeholder, textarea::placeholder { color: rgba(139,130,117,0.7); }
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
button { transition: transform 0.12s, opacity 0.12s, background 0.18s; }
button:active { transform: scale(0.97); opacity: 0.9; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
@media (min-width: 768px) {
  html, body { height: 100%; overflow: hidden; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(28,25,23,0.15); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(28,25,23,0.28); }
}
`;
