import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

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

const RENTAL_DEDUCTIONS = [
  { id: "rd1",  name: "Assessment Tax",               malay: "Cukai Taksiran",             icon: "🏛️", desc: "Local council tax, paid semi-annually" },
  { id: "rd2",  name: "Quit Rent / Parcel Rent",      malay: "Cukai Tanah / Cukai Petak",  icon: "📋", desc: "Yearly land tax to state authorities" },
  { id: "rd3",  name: "Home Loan Interest",           malay: "Faedah Pinjaman",             icon: "🏦", desc: "Interest only — NOT principal repayment" },
  { id: "rd4",  name: "Fire Insurance",               malay: "Insurans Kebakaran",           icon: "🔥", desc: "Fire insurance premium for the property" },
  { id: "rd5",  name: "Repair & Maintenance",         malay: "Pembaikan & Penyelenggaraan", icon: "🔧", desc: "Fix existing items only — not upgrades or renovations" },
  { id: "rd6",  name: "Maintenance Fee & Sinking Fund", malay: "Yuran Penyelenggaraan",    icon: "🏢", desc: "Strata/condo fees + Indah Water bill" },
  { id: "rd7",  name: "Pest Control",                 malay: "Kawalan Perosak",              icon: "🐛", desc: "Pest control services for the property" },
  { id: "rd8",  name: "Agent Fees (Renewal Only)",    malay: "Komisyen Ejen (Pembaharuan)", icon: "🤝", desc: "Renewal tenancy only — NOT fees for first tenant" },
  { id: "rd9",  name: "Legal Fees on Tenancy",        malay: "Yuran Guaman",                 icon: "⚖️", desc: "Legal costs on tenancy agreement renewal" },
  { id: "rd10", name: "Rent Collection Expenses",     malay: "Kos Kutipan Sewa",             icon: "💰", desc: "Collection costs including stamp duty on agreement" },
];

