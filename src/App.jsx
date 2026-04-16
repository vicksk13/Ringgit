import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

const C = {
  pri: "#1A1C1E", priLight: "#2D2F33", priPale: "#E8FA5B", mint: "#D4EDE1", mintDeep: "#A8D5BA",
  sage: "#E8F0EC", bg: "#D4EDE1", card: "#FFFFFF", text: "#1A1C1E", textSec: "#94A3B8",
  border: "#C8DDD4", success: "#22C55E", warning: "#F59E0B", danger: "#FF6B6B",
  accent: "#FF6B6B", yellow: "#E8FA5B", yellowBold: "#D4EC4A",
};

const Logo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="12" fill="#E8FA5B"/>
    <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="#1A1C1E" fontSize="16" fontWeight="800" fontFamily="Poppins,system-ui">RM</text>
  </svg>
);

const YEARS = ["2025", "2026", "2027"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const REL = {"2025":[{id:"personal",name:"Individual & Dependents",icon:"👤",items:[{id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic for all resident taxpayers"},{id:"G4",name:"Disabled individual",cap:7000,desc:"Certified by JKM"},{id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income or alimony"},{id:"G15",name:"Disabled spouse",cap:6000,desc:"Spouse certified disabled"}]},{id:"medical",name:"Medical & Special Needs",icon:"🏥",items:[{id:"G6",name:"Serious disease / fertility / vaccination / dental",cap:10000,desc:"G6+G7+G8 combined cap RM10k. Vaccination RM1k sub, dental RM1k sub"},{id:"G7",name:"Medical exam / self-test / mental health",cap:1000,desc:"Check-up, screening, oximeter, BP monitor, mental health"},{id:"G8",name:"Learning disability (child 18 and below)",cap:6000,desc:"ASD, ADHD, GDD, Down Syndrome diagnosis and rehab"},{id:"G2",name:"Parents / grandparents medical",cap:8000,desc:"Medical, dental, nursing, carer. Check-up sub-limit RM1k"},{id:"G3",name:"Disabled equipment",cap:6000,desc:"Wheelchair, hearing aid, dialysis machine"}]},{id:"lifestyle",name:"Lifestyle",icon:"🎯",items:[{id:"G9",name:"Books, gadgets, internet, courses",cap:2500,desc:"Books, smartphone/tablet/PC, internet bills, upskilling"},{id:"G10",name:"Sports & fitness",cap:1000,desc:"Equipment, gym membership, facility rental, competition fees"},{id:"G21",name:"EV charging / composting",cap:2500,desc:"EV charging install/rental/subscription, composting machine"}]},{id:"insurance",name:"Insurance & Contributions",icon:"🛡",items:[{id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Insurance/takaful (max RM3k) + EPF (max RM4k)"},{id:"G18",name:"PRS / Deferred annuity",cap:3000,desc:"Private Retirement Scheme"},{id:"G19",name:"Education & medical insurance",cap:4000,desc:"Insurance premiums for education or medical"},{id:"G20",name:"SOCSO / EIS",cap:350,desc:"SOCSO + Employment Insurance"}]},{id:"education",name:"Education & Savings",icon:"🎓",items:[{id:"G5",name:"Education fees (self)",cap:7000,desc:"Postgraduate, professional. Upskilling sub-limit RM2k"},{id:"G13",name:"SSPN net savings",cap:8000,desc:"Net deposits minus withdrawals"}]},{id:"children",name:"Children",icon:"👶",items:[{id:"G16a",name:"Child under 18",cap:2000,desc:"RM2,000 per unmarried child",perUnit:true,unitName:"children"},{id:"G16b",name:"Child 18+ in education",cap:8000,desc:"Diploma+ MY / degree+ overseas",perUnit:true,unitName:"children"},{id:"G16c",name:"Disabled child",cap:8000,desc:"Additional RM8k if in higher education",perUnit:true,unitName:"children"},{id:"G12",name:"Childcare / kindergarten",cap:3000,desc:"Child aged 6 and below"},{id:"G11",name:"Breastfeeding equipment",cap:1000,desc:"Child aged 2 and below. Once every 2 years"}]},{id:"housing",name:"Housing",icon:"🏠",items:[{id:"G22",name:"Housing loan interest (first home)",cap:7000,desc:"SPA 2025-2027. RM7k if up to RM500k, RM5k if RM500k-750k"}]}],"2026":[{id:"personal",name:"Individual",icon:"👤",items:[{id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic"},{id:"G4",name:"Disabled individual",cap:8000,desc:"Increased"},{id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income"}]},{id:"lifestyle",name:"Lifestyle",icon:"🎯",items:[{id:"G9",name:"Books, gadgets, internet",cap:2500,desc:"Same as YA2025"},{id:"G10",name:"Sports & fitness",cap:1000,desc:"Equipment, gym"},{id:"VMY",name:"Visit Malaysia 2026",cap:1000,desc:"NEW: Domestic tourism"}]},{id:"medical",name:"Medical",icon:"🏥",items:[{id:"G6",name:"Medical",cap:10000,desc:"Same as YA2025"},{id:"G2",name:"Parents medical",cap:8000,desc:"Medical, dental, nursing"}]},{id:"insurance",name:"Insurance",icon:"🛡",items:[{id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Combined"},{id:"G18",name:"PRS",cap:3000,desc:"PRS"},{id:"G19",name:"Education & medical insurance",cap:4000,desc:"Premiums"},{id:"G20",name:"SOCSO / EIS",cap:350,desc:"Contributions"}]},{id:"children",name:"Children",icon:"👶",items:[{id:"G16a",name:"Child under 18",cap:2000,desc:"Per child",perUnit:true,unitName:"children"},{id:"G16c",name:"Disabled child",cap:10000,desc:"Increased",perUnit:true,unitName:"children"}]},{id:"housing",name:"Housing",icon:"🏠",items:[{id:"G22",name:"Housing loan interest",cap:7000,desc:"First-time buyer"}]}],"2027":[{id:"personal",name:"Individual",icon:"👤",items:[{id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic"},{id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income"}]},{id:"lifestyle",name:"Lifestyle",icon:"🎯",items:[{id:"G9",name:"Books, gadgets, internet",cap:2500,desc:"Gadgets, internet"},{id:"G10",name:"Sports & fitness",cap:1000,desc:"Equipment, gym"}]},{id:"insurance",name:"Insurance",icon:"🛡",items:[{id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Combined"},{id:"G20",name:"SOCSO / EIS",cap:350,desc:"Contributions"}]}]};

const BK=[{max:5000,r:0,c:0},{max:20000,r:1,c:0},{max:35000,r:3,c:150},{max:50000,r:6,c:600},{max:70000,r:11,c:1500},{max:100000,r:19,c:3700},{max:400000,r:25,c:9400},{max:600000,r:26,c:84400},{max:2000000,r:28,c:136400},{max:Infinity,r:30,c:528400}];
const calcTax=(ci)=>{if(ci<=0)return 0;let p=0;for(const b of BK){if(ci<=b.max)return b.c+(ci-p)*b.r/100;p=b.max;}return 0;};

// localStorage helpers (for guest mode)
const SK="ringgit-v2";
const ld=()=>{try{return JSON.parse(localStorage.getItem(SK))||{};}catch{return{};}};
const sv=(d)=>{try{localStorage.setItem(SK,JSON.stringify(d));}catch{}};

// iOS-style month picker
const MonthPicker = ({ label, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const parsed = value ? value.split("-") : null;
  const [selY, setSelY] = useState(parsed ? parseInt(parsed[0]) : now.getFullYear());
  const [selM, setSelM] = useState(parsed ? parseInt(parsed[1]) - 1 : now.getMonth());
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i);
  const display = value ? MONTHS[parseInt(value.split("-")[1]) - 1] + " " + value.split("-")[0] : "Tap to select";

  return (
    <div style={{ flex: 1 }}>
      <label style={lb}>{label}</label>
      <button type="button" onClick={() => setOpen(true)}
        style={{ ...ip, textAlign: "left", cursor: "pointer", color: value ? C.text : C.textSec, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1.5px solid " + (value ? C.mintDeep : C.border) }}>
        <span>{display}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, backgroundColor: "rgba(26,28,30,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }} onClick={() => setOpen(false)}>
          <div style={{ backgroundColor: C.card, borderRadius: "28px 28px 0 0", width: "100%", maxWidth: 480, padding: "20px 20px 32px", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", fontFamily: "'Poppins',sans-serif" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{label}</span>
              <button style={{ ...bt, backgroundColor: C.priPale, color: C.pri, padding: "9px 22px", fontSize: 13, fontWeight: 700 }}
                onClick={() => { onChange(selY + "-" + String(selM + 1).padStart(2, "0") + "-01"); setOpen(false); }}>Done</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={st}>YEAR</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {years.map(y => (
                  <button key={y} type="button"
                    style={{ ...bt, padding: "10px 20px", backgroundColor: selY === y ? "#1A1C1E" : C.sage, color: selY === y ? "#fff" : C.text, fontSize: 13, flexShrink: 0 }}
                    onClick={() => setSelY(y)}>{y}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={st}>MONTH</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {MONTHS.map((m, i) => (
                  <button key={m} type="button"
                    style={{ ...bt, padding: "13px 0", backgroundColor: selM === i ? "#1A1C1E" : C.sage, color: selM === i ? "#fff" : C.text, fontSize: 13, borderRadius: 14 }}
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

export default function Ringgit() {
  const [user, setUser] = useState(null);           // { id, name, email, provider }
  const [authMode, setAuthMode] = useState("welcome"); // welcome | signup | app
  const [nameIn, setNameIn] = useState("");
  const [yobIn, setYobIn] = useState("");
  const [ya, setYa] = useState("2025");
  const [tab, setTab] = useState("relief");
  const [claims, setClaims] = useState({});
  const [receipts, setReceipts] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [expCat, setExpCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [amtIn, setAmtIn] = useState("");
  const [unitIn, setUnitIn] = useState(1);
  const [search, setSearch] = useState("");
  const [showYa, setShowYa] = useState(false);
  const [scanMode, setScanMode] = useState(null);
  const [scanImg, setScanImg] = useState(null);
  const [scanDesc, setScanDesc] = useState("");
  const [scanStep, setScanStep] = useState("idle");
  const [scanResult, setScanResult] = useState(null);
  const [scanErr, setScanErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const fRef = useRef(null);
  const scanDescRef = useRef(null);
  const [iEmp, setIEmp] = useState("");
  const [iAmt, setIAmt] = useState("");
  const [iStart, setIStart] = useState("");
  const [iEnd, setIEnd] = useState("");
  const [viewImg, setViewImg] = useState(null);

  // ── Auth listener ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        setUser({ id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "User", email: u.email, provider: "google" });
        setAuthMode("app");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = session.user;
        setUser({ id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "User", email: u.email, provider: "google" });
        setAuthMode("app");
      } else if (_event === "SIGNED_OUT") {
        setUser(null);
        setAuthMode("welcome");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load data when ya or user changes ──
  useEffect(() => {
    if (authMode !== "app") return;
    if (user?.provider === "google" && user?.id) {
      loadFromSupabase();
    } else {
      // guest: load from localStorage
      const d = ld();
      const yd = d[ya] || {};
      setClaims(yd.claims || {});
      setReceipts(yd.receipts || []);
      setIncomes(yd.incomes || []);
    }
  }, [ya, authMode, user?.id]);

  // ── Auto-set G1 ──
  useEffect(() => {
    if (authMode === "app" && !claims.G1) {
      setClaims(p => ({ ...p, G1: { amount: 9000 } }));
    }
  }, [ya, authMode]);

  // ── Save for guest ──
  useEffect(() => {
    if (authMode === "app" && user?.provider !== "google") {
      const d = ld(); d[ya] = { claims, receipts, incomes }; d.user = user; sv(d);
    }
  }, [claims, receipts, incomes, user, ya]);

  // ── Supabase load ──
  const loadFromSupabase = async () => {
    if (!user?.id) return;
    try {
      const [{ data: cl }, { data: inc }, { data: rec }] = await Promise.all([
        supabase.from("claims").select("*").eq("user_id", user.id).eq("ya", ya),
        supabase.from("incomes").select("*").eq("user_id", user.id).eq("ya", ya),
        supabase.from("receipts").select("*").eq("user_id", user.id).eq("ya", ya),
      ]);
      const claimsObj = {};
      (cl || []).forEach(c => { claimsObj[c.item_id] = { amount: c.amount, units: c.units }; });
      setClaims(claimsObj);
      setIncomes(inc || []);
      setReceipts(rec || []);
    } catch (e) { console.error("Load error", e); }
  };

  // ── Supabase save claim ──
  const saveClaimToSupabase = async (id, amt, units) => {
    if (!user?.id) return;
    await supabase.from("claims").upsert({ user_id: user.id, ya, item_id: id, amount: amt, units: units || 1 }, { onConflict: "user_id,ya,item_id" });
  };

  const cats = REL[ya] || REL["2025"];
  const allItems = cats.flatMap(c => c.items);
  const totalRelief = allItems.reduce((s, i) => s + (i.auto ? i.cap : (claims[i.id]?.amount || 0)), 0);
  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const chargeable = Math.max(0, totalIncome - totalRelief);
  const estTax = calcTax(chargeable);

  const saveClaim = async (id, amt, units) => {
    const it = allItems.find(i => i.id === id); if (!it) return;
    const cap = it.perUnit ? it.cap * (units || 1) : it.cap;
    const finalAmt = Math.min(amt, cap);
    setClaims(p => ({ ...p, [id]: { ...p[id], amount: finalAmt, units: units || 1 } }));
    if (user?.provider === "google") await saveClaimToSupabase(id, finalAmt, units);
  };

  const addIncome = async (inc) => {
    setIncomes(p => [...p, inc]);
    if (user?.provider === "google" && user?.id) {
      await supabase.from("incomes").insert({ ...inc, user_id: user.id, ya });
    }
  };

  const removeIncome = async (id) => {
    setIncomes(p => p.filter(i => i.id !== id));
    if (user?.provider === "google" && user?.id) {
      await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
    }
  };

  const addReceipt = async (rec) => {
    setReceipts(p => [...p, rec]);
    if (user?.provider === "google" && user?.id) {
      await supabase.from("receipts").insert({ ...rec, user_id: user.id, ya });
    }
  };

  const removeReceipt = async (id) => {
    setReceipts(p => p.filter(x => x.id !== id));
    if (user?.provider === "google" && user?.id) {
      await supabase.from("receipts").delete().eq("id", id).eq("user_id", user.id);
    }
  };

  const switchYA = (y) => { setYa(y); setShowYa(false); setExpCat(null); setEditItem(null); closeScan(); };

  const closeScan = () => { setScanMode(null); setScanImg(null); setScanDesc(""); setScanStep("idle"); setScanResult(null); setScanErr(null); };
  const openScan = (id) => { setScanMode(id || "general"); setScanStep("pick"); setScanImg(null); setScanDesc(""); setScanResult(null); };

  const handleFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = (ev) => setScanImg(ev.target.result); r.readAsDataURL(f); e.target.value = "";
  };

  // ── Gemini AI scan ──
  const runAI = async () => {
    const desc = scanDescRef.current?.value || scanDesc;
    if (!scanImg && !desc) return;
    setScanStep("analyzing"); setScanErr(null);

    const list = allItems.filter(i => !i.auto).map(i => `${i.id}: ${i.name} (cap RM${i.cap}) - ${i.desc}`).join("\n");
    const prompt = `You are a Malaysian tax relief validator for Year of Assessment (YA) ${ya}, strictly following LHDN BE form guidelines.

Your ONLY job is to determine if an expense qualifies for Malaysian income tax relief under the Income Tax Act 1967.

${desc ? `User describes the expense as: "${desc}"` : "No description provided."}
${scanImg ? "A receipt image has been attached." : "No receipt image."}

Available relief categories for YA${ya}:
${list}

Rules:
- Only approve expenses that are explicitly listed as qualifying reliefs under LHDN YA${ya}
- Do NOT approve general living expenses, groceries, clothing, entertainment, travel (unless domestic tourism under VMY2026), or anything not in the list above
- If partially claimable (e.g. receipt has both qualifying and non-qualifying items), suggest only the qualifying portion
- Be conservative — when in doubt, do not approve

Reply ONLY with this exact JSON (no markdown, no explanation outside JSON):
{"claimable":true,"category_id":"G10","category_name":"Sports & fitness","total_amount":250,"suggested_amount":250,"explanation":"Gym membership qualifies under G10 Sports & fitness relief.","conditions":"Keep receipt for 7 years for LHDN audit purposes."}

If not claimable: {"claimable":false,"category_id":null,"category_name":null,"total_amount":0,"suggested_amount":0,"explanation":"Reason why it does not qualify.","conditions":null}`;

    try {
      const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
      const parts = [];

      // Add image if present
      if (scanImg) {
        const base64 = scanImg.split(",")[1];
        const mimeType = scanImg.split(";")[0].split(":")[1];
        parts.push({ inlineData: { mimeType, data: base64 } });
      }
      parts.push({ text: prompt });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts }] }),
        }
      );
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const clean = txt.replace(/```json/g, "").replace(/```/g, "").trim();
      setScanResult(JSON.parse(clean));
      setScanStep("result");
    } catch (e) {
      console.error(e);
      setScanErr("Analysis failed. Check your Gemini API key or try again.");
      setScanStep("pick");
    }
  };

  const addFromScan = async (useTotal) => {
    if (!scanResult?.claimable || !scanResult.category_id) return;
    const it = allItems.find(i => i.id === scanResult.category_id); if (!it) return;
    const amt = useTotal ? scanResult.total_amount : scanResult.suggested_amount;
    const existing = claims[it.id]?.amount || 0;
    const cap = it.perUnit ? it.cap * (claims[it.id]?.units || 1) : it.cap;
    const newAmt = Math.min(existing + amt, cap);

    setClaims(p => ({ ...p, [it.id]: { ...p[it.id], amount: newAmt } }));
    if (user?.provider === "google") await saveClaimToSupabase(it.id, newAmt, claims[it.id]?.units || 1);

    const rec = { id: Date.now().toString(), name: scanResult.category_name, data: scanImg, date: new Date().toLocaleDateString("en-MY"), item_id: scanResult.category_id, itemId: scanResult.category_id, amount: amt };
    await addReceipt(rec);
    closeScan();
  };

  const exportD = () => { const b = new Blob([JSON.stringify(ld(), null, 2)], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "ringgit-backup.json"; a.click(); };
  const importD = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); sv(d); const y = d[ya] || {}; setClaims(y.claims || {}); setReceipts(y.receipts || []); setIncomes(y.incomes || []); alert("Restored!"); } catch { alert("Invalid file"); } }; r.readAsText(f);
  };

  const filtCats = search ? cats.map(c => ({ ...c, items: c.items.filter(i => (i.name + i.desc).toLowerCase().includes(search.toLowerCase())) })).filter(c => c.items.length) : cats;
  const itemName = (id) => allItems.find(i => i.id === id)?.name || id;
  const fmtPeriod = (start, end) => {
    const fmt = (d) => { if (!d) return ""; const [y, m] = d.split("-"); return MONTHS[parseInt(m) - 1] + " " + y; };
    return (start && end) ? fmt(start) + " – " + fmt(end) : "Full year";
  };

  // ── Loading screen ──
  if (loading) return (
    <div style={{ ...base, background: "linear-gradient(160deg,#1A1C1E,#2D2F33)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <Logo size={56} />
        <div style={{ marginTop: 16, width: 32, height: 32, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #E8FA5B", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "16px auto 0" }} />
      </div>
    </div>
  );

  // ── WELCOME SCREEN ──
  if (authMode === "welcome") return (
    <div style={{ ...base, background: "linear-gradient(160deg,#1A1C1E,#2D2F33)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, color: "#fff", textAlign: "center" }}>
      <Logo size={64} />
      <h1 style={{ fontSize: 34, fontWeight: 700, margin: "14px 0 6px", letterSpacing: -1, fontFamily: "'Poppins',sans-serif" }}>Ringgit</h1>
      <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 40, fontWeight: 400, fontFamily: "'Poppins',sans-serif" }}>Your Malaysian finance companion</p>
      <button style={{ ...bt, backgroundColor: "#E8FA5B", color: "#1A1C1E", width: "100%", padding: "16px 0", fontSize: 15, marginBottom: 10, boxShadow: "0 4px 20px rgba(232,250,91,0.3)" }}
        onClick={async () => {
          await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin }
          });
        }}>Continue with Google</button>
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
        <div style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
        <span style={{ fontSize: 12, opacity: 0.4, fontFamily: "'Poppins',sans-serif" }}>or</span>
        <div style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
      </div>
      <button style={{ ...bt, backgroundColor: "rgba(255,255,255,0.06)", color: "#fff", width: "100%", padding: "16px 0", fontSize: 15 }}
        onClick={() => setAuthMode("signup")}>Continue as Guest</button>
      <p style={{ fontSize: 11, opacity: 0.3, marginTop: 24, fontFamily: "'Poppins',sans-serif" }}>Free · Google users get cloud sync · Not financial advice</p>
    </div>
  );

  // ── SIGNUP SCREEN (guest only) ──
  if (authMode === "signup") return (
    <div style={{ ...base, backgroundColor: C.bg, display: "flex", flexDirection: "column", padding: 24 }}>
      <div style={{ textAlign: "center", marginTop: 48, marginBottom: 36 }}>
        <Logo size={48} />
        <h2 style={{ fontSize: 24, fontWeight: 600, color: C.text, margin: "14px 0 4px", fontFamily: "'Poppins',sans-serif" }}>Set up your profile</h2>
        <p style={{ fontSize: 14, color: C.textSec, fontWeight: 400, fontFamily: "'Poppins',sans-serif" }}>Helps personalise your calculations</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div><label style={lb}>Your name</label><input style={ip} placeholder="e.g. Vick" value={nameIn} onChange={e => setNameIn(e.target.value)} /></div>
        <div><label style={lb}>Year of birth</label><input style={ip} type="number" placeholder="e.g. 1990" value={yobIn} onChange={e => setYobIn(e.target.value)} /></div>
      </div>
      <button style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "16px 0", fontSize: 16, marginTop: 28 }}
        onClick={() => { const u = { name: nameIn || "Guest", yob: yobIn, provider: "guest" }; setUser(u); setAuthMode("app"); const d = ld(); d.user = u; sv(d); }}>Get Started</button>
      <button style={{ ...bt, backgroundColor: "transparent", color: C.textSec, marginTop: 12, fontSize: 14 }}
        onClick={() => { setUser({ name: "Guest", provider: "guest" }); setAuthMode("app"); }}>Skip for now</button>
    </div>
  );

  // ── SCAN MODAL ──
  const ScanModal = () => {
    if (!scanMode) return null;
    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(26,28,30,0.55)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(6px)" }}>
        <div style={{ backgroundColor: C.card, borderRadius: "32px 32px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", padding: 22, boxShadow: "0 -4px 40px rgba(0,0,0,0.12)", fontFamily: "'Poppins',sans-serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>🤖 AI Receipt Check</h3>
            <button style={{ ...bt, width: 32, height: 32, borderRadius: 16, backgroundColor: C.sage, color: C.textSec, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} onClick={closeScan}>✕</button>
          </div>

          {scanStep === "pick" && (
            <div>
              <div style={{ ...cd, backgroundColor: C.mint, textAlign: "center", padding: 28, cursor: "pointer" }} onClick={() => fRef.current?.click()}>
                {scanImg
                  ? <img src={scanImg} style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12 }} />
                  : <div><div style={{ fontSize: 36, marginBottom: 8 }}>📸</div><div style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>Upload receipt (optional)</div><div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>Photo or screenshot</div></div>}
              </div>
              <input ref={fRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
              {!scanImg && <div style={{ fontSize: 11, color: "#7C6A0A", backgroundColor: C.yellow, textAlign: "center", marginTop: 8, padding: "8px 12px", borderRadius: 10 }}>💡 Keeping receipts helps during LHDN audits (7-year requirement)</div>}
              <textarea
                ref={scanDescRef}
                style={{ ...ip, marginTop: 12, resize: "none", minHeight: 70 }}
                placeholder='Describe the expense (e.g. "gym membership RM250" or "dental checkup RM180")'
                defaultValue={scanDesc}
                onBlur={e => setScanDesc(e.target.value)}
              />
              {scanErr && <div style={{ color: C.danger, fontSize: 13, fontWeight: 600, marginTop: 8, textAlign: "center" }}>{scanErr}</div>}
              <button style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "15px 0", fontSize: 15, marginTop: 14 }} onClick={runAI}>🤖 Check if Claimable</button>
            </div>
          )}

          {scanStep === "analyzing" && (
            <div style={{ textAlign: "center", padding: "44px 0" }}>
              <div style={{ width: 40, height: 40, border: "4px solid " + C.border, borderTop: "4px solid #1A1C1E", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1C1E" }}>Checking against LHDN YA{ya} reliefs...</div>
            </div>
          )}

          {scanStep === "result" && scanResult && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 28 }}>{scanResult.claimable ? "✅" : "❌"}</span>
                <h3 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: scanResult.claimable ? C.success : C.danger }}>{scanResult.claimable ? "Claimable!" : "Not Claimable"}</h3>
              </div>
              <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 14 }}>{scanResult.explanation}</p>
              {scanResult.claimable && (
                <div style={{ ...cd, backgroundColor: C.mint }}>
                  <div style={rw}><span style={rl}>Category</span><span style={{ fontWeight: 700, fontSize: 13 }}>{scanResult.category_id + " – " + scanResult.category_name}</span></div>
                  <div style={rw}><span style={rl}>Total</span><span style={{ fontWeight: 700 }}>{"RM " + (scanResult.total_amount || 0).toLocaleString()}</span></div>
                  <div style={rw}><span style={rl}>Suggested</span><span style={{ fontWeight: 800, color: C.pri, fontSize: 20 }}>{"RM " + (scanResult.suggested_amount || 0).toLocaleString()}</span></div>
                  {scanResult.conditions && <div style={{ marginTop: 8, padding: "8px 12px", backgroundColor: C.yellow, borderRadius: 10, fontSize: 11, color: "#7C6A0A", lineHeight: 1.5 }}>⚠️ {scanResult.conditions}</div>}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                {scanResult.claimable && scanResult.total_amount !== scanResult.suggested_amount && (
                  <button style={{ ...bt, backgroundColor: C.sage, color: C.text, width: "100%", padding: "12px 0", fontSize: 13 }} onClick={() => addFromScan(true)}>{"Add full (RM " + (scanResult.total_amount || 0).toLocaleString() + ")"}</button>
                )}
                {scanResult.claimable && (
                  <button style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "14px 0", fontSize: 14 }} onClick={() => addFromScan(false)}>{"Add suggested (RM " + (scanResult.suggested_amount || 0).toLocaleString() + ")"}</button>
                )}
                <button style={{ ...bt, backgroundColor: "transparent", color: C.textSec, fontSize: 13 }} onClick={closeScan}>{scanResult.claimable ? "Skip" : "Close"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── MAIN APP ──
  return (
    <div style={base}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} input[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;} *{box-sizing:border-box;}`}</style>
      <ScanModal />

      {/* Lightbox */}
      {viewImg && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setViewImg(null)}>
          <img src={viewImg} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16, objectFit: "contain" }} />
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#1A1C1E", padding: "20px 20px 18px", color: "#fff", borderRadius: "0 0 32px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.5, fontWeight: 400, fontFamily: "'Poppins',sans-serif" }}>Welcome back,</div>
            <div style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>
              {user?.name || "User"}
              {user?.provider === "google" && <span style={{ fontSize: 10, backgroundColor: "#E8FA5B", color: "#1A1C1E", padding: "2px 8px", borderRadius: 20, marginLeft: 8, fontWeight: 700, verticalAlign: "middle" }}>☁️ Synced</span>}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <button style={{ ...bt, backgroundColor: "rgba(255,255,255,0.1)", color: "#fff", padding: "8px 16px", fontSize: 12 }} onClick={() => setShowYa(!showYa)}>{"YA" + ya + " ▾"}</button>
            {showYa && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, backgroundColor: C.card, borderRadius: 20, boxShadow: "0px 12px 40px rgba(26,28,30,0.15)", overflow: "hidden", zIndex: 50, minWidth: 110 }}>
                {YEARS.map(y => (
                  <button key={y} style={{ display: "block", width: "100%", padding: "12px 20px", border: "none", backgroundColor: y === ya ? "#E8FA5B" : "transparent", color: "#1A1C1E", fontSize: 14, fontWeight: y === ya ? 600 : 400, cursor: "pointer", fontFamily: "'Poppins',sans-serif", textAlign: "left" }} onClick={() => switchYA(y)}>{"YA" + y}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Summary card */}
        <div style={{ backgroundColor: "#E8FA5B", borderRadius: 24, padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[["Income", totalIncome, "#1A1C1E"], ["Relief", totalRelief, "#1A1C1E"], ["Chargeable", chargeable, "#1A1C1E"], ["Est. Tax", estTax, "#FF6B6B"]].map(([l, v, clr]) => (
              <div key={l}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(26,28,30,0.5)", marginBottom: 2, fontFamily: "'Poppins',sans-serif" }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: clr, letterSpacing: -0.5, fontFamily: "'Poppins',sans-serif" }}>{"RM " + (typeof v === "number" ? v : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", backgroundColor: C.card, margin: "0 16px", borderRadius: 9999, marginTop: -14, position: "relative", zIndex: 5, boxShadow: "0px 12px 40px rgba(26,28,30,0.06)", padding: 4 }}>
        {[["relief", "Tax Relief"], ["income", "Income"], ["receipts", "Receipts"], ["more", "More"]].map(([k, l]) => (
          <button key={k} style={{ flex: 1, padding: "12px 4px", border: "none", borderRadius: 9999, backgroundColor: tab === k ? "#1A1C1E" : "transparent", color: tab === k ? "#fff" : "#94A3B8", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Poppins',sans-serif", transition: "all 0.2s" }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: 14, paddingTop: 16 }}>

        {/* ── RELIEF TAB ── */}
        {tab === "relief" && (
          <div>
            <button style={{ ...cd, width: "100%", backgroundColor: "#E8FA5B", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", marginBottom: 16, textAlign: "left", boxShadow: "0 4px 20px rgba(232,250,91,0.2)" }} onClick={() => openScan("general")}>
              <div style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#1A1C1E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🤖</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#1A1C1E", fontFamily: "'Poppins',sans-serif" }}>AI Receipt Scanner</div>
                <div style={{ fontSize: 12, color: "rgba(26,28,30,0.5)", fontFamily: "'Poppins',sans-serif" }}>Gemini validates your LHDN claims</div>
              </div>
            </button>
            <input style={{ ...ip, marginBottom: 14, backgroundColor: C.card }} placeholder="Search reliefs..." value={search} onChange={e => setSearch(e.target.value)} />
            {filtCats.map(cat => (
              <div key={cat.id} style={{ marginBottom: 10 }}>
                <div style={{ ...cd, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setExpCat(expCat === cat.id ? null : cat.id)}>
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{cat.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.pri, backgroundColor: C.mint, padding: "3px 10px", borderRadius: 20, fontFamily: "'Poppins',sans-serif" }}>{cat.items.filter(i => claims[i.id]?.amount > 0).length + "/" + cat.items.length}</span>
                  <span style={{ fontSize: 12, color: C.textSec }}>{expCat === cat.id ? "▾" : "▸"}</span>
                </div>
                {(expCat === cat.id || search) && cat.items.map(item => {
                  const cl = claims[item.id]; const done = cl?.amount > 0; const ed = editItem === item.id;
                  const ec = item.perUnit ? item.cap * (cl?.units || 1) : item.cap;
                  const ir = receipts.filter(rx => (rx.itemId || rx.item_id) === item.id);
                  return (
                    <div key={item.id} style={{ ...cd, marginTop: 6, marginLeft: 6, backgroundColor: done ? C.mint : C.card }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3, fontFamily: "'Poppins',sans-serif" }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, backgroundColor: C.priPale, padding: "2px 6px", borderRadius: 6, marginRight: 5 }}>{item.id}</span>
                            {item.name}
                          </div>
                          <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.5, marginBottom: 4, fontFamily: "'Poppins',sans-serif" }}>{item.desc}</div>
                          <div style={{ fontSize: 11, color: C.pri, fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>
                            {"Cap: RM " + item.cap.toLocaleString() + (item.perUnit ? " / child" : "")}
                            {done && <span style={{ marginLeft: 6, backgroundColor: "#1A1C1E", color: "#fff", padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{"RM " + cl.amount.toLocaleString()}</span>}
                          </div>
                          {ir.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              {ir.map(rx => (
                                <div key={rx.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.textSec, marginTop: 3 }}>
                                  {rx.data && <img src={rx.data} style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover", cursor: "pointer" }} onClick={e => { e.stopPropagation(); setViewImg(rx.data); }} />}
                                  <span>{"RM " + (rx.amount || 0).toLocaleString() + " – " + rx.date}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                          {item.auto
                            ? <div style={{ fontSize: 9, fontWeight: 700, color: C.pri, backgroundColor: C.priPale, padding: "5px 10px", borderRadius: 8, fontFamily: "'Poppins',sans-serif" }}>AUTO</div>
                            : <>
                              <button style={{ padding: "7px 12px", border: "none", borderRadius: 8, backgroundColor: done ? C.pri : C.sage, color: done ? "#fff" : C.pri, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}
                                onClick={() => { if (ed) setEditItem(null); else { setEditItem(item.id); setAmtIn(cl?.amount?.toString() || ""); setUnitIn(cl?.units || 1); } }}>{done ? "Edit" : "+ Claim"}</button>
                              <button style={{ padding: "5px 10px", border: "none", borderRadius: 8, backgroundColor: C.sage, color: C.textSec, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }} onClick={() => openScan(item.id)}>🤖 Scan</button>
                            </>}
                        </div>
                      </div>
                      {ed && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + C.border }}>
                          {item.perUnit && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{"No. of " + item.unitName + ":"}</label>
                              <input style={{ ...ip, width: 55, textAlign: "center", padding: "7px" }} type="number" min="1" value={unitIn} onChange={e => setUnitIn(parseInt(e.target.value) || 1)} />
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>RM</span>
                            <input style={{ ...ip, flex: 1, backgroundColor: "#fff" }} type="number" placeholder="0" value={amtIn} onChange={e => setAmtIn(e.target.value)} autoFocus />
                            <button style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", padding: "10px 16px", fontSize: 12 }} onClick={() => { saveClaim(item.id, parseFloat(amtIn) || 0, unitIn); setEditItem(null); }}>Save</button>
                          </div>
                          {parseFloat(amtIn) > ec && <div style={{ fontSize: 11, color: C.warning, fontWeight: 600, marginTop: 4, fontFamily: "'Poppins',sans-serif" }}>{"Capped at RM " + ec.toLocaleString()}</div>}
                          {done && <button style={{ border: "none", background: "none", color: C.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif", marginTop: 6 }} onClick={() => { saveClaim(item.id, 0, 1); setEditItem(null); }}>Remove</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* ── INCOME TAB ── */}
        {tab === "income" && (
          <div>
            <div style={{ ...cd, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{"Add Employment Income (YA" + ya + ")"}</div>
              <div><label style={lb}>Employer</label><input style={ip} placeholder="e.g. AirAsia" value={iEmp} onChange={e => setIEmp(e.target.value)} /></div>
              <div><label style={lb}>Annual gross income (RM)</label><input style={ip} type="number" placeholder="0" value={iAmt} onChange={e => setIAmt(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10 }}>
                <MonthPicker label="Start" value={iStart} onChange={setIStart} />
                <MonthPicker label="End" value={iEnd} onChange={setIEnd} />
              </div>
              <button style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "14px 0", fontSize: 14, marginTop: 2 }}
                onClick={async () => {
                  if (!iEmp || !iAmt) return;
                  const period = fmtPeriod(iStart, iEnd);
                  await addIncome({ id: Date.now().toString(), employer: iEmp, amount: parseFloat(iAmt) || 0, period });
                  setIEmp(""); setIAmt(""); setIStart(""); setIEnd("");
                }}>+ Add Income Source</button>
            </div>

            {incomes.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={st}>INCOME SOURCES</div>
                {incomes.map(inc => (
                  <div key={inc.id} style={{ ...cd, display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{inc.employer}</div>
                      <div style={{ fontSize: 11, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{inc.period + " · RM " + inc.amount.toLocaleString()}</div>
                    </div>
                    <button style={{ width: 28, height: 28, border: "none", borderRadius: 14, backgroundColor: "#FECACA", color: C.danger, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => removeIncome(inc.id)}>✕</button>
                  </div>
                ))}
                <div style={{ ...cd, backgroundColor: C.mint }}>Total: <strong>{"RM " + totalIncome.toLocaleString()}</strong></div>
              </div>
            )}

            {totalIncome > 0 && (
              <div style={{ ...cd, marginTop: 14 }}>
                <div style={st}>TAX ESTIMATE</div>
                {[["Gross Income", "RM " + totalIncome.toLocaleString(), C.text], ["Total Relief", "– RM " + totalRelief.toLocaleString(), C.success]].map(([l, v, clr]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>
                    <span>{l}</span><span style={{ color: clr, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid " + C.border, marginTop: 8, paddingTop: 8, fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "'Poppins',sans-serif" }}>
                  <span>Chargeable</span><span>{"RM " + chargeable.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, fontSize: 20, fontWeight: 800, color: C.danger, fontFamily: "'Poppins',sans-serif" }}>
                  <span>Est. Tax</span><span>{"RM " + estTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── RECEIPTS TAB ── */}
        {tab === "receipts" && (
          <div>
            {receipts.length === 0
              ? <div style={{ textAlign: "center", padding: "50px 20px" }}>
                <div style={{ fontSize: 44 }}>🧾</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.textSec, marginTop: 8, fontFamily: "'Poppins',sans-serif" }}>No receipts yet</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, fontFamily: "'Poppins',sans-serif" }}>Use AI Scan on Relief tab</div>
              </div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {receipts.map(rx => (
                  <div key={rx.id} style={{ ...cd, display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
                    {rx.data
                      ? <img src={rx.data} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 10, flexShrink: 0, cursor: "pointer" }} onClick={() => setViewImg(rx.data)} />
                      : <div style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🧾</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Poppins',sans-serif" }}>{rx.name}</div>
                      <div style={{ fontSize: 10, color: C.textSec, marginTop: 2, fontFamily: "'Poppins',sans-serif" }}>{rx.date + (rx.amount ? " · RM " + rx.amount.toLocaleString() : "")}</div>
                      <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(rx.itemId || rx.item_id) && <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, backgroundColor: C.priPale, padding: "2px 7px", borderRadius: 6, fontFamily: "'Poppins',sans-serif" }}>{(rx.itemId || rx.item_id) + ": " + itemName(rx.itemId || rx.item_id)}</span>}
                      </div>
                    </div>
                    <button style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, border: "none", borderRadius: 12, backgroundColor: "#FECACA", color: C.danger, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => removeReceipt(rx.id)}>✕</button>
                  </div>
                ))}
              </div>}
          </div>
        )}

        {/* ── MORE TAB ── */}
        {tab === "more" && (
          <div>
            <div style={{ ...cd, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: C.pri, fontFamily: "'Poppins',sans-serif" }}>{(user?.name || "U")[0]}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{user?.provider === "google" ? "☁️ Google · Synced" : "Guest · Local only"} · YA{ya}</div>
                </div>
              </div>
              {user?.provider !== "google" && (
                <button style={{ ...bt, backgroundColor: "#E8FA5B", color: "#1A1C1E", width: "100%", padding: "11px 0", fontSize: 13, marginTop: 14, fontWeight: 700 }}
                  onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}>
                  ☁️ Sign in with Google to sync data
                </button>
              )}
            </div>

            {user?.provider !== "google" && (
              <div style={{ ...cd, marginBottom: 10 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>Backup & Restore</h3>
                <p style={{ fontSize: 12, color: C.textSec, margin: "0 0 10px", fontFamily: "'Poppins',sans-serif" }}>Download before switching phones.</p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...bt, flex: 1, backgroundColor: C.sage, color: C.pri, padding: "11px 0", fontSize: 12 }} onClick={exportD}>💾 Download</button>
                  <label style={{ ...bt, flex: 1, backgroundColor: C.sage, color: C.pri, padding: "11px 0", fontSize: 12, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    📂 Restore<input type="file" accept=".json" style={{ display: "none" }} onChange={importD} />
                  </label>
                </div>
              </div>
            )}

            <div style={{ ...cd, marginBottom: 10 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>Coming Soon</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Debt Tracker", "Savings Goals", "Budget Planner", "EPF Calc", "Zakat Calc"].map(f => (
                  <span key={f} style={{ fontSize: 11, fontWeight: 600, color: C.textSec, backgroundColor: C.sage, padding: "6px 12px", borderRadius: 20, fontFamily: "'Poppins',sans-serif" }}>{f}</span>
                ))}
              </div>
            </div>

            <div style={{ ...cd, marginBottom: 10 }}>
              <button style={{ border: "none", background: "none", color: C.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}
                onClick={() => { if (confirm("Reset YA" + ya + " data?")) { setClaims({}); setReceipts([]); setIncomes([]); } }}>🗑️ Reset YA{ya} Data</button>
            </div>

            <button style={{ ...bt, backgroundColor: "transparent", color: C.textSec, width: "100%", marginTop: 4, fontSize: 12 }}
              onClick={async () => {
                if (user?.provider === "google") { await supabase.auth.signOut(); }
                else { const d = ld(); delete d.user; sv(d); setUser(null); setAuthMode("welcome"); }
              }}>Sign Out</button>
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 10, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>Ringgit v3.0 · Powered by Gemini · Not financial advice</div>
          </div>
        )}

      </div>
    </div>
  );
}

const base = { fontFamily: "'Poppins',sans-serif", backgroundColor: "#D4EDE1", color: "#1A1C1E", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 40 };
const cd = { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 18, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0px 4px 20px rgba(26,28,30,0.06)", fontFamily: "'Poppins',sans-serif" };
const bt = { border: "none", borderRadius: 20, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif" };
const ip = { width: "100%", padding: "13px 16px", border: "1.5px solid transparent", borderRadius: 16, fontSize: 14, fontFamily: "'Poppins',sans-serif", outline: "none", boxSizing: "border-box", color: "#1A1C1E", backgroundColor: "#E8F0EC" };
const lb = { fontSize: 11, fontWeight: 600, color: "#94A3B8", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Poppins',sans-serif" };
const st = { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "#94A3B8", marginBottom: 8, textTransform: "uppercase", fontFamily: "'Poppins',sans-serif" };
const rw = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 14, fontFamily: "'Poppins',sans-serif" };
const rl = { color: "#94A3B8", fontWeight: 500, fontFamily: "'Poppins',sans-serif" };