const REL = {"2025":[{id:"personal",name:"Individual & Dependents",icon:"👤",items:[{id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic for all resident taxpayers"},{id:"G4",name:"Disabled individual",cap:7000,desc:"Certified by JKM"},{id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income or alimony"},{id:"G15",name:"Disabled spouse",cap:6000,desc:"Spouse certified disabled"}]},{id:"medical",name:"Medical & Special Needs",icon:"🏥",items:[{id:"G6",name:"Serious disease / fertility / vaccination / dental",cap:10000,desc:"G6+G7+G8 combined cap RM10k. Vaccination RM1k sub, dental RM1k sub"},{id:"G7",name:"Medical exam / self-test / mental health",cap:1000,desc:"Check-up, screening, oximeter, BP monitor, mental health"},{id:"G8",name:"Learning disability (child 18 and below)",cap:6000,desc:"ASD, ADHD, GDD, Down Syndrome diagnosis and rehab"},{id:"G2",name:"Parents / grandparents medical",cap:8000,desc:"Medical, dental, nursing, carer. Check-up sub-limit RM1k"},{id:"G3",name:"Disabled equipment",cap:6000,desc:"Wheelchair, hearing aid, dialysis machine"}]},{id:"lifestyle",name:"Lifestyle",icon:"🎯",items:[{id:"G9",name:"Books, gadgets, internet, courses",cap:2500,desc:"Books, smartphone/tablet/PC, internet bills, upskilling"},{id:"G10",name:"Sports & fitness",cap:1000,desc:"Sports equipment (golf clubs, balls, bags, rackets, etc), gym membership, sports facility rental (golf green fees, golf simulator, badminton/squash court, swimming pool), sports training/lesson fees (golf lessons, tennis coaching, etc), competition entry fees. EXCLUDES: golf club joining/membership fees, sports clothing/shoes/apparel, buggy rental, insurance fees."},{id:"G21",name:"EV charging / composting",cap:2500,desc:"EV charging install/rental/subscription, composting machine"}]},{id:"insurance",name:"Insurance & Contributions",icon:"🛡",items:[{id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Insurance/takaful (max RM3k) + EPF (max RM4k)"},{id:"G18",name:"PRS / Deferred annuity",cap:3000,desc:"Private Retirement Scheme"},{id:"G19",name:"Education & medical insurance",cap:4000,desc:"Insurance premiums for education or medical"},{id:"G20",name:"SOCSO / EIS",cap:350,desc:"SOCSO + Employment Insurance"}]},{id:"education",name:"Education & Savings",icon:"🎓",items:[{id:"G5",name:"Education fees (self)",cap:7000,desc:"Postgraduate, professional. Upskilling sub-limit RM2k"},{id:"G13",name:"SSPN net savings",cap:8000,desc:"Net deposits minus withdrawals"}]},{id:"children",name:"Children",icon:"👶",items:[{id:"G16a",name:"Child under 18",cap:2000,desc:"RM2,000 per unmarried child",perUnit:true,unitName:"children"},{id:"G16b",name:"Child 18+ in education",cap:8000,desc:"Diploma+ MY / degree+ overseas",perUnit:true,unitName:"children"},{id:"G16c",name:"Disabled child",cap:8000,desc:"Additional RM8k if in higher education",perUnit:true,unitName:"children"},{id:"G12",name:"Childcare / kindergarten",cap:3000,desc:"Child aged 6 and below"},{id:"G11",name:"Breastfeeding equipment",cap:1000,desc:"Child aged 2 and below. Once every 2 years"}]},{id:"housing",name:"Housing",icon:"🏠",items:[{id:"G22",name:"Housing loan interest (first home)",cap:7000,desc:"SPA 2025-2027. RM7k if up to RM500k, RM5k if RM500k-750k"}]}],"2026":[{id:"personal",name:"Individual",icon:"👤",items:[{id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic"},{id:"G4",name:"Disabled individual",cap:8000,desc:"Increased"},{id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income"}]},{id:"lifestyle",name:"Lifestyle",icon:"🎯",items:[{id:"G9",name:"Books, gadgets, internet",cap:2500,desc:"Same as YA2025"},{id:"G10",name:"Sports & fitness",cap:1000,desc:"Sports equipment (golf clubs, balls, bags, rackets, etc), gym membership, sports facility rental (golf green fees, golf simulator, badminton/squash court, swimming pool), sports training/lesson fees, competition entry fees. EXCLUDES: golf club joining/membership fees, sports clothing/shoes/apparel, buggy rental, insurance fees."},{id:"VMY",name:"Visit Malaysia 2026",cap:1000,desc:"NEW: Domestic tourism"}]},{id:"medical",name:"Medical",icon:"🏥",items:[{id:"G6",name:"Medical",cap:10000,desc:"Same as YA2025"},{id:"G2",name:"Parents medical",cap:8000,desc:"Medical, dental, nursing"}]},{id:"insurance",name:"Insurance",icon:"🛡",items:[{id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Combined"},{id:"G18",name:"PRS",cap:3000,desc:"PRS"},{id:"G19",name:"Education & medical insurance",cap:4000,desc:"Premiums"},{id:"G20",name:"SOCSO / EIS",cap:350,desc:"Contributions"}]},{id:"children",name:"Children",icon:"👶",items:[{id:"G16a",name:"Child under 18",cap:2000,desc:"Per child",perUnit:true,unitName:"children"},{id:"G16c",name:"Disabled child",cap:10000,desc:"Increased",perUnit:true,unitName:"children"}]},{id:"housing",name:"Housing",icon:"🏠",items:[{id:"G22",name:"Housing loan interest",cap:7000,desc:"First-time buyer"}]}],"2027":[{id:"personal",name:"Individual",icon:"👤",items:[{id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic"},{id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income"}]},{id:"lifestyle",name:"Lifestyle",icon:"🎯",items:[{id:"G9",name:"Books, gadgets, internet",cap:2500,desc:"Gadgets, internet"},{id:"G10",name:"Sports & fitness",cap:1000,desc:"Sports equipment (golf clubs, balls, bags, rackets, etc), gym membership, sports facility rental (golf green fees, golf simulator, badminton/squash court, swimming pool), sports training/lesson fees, competition entry fees. EXCLUDES: golf club joining/membership fees, sports clothing/shoes/apparel, buggy rental, insurance fees."}]},{id:"insurance",name:"Insurance",icon:"🛡",items:[{id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Combined"},{id:"G20",name:"SOCSO / EIS",cap:350,desc:"Contributions"}]}]};

const BK=[{max:5000,r:0,c:0},{max:20000,r:1,c:0},{max:35000,r:3,c:150},{max:50000,r:6,c:600},{max:70000,r:11,c:1500},{max:100000,r:19,c:3700},{max:400000,r:25,c:9400},{max:600000,r:26,c:84400},{max:2000000,r:28,c:136400},{max:Infinity,r:30,c:528400}];
const calcTax=(ci)=>{if(ci<=0)return 0;let p=0;for(const b of BK){if(ci<=b.max)return b.c+(ci-p)*b.r/100;p=b.max;}return 0;};

const SK="ringgit-v2";
const ld=()=>{try{return JSON.parse(localStorage.getItem(SK))||{};}catch{return{};}};
const sv=(d)=>{try{localStorage.setItem(SK,JSON.stringify(d));}catch{}};

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
        style={{ ...ip, textAlign: "left", cursor: "pointer", color: value ? C.text : C.textSec, display: "flex", alignItems: "center", justifyContent: "space-between", border: "1.5px solid " + (value ? C.mintDeep : "transparent"), transition: "all 0.2s ease-out" }}>
        <span>{display}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, backgroundColor: "rgba(26,28,30,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(8px)", animation: "fadeIn 0.2s ease-out" }} onClick={() => setOpen(false)}>
          <div style={{ backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderRadius: "28px 28px 0 0", width: "100%", maxWidth: 480, padding: "20px 20px 32px", boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", fontFamily: "'Poppins',sans-serif", animation: "slideUp 0.25s ease-out" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{label}</span>
              <button className="ringgit-tap" style={{ ...bt, backgroundColor: C.priPale, color: C.pri, padding: "9px 22px", fontSize: 13, fontWeight: 700 }}
                onClick={() => { onChange(selY + "-" + String(selM + 1).padStart(2, "0") + "-01"); setOpen(false); }}>Done</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={st}>YEAR</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                {years.map(y => (
                  <button key={y} type="button" className="ringgit-tap"
                    style={{ ...bt, padding: "10px 20px", backgroundColor: selY === y ? "#1A1C1E" : C.sage, color: selY === y ? "#fff" : C.text, fontSize: 13, flexShrink: 0 }}
                    onClick={() => setSelY(y)}>{y}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={st}>MONTH</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {MONTHS.map((m, i) => (
                  <button key={m} type="button" className="ringgit-tap"
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
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("welcome");
  const [nameIn, setNameIn] = useState("");
  const [yobIn, setYobIn] = useState("");
  const [ya, setYa] = useState("2025");
  const [tab, setTab] = useState("relief");
  const [claims, setClaims] = useState({});
  const [receipts, setReceipts] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [rentalProps, setRentalProps] = useState([]);
  const [expCat, setExpCat] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [amtIn, setAmtIn] = useState("");
  const [unitIn, setUnitIn] = useState(1);
  const [search, setSearch] = useState("");
  const [showYa, setShowYa] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanImg, setScanImg] = useState(null);
  const [scanDesc, setScanDesc] = useState("");
  const [scanStep, setScanStep] = useState("idle");
  const [scanResult, setScanResult] = useState(null);
  const [scanErr, setScanErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const fRef = useRef(null);
  const rImgRef = useRef(null);
  const scanDescRef = useRef(null);
  const [iEmp, setIEmp] = useState("");
  const [iAmt, setIAmt] = useState("");
  const [iStart, setIStart] = useState("");
  const [iEnd, setIEnd] = useState("");
  const [viewImg, setViewImg] = useState(null);
  // Rental state
  const [showAddRental, setShowAddRental] = useState(false);
  const [rPropName, setRPropName] = useState("");
  const [rGrossRent, setRGrossRent] = useState("");
  const [expandedRental, setExpandedRental] = useState(null);
  const [activeRentalDeduct, setActiveRentalDeduct] = useState(null);
  const [rentalDeductDraft, setRentalDeductDraft] = useState({});

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

  useEffect(() => {
    if (authMode !== "app") return;
    if (user?.provider === "google" && user?.id) {
      loadFromSupabase();
    } else {
      const d = ld();
      const yd = d[ya] || {};
      setClaims(yd.claims || {});
      setReceipts(yd.receipts || []);
      setIncomes(yd.incomes || []);
      setRentalProps(yd.rentalProps || []);
    }
  }, [ya, authMode, user?.id]);

  useEffect(() => {
    if (authMode === "app" && !claims.G1) {
      setClaims(p => ({ ...p, G1: { amount: 9000 } }));
    }
  }, [ya, authMode]);

  useEffect(() => {
    if (authMode === "app" && user?.provider !== "google") {
      const d = ld(); d[ya] = { claims, receipts, incomes, rentalProps }; d.user = user; sv(d);
    }
  }, [claims, receipts, incomes, rentalProps, user, ya]);

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

  const saveClaimToSupabase = async (id, amt, units) => {
    if (!user?.id) return;
    await supabase.from("claims").upsert({ user_id: user.id, ya, item_id: id, amount: amt, units: units || 1 }, { onConflict: "user_id,ya,item_id" });
  };

  const cats = REL[ya] || REL["2025"];
  const allItems = cats.flatMap(c => c.items);
  const totalRelief = allItems.reduce((s, i) => s + (i.auto ? i.cap : (claims[i.id]?.amount || 0)), 0);
  const totalEmploymentIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalRentalIncome = rentalProps.reduce((sum, p) => {
    const deductTotal = Object.values(p.deductions || {}).reduce((s, d) => s + (d.amount || 0), 0);
    return sum + Math.max(0, (p.grossRent || 0) - deductTotal);
  }, 0);
  const totalIncome = totalEmploymentIncome + totalRentalIncome;
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

  // Rental helpers
  const addRentalProperty = () => {
    if (!rPropName || !rGrossRent) return;
    const newProp = { id: Date.now().toString(), name: rPropName, grossRent: parseFloat(rGrossRent) || 0, deductions: {} };
    setRentalProps(p => [...p, newProp]);
    setRPropName(""); setRGrossRent(""); setShowAddRental(false);
    setExpandedRental(newProp.id);
  };

  const updateRentalDeduction = (propId, deductId, amount, image) => {
    setRentalProps(prev => prev.map(p => {
      if (p.id !== propId) return p;
      const existing = p.deductions[deductId] || {};
      return { ...p, deductions: { ...p.deductions, [deductId]: { amount: parseFloat(amount) || 0, image: image !== undefined ? image : existing.image } } };
    }));
  };

  const removeRentalProperty = (id) => setRentalProps(prev => prev.filter(p => p.id !== id));

  const handleRentalImg = (e, propId, deductId) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      const currentAmt = rentalDeductDraft[`${propId}-${deductId}`] ?? rentalProps.find(p => p.id === propId)?.deductions[deductId]?.amount ?? 0;
      updateRentalDeduction(propId, deductId, currentAmt, ev.target.result);
    };
    r.readAsDataURL(f); e.target.value = "";
  };

  const switchYA = (y) => { setYa(y); setShowYa(false); setExpCat(null); setEditItem(null); closeScan(); };

  const closeScan = () => { setScanOpen(false); setScanImg(null); setScanDesc(""); setScanStep("idle"); setScanResult(null); setScanErr(null); };
  const openScan = () => { setScanOpen(true); setScanStep("pick"); setScanImg(null); setScanDesc(""); setScanResult(null); setScanErr(null); };

  const handleFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = (ev) => setScanImg(ev.target.result); r.readAsDataURL(f); e.target.value = "";
  };

  const runAI = async () => {
    const desc = scanDescRef.current?.value || scanDesc;
    if (!scanImg && !desc) return;
    setScanStep("analyzing"); setScanErr(null);

    const list = allItems.filter(i => !i.auto).map(i => `${i.id}: ${i.name} (cap RM${i.cap}) - ${i.desc}`).join("\n");
    const systemPrompt = `You are a Malaysian tax relief validator for Year of Assessment (YA) ${ya}, strictly following LHDN BE form guidelines. Your ONLY job is to determine if an expense qualifies for Malaysian income tax relief under the Income Tax Act 1967.

Available relief categories for YA${ya}:
${list}

Rules:
- Map expenses to the MOST SPECIFIC matching relief category using the descriptions above
- Sports & fitness (G10) INCLUDES: golf green fees, golf equipment (clubs/balls/bags), golf lessons from registered coaches, gym memberships, sports court rental (badminton/squash/tennis), swimming pool entry, martial arts fees, yoga/pilates classes, competition entry fees
- Sports & fitness (G10) EXCLUDES: golf buggy rental, golf club membership joining fees, daily insurance, sports clothing/shoes/apparel
- When a receipt has BOTH claimable and non-claimable line items, add up ONLY the claimable line items for suggested_amount, and the full receipt total for total_amount
- Do NOT reject an expense based on the merchant name alone — read the actual line items purchased
- If an expense clearly matches a category description above, approve it confidently
- Only reject if the expense genuinely has no matching category

Reply with ONLY valid JSON (no markdown, no code fences, no explanation outside JSON):
{"claimable":true,"category_id":"G10","category_name":"Sports & fitness","total_amount":250,"suggested_amount":250,"explanation":"Short reason","conditions":"Keep receipt for 7 years for LHDN audit."}

If not claimable: {"claimable":false,"category_id":null,"category_name":null,"total_amount":0,"suggested_amount":0,"explanation":"Reason why not.","conditions":null}`;

    const userContent = [];
    if (scanImg) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: scanImg.split(";")[0].split(":")[1], data: scanImg.split(",")[1] }
      });
    }
    userContent.push({
      type: "text",
      text: desc
        ? `User describes the expense as: "${desc}". ${scanImg ? "A receipt image is also attached — extract all line items from it and evaluate each one individually." : "No receipt image provided."}`
        : "A receipt image has been attached. Extract ALL line items from the receipt individually. For each line item, decide if it qualifies for any LHDN tax relief. Sum up only the qualifying line items for suggested_amount. Sum the full receipt total for total_amount."
    });

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "API error");

      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) throw new Error("No response from Claude");

      let jsonText = textBlock.text.trim();
      jsonText = jsonText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(jsonText);

      setScanResult(parsed);
      setScanStep("result");
    } catch (e) {
      console.error(e);
      setScanErr("Analysis failed. Please check your connection and try again.");
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
    const r = new FileReader(); r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); sv(d); const y = d[ya] || {}; setClaims(y.claims || {}); setReceipts(y.receipts || []); setIncomes(y.incomes || []); setRentalProps(y.rentalProps || []); alert("Restored!"); } catch { alert("Invalid file"); } }; r.readAsText(f);
  };

  const filtCats = search ? cats.map(c => ({ ...c, items: c.items.filter(i => (i.name + i.desc).toLowerCase().includes(search.toLowerCase())) })).filter(c => c.items.length) : cats;
  const itemName = (id) => allItems.find(i => i.id === id)?.name || id;
  const fmtPeriod = (start, end) => {
    const fmt = (d) => { if (!d) return ""; const [y, m] = d.split("-"); return MONTHS[parseInt(m) - 1] + " " + y; };
    return (start && end) ? fmt(start) + " – " + fmt(end) : "Full year";
  };

  if (loading) return (
    <div style={{ ...base, background: "linear-gradient(160deg,#1A1C1E,#2D2F33)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{globalCSS}</style>
      <div style={{ textAlign: "center" }}>
        <Logo size={56} />
        <div style={{ marginTop: 16, width: 32, height: 32, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #E8FA5B", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "16px auto 0" }} />
      </div>
    </div>
  );

  if (authMode === "welcome") return (
    <div style={{ ...base, background: "linear-gradient(160deg,#1A1C1E,#2D2F33)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, color: "#fff", textAlign: "center" }}>
      <style>{globalCSS}</style>
      <Logo size={64} />
      <h1 style={{ fontSize: 34, fontWeight: 700, margin: "14px 0 6px", letterSpacing: -1, fontFamily: "'Poppins',sans-serif" }}>Ringgit</h1>
      <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 40, fontWeight: 400, fontFamily: "'Poppins',sans-serif" }}>Your Malaysian finance companion</p>
      <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#E8FA5B", color: "#1A1C1E", width: "100%", padding: "16px 0", fontSize: 15, marginBottom: 10, boxShadow: "0 4px 20px rgba(232,250,91,0.3)" }}
        onClick={async () => {
          await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
        }}>Continue with Google</button>
      <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, margin: "16px 0" }}>
        <div style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
        <span style={{ fontSize: 12, opacity: 0.4, fontFamily: "'Poppins',sans-serif" }}>or</span>
        <div style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.15)" }} />
      </div>
      <button className="ringgit-tap" style={{ ...bt, backgroundColor: "rgba(255,255,255,0.06)", color: "#fff", width: "100%", padding: "16px 0", fontSize: 15, border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={() => setAuthMode("signup")}>Continue as Guest</button>
      <p style={{ fontSize: 11, opacity: 0.3, marginTop: 24, fontFamily: "'Poppins',sans-serif" }}>Free · Google users get cloud sync · Not financial advice</p>
    </div>
  );

  if (authMode === "signup") return (
    <div style={{ ...base, backgroundColor: C.bg, display: "flex", flexDirection: "column", padding: 24 }}>
      <style>{globalCSS}</style>
      <div style={{ textAlign: "center", marginTop: 48, marginBottom: 36 }}>
        <Logo size={48} />
        <h2 style={{ fontSize: 24, fontWeight: 600, color: C.text, margin: "14px 0 4px", fontFamily: "'Poppins',sans-serif" }}>Set up your profile</h2>
        <p style={{ fontSize: 14, color: C.textSec, fontWeight: 400, fontFamily: "'Poppins',sans-serif" }}>Helps personalise your calculations</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div><label style={lb}>Your name</label><input className="ringgit-input" style={ip} placeholder="e.g. Vick" value={nameIn} onChange={e => setNameIn(e.target.value)} /></div>
        <div><label style={lb}>Year of birth</label><input className="ringgit-input" style={ip} type="number" placeholder="e.g. 1990" value={yobIn} onChange={e => setYobIn(e.target.value)} /></div>
      </div>
      <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "16px 0", fontSize: 16, marginTop: 28 }}
        onClick={() => { const u = { name: nameIn || "Guest", yob: yobIn, provider: "guest" }; setUser(u); setAuthMode("app"); const d = ld(); d.user = u; sv(d); }}>Get Started</button>
      <button className="ringgit-tap" style={{ ...bt, backgroundColor: "transparent", color: C.textSec, marginTop: 12, fontSize: 14 }}
        onClick={() => { setUser({ name: "Guest", provider: "guest" }); setAuthMode("app"); }}>Skip for now</button>
    </div>
  );

  const ScanModal = () => {
    if (!scanOpen) return null;
    return (
      <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(26,28,30,0.55)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(8px)", animation: "fadeIn 0.2s ease-out" }}>
        <div style={{ backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderRadius: "32px 32px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", padding: 22, boxShadow: "0 -8px 40px rgba(0,0,0,0.18)", fontFamily: "'Poppins',sans-serif", border: "1px solid rgba(255,255,255,0.5)", animation: "slideUp 0.25s ease-out" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>🤖 AI Receipt Check</h3>
            <button className="ringgit-tap" style={{ ...bt, width: 32, height: 32, borderRadius: 16, backgroundColor: C.sage, color: C.textSec, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} onClick={closeScan}>✕</button>
          </div>

          {scanStep === "pick" && (
            <div>
              <div className="ringgit-tap" style={{ ...cd, backgroundColor: C.mint, textAlign: "center", padding: 28, cursor: "pointer", border: "1.5px dashed " + C.mintDeep }} onClick={() => fRef.current?.click()}>
                {scanImg
                  ? <img src={scanImg} style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 12 }} />
                  : <div><div style={{ fontSize: 36, marginBottom: 8 }}>📸</div><div style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>Upload receipt (optional)</div><div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>Photo or screenshot</div></div>}
              </div>
              <input ref={fRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
              {!scanImg && <div style={{ fontSize: 11, color: "#7C6A0A", backgroundColor: C.yellow, textAlign: "center", marginTop: 8, padding: "8px 12px", borderRadius: 10 }}>💡 Keeping receipts helps during LHDN audits (7-year requirement)</div>}
              <textarea
                ref={scanDescRef}
                className="ringgit-input"
                style={{ ...ip, marginTop: 12, resize: "none", minHeight: 70 }}
                placeholder='Describe the expense (e.g. "gym membership RM250" or "dental checkup RM180")'
                defaultValue={scanDesc}
                onBlur={e => setScanDesc(e.target.value)}
              />
              {scanErr && <div style={{ color: C.danger, fontSize: 13, fontWeight: 600, marginTop: 8, textAlign: "center" }}>{scanErr}</div>}
              <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "15px 0", fontSize: 15, marginTop: 14 }} onClick={runAI}>🤖 Check if Claimable</button>
            </div>
          )}

          {scanStep === "analyzing" && (
            <div style={{ textAlign: "center", padding: "44px 0" }}>
              <div style={{ width: 40, height: 40, border: "4px solid " + C.border, borderTop: "4px solid #1A1C1E", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1C1E" }}>Checking against LHDN YA{ya} reliefs...</div>
            </div>
          )}

          {scanStep === "result" && scanResult && (
            <div style={{ animation: "fadeIn 0.25s ease-out" }}>
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
                  <button className="ringgit-tap" style={{ ...bt, backgroundColor: C.sage, color: C.text, width: "100%", padding: "12px 0", fontSize: 13 }} onClick={() => addFromScan(true)}>{"Add full (RM " + (scanResult.total_amount || 0).toLocaleString() + ")"}</button>
                )}
                {scanResult.claimable && (
                  <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "14px 0", fontSize: 14 }} onClick={() => addFromScan(false)}>{"Add suggested (RM " + (scanResult.suggested_amount || 0).toLocaleString() + ")"}</button>
                )}
                <button className="ringgit-tap" style={{ ...bt, backgroundColor: "transparent", color: C.textSec, fontSize: 13 }} onClick={closeScan}>{scanResult.claimable ? "Skip" : "Close"}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={base}>
      <style>{globalCSS}</style>
      <ScanModal />

      {tab === "relief" && !scanOpen && (
        <button
          className="ringgit-tap"
          onClick={openScan}
          style={{
            position: "fixed", bottom: 24, right: "max(24px, calc(50vw - 216px))",
            width: 60, height: 60, borderRadius: 30,
            backgroundColor: "#E8FA5B", color: "#1A1C1E",
            border: "none", cursor: "pointer", zIndex: 50,
            boxShadow: "0 8px 30px rgba(232,250,91,0.5), 0 4px 12px rgba(26,28,30,0.15)",
            fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Poppins',sans-serif"
          }}
          title="AI Receipt Scan"
        >🤖</button>
      )}

      {viewImg && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "fadeIn 0.2s ease-out" }} onClick={() => setViewImg(null)}>
          <img src={viewImg} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16, objectFit: "contain" }} />
        </div>
      )}

      {/* Header */}
      <div style={{ background: "#1A1C1E", padding: "22px 20px 28px", color: "#fff", borderRadius: "0 0 36px 36px", position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.5, fontWeight: 400, fontFamily: "'Poppins',sans-serif" }}>Welcome back,</div>
            <div style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>
              {user?.name || "User"}
              {user?.provider === "google" && <span style={{ fontSize: 10, backgroundColor: "#E8FA5B", color: "#1A1C1E", padding: "2px 8px", borderRadius: 20, marginLeft: 8, fontWeight: 700, verticalAlign: "middle" }}>☁️ Synced</span>}
            </div>
          </div>
          <div style={{ position: "relative" }}>
            <button className="ringgit-tap" style={{ ...bt, backgroundColor: "rgba(255,255,255,0.08)", color: "#fff", padding: "9px 16px", fontSize: 12, border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)" }} onClick={() => setShowYa(!showYa)}>{"YA" + ya + " ▾"}</button>
            {showYa && (
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, backgroundColor: "rgba(255,255,255,0.95)", backdropFilter: "blur(20px)", borderRadius: 20, boxShadow: "0px 12px 40px rgba(26,28,30,0.18)", overflow: "hidden", zIndex: 50, minWidth: 110, border: "1px solid rgba(255,255,255,0.4)", animation: "fadeIn 0.15s ease-out" }}>
                {YEARS.map(y => (
                  <button key={y} className="ringgit-tap" style={{ display: "block", width: "100%", padding: "12px 20px", border: "none", backgroundColor: y === ya ? "#E8FA5B" : "transparent", color: "#1A1C1E", fontSize: 14, fontWeight: y === ya ? 600 : 400, cursor: "pointer", fontFamily: "'Poppins',sans-serif", textAlign: "left" }} onClick={() => switchYA(y)}>{"YA" + y}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -8, backgroundColor: "#E8FA5B", filter: "blur(24px)", opacity: 0.25, borderRadius: 40, pointerEvents: "none" }} />
          <div style={{ position: "relative", backgroundColor: "#E8FA5B", borderRadius: 28, padding: "22px 22px", boxShadow: "0 10px 30px rgba(232,250,91,0.18), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {[["Income", totalIncome, "#1A1C1E"], ["Relief", totalRelief, "#1A1C1E"], ["Chargeable", chargeable, "#1A1C1E"], ["Est. Tax", estTax, "#FF6B6B"]].map(([l, v, clr]) => (
                <div key={l}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(26,28,30,0.55)", marginBottom: 3, fontFamily: "'Poppins',sans-serif", letterSpacing: 0.3, textTransform: "uppercase" }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: clr, letterSpacing: -0.6, fontFamily: "'Poppins',sans-serif" }}>{"RM " + (typeof v === "number" ? v : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", backgroundColor: "rgba(255,255,255,0.7)", backdropFilter: "blur(18px)", margin: "0 16px", borderRadius: 9999, marginTop: -18, position: "relative", zIndex: 5, boxShadow: "0px 12px 40px rgba(26,28,30,0.08)", padding: 4, border: "1px solid rgba(255,255,255,0.6)" }}>
        {[["relief", "Tax Relief"], ["income", "Income"], ["receipts", "Receipts"], ["more", "More"]].map(([k, l]) => (
          <button key={k} className="ringgit-tab" style={{ flex: 1, padding: "12px 4px", border: "none", borderRadius: 9999, backgroundColor: tab === k ? "#1A1C1E" : "transparent", color: tab === k ? "#fff" : "#94A3B8", fontSize: 12, fontWeight: tab === k ? 600 : 500, cursor: "pointer", fontFamily: "'Poppins',sans-serif", transition: "all 0.25s ease-out" }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ padding: 16, paddingTop: 20 }}>

        {/* RELIEF TAB */}
        {tab === "relief" && (
          <div style={{ animation: "fadeIn 0.2s ease-out" }}>
            <button className="ringgit-card-tap" style={{ ...cd, width: "100%", backgroundColor: "#E8FA5B", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", marginBottom: 18, textAlign: "left", boxShadow: "0 8px 24px rgba(232,250,91,0.25), inset 0 1px 0 rgba(255,255,255,0.5)", border: "1px solid rgba(26,28,30,0.04)" }} onClick={openScan}>
              <div style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#1A1C1E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0, boxShadow: "0 4px 12px rgba(26,28,30,0.25)" }}>🤖</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1C1E", fontFamily: "'Poppins',sans-serif" }}>AI Receipt Scanner</div>
                <div style={{ fontSize: 12, color: "rgba(26,28,30,0.55)", fontFamily: "'Poppins',sans-serif" }}>Claude validates your LHDN claims</div>
              </div>
              <span style={{ fontSize: 18, color: "#1A1C1E", opacity: 0.5 }}>›</span>
            </button>

            <input className="ringgit-input" style={{ ...ip, marginBottom: 16, backgroundColor: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.5)" }} placeholder="Search reliefs..." value={search} onChange={e => setSearch(e.target.value)} />

            {filtCats.map(cat => (
              <div key={cat.id} style={{ marginBottom: 12 }}>
                <div className="ringgit-card-tap" style={{ ...cd, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }} onClick={() => setExpCat(expCat === cat.id ? null : cat.id)}>
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{cat.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.pri, backgroundColor: C.mint, padding: "3px 10px", borderRadius: 20, fontFamily: "'Poppins',sans-serif" }}>{cat.items.filter(i => claims[i.id]?.amount > 0).length + "/" + cat.items.length}</span>
                  <span style={{ fontSize: 12, color: C.textSec, transition: "transform 0.2s ease-out", transform: expCat === cat.id ? "rotate(90deg)" : "rotate(0)" }}>›</span>
                </div>
                {(expCat === cat.id || search) && (
                  <div style={{ animation: "expand 0.25s ease-out" }}>
                    {cat.items.map(item => {
                      const cl = claims[item.id]; const done = cl?.amount > 0; const ed = editItem === item.id;
                      const ec = item.perUnit ? item.cap * (cl?.units || 1) : item.cap;
                      const ir = receipts.filter(rx => (rx.itemId || rx.item_id) === item.id);
                      return (
                        <div key={item.id} className="ringgit-item-card" style={{ ...cd, marginTop: 8, marginLeft: 6, backgroundColor: done ? C.mint : "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: done ? "1px solid rgba(168,213,186,0.5)" : "1px solid rgba(255,255,255,0.55)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4, fontFamily: "'Poppins',sans-serif" }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, backgroundColor: C.priPale, padding: "2px 6px", borderRadius: 6, marginRight: 6, boxShadow: "0 1px 3px rgba(232,250,91,0.3)" }}>{item.id}</span>
                                {item.name}
                              </div>
                              <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.5, marginBottom: 5, fontFamily: "'Poppins',sans-serif" }}>{item.desc}</div>
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
                            <div style={{ flexShrink: 0 }}>
                              {item.auto
                                ? <div style={{ fontSize: 9, fontWeight: 700, color: C.pri, backgroundColor: C.priPale, padding: "6px 11px", borderRadius: 10, fontFamily: "'Poppins',sans-serif", boxShadow: "0 2px 8px rgba(232,250,91,0.35)" }}>AUTO</div>
                                : <button className="ringgit-tap" style={{ padding: "9px 14px", border: "none", borderRadius: 12, backgroundColor: done ? C.pri : C.sage, color: done ? "#fff" : C.pri, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins',sans-serif", boxShadow: done ? "0 3px 10px rgba(26,28,30,0.2)" : "0 2px 6px rgba(26,28,30,0.06)" }}
                                    onClick={() => { if (ed) setEditItem(null); else { setEditItem(item.id); setAmtIn(cl?.amount?.toString() || ""); setUnitIn(cl?.units || 1); } }}>{done ? "Edit" : "+ Claim"}</button>}
                            </div>
                          </div>
                          {ed && (
                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + C.border, animation: "expand 0.2s ease-out" }}>
                              {item.perUnit && (
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                  <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{"No. of " + item.unitName + ":"}</label>
                                  <input className="ringgit-input" style={{ ...ip, width: 55, textAlign: "center", padding: "7px" }} type="number" min="1" value={unitIn} onChange={e => setUnitIn(parseInt(e.target.value) || 1)} />
                                </div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>RM</span>
                                <input className="ringgit-input" style={{ ...ip, flex: 1, backgroundColor: "#fff" }} type="number" placeholder="0" value={amtIn} onChange={e => setAmtIn(e.target.value)} autoFocus />
                                <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", padding: "10px 16px", fontSize: 12 }} onClick={() => { saveClaim(item.id, parseFloat(amtIn) || 0, unitIn); setEditItem(null); }}>Save</button>
                              </div>
                              {parseFloat(amtIn) > ec && <div style={{ fontSize: 11, color: C.warning, fontWeight: 600, marginTop: 4, fontFamily: "'Poppins',sans-serif" }}>{"Capped at RM " + ec.toLocaleString()}</div>}
                              {done && <button className="ringgit-tap" style={{ border: "none", background: "none", color: C.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif", marginTop: 8 }} onClick={() => { saveClaim(item.id, 0, 1); setEditItem(null); }}>Remove</button>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* INCOME TAB */}
        {tab === "income" && (
          <div style={{ animation: "fadeIn 0.2s ease-out" }}>

            {/* Employment Income */}
            <div style={{ ...cd, display: "flex", flexDirection: "column", gap: 12, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{"Add Employment Income (YA" + ya + ")"}</div>
              <div><label style={lb}>Employer</label><input className="ringgit-input" style={ip} placeholder="e.g. Space X" value={iEmp} onChange={e => setIEmp(e.target.value)} /></div>
              <div><label style={lb}>Annual gross income (RM)</label><input className="ringgit-input" style={ip} type="number" placeholder="0" value={iAmt} onChange={e => setIAmt(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10 }}>
                <MonthPicker label="Start" value={iStart} onChange={setIStart} />
                <MonthPicker label="End" value={iEnd} onChange={setIEnd} />
              </div>
              <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", width: "100%", padding: "14px 0", fontSize: 14, marginTop: 4 }}
                onClick={async () => {
                  if (!iEmp || !iAmt) return;
                  const period = fmtPeriod(iStart, iEnd);
                  await addIncome({ id: Date.now().toString(), employer: iEmp, amount: parseFloat(iAmt) || 0, period });
                  setIEmp(""); setIAmt(""); setIStart(""); setIEnd("");
                }}>+ Add Income Source</button>
            </div>

            {incomes.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={st}>EMPLOYMENT SOURCES</div>
                {incomes.map(inc => (
                  <div key={inc.id} className="ringgit-item-card" style={{ ...cd, display: "flex", alignItems: "center", gap: 10, marginBottom: 10, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{inc.employer}</div>
                      <div style={{ fontSize: 11, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{inc.period + " · RM " + inc.amount.toLocaleString()}</div>
                    </div>
                    <button className="ringgit-tap" style={{ width: 28, height: 28, border: "none", borderRadius: 14, backgroundColor: "#FECACA", color: C.danger, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => removeIncome(inc.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* ── RENTAL INCOME SECTION ── */}
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.2, color: C.textSec, textTransform: "uppercase", fontFamily: "'Poppins',sans-serif" }}>Rental Income</div>
                  <div style={{ fontSize: 11, color: C.textSec, fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>Section 4(d) · Net after deductions</div>
                </div>
                <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#E8FA5B", padding: "9px 16px", fontSize: 12, fontWeight: 700 }} onClick={() => setShowAddRental(!showAddRental)}>+ Property</button>
              </div>

              {showAddRental && (
                <div style={{ ...cd, marginBottom: 14, backgroundColor: "rgba(255,255,255,0.85)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.6)", animation: "expand 0.2s ease-out" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif", marginBottom: 12 }}>Add Rental Property</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={lb}>Property Name / Address</label>
                    <input className="ringgit-input" style={ip} placeholder="e.g. Subang Jaya Condo A-12" value={rPropName} onChange={e => setRPropName(e.target.value)} />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={lb}>Annual Gross Rental Income (RM)</label>
                    <input className="ringgit-input" style={ip} type="number" placeholder="e.g. 18000" value={rGrossRent} onChange={e => setRGrossRent(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ringgit-tap" style={{ ...bt, flex: 1, backgroundColor: "#1A1C1E", color: "#fff", padding: "13px 0", fontSize: 13 }} onClick={addRentalProperty}>Add Property</button>
                    <button className="ringgit-tap" style={{ ...bt, flex: 1, backgroundColor: C.sage, color: C.textSec, padding: "13px 0", fontSize: 13 }} onClick={() => setShowAddRental(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {rentalProps.length === 0 && !showAddRental && (
                <div style={{ textAlign: "center", padding: "24px 0", color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🏠</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>No rental properties yet</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>Tap + Property to add one</div>
                </div>
              )}

              {rentalProps.map(prop => {
                const deductTotal = Object.values(prop.deductions || {}).reduce((s, d) => s + (d.amount || 0), 0);
                const netRent = Math.max(0, (prop.grossRent || 0) - deductTotal);
                const claimedCount = Object.values(prop.deductions || {}).filter(d => d.amount > 0).length;
                const isExpanded = expandedRental === prop.id;

                return (
                  <div key={prop.id} style={{ marginBottom: 12 }}>
                    {/* Property card */}
                    <div className="ringgit-card-tap" style={{ ...cd, cursor: "pointer", backgroundColor: "rgba(255,255,255,0.82)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }} onClick={() => setExpandedRental(isExpanded ? null : prop.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: "#1A1C1E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏠</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prop.name}</div>
                          <div style={{ fontSize: 11, color: C.textSec, fontFamily: "'Poppins',sans-serif", marginTop: 2 }}>Gross RM {(prop.grossRent || 0).toLocaleString()} · Deductions RM {deductTotal.toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "#1A1C1E", fontFamily: "'Poppins',sans-serif" }}>RM {netRent.toLocaleString()}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: 0.5 }}>Net Taxable</div>
                        </div>
                        <span style={{ fontSize: 12, color: C.textSec, transition: "transform 0.2s ease-out", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", marginLeft: 4 }}>›</span>
                      </div>
                      <div style={{ marginTop: 10, height: 4, backgroundColor: C.sage, borderRadius: 999, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${prop.grossRent > 0 ? Math.min(100, (deductTotal / prop.grossRent) * 100) : 0}%`, backgroundColor: "#E8FA5B", borderRadius: 999, transition: "width 0.4s ease-out" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{claimedCount}/{RENTAL_DEDUCTIONS.length} deductions added</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#1A1C1E", fontFamily: "'Poppins',sans-serif" }}>{prop.grossRent > 0 ? Math.round((deductTotal / prop.grossRent) * 100) : 0}% deducted</span>
                      </div>
                    </div>

                    {/* Deductions checklist */}
                    {isExpanded && (
                      <div style={{ marginLeft: 6, animation: "expand 0.25s ease-out" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.textSec, textTransform: "uppercase", fontFamily: "'Poppins',sans-serif", margin: "12px 0 6px", paddingLeft: 2 }}>Section 4(d) Deductions</div>
                        <div style={{ fontSize: 10, color: "#7C6A0A", backgroundColor: "#E8FA5B", padding: "8px 12px", borderRadius: 10, marginBottom: 10, fontFamily: "'Poppins',sans-serif", lineHeight: 1.5 }}>
                          ⚠️ Keep original receipts 7 years · Only deduct expenses incurred while property was rented out
                        </div>

                        {RENTAL_DEDUCTIONS.map(ded => {
                          const saved = prop.deductions?.[ded.id];
                          const hasClaim = (saved?.amount || 0) > 0;
                          const localKey = `${prop.id}-${ded.id}`;
                          const isActive = activeRentalDeduct === localKey;

                          return (
                            <div key={ded.id} className="ringgit-item-card" style={{ ...cd, marginBottom: 8, backgroundColor: hasClaim ? C.mint : "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: hasClaim ? "1px solid rgba(168,213,186,0.5)" : "1px solid rgba(255,255,255,0.55)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                    <span>{ded.icon}</span>
                                    <span>{ded.name}</span>
                                    {hasClaim && <span style={{ fontSize: 10, fontWeight: 800, backgroundColor: "#1A1C1E", color: "#fff", padding: "2px 8px", borderRadius: 8 }}>RM {saved.amount.toLocaleString()}</span>}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#7B9E87", fontStyle: "italic", fontFamily: "'Poppins',sans-serif", marginTop: 1 }}>{ded.malay}</div>
                                  <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.5, marginTop: 3, fontFamily: "'Poppins',sans-serif" }}>{ded.desc}</div>
                                  {saved?.image && (
                                    <img src={saved.image} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, marginTop: 6, cursor: "pointer", border: "2px solid rgba(168,213,186,0.6)" }} onClick={() => setViewImg(saved.image)} />
                                  )}
                                </div>
                                <button className="ringgit-tap" style={{ padding: "9px 14px", border: "none", borderRadius: 12, backgroundColor: hasClaim ? C.pri : C.sage, color: hasClaim ? "#fff" : C.pri, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins',sans-serif", flexShrink: 0 }}
                                  onClick={() => { setActiveRentalDeduct(isActive ? null : localKey); setRentalDeductDraft(p => ({ ...p, [localKey]: saved?.amount?.toString() || "" })); }}>
                                  {hasClaim ? "Edit" : "+ Add"}
                                </button>
                              </div>

                              {isActive && (
                                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + C.border, animation: "expand 0.2s ease-out" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>RM</span>
                                    <input
                                      className="ringgit-input"
                                      style={{ ...ip, flex: 1, backgroundColor: "#fff" }}
                                      type="number"
                                      placeholder="0"
                                      autoFocus
                                      value={rentalDeductDraft[localKey] ?? ""}
                                      onChange={e => setRentalDeductDraft(p => ({ ...p, [localKey]: e.target.value }))}
                                    />
                                    <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#1A1C1E", color: "#fff", padding: "10px 16px", fontSize: 12 }}
                                      onClick={() => { updateRentalDeduction(prop.id, ded.id, rentalDeductDraft[localKey] || 0, undefined); setActiveRentalDeduct(null); }}>Save</button>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <input ref={rImgRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleRentalImg(e, prop.id, ded.id)} />
                                    <button className="ringgit-tap" style={{ ...bt, backgroundColor: C.sage, color: C.pri, padding: "9px 14px", fontSize: 11 }} onClick={() => rImgRef.current?.click()}>
                                      📎 {saved?.image ? "Replace Receipt" : "Attach Receipt"}
                                    </button>
                                    {saved?.image && <span style={{ fontSize: 10, color: C.success, fontWeight: 600, fontFamily: "'Poppins',sans-serif" }}>✓ Saved</span>}
                                  </div>
                                  {hasClaim && (
                                    <button className="ringgit-tap" style={{ border: "none", background: "none", color: C.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif", marginTop: 8 }}
                                      onClick={() => { updateRentalDeduction(prop.id, ded.id, 0, null); setActiveRentalDeduct(null); }}>Remove</button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Per-property net summary */}
                        <div style={{ ...cd, backgroundColor: "#1A1C1E", border: "none", marginTop: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13, fontFamily: "'Poppins',sans-serif" }}>
                            <span style={{ color: "rgba(255,255,255,0.5)" }}>Gross Rental</span>
                            <span style={{ color: "#fff", fontWeight: 600 }}>RM {(prop.grossRent || 0).toLocaleString()}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 13, fontFamily: "'Poppins',sans-serif" }}>
                            <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Deductions</span>
                            <span style={{ color: "#E8FA5B", fontWeight: 600 }}>– RM {deductTotal.toLocaleString()}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.12)", marginTop: 8, paddingTop: 8, fontSize: 15, fontWeight: 800, fontFamily: "'Poppins',sans-serif" }}>
                            <span style={{ color: "rgba(255,255,255,0.7)" }}>Net Taxable</span>
                            <span style={{ color: "#E8FA5B" }}>RM {netRent.toLocaleString()}</span>
                          </div>
                        </div>

                        <button className="ringgit-tap" style={{ border: "none", background: "none", color: C.danger, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif", marginTop: 10, display: "block" }}
                          onClick={() => removeRentalProperty(prop.id)}>🗑️ Remove this property</button>
                      </div>
                    )}
                  </div>
                );
              })}

              {rentalProps.length > 0 && (
                <div style={{ ...cd, backgroundColor: C.mint, border: "1px solid rgba(168,213,186,0.4)", marginTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 800, color: C.text, fontFamily: "'Poppins',sans-serif" }}>
                    <span>Total Net Rental Income</span>
                    <span>RM {totalRentalIncome.toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 4, fontFamily: "'Poppins',sans-serif" }}>Included in chargeable income above</div>
                </div>
              )}
            </div>
            {/* ── END RENTAL SECTION ── */}

            {totalIncome > 0 && (
              <div style={{ ...cd, marginTop: 16, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
                <div style={st}>TAX ESTIMATE</div>
                {[
                  ["Employment Income", "RM " + totalEmploymentIncome.toLocaleString(), C.text],
                  ["Net Rental Income", "RM " + totalRentalIncome.toLocaleString(), C.text],
                  ["Total Relief", "– RM " + totalRelief.toLocaleString(), C.success],
                ].filter(([,v]) => v !== "RM 0").map(([l, v, clr]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>
                    <span>{l}</span><span style={{ color: clr, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid " + C.border, marginTop: 8, paddingTop: 8, fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "'Poppins',sans-serif" }}>
                  <span>Chargeable</span><span>{"RM " + chargeable.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4, fontSize: 22, fontWeight: 800, color: C.danger, fontFamily: "'Poppins',sans-serif" }}>
                  <span>Est. Tax</span><span>{"RM " + estTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RECEIPTS TAB */}
        {tab === "receipts" && (
          <div style={{ animation: "fadeIn 0.2s ease-out" }}>
            {receipts.length === 0
              ? <div style={{ textAlign: "center", padding: "50px 20px" }}>
                <div style={{ fontSize: 44 }}>🧾</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.textSec, marginTop: 8, fontFamily: "'Poppins',sans-serif" }}>No receipts yet</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, fontFamily: "'Poppins',sans-serif" }}>Tap the 🤖 button to scan</div>
              </div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {receipts.map(rx => (
                  <div key={rx.id} className="ringgit-item-card" style={{ ...cd, display: "flex", alignItems: "center", gap: 12, position: "relative", backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
                    {rx.data
                      ? <img src={rx.data} style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 12, flexShrink: 0, cursor: "pointer" }} onClick={() => setViewImg(rx.data)} />
                      : <div style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🧾</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Poppins',sans-serif" }}>{rx.name}</div>
                      <div style={{ fontSize: 10, color: C.textSec, marginTop: 2, fontFamily: "'Poppins',sans-serif" }}>{rx.date + (rx.amount ? " · RM " + rx.amount.toLocaleString() : "")}</div>
                      <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(rx.itemId || rx.item_id) && <span style={{ fontSize: 9, fontWeight: 700, color: C.pri, backgroundColor: C.priPale, padding: "2px 7px", borderRadius: 6, fontFamily: "'Poppins',sans-serif" }}>{(rx.itemId || rx.item_id) + ": " + itemName(rx.itemId || rx.item_id)}</span>}
                      </div>
                    </div>
                    <button className="ringgit-tap" style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, border: "none", borderRadius: 12, backgroundColor: "#FECACA", color: C.danger, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => removeReceipt(rx.id)}>✕</button>
                  </div>
                ))}
              </div>}
          </div>
        )}

        {/* MORE TAB */}
        {tab === "more" && (
          <div style={{ animation: "fadeIn 0.2s ease-out" }}>
            <div style={{ ...cd, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: C.pri, fontFamily: "'Poppins',sans-serif" }}>{(user?.name || "U")[0]}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>{user?.name}</div>
                  <div style={{ fontSize: 11, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>{user?.provider === "google" ? "☁️ Google · Synced" : "Guest · Local only"} · YA{ya}</div>
                </div>
              </div>
              {user?.provider !== "google" && (
                <button className="ringgit-tap" style={{ ...bt, backgroundColor: "#E8FA5B", color: "#1A1C1E", width: "100%", padding: "11px 0", fontSize: 13, marginTop: 14, fontWeight: 700 }}
                  onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}>
                  ☁️ Sign in with Google to sync data
                </button>
              )}
            </div>

            {user?.provider !== "google" && (
              <div style={{ ...cd, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>Backup & Restore</h3>
                <p style={{ fontSize: 12, color: C.textSec, margin: "0 0 10px", fontFamily: "'Poppins',sans-serif" }}>Download before switching phones.</p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="ringgit-tap" style={{ ...bt, flex: 1, backgroundColor: C.sage, color: C.pri, padding: "11px 0", fontSize: 12 }} onClick={exportD}>💾 Download</button>
                  <label className="ringgit-tap" style={{ ...bt, flex: 1, backgroundColor: C.sage, color: C.pri, padding: "11px 0", fontSize: 12, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    📂 Restore<input type="file" accept=".json" style={{ display: "none" }} onChange={importD} />
                  </label>
                </div>
              </div>
            )}

            <div style={{ ...cd, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Poppins',sans-serif" }}>Coming Soon</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Debt Tracker", "Savings Goals", "Budget Planner", "EPF Calc", "Zakat Calc"].map(f => (
                  <span key={f} style={{ fontSize: 11, fontWeight: 600, color: C.textSec, backgroundColor: C.sage, padding: "6px 12px", borderRadius: 20, fontFamily: "'Poppins',sans-serif" }}>{f}</span>
                ))}
              </div>
            </div>

            <div style={{ ...cd, marginBottom: 12, backgroundColor: "rgba(255,255,255,0.75)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.55)" }}>
              <button className="ringgit-tap" style={{ border: "none", background: "none", color: C.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Poppins',sans-serif" }}
                onClick={() => { if (confirm("Reset YA" + ya + " data?")) { setClaims({}); setReceipts([]); setIncomes([]); setRentalProps([]); } }}>🗑️ Reset YA{ya} Data</button>
            </div>

            <button className="ringgit-tap" style={{ ...bt, backgroundColor: "transparent", color: C.textSec, width: "100%", marginTop: 4, fontSize: 12 }}
              onClick={async () => {
                if (user?.provider === "google") { await supabase.auth.signOut(); }
                else { const d = ld(); delete d.user; sv(d); setUser(null); setAuthMode("welcome"); }
              }}>Sign Out</button>
            <div style={{ textAlign: "center", padding: "16px 0", fontSize: 10, color: C.textSec, fontFamily: "'Poppins',sans-serif" }}>Ringgit v3.2 · Powered by Claude · Not financial advice</div>
          </div>
        )}

      </div>
    </div>
  );
}

const base = { fontFamily: "'Poppins',sans-serif", backgroundColor: "#D4EDE1", color: "#1A1C1E", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 40 };
const cd = { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 18, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0px 4px 20px rgba(26,28,30,0.06)", fontFamily: "'Poppins',sans-serif" };
const bt = { border: "none", borderRadius: 20, fontWeight: 600, cursor: "pointer", fontFamily: "'Poppins',sans-serif" };
const ip = { width: "100%", padding: "13px 16px", border: "1.5px solid transparent", borderRadius: 16, fontSize: 14, fontFamily: "'Poppins',sans-serif", outline: "none", boxSizing: "border-box", color: "#1A1C1E", backgroundColor: "#E8F0EC", transition: "all 0.2s ease-out" };
const lb = { fontSize: 11, fontWeight: 600, color: "#94A3B8", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Poppins',sans-serif" };
const st = { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "#94A3B8", marginBottom: 8, textTransform: "uppercase", fontFamily: "'Poppins',sans-serif" };
const rw = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 14, fontFamily: "'Poppins',sans-serif" };
const rl = { color: "#94A3B8", fontWeight: 500, fontFamily: "'Poppins',sans-serif" };

const globalCSS = `
@keyframes spin { to { transform: rotate(360deg) } }
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes expand { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
* { box-sizing: border-box; }

.ringgit-tap { transition: transform 0.15s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out, opacity 0.2s ease-out; }
.ringgit-tap:hover { transform: translateY(-1px); filter: brightness(1.04); }
.ringgit-tap:active { transform: scale(0.97); filter: brightness(0.96); }

.ringgit-card-tap { transition: transform 0.2s ease-out, box-shadow 0.2s ease-out; }
.ringgit-card-tap:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(26,28,30,0.1); }
.ringgit-card-tap:active { transform: scale(0.99); }

.ringgit-item-card { transition: transform 0.2s ease-out, box-shadow 0.2s ease-out; }
.ringgit-item-card:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(26,28,30,0.08); }

.ringgit-input { transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out; }
.ringgit-input:focus { border-color: #E8FA5B !important; box-shadow: 0 0 0 4px rgba(232,250,91,0.2); }

.ringgit-tab { transition: all 0.25s ease-out; }
.ringgit-tab:active { transform: scale(0.96); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
