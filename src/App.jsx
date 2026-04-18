import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

const compressImage = async (dataUrl, maxSizeMB = 4.5) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate scaling to stay under size limit
      let quality = 0.8;
      const maxDimension = 2048; // Start with reasonable max dimension
      
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Try progressive quality reduction
      const tryCompress = (q) => {
        const compressed = canvas.toDataURL('image/jpeg', q);
        const sizeInMB = (compressed.length * 0.75) / (1024 * 1024); // Estimate base64 size
        
        if (sizeInMB > maxSizeMB && q > 0.1) {
          return tryCompress(q - 0.1);
        }
        return compressed;
      };
      
      resolve(tryCompress(quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);

// ─────────────────────────────────────────────────────────────
// THEMES — light + dark
// ─────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: "#F5EFE3", bgAlt: "#EDE5D3", surface: "#FFFBF3", surface2: "#F0E8D6",
    ink: "#1C1917", inkSoft: "#44403C", inkMute: "#8B8275",
    hair: "rgba(28,25,23,0.1)", hairStrong: "rgba(28,25,23,0.2)",
    red: "#C8442B", redDeep: "#A3341F", redSoft: "rgba(200,68,43,0.1)",
    gold: "#B8863D", goldSoft: "rgba(184,134,61,0.12)",
    green: "#4A6B3A", greenSoft: "rgba(74,107,58,0.1)",
    shadow: "0 4px 20px rgba(28,25,23,0.06)", shadowHi: "0 12px 40px rgba(28,25,23,0.12)",
  },
  dark: {
    bg: "#15110D", bgAlt: "#1E1813", surface: "#221A14", surface2: "#2A2018",
    ink: "#F5EFE3", inkSoft: "#D6CDBE", inkMute: "#8B8275",
    hair: "rgba(245,239,227,0.08)", hairStrong: "rgba(245,239,227,0.18)",
    red: "#E35A40", redDeep: "#C8442B", redSoft: "rgba(227,90,64,0.15)",
    gold: "#D4A94A", goldSoft: "rgba(212,169,74,0.15)",
    green: "#8FB174", greenSoft: "rgba(143,177,116,0.14)",
    shadow: "0 4px 20px rgba(0,0,0,0.4)", shadowHi: "0 12px 40px rgba(0,0,0,0.5)",
  },
};

const FONT = "'Poppins', -apple-system, system-ui, sans-serif";
const YEARS = ["2025", "2026", "2027"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─────────────────────────────────────────────────────────────
// SVG icon set
// ─────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18, color = "currentColor", weight = 1.6 }) => {
  const s = { width: size, height: size, display: "block", flexShrink: 0 };
  const p = { stroke: color, strokeWidth: weight, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  const map = {
    user: <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="4" {...p}/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" {...p}/></svg>,
    heart: <svg viewBox="0 0 24 24" style={s}><path d="M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11z" {...p}/></svg>,
    sparkle: <svg viewBox="0 0 24 24" style={s}><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" {...p}/></svg>,
    shield: <svg viewBox="0 0 24 24" style={s}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" {...p}/></svg>,
    plus: <svg viewBox="0 0 24 24" style={s}><path d="M12 5v14M5 12h14" {...p}/></svg>,
    chevR: <svg viewBox="0 0 24 24" style={s}><path d="M9 6l6 6-6 6" {...p}/></svg>,
    chevD: <svg viewBox="0 0 24 24" style={s}><path d="M6 9l6 6 6-6" {...p}/></svg>,
    receipt: <svg viewBox="0 0 24 24" style={s}><path d="M6 3v18l3-2 3 2 3-2 3 2V3zM9 8h6M9 12h6M9 16h4" {...p}/></svg>,
    close: <svg viewBox="0 0 24 24" style={s}><path d="M6 6l12 12M18 6L6 18" {...p}/></svg>,
    check: <svg viewBox="0 0 24 24" style={s}><path d="M5 12l5 5L20 7" {...p}/></svg>,
    camera: <svg viewBox="0 0 24 24" style={s}><path d="M4 8h3l2-2h6l2 2h3v12H4z" {...p}/><circle cx="12" cy="13" r="3.5" {...p}/></svg>,
    search: <svg viewBox="0 0 24 24" style={s}><circle cx="11" cy="11" r="7" {...p}/><path d="M20 20l-4-4" {...p}/></svg>,
    moon: <svg viewBox="0 0 24 24" style={s}><path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" {...p}/></svg>,
    sun: <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="4" {...p}/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" {...p}/></svg>,
    download: <svg viewBox="0 0 24 24" style={s}><path d="M12 3v13M6 11l6 6 6-6M4 21h16" {...p}/></svg>,
    upload: <svg viewBox="0 0 24 24" style={s}><path d="M12 21V8M6 13l6-6 6 6M4 3h16" {...p}/></svg>,
    logout: <svg viewBox="0 0 24 24" style={s}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" {...p}/></svg>,
    trash: <svg viewBox="0 0 24 24" style={s}><path d="M4 6h16M8 6V4h8v2M6 6l1 14h10l1-14" {...p}/></svg>,
    google: <svg viewBox="0 0 24 24" style={s}><path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" fill={color} stroke="none"/></svg>,
    briefcase: <svg viewBox="0 0 24 24" style={s}><rect x="3" y="7" width="18" height="13" rx="2" {...p}/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p}/></svg>,
    settings: <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="3" {...p}/><path d="M19 12a7 7 0 0 0-.2-1.6l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.8-1.6L13 2h-4l-.7 2.9a7 7 0 0 0-2.8 1.6l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 3.2 12c0 .55.07 1.08.2 1.6l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.8 1.6l.7 2.9h4l.7-2.9a7 7 0 0 0 2.8-1.6l2.3 1 2-3.4-2-1.5c.13-.52.2-1.05.2-1.6z" {...p}/></svg>,
    sparkleAi: <svg viewBox="0 0 24 24" style={s}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" {...p}/></svg>,
    home: <svg viewBox="0 0 24 24" style={s}><path d="M3 12l9-9 9 9M5 10v10h4v-6h6v6h4V10" {...p}/></svg>,
    key: <svg viewBox="0 0 24 24" style={s}><circle cx="8" cy="15" r="4" {...p}/><path d="M12 11l8-8M18 6l2 2M15 9l2 2" {...p}/></svg>,
  };
  return map[name] || null;
};

const CAT_ICON = {
  personal: "user", medical: "heart", lifestyle: "sparkle",
  insurance: "shield", education: "sparkle", children: "user", housing: "home",
  rental: "key", // FIX 1: rental icon
};

// ─────────────────────────────────────────────────────────────
// LHDN Tax Relief data (YA2025/2026/2027)
// ─────────────────────────────────────────────────────────────
const REL = {
  "2025":[
    {id:"personal",name:"Individual & Dependents",items:[
      {id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic for all resident taxpayers"},
      {id:"G4",name:"Disabled individual",cap:7000,desc:"Certified by JKM"},
      {id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income or alimony"},
      {id:"G15",name:"Disabled spouse",cap:6000,desc:"Spouse certified disabled"}
    ]},
    {id:"medical",name:"Medical & Special Needs",items:[
      {id:"G6",name:"Serious disease / fertility / vaccination / dental",cap:10000,desc:"G6+G7+G8 combined cap RM10k. Vaccination RM1k sub, dental RM1k sub"},
      {id:"G7",name:"Medical exam / self-test / mental health",cap:1000,desc:"Check-up, screening, oximeter, BP monitor, mental health"},
      {id:"G8",name:"Learning disability (child 18 and below)",cap:6000,desc:"ASD, ADHD, GDD, Down Syndrome diagnosis and rehab"},
      {id:"G2",name:"Parents / grandparents medical",cap:8000,desc:"Medical, dental, nursing, carer. Check-up sub-limit RM1k"},
      {id:"G3",name:"Disabled equipment",cap:6000,desc:"Wheelchair, hearing aid, dialysis machine"}
    ]},
    {id:"lifestyle",name:"Lifestyle",items:[
      {id:"G9",name:"Books, gadgets, internet, courses",cap:2500,desc:"Books, smartphone/tablet/PC, internet bills, upskilling"},
      {id:"G10",name:"Sports & fitness",cap:1000,desc:"Sports equipment (golf clubs, balls, bags, rackets, etc), gym membership, sports facility rental (golf green fees, golf simulator, badminton/squash court, swimming pool), sports training/lesson fees (golf lessons, tennis coaching, etc), competition entry fees. EXCLUDES: golf club joining/membership fees, sports clothing/shoes/apparel, buggy rental, insurance fees."},
      {id:"G21",name:"EV charging / composting",cap:2500,desc:"EV charging install/rental/subscription, composting machine"}
    ]},
    {id:"insurance",name:"Insurance & Contributions",items:[
      {id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Insurance/takaful (max RM3k) + EPF (max RM4k)"},
      {id:"G18",name:"PRS / Deferred annuity",cap:3000,desc:"Private Retirement Scheme"},
      {id:"G19",name:"Education & medical insurance",cap:4000,desc:"Insurance premiums for education or medical"},
      {id:"G20",name:"SOCSO / EIS",cap:350,desc:"SOCSO + Employment Insurance"}
    ]},
    {id:"education",name:"Education & Savings",items:[
      {id:"G5",name:"Education fees (self)",cap:7000,desc:"Postgraduate, professional. Upskilling sub-limit RM2k"},
      {id:"G13",name:"SSPN net savings",cap:8000,desc:"Net deposits minus withdrawals"}
    ]},
    {id:"children",name:"Children",items:[
      {id:"G16a",name:"Child under 18",cap:2000,desc:"RM2,000 per unmarried child",perUnit:true,unitName:"children"},
      {id:"G16b",name:"Child 18+ in education",cap:8000,desc:"Diploma+ MY / degree+ overseas",perUnit:true,unitName:"children"},
      {id:"G16c",name:"Disabled child",cap:8000,desc:"Additional RM8k if in higher education",perUnit:true,unitName:"children"},
      {id:"G12",name:"Childcare / kindergarten",cap:3000,desc:"Child aged 6 and below"},
      {id:"G11",name:"Breastfeeding equipment",cap:1000,desc:"Child aged 2 and below. Once every 2 years"}
    ]},
    {id:"housing",name:"Housing",items:[
      {id:"G22",name:"Housing loan interest (first home)",cap:7000,desc:"SPA 2025-2027. RM7k if up to RM500k, RM5k if RM500k-750k"}
    ]},
    // FIX 1: Rental income & deductible expenses section
    {id:"rental",name:"Rental Income & Expenses",items:[
      {id:"R1",name:"Rental expenses — repairs & maintenance",cap:999999,desc:"Deductible: cost of repairs and maintenance of rental property"},
      {id:"R2",name:"Rental expenses — quit rent & assessment",cap:999999,desc:"Deductible: quit rent, assessment tax paid to local authority"},
      {id:"R3",name:"Rental expenses — insurance premium",cap:999999,desc:"Deductible: fire/building insurance on rental property"},
      {id:"R4",name:"Rental expenses — management & agent fees",cap:999999,desc:"Deductible: property management fees, agent commission"},
      {id:"R5",name:"Rental expenses — loan interest",cap:999999,desc:"Deductible: interest on loan taken to purchase/improve rental property"},
    ]}
  ],
  "2026":[
    {id:"personal",name:"Individual",items:[
      {id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic"},
      {id:"G4",name:"Disabled individual",cap:8000,desc:"Increased"},
      {id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income"}
    ]},
    {id:"lifestyle",name:"Lifestyle",items:[
      {id:"G9",name:"Books, gadgets, internet",cap:2500,desc:"Same as YA2025"},
      {id:"G10",name:"Sports & fitness",cap:1000,desc:"Sports equipment (golf clubs, balls, bags, rackets, etc), gym membership, sports facility rental (golf green fees, golf simulator, badminton/squash court, swimming pool), sports training/lesson fees, competition entry fees. EXCLUDES: golf club joining/membership fees, sports clothing/shoes/apparel, buggy rental, insurance fees."},
      {id:"VMY",name:"Visit Malaysia 2026",cap:1000,desc:"NEW: Domestic tourism"}
    ]},
    {id:"medical",name:"Medical",items:[
      {id:"G6",name:"Medical",cap:10000,desc:"Same as YA2025"},
      {id:"G2",name:"Parents medical",cap:8000,desc:"Medical, dental, nursing"}
    ]},
    {id:"insurance",name:"Insurance",items:[
      {id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Combined"},
      {id:"G18",name:"PRS",cap:3000,desc:"PRS"},
      {id:"G19",name:"Education & medical insurance",cap:4000,desc:"Premiums"},
      {id:"G20",name:"SOCSO / EIS",cap:350,desc:"Contributions"}
    ]},
    {id:"children",name:"Children",items:[
      {id:"G16a",name:"Child under 18",cap:2000,desc:"Per child",perUnit:true,unitName:"children"},
      {id:"G16c",name:"Disabled child",cap:10000,desc:"Increased",perUnit:true,unitName:"children"}
    ]},
    {id:"housing",name:"Housing",items:[
      {id:"G22",name:"Housing loan interest",cap:7000,desc:"First-time buyer"}
    ]},
    {id:"rental",name:"Rental Income & Expenses",items:[
      {id:"R1",name:"Rental expenses — repairs & maintenance",cap:999999,desc:"Deductible: cost of repairs and maintenance of rental property"},
      {id:"R2",name:"Rental expenses — quit rent & assessment",cap:999999,desc:"Deductible: quit rent, assessment tax paid to local authority"},
      {id:"R3",name:"Rental expenses — insurance premium",cap:999999,desc:"Deductible: fire/building insurance on rental property"},
      {id:"R4",name:"Rental expenses — management & agent fees",cap:999999,desc:"Deductible: property management fees, agent commission"},
      {id:"R5",name:"Rental expenses — loan interest",cap:999999,desc:"Deductible: interest on loan taken to purchase/improve rental property"},
    ]}
  ],
  "2027":[
    {id:"personal",name:"Individual",items:[
      {id:"G1",name:"Individual relief",cap:9000,auto:true,desc:"Automatic"},
      {id:"G14",name:"Spouse / Alimony",cap:4000,desc:"Spouse with no income"}
    ]},
    {id:"lifestyle",name:"Lifestyle",items:[
      {id:"G9",name:"Books, gadgets, internet",cap:2500,desc:"Gadgets, internet"},
      {id:"G10",name:"Sports & fitness",cap:1000,desc:"Sports equipment (golf clubs, balls, bags, rackets, etc), gym membership, sports facility rental (golf green fees, golf simulator, badminton/squash court, swimming pool), sports training/lesson fees, competition entry fees. EXCLUDES: golf club joining/membership fees, sports clothing/shoes/apparel, buggy rental, insurance fees."}
    ]},
    {id:"insurance",name:"Insurance",items:[
      {id:"G17",name:"Life insurance + EPF",cap:7000,desc:"Combined"},
      {id:"G20",name:"SOCSO / EIS",cap:350,desc:"Contributions"}
    ]},
    {id:"rental",name:"Rental Income & Expenses",items:[
      {id:"R1",name:"Rental expenses — repairs & maintenance",cap:999999,desc:"Deductible: cost of repairs and maintenance of rental property"},
      {id:"R2",name:"Rental expenses — quit rent & assessment",cap:999999,desc:"Deductible: quit rent, assessment tax paid to local authority"},
      {id:"R3",name:"Rental expenses — insurance premium",cap:999999,desc:"Deductible: fire/building insurance on rental property"},
      {id:"R4",name:"Rental expenses — management & agent fees",cap:999999,desc:"Deductible: property management fees, agent commission"},
      {id:"R5",name:"Rental expenses — loan interest",cap:999999,desc:"Deductible: interest on loan taken to purchase/improve rental property"},
    ]}
  ]
};

const BK = [{max:5000,r:0,c:0},{max:20000,r:1,c:0},{max:35000,r:3,c:150},{max:50000,r:6,c:600},{max:70000,r:11,c:1500},{max:100000,r:19,c:3700},{max:400000,r:25,c:9400},{max:600000,r:26,c:84400},{max:2000000,r:28,c:136400},{max:Infinity,r:30,c:528400}];
const calcTax = (ci) => { if (ci <= 0) return 0; let p = 0; for (const b of BK) { if (ci <= b.max) return b.c + (ci - p) * b.r / 100; p = b.max; } return 0; };

const SK = "ringgit-v3";
const ld = () => { try { return JSON.parse(localStorage.getItem(SK)) || {}; } catch { return {}; } };
const sv = (d) => { try { localStorage.setItem(SK, JSON.stringify(d)); } catch {} };

const migrateOld = () => {
  try {
    const old = JSON.parse(localStorage.getItem("ringgit-v2") || "{}");
    if (!old || Object.keys(old).length === 0) return;
    const out = { user: old.user };
    for (const y of YEARS) {
      const yd = old[y];
      if (!yd) continue;
      const entries = [];
      Object.entries(yd.claims || {}).forEach(([itemId, c]) => {
        if (c?.amount > 0) {
          entries.push({
            id: `mig-${itemId}-${Date.now()}`, itemId, amount: c.amount,
            desc: "Migrated from previous version",
            date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
            hasReceipt: false, units: c.units || 1,
          });
        }
      });
      out[y] = { entries, receipts: yd.receipts || [], incomes: yd.incomes || [] };
    }
    localStorage.setItem(SK, JSON.stringify(out));
    localStorage.removeItem("ringgit-v2");
  } catch {}
};

// ─────────────────────────────────────────────────────────────
// MonthPicker
// ─────────────────────────────────────────────────────────────
const MonthPicker = ({ label, value, onChange, t }) => {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const parsed = value ? value.split("-") : null;
  const [selY, setSelY] = useState(parsed ? parseInt(parsed[0]) : now.getFullYear());
  const [selM, setSelM] = useState(parsed ? parseInt(parsed[1]) - 1 : now.getMonth());
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i);
  const display = value ? MONTHS[parseInt(value.split("-")[1]) - 1] + " " + value.split("-")[0] : "Tap to select";

  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <button type="button" onClick={() => setOpen(true)}
        style={{ width: "100%", padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.bg, color: value ? t.ink : t.inkMute, fontSize: 13, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box" }}>
        <span>{display}</span>
        <Icon name="chevD" size={12} color={t.inkMute} />
      </button>
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setOpen(false)}>
          <div style={{ background: t.bg, borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, padding: "18px 20px 28px", fontFamily: FONT, animation: "slideup 0.25s ease-out" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
              <div style={{ width: 40, height: 4, background: t.hairStrong, borderRadius: 2 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>{label}</span>
              <button style={{ padding: "8px 18px", border: "none", borderRadius: 10, background: t.red, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
                onClick={() => { onChange(selY + "-" + String(selM + 1).padStart(2, "0") + "-01"); setOpen(false); }}>Done</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>YEAR</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {years.map(y => (
                  <button key={y} type="button" style={{ padding: "9px 16px", border: "none", borderRadius: 10, background: selY === y ? t.ink : t.surface, color: selY === y ? t.bg : t.ink, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer", flexShrink: 0 }} onClick={() => setSelY(y)}>{y}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>MONTH</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {MONTHS.map((m, i) => (
                  <button key={m} type="button" style={{ padding: "11px 0", border: "none", borderRadius: 10, background: selM === i ? t.ink : t.surface, color: selM === i ? t.bg : t.ink, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }} onClick={() => setSelM(i)}>{m}</button>
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
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function Ringgit() {
  const [themeName, setThemeNameRaw] = useState(() => {
    try { return localStorage.getItem("ringgit-theme") || "light"; } catch { return "light"; }
  });
  const setThemeName = (n) => { setThemeNameRaw(n); try { localStorage.setItem("ringgit-theme", n); } catch {} };
  const t = THEMES[themeName];

  // FIX 2: Sync body background to current theme so dark mode Welcome screen works
  useEffect(() => {
    document.body.style.background = t.bg;
    document.body.style.color = t.ink;
  }, [t.bg, t.ink]);

  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("welcome");
  const [nameIn, setNameIn] = useState("");
  const [yobIn, setYobIn] = useState("");
  const [ya, setYa] = useState("2025");
  const [yaOpen, setYaOpen] = useState(false);
  const [tab, setTab] = useState("relief");
  const [entries, setEntries] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [rentalIncomes, setRentalIncomes] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerSeed, setScannerSeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewImg, setViewImg] = useState(null);

  useEffect(() => { migrateOld(); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        setUser({ id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "User", email: u.email, provider: "google" });
        setScreen("app");
      } else {
        const d = ld();
        if (d.user) { setUser(d.user); setScreen("app"); }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const u = session.user;
        setUser({ id: u.id, name: u.user_metadata?.full_name || u.email?.split("@")[0] || "User", email: u.email, provider: "google" });
        setScreen("app");
      } else if (event === "SIGNED_OUT") {
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
      const d = ld();
      const yd = d[ya] || {};
      setEntries(yd.entries || []);
      setReceipts(yd.receipts || []);
      setIncomes(yd.incomes || []);
      setRentalIncomes(yd.rentalIncomes || []);
    }
  }, [ya, screen, user?.id]);

  useEffect(() => {
    if (screen === "app" && user?.provider !== "google") {
      const d = ld();
      d[ya] = { entries, receipts, incomes, rentalIncomes };
      d.user = user;
      sv(d);
    }
  }, [entries, receipts, incomes, rentalIncomes, user, ya, screen]);

  const loadFromSupabase = async () => {
    if (!user?.id) return;
    try {
      const [{ data: cl }, { data: inc }, { data: rec }] = await Promise.all([
        supabase.from("claims").select("*").eq("user_id", user.id).eq("ya", ya),
        supabase.from("incomes").select("*").eq("user_id", user.id).eq("ya", ya),
        supabase.from("receipts").select("*").eq("user_id", user.id).eq("ya", ya),
      ]);
      const e = (cl || []).map(c => ({
        id: c.id || `c-${c.item_id}-${Date.now()}`,
        itemId: c.item_id, amount: c.amount, units: c.units || 1,
        desc: c.desc || "Entry",
        date: c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "",
        hasReceipt: !!c.has_receipt,
      }));
      setEntries(e);
      setIncomes((inc || []).filter(i => i.type !== "rental"));
      setRentalIncomes((inc || []).filter(i => i.type === "rental"));
      setReceipts(rec || []);
    } catch (e) { console.error("Load error", e); }
  };

  // ─────────────────────────────────────────────────────────────
  // Derived data
  // ─────────────────────────────────────────────────────────────
  const cats = useMemo(() => (REL[ya] || REL["2025"]).map(c => ({ ...c, icon: CAT_ICON[c.id] || "sparkle" })), [ya]);
  const allItems = useMemo(() => cats.flatMap(c => c.items), [cats]);

  const itemEntries = (id) => entries.filter(e => e.itemId === id);
  const itemTotalRaw = (id) => itemEntries(id).reduce((s, e) => s + (e.amount || 0), 0);
  const itemTotalCapped = (id) => {
    const it = allItems.find(i => i.id === id); if (!it) return 0;
    // Rental expense items are uncapped (deductible from rental income, not from tax relief cap)
    if (it.cap >= 999999) return itemTotalRaw(id);
    const cap = it.perUnit ? it.cap * ((itemEntries(id)[0]?.units) || 1) : it.cap;
    return Math.min(itemTotalRaw(id), cap);
  };

  const totalRelief = allItems.reduce((s, i) => {
    // Skip rental items from standard relief total — they reduce rental income instead
    if (i.id.startsWith("R")) return s;
    return s + (i.auto ? i.cap : itemTotalCapped(i.id));
  }, 0);

  const totalRentalIncome = rentalIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalRentalExpenses = ["R1","R2","R3","R4","R5"].reduce((s, id) => s + itemTotalRaw(id), 0);
  const netRentalIncome = Math.max(0, totalRentalIncome - totalRentalExpenses);

  const totalEmploymentIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalIncome = totalEmploymentIncome + netRentalIncome;
  const chargeable = Math.max(0, totalIncome - totalRelief);
  const estTax = calcTax(chargeable);

  // ─────────────────────────────────────────────────────────────
  // Entry mutations
  // ─────────────────────────────────────────────────────────────
  const addEntry = async (itemId, amount, desc, units = 1, hasReceipt = false, receiptImg = null) => {
    if (!amount || amount <= 0) return;
    const newEntry = {
      id: Date.now() + "",
      itemId, amount: parseFloat(amount), desc: desc || "Entry",
      units,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      hasReceipt: !!hasReceipt,
    };
    setEntries(p => [newEntry, ...p]);
    if (user?.provider === "google" && user?.id) {
      await supabase.from("claims").insert({ user_id: user.id, ya, item_id: itemId, amount: newEntry.amount, units, desc: newEntry.desc, has_receipt: !!hasReceipt });
    }
    if (hasReceipt && receiptImg) {
      const item = allItems.find(i => i.id === itemId);
      await addReceiptObj({
        id: Date.now() + "r", name: item?.name || itemId, itemId,
        item_id: itemId,
        data: receiptImg,
        amount: newEntry.amount,
        merchant: "Scanned via AI",
        date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      });
    }
  };

  const removeEntry = async (eid) => {
    setEntries(p => p.filter(e => e.id !== eid));
    if (user?.provider === "google" && user?.id) {
      await supabase.from("claims").delete().eq("id", eid).eq("user_id", user.id);
    }
  };

  const addIncome = async (inc) => {
    setIncomes(p => [...p, inc]);
    if (user?.provider === "google" && user?.id) {
      await supabase.from("incomes").insert({ ...inc, user_id: user.id, ya, type: "employment" });
    }
  };
  const removeIncome = async (id) => {
    setIncomes(p => p.filter(i => i.id !== id));
    if (user?.provider === "google" && user?.id) {
      await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
    }
  };

  // FIX 1: Rental income mutations
  const addRentalIncome = async (inc) => {
    setRentalIncomes(p => [...p, inc]);
    if (user?.provider === "google" && user?.id) {
      await supabase.from("incomes").insert({ ...inc, user_id: user.id, ya, type: "rental" });
    }
  };
  const removeRentalIncome = async (id) => {
    setRentalIncomes(p => p.filter(i => i.id !== id));
    if (user?.provider === "google" && user?.id) {
      await supabase.from("incomes").delete().eq("id", id).eq("user_id", user.id);
    }
  };

  const addReceiptObj = async (rec) => {
    setReceipts(p => [rec, ...p]);
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

  const addFromScan = async (scanResult, useTotal, img) => {
    if (!scanResult?.claimable || !scanResult.category_id) return;
    const amt = useTotal ? scanResult.total_amount : scanResult.suggested_amount;
    await addEntry(scanResult.category_id, amt, scanResult.category_name + " (AI scanned)", 1, true, img);
  };

  // ─────────────────────────────────────────────────────────────
  // Backup / restore
  // ─────────────────────────────────────────────────────────────
  const exportD = () => {
    const b = new Blob([JSON.stringify(ld(), null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a"); a.href = u; a.download = "ringgit-backup.json"; a.click();
  };
  const importD = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const d = JSON.parse(ev.target.result); sv(d);
        const y = d[ya] || {};
        setEntries(y.entries || []); setReceipts(y.receipts || []); setIncomes(y.incomes || []); setRentalIncomes(y.rentalIncomes || []);
        alert("Restored!");
      } catch { alert("Invalid file"); }
    };
    r.readAsText(f);
  };

  const handleSignOut = async () => {
    if (user?.provider === "google") { await supabase.auth.signOut(); }
    else { const d = ld(); delete d.user; sv(d); setUser(null); setScreen("welcome"); }
  };

  const resetYAData = () => {
    if (!confirm(`Reset YA${ya} data?`)) return;
    setEntries([]); setReceipts([]); setIncomes([]); setRentalIncomes([]);
    if (user?.provider === "google" && user?.id) {
      supabase.from("claims").delete().eq("user_id", user.id).eq("ya", ya);
      supabase.from("incomes").delete().eq("user_id", user.id).eq("ya", ya);
      supabase.from("receipts").delete().eq("user_id", user.id).eq("ya", ya);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...baseStyle(t), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{globalCSS}</style>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: t.red, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 28, color: t.bg, fontFamily: FONT }}>RM</div>
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <div style={baseStyle(t)}>
        <style>{globalCSS}</style>
        <Welcome t={t} onGoogle={async () => {
          await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
        }} onGuest={() => setScreen("signup")} />
      </div>
    );
  }

  if (screen === "signup") {
    return (
      <div style={baseStyle(t)}>
        <style>{globalCSS}</style>
        <Signup t={t} name={nameIn} setName={setNameIn} yob={yobIn} setYob={setYobIn}
          onDone={() => {
            const u = { name: nameIn || "Guest", yob: yobIn, provider: "guest" };
            setUser(u); setScreen("app");
            const d = ld(); d.user = u; sv(d);
          }}
          onSkip={() => {
            const u = { name: "Guest", provider: "guest" };
            setUser(u); setScreen("app");
            const d = ld(); d.user = u; sv(d);
          }} />
      </div>
    );
  }

  return (
    <div style={baseStyle(t)}>
      <style>{globalCSS}</style>

      {viewImg && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setViewImg(null)}>
          <img src={viewImg} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 16, objectFit: "contain" }} />
        </div>
      )}

      {tab === "relief" ? (
        <Header t={t} user={user} ya={ya} setYa={setYa} yaOpen={yaOpen} setYaOpen={setYaOpen}
          totalIncome={totalIncome} totalRelief={totalRelief} chargeable={chargeable} estTax={estTax} />
      ) : (
        <div style={{ padding: "26px 20px 16px", fontFamily: FONT }}>
          <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2 }}>
            YA{ya} · {user?.name}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: t.ink, letterSpacing: -0.8, marginTop: 2 }}>
            {tab === "income" ? "Income" : tab === "receipts" ? "Receipts" : "Settings"}
          </div>
        </div>
      )}

      <div style={{ paddingBottom: 140 }}>
        {tab === "relief" && (
          <ReliefTab t={t} cats={cats} entries={entries}
            itemEntries={itemEntries} itemTotalRaw={itemTotalRaw}
            onAddEntry={addEntry} onRemoveEntry={removeEntry}
            onOpenScanner={(item) => { setScannerSeed(item); setScannerOpen(true); }} />
        )}
        {tab === "income" && (
          <IncomeTab t={t} incomes={incomes} rentalIncomes={rentalIncomes}
            onAdd={addIncome} onRemove={removeIncome}
            onAddRental={addRentalIncome} onRemoveRental={removeRentalIncome}
            totalEmploymentIncome={totalEmploymentIncome}
            totalRentalIncome={totalRentalIncome} totalRentalExpenses={totalRentalExpenses}
            netRentalIncome={netRentalIncome}
            totalIncome={totalIncome} totalRelief={totalRelief} chargeable={chargeable} estTax={estTax} />
        )}
        {tab === "receipts" && (
          <ReceiptsTab t={t} receipts={receipts} onRemove={removeReceipt} onView={setViewImg} />
        )}
        {tab === "more" && (
          <MoreTab t={t} user={user} ya={ya} themeName={themeName} setTheme={setThemeName}
            onSignOut={handleSignOut} onReset={resetYAData}
            onExport={exportD} onImport={importD}
            onSignInGoogle={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })} />
        )}
      </div>

      {/* FIX 4: Scan FAB — raised bottom so it clears the tab bar */}
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
          Scan
        </button>
      )}

      <TabBar t={t} tab={tab} setTab={setTab} />

      <ScannerSheet open={scannerOpen} seededItem={scannerSeed} t={t} ya={ya} allItems={allItems}
        onClose={() => { setScannerOpen(false); setScannerSeed(null); }}
        onAdd={addFromScan} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function Welcome({ t, onGoogle, onGuest }) {
  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: "80px 28px 40px", display: "flex", flexDirection: "column", fontFamily: FONT, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: t.red, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 28, color: "#fff", boxShadow: "0 12px 32px rgba(200,68,43,0.3)", marginBottom: 32 }}>RM</div>
        {/* FIX 2: use t.ink for all text so dark mode renders correctly */}
        <div style={{ fontSize: 44, fontWeight: 700, color: t.ink, letterSpacing: -1.5, lineHeight: 1 }}>Ringgit.</div>
        <div style={{ fontSize: 16, color: t.inkMute, marginTop: 12, lineHeight: 1.5, maxWidth: 300 }}>
          Tax relief tracker for Malaysian taxpayers. Filing season, simplified.
        </div>
      </div>

      <button onClick={onGoogle} style={{ width: "100%", padding: "16px 20px", border: "none", borderRadius: 14, background: t.ink, color: t.bg, fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
        <Icon name="google" size={18} color={t.bg} />
        Continue with Google
      </button>

      <button onClick={onGuest} style={{ width: "100%", padding: "16px 20px", border: `1px solid ${t.hairStrong}`, borderRadius: 14, background: "transparent", color: t.ink, fontSize: 15, fontWeight: 500, fontFamily: FONT, cursor: "pointer" }}>
        Continue as Guest
      </button>

      <div style={{ textAlign: "center", fontSize: 11, color: t.inkMute, marginTop: 20 }}>
        Free · Google users get cloud sync · Not financial advice
      </div>
    </div>
  );
}

function Signup({ t, name, setName, yob, setYob, onDone, onSkip }) {
  return (
    <div style={{ minHeight: "100vh", background: t.bg, padding: "72px 24px 40px", display: "flex", flexDirection: "column", fontFamily: FONT, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: t.red, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22, color: "#fff", marginBottom: 24 }}>RM</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: t.ink, letterSpacing: -0.8 }}>Set up your profile</div>
      <div style={{ fontSize: 14, color: t.inkMute, marginTop: 6, marginBottom: 32 }}>Helps personalise your calculations.</div>

      {[
        { label: "Your name", value: name, set: setName, ph: "e.g. Vick", type: "text" },
        { label: "Year of birth", value: yob, set: setYob, ph: "e.g. 1990", type: "number" },
      ].map(f => (
        <div key={f.label} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{f.label}</div>
          <input value={f.value} onChange={e => f.set(e.target.value)} type={f.type} placeholder={f.ph}
            style={{ width: "100%", padding: "14px 16px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 15, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
      ))}

      <div style={{ flex: 1, minHeight: 20 }} />

      <button onClick={onDone} style={{ width: "100%", padding: "16px 20px", border: "none", borderRadius: 14, background: t.red, color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer", marginBottom: 8 }}>
        Get Started
      </button>
      <button onClick={onSkip} style={{ width: "100%", padding: 14, border: "none", background: "transparent", color: t.inkMute, fontSize: 14, fontFamily: FONT, cursor: "pointer" }}>
        Skip for now
      </button>
    </div>
  );
}

function Header({ t, user, ya, setYa, yaOpen, setYaOpen, totalIncome, totalRelief, chargeable, estTax }) {
  return (
    <div style={{ background: t.bg, padding: "18px 20px 22px", fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: t.red, color: "#fff", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>RM</div>
          <div>
            <div style={{ fontSize: 11, color: t.inkMute, fontWeight: 500 }}>Welcome back,</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.ink, letterSpacing: -0.3 }}>
              {user?.name}
              {user?.provider === "google" && (
                <span style={{ fontSize: 9, background: t.greenSoft, color: t.green, padding: "2px 7px", borderRadius: 6, marginLeft: 6, fontWeight: 700, letterSpacing: 0.4, verticalAlign: "middle" }}>SYNCED</span>
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
                <button key={y} onClick={() => { setYa(y); setYaOpen(false); }} style={{ display: "block", width: "100%", padding: "11px 16px", border: "none", background: y === ya ? t.redSoft : "transparent", color: y === ya ? t.red : t.ink, fontSize: 13, fontWeight: y === ya ? 600 : 500, fontFamily: FONT, cursor: "pointer", textAlign: "left" }}>
                  YA{y}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 20, background: t.ink, color: t.bg, borderRadius: 20, padding: 22, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: t.red, opacity: 0.9 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, color: "rgba(245,239,227,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2 }}>Estimated tax · YA{ya}</div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1.2, marginTop: 4, color: t.bg, fontVariantNumeric: "tabular-nums" }}>
            RM {estTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(245,239,227,0.15)" }}>
            {[["Income", totalIncome], ["Relief", totalRelief], ["Chargeable", chargeable]].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 9.5, color: "rgba(245,239,227,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 3, color: t.bg, fontVariantNumeric: "tabular-nums" }}>
                  RM {v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBar({ t, tab, setTab }) {
  const tabs = [
    ["relief", "Relief", "receipt"],
    ["income", "Income", "briefcase"],
    ["receipts", "Receipts", "camera"],
    ["more", "More", "settings"],
  ];
  return (
    <div style={{ position: "fixed", left: "max(12px, calc(50vw - 228px))", right: "max(12px, calc(50vw - 228px))", bottom: 20, zIndex: 40, background: t.surface, borderRadius: 22, padding: 6, display: "flex", border: `1px solid ${t.hair}`, boxShadow: t.shadowHi, fontFamily: FONT }}>
      {tabs.map(([k, l, ic]) => {
        const active = tab === k;
        return (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "10px 4px", border: "none", borderRadius: 16, background: active ? t.ink : "transparent", color: active ? t.bg : t.inkMute, fontSize: 11, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <Icon name={ic} size={18} color={active ? t.bg : t.inkMute} />
            {l}
          </button>
        );
      })}
    </div>
  );
}

function ReliefTab({ t, cats, entries, itemEntries, itemTotalRaw, onAddEntry, onRemoveEntry, onOpenScanner }) {
  const [expCat, setExpCat] = useState("lifestyle");
  const [expItem, setExpItem] = useState(null);
  const [addingFor, setAddingFor] = useState(null);
  const [amtIn, setAmtIn] = useState("");
  const [descIn, setDescIn] = useState("");
  const [unitsIn, setUnitsIn] = useState(1);
  const [search, setSearch] = useState("");

  const filtCats = search
    ? cats.map(c => ({ ...c, items: c.items.filter(i => (i.name + i.desc + i.id).toLowerCase().includes(search.toLowerCase())) })).filter(c => c.items.length)
    : cats;

  const handleAdd = async (item) => {
    const amt = parseFloat(amtIn) || 0;
    if (amt <= 0) return;
    await onAddEntry(item.id, amt, descIn || item.name, unitsIn || 1, false, null);
    setAmtIn(""); setDescIn(""); setUnitsIn(1); setAddingFor(null);
    setExpItem(item.id);
  };

  return (
    <div style={{ padding: "0 16px 40px", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: "12px 16px", marginBottom: 14 }}>
        <Icon name="search" size={16} color={t.inkMute} />
        <input placeholder="Search reliefs..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 14, color: t.ink, fontFamily: FONT }} />
      </div>

      {filtCats.map(cat => {
        const doneCount = cat.items.filter(i => itemTotalRaw(i.id) > 0 || i.auto).length;
        const expanded = expCat === cat.id || !!search;
        // Special label for rental category
        const isRental = cat.id === "rental";
        return (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <button onClick={() => setExpCat(expanded && !search ? null : cat.id)} style={{ width: "100%", background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 16, padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isRental ? t.goldSoft : t.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={cat.icon} size={18} color={isRental ? t.gold : t.red} />
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: -0.2 }}>{cat.name}</div>
                <div style={{ fontSize: 11, color: t.inkMute, marginTop: 2, fontWeight: 500 }}>
                  {isRental ? "Track deductible rental expenses" : `${doneCount} of ${cat.items.length} claimed`}
                </div>
              </div>
              {!isRental && (
                <div style={{ padding: "4px 10px", borderRadius: 8, background: doneCount === cat.items.length ? t.greenSoft : t.bgAlt, color: doneCount === cat.items.length ? t.green : t.inkSoft, fontSize: 11, fontWeight: 700 }}>
                  {doneCount}/{cat.items.length}
                </div>
              )}
              <div style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>
                <Icon name="chevR" size={14} color={t.inkMute} />
              </div>
            </button>

            {expanded && (
              <div style={{ marginTop: 8 }}>
                {isRental && (
                  <div style={{ padding: "10px 14px", background: t.goldSoft, borderRadius: 12, borderLeft: `3px solid ${t.gold}`, fontSize: 12, color: t.inkSoft, marginBottom: 8, lineHeight: 1.5 }}>
                    Add rental expenses below. These are deducted from your gross rental income (entered in the <b>Income</b> tab) to arrive at net rental income.
                  </div>
                )}
                {cat.items.map(item => {
                  const eItems = itemEntries(item.id);
                  const rawTotal = itemTotalRaw(item.id);
                  const units = eItems[0]?.units || 1;
                  const isUncapped = item.cap >= 999999;
                  const capEffective = isUncapped ? rawTotal || 1 : (item.perUnit ? item.cap * units : item.cap);
                  const claimed = item.auto ? item.cap : (isUncapped ? rawTotal : Math.min(rawTotal, capEffective));
                  const pct = isUncapped ? 100 : Math.round((claimed / capEffective) * 100);
                  const done = claimed > 0;
                  const isExp = expItem === item.id;
                  const isAdding = addingFor === item.id;
                  const overCap = !isUncapped && rawTotal > capEffective;

                  return (
                    <div key={item.id} style={{ background: t.surface, border: `1px solid ${done ? (isRental ? t.goldSoft : t.redSoft) : t.hair}`, borderRadius: 14, padding: 14, marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: isRental ? t.gold : t.red, background: isRental ? t.goldSoft : t.redSoft, padding: "2px 7px", borderRadius: 5, letterSpacing: 0.3 }}>{item.id}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: -0.2 }}>{item.name}</span>
                          </div>
                          <div style={{ fontSize: 12, color: t.inkMute, lineHeight: 1.5, marginBottom: 12 }}>{item.desc}</div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                            <div style={{ flex: 1, height: 6, background: t.bgAlt, borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: item.auto ? t.green : (done ? (isRental ? t.gold : t.red) : t.inkMute), borderRadius: 4, transition: "width .3s" }} />
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: t.inkSoft, fontVariantNumeric: "tabular-nums", minWidth: 34, textAlign: "right" }}>
                              {isUncapped ? "" : `${pct}%`}
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: t.inkMute, fontWeight: 500 }}>
                            <span style={{ color: done ? t.ink : t.inkMute, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                              RM {claimed.toLocaleString()}
                            </span>
                            {!isUncapped && (
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                                / RM {capEffective.toLocaleString()} cap{item.perUnit ? ` (${units} ${item.unitName})` : ""}
                              </span>
                            )}
                            {isUncapped && <span style={{ color: t.inkMute }}>No cap — full deduction</span>}
                          </div>
                          {overCap && (
                            <div style={{ fontSize: 10, color: t.gold, fontWeight: 600, marginTop: 6 }}>
                              Capped — claimed RM{rawTotal.toLocaleString()} but cap is RM{capEffective.toLocaleString()}
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                          {item.auto ? (
                            <div style={{ padding: "6px 10px", borderRadius: 8, background: t.greenSoft, color: t.green, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>AUTO</div>
                          ) : (
                            <button onClick={() => {
                              if (eItems.length === 0) { setAddingFor(isAdding ? null : item.id); setAmtIn(""); setDescIn(""); setUnitsIn(1); }
                              else { setExpItem(isExp ? null : item.id); }
                            }} style={{ padding: "8px 14px", border: "none", borderRadius: 10, background: done ? t.ink : (isRental ? t.gold : t.red), color: done ? t.bg : "#fff", fontSize: 11, fontWeight: 700, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                              {done ? (<>View <Icon name={isExp ? "chevD" : "chevR"} size={10} color={t.bg} /></>) : "Add"}
                            </button>
                          )}
                        </div>
                      </div>

                      {isExp && eItems.length > 0 && !item.auto && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.hair}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                            Entries · {eItems.length}
                          </div>
                          {eItems.map(e => (
                            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.hair}` }}>
                              <div style={{ width: 30, height: 30, borderRadius: 8, background: e.hasReceipt ? t.greenSoft : t.bgAlt, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Icon name={e.hasReceipt ? "receipt" : "plus"} size={14} color={e.hasReceipt ? t.green : t.inkMute} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.desc}</div>
                                <div style={{ fontSize: 10, color: t.inkMute, marginTop: 1 }}>
                                  {e.date}{e.hasReceipt ? " · Receipt attached" : ""}
                                </div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>
                                RM {e.amount.toLocaleString()}
                              </div>
                              <button onClick={() => onRemoveEntry(e.id)} style={{ width: 22, height: 22, border: "none", borderRadius: 6, background: "transparent", color: t.inkMute, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Icon name="close" size={12} color={t.inkMute} />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => { setAddingFor(item.id); setAmtIn(""); setDescIn(""); setUnitsIn(units); }}
                            style={{ width: "100%", marginTop: 10, padding: "10px 12px", border: `1.5px dashed ${t.hairStrong}`, borderRadius: 10, background: "transparent", color: t.red, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            <Icon name="plus" size={14} color={t.red} />
                            Add another entry
                          </button>
                        </div>
                      )}

                      {isAdding && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.hair}` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                            New entry for {item.id}
                          </div>
                          <input autoFocus value={descIn} onChange={e => setDescIn(e.target.value)}
                            placeholder="Description (e.g. Plumbing repair)"
                            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.bg, color: t.ink, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                          {item.perUnit && (
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: t.inkMute }}>Number of {item.unitName}:</span>
                              <input type="number" min="1" value={unitsIn} onChange={e => setUnitsIn(parseInt(e.target.value) || 1)}
                                style={{ width: 60, padding: "8px 10px", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.bg, color: t.ink, fontSize: 13, fontFamily: FONT, outline: "none", textAlign: "center" }} />
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: t.inkMute }}>RM</span>
                            <input type="number" value={amtIn} onChange={e => setAmtIn(e.target.value)} placeholder="0.00"
                              style={{ flex: 1, padding: "10px 12px", border: `1px solid ${t.hair}`, borderRadius: 10, background: t.bg, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
                            {!isRental && (
                              <button onClick={() => { onOpenScanner(item); setAddingFor(null); }}
                                style={{ padding: "10px 12px", border: `1px solid ${t.hairStrong}`, borderRadius: 10, background: "transparent", color: t.ink, fontSize: 11, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                                <Icon name="camera" size={13} color={t.ink} />
                                Scan
                              </button>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button onClick={() => handleAdd(item)}
                              style={{ flex: 1, padding: "10px 14px", border: "none", borderRadius: 10, background: isRental ? t.gold : t.red, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                              Save entry
                            </button>
                            <button onClick={() => { setAddingFor(null); setAmtIn(""); setDescIn(""); }}
                              style={{ padding: "10px 14px", border: `1px solid ${t.hair}`, borderRadius: 10, background: "transparent", color: t.inkSoft, fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// FIX 1: IncomeTab now handles both employment + rental income
function IncomeTab({ t, incomes, rentalIncomes, onAdd, onRemove, onAddRental, onRemoveRental,
  totalEmploymentIncome, totalRentalIncome, totalRentalExpenses, netRentalIncome,
  totalIncome, totalRelief, chargeable, estTax }) {
  const [emp, setEmp] = useState("");
  const [amt, setAmt] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Rental income form
  const [rentalAddr, setRentalAddr] = useState("");
  const [rentalAmt, setRentalAmt] = useState("");

  const fmtPeriod = (s, e) => {
    const fmt = (d) => { if (!d) return ""; const [y, m] = d.split("-"); return MONTHS[parseInt(m) - 1] + " " + y; };
    return (s && e) ? fmt(s) + " – " + fmt(e) : "Full year";
  };

  return (
    <div style={{ padding: "0 16px 40px", fontFamily: FONT }}>
      {/* Employment Income */}
      <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 18, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginBottom: 12 }}>Add Employment Income</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Employer</div>
          <input value={emp} onChange={e => setEmp(e.target.value)} placeholder="e.g. Grab Malaysia"
            style={{ width: "100%", padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.bg, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Annual gross income (RM)</div>
          <input value={amt} onChange={e => setAmt(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.bg, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <MonthPicker label="Start" value={start} onChange={setStart} t={t} />
          <MonthPicker label="End" value={end} onChange={setEnd} t={t} />
        </div>
        <button onClick={async () => {
          if (!emp || !amt) return;
          await onAdd({ id: Date.now() + "", employer: emp, amount: parseFloat(amt) || 0, period: fmtPeriod(start, end) });
          setEmp(""); setAmt(""); setStart(""); setEnd("");
        }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 12, background: t.red, color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="plus" size={16} color="#fff" /> Add Income Source
        </button>
      </div>

      {incomes.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>
            Employment Sources · {incomes.length}
          </div>
          {incomes.map(inc => (
            <div key={inc.id} style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: t.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="briefcase" size={18} color={t.red} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>{inc.employer}</div>
                <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>{inc.period}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>
                RM {inc.amount.toLocaleString()}
              </div>
              <button onClick={() => onRemove(inc.id)} style={{ width: 28, height: 28, border: "none", borderRadius: 8, background: t.redSoft, color: t.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={14} color={t.red} />
              </button>
            </div>
          ))}
        </>
      )}

      {/* FIX 1: Rental Income Section */}
      <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 18, padding: 18, marginTop: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Icon name="key" size={16} color={t.gold} />
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>Add Rental Income</div>
        </div>
        <div style={{ fontSize: 12, color: t.inkMute, marginBottom: 14, lineHeight: 1.5 }}>
          Gross rent received. Add deductible expenses under <b style={{ color: t.ink }}>Relief → Rental</b> to reduce your net rental income.
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Property address / description</div>
          <input value={rentalAddr} onChange={e => setRentalAddr(e.target.value)} placeholder="e.g. Condo Unit A-12-3, PJ"
            style={{ width: "100%", padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.bg, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Annual gross rental income (RM)</div>
          <input value={rentalAmt} onChange={e => setRentalAmt(e.target.value)} type="number" placeholder="0"
            style={{ width: "100%", padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.bg, color: t.ink, fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }} />
        </div>
        <button onClick={async () => {
          if (!rentalAddr || !rentalAmt) return;
          await onAddRental({ id: Date.now() + "", employer: rentalAddr, amount: parseFloat(rentalAmt) || 0, period: "Rental income" });
          setRentalAddr(""); setRentalAmt("");
        }} style={{ width: "100%", padding: 14, border: "none", borderRadius: 12, background: t.gold, color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="plus" size={16} color="#fff" /> Add Rental Income
        </button>
      </div>

      {rentalIncomes.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>
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
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>
                RM {inc.amount.toLocaleString()}
              </div>
              <button onClick={() => onRemoveRental(inc.id)} style={{ width: 28, height: 28, border: "none", borderRadius: 8, background: t.goldSoft, color: t.gold, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" size={14} color={t.gold} />
              </button>
            </div>
          ))}

          {/* Rental net summary */}
          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.inkSoft, padding: "4px 0" }}>
              <span>Gross rental income</span>
              <span style={{ fontWeight: 600, color: t.ink, fontVariantNumeric: "tabular-nums" }}>RM {totalRentalIncome.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.inkSoft, padding: "4px 0" }}>
              <span>Deductible expenses</span>
              <span style={{ fontWeight: 600, color: t.green, fontVariantNumeric: "tabular-nums" }}>– RM {totalRentalExpenses.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: t.ink, borderTop: `1px solid ${t.hair}`, marginTop: 6, paddingTop: 8 }}>
              <span>Net rental income</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>RM {netRentalIncome.toLocaleString()}</span>
            </div>
          </div>
        </>
      )}

      {/* Overall tax estimate */}
      {(incomes.length > 0 || rentalIncomes.length > 0) && (
        <>
          <div style={{ background: t.ink, color: t.bg, borderRadius: 18, padding: 18, marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,239,227,0.6)", textTransform: "uppercase", letterSpacing: 1.2 }}>Total Income</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, marginTop: 4, color: t.bg, fontVariantNumeric: "tabular-nums" }}>
              RM {totalIncome.toLocaleString()}
            </div>
            {rentalIncomes.length > 0 && (
              <div style={{ fontSize: 11, color: "rgba(245,239,227,0.5)", marginTop: 4 }}>
                Employment RM {totalEmploymentIncome.toLocaleString()} + Net rental RM {netRentalIncome.toLocaleString()}
              </div>
            )}
          </div>

          <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 18, padding: 18, marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>Tax Estimate</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: t.inkSoft, padding: "4px 0" }}>
              <span>Total Income</span>
              <span style={{ fontWeight: 600, color: t.ink, fontVariantNumeric: "tabular-nums" }}>RM {totalIncome.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: t.inkSoft, padding: "4px 0" }}>
              <span>Total Relief</span>
              <span style={{ fontWeight: 600, color: t.green, fontVariantNumeric: "tabular-nums" }}>– RM {totalRelief.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: t.ink, borderTop: `1px solid ${t.hair}`, marginTop: 8, paddingTop: 8 }}>
              <span>Chargeable</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>RM {chargeable.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, color: t.red, paddingTop: 4 }}>
              <span>Est. Tax</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>RM {estTax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
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
          <div style={{ fontSize: 12, color: t.inkMute, marginTop: 4 }}>
            Tap the Scan button on the Relief tab to add one
          </div>
        </div>
      ) : receipts.map(rx => {
        const itemId = rx.itemId || rx.item_id;
        return (
          <div key={rx.id} style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
            {rx.data ? (
              <img src={rx.data} onClick={() => onView(rx.data)} style={{ width: 52, height: 52, borderRadius: 12, objectFit: "cover", cursor: "pointer", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: 12, background: t.bgAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="receipt" size={22} color={t.inkSoft} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {rx.merchant || rx.name}
              </div>
              <div style={{ fontSize: 11, color: t.inkMute, marginTop: 2 }}>{rx.date}</div>
              {itemId && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: t.red, background: t.redSoft, padding: "2px 7px", borderRadius: 5 }}>
                    {itemId} · {rx.name}
                  </span>
                </div>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, fontVariantNumeric: "tabular-nums" }}>
              RM {(rx.amount || 0).toLocaleString()}
            </div>
            <button onClick={() => onRemove(rx.id)} style={{ width: 26, height: 26, border: "none", borderRadius: 8, background: t.redSoft, color: t.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="close" size={12} color={t.red} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MoreTab({ t, user, ya, themeName, setTheme, onSignOut, onReset, onExport, onImport, onSignInGoogle }) {
  const rowStyle = { display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: t.surface, borderRadius: 14, border: `1px solid ${t.hair}`, marginBottom: 8, cursor: "pointer" };
  return (
    <div style={{ padding: "0 20px 40px", fontFamily: FONT }}>
      <div style={{ background: t.surface, padding: 18, borderRadius: 18, border: `1px solid ${t.hair}`, marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: t.red, color: "#fff", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {(user?.name || "U")[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: t.ink }}>{user?.name}</div>
          <div style={{ fontSize: 12, color: t.inkMute, marginTop: 2 }}>
            {user?.provider === "google" ? "Google · Cloud synced" : "Guest · Local only"} · YA{ya}
          </div>
        </div>
        {user?.provider === "google" && (
          <div style={{ padding: "4px 10px", borderRadius: 8, background: t.greenSoft, color: t.green, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
            SYNCED
          </div>
        )}
      </div>

      {user?.provider !== "google" && (
        <button onClick={onSignInGoogle} style={{ width: "100%", padding: 14, border: "none", borderRadius: 14, background: t.red, color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Icon name="google" size={16} color="#fff" />
          Sign in with Google to cloud sync
        </button>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>Appearance</div>
      <div style={{ background: t.surface, borderRadius: 16, border: `1px solid ${t.hair}`, padding: 6, display: "flex", gap: 6, marginBottom: 20 }}>
        {[{ k: "light", label: "Light", icon: "sun" }, { k: "dark", label: "Dark", icon: "moon" }].map(opt => {
          const active = themeName === opt.k;
          return (
            <button key={opt.k} onClick={() => setTheme(opt.k)} style={{ flex: 1, padding: "12px 16px", border: "none", borderRadius: 12, background: active ? t.ink : "transparent", color: active ? t.bg : t.inkSoft, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name={opt.icon} size={16} color={active ? t.bg : t.inkSoft} />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "4px 4px 10px" }}>Data</div>
      <div onClick={onExport} style={rowStyle}>
        <Icon name="download" size={18} color={t.inkSoft} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.ink }}>Export backup</div>
          <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>Download JSON of your data</div>
        </div>
        <Icon name="chevR" size={14} color={t.inkMute} />
      </div>
      <label style={rowStyle}>
        <Icon name="upload" size={18} color={t.inkSoft} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: t.ink }}>Restore from file</div>
          <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1 }}>Import a previous backup</div>
        </div>
        <Icon name="chevR" size={14} color={t.inkMute} />
        <input type="file" accept=".json" onChange={onImport} style={{ display: "none" }} />
      </label>
      <div onClick={onReset} style={{ ...rowStyle, marginTop: 8 }}>
        <Icon name="trash" size={18} color={t.red} />
        <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.red }}>Reset YA{ya} data</div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.inkMute, textTransform: "uppercase", letterSpacing: 1.2, padding: "16px 4px 10px" }}>Coming soon</div>
      <div style={{ background: t.surface, padding: 16, borderRadius: 16, border: `1px solid ${t.hair}`, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {["Debt Tracker", "Savings Goals", "Budget Planner", "EPF Calc", "Zakat Calc"].map(f => (
          <span key={f} style={{ fontSize: 11, fontWeight: 500, color: t.inkSoft, background: t.bgAlt, padding: "7px 12px", borderRadius: 20 }}>
            {f}
          </span>
        ))}
      </div>

      <button onClick={onSignOut} style={{ width: "100%", padding: 16, marginTop: 20, border: `1px solid ${t.hair}`, borderRadius: 14, background: "transparent", color: t.inkSoft, fontSize: 14, fontWeight: 500, fontFamily: FONT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Icon name="logout" size={16} color={t.inkSoft} />
        Sign out
      </button>

      <div style={{ textAlign: "center", fontSize: 10, color: t.inkMute, marginTop: 16 }}>
        Ringgit v4.1 · Powered by Claude · Not financial advice
      </div>
    </div>
  );
}

function ScannerSheet({ open, onClose, onAdd, seededItem, t, ya, allItems }) {
  const [step, setStep] = useState("idle");
  const [desc, setDesc] = useState("");
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(null);
  const [result, setResult] = useState(null);
  const fRef = useRef(null);

  useEffect(() => {
    if (open) { setStep("idle"); setDesc(""); setImg(null); setErr(null); setResult(null); }
  }, [open]);

  if (!open) return null;

  const handleFile = async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  
  setErr(null); // Clear any previous errors
  
  const r = new FileReader();
  r.onload = async (ev) => {
    try {
      // Show a brief loading state (optional)
      const originalSize = (f.size / 1024 / 1024).toFixed(1);
      console.log(`Original image: ${originalSize} MB`);
      
      const compressed = await compressImage(ev.target.result);
      
      const compressedSize = (compressed.length * 0.75 / 1024 / 1024).toFixed(1);
      console.log(`Compressed to: ${compressedSize} MB`);
      
      setImg(compressed);
    } catch (err) {
      console.error('Compression failed:', err);
      setErr('Failed to process image. Try a smaller photo or take a new one.');
    }
  };
  r.readAsDataURL(f);
  e.target.value = "";
};

  const runAI = async () => {
    if (!img && !desc) return;
    setStep("analyzing"); setErr(null);

    const list = allItems.filter(i => !i.auto && i.cap < 999999).map(i => `${i.id}: ${i.name} (cap RM${i.cap}) - ${i.desc}`).join("\n");
    const scopedId = seededItem?.id;
    const scopedName = seededItem?.name;

    const systemPrompt = `You are a Malaysian tax relief validator for Year of Assessment (YA) ${ya}, strictly following LHDN BE form guidelines. Your ONLY job is to determine if an expense qualifies for Malaysian income tax relief under the Income Tax Act 1967.

Available relief categories for YA${ya}:
${list}

${scopedId ? `The user is trying to claim this expense under: ${scopedId} · ${scopedName}. Check whether the receipt fits THIS specific category. If it doesn't fit ${scopedId} but fits a different category, flag that in the explanation but still return the better category.` : ""}

Rules:
- Map expenses to the MOST SPECIFIC matching relief category using the descriptions above
- Sports & fitness (G10) INCLUDES: golf green fees, golf equipment (clubs/balls/bags), golf lessons, gym memberships, court rental (badminton/squash/tennis), swimming pool entry, martial arts fees, yoga/pilates, competition entry fees
- Sports & fitness (G10) EXCLUDES: golf buggy rental, club joining/membership fees, sports clothing/shoes/apparel
- When a receipt has BOTH claimable and non-claimable line items, add up ONLY the claimable line items for suggested_amount, and the full receipt total for total_amount
- Do NOT reject based on merchant name alone — read the actual line items
- If an expense clearly matches a category description, approve it confidently
- Only reject if the expense genuinely has no matching category

Reply with ONLY valid JSON (no markdown, no code fences):
{"claimable":true,"category_id":"G10","category_name":"Sports & fitness","total_amount":250,"suggested_amount":250,"explanation":"Short reason","conditions":"Keep receipt for 7 years for LHDN audit."}

If not claimable: {"claimable":false,"category_id":null,"category_name":null,"total_amount":0,"suggested_amount":0,"explanation":"Reason why not.","conditions":null}`;

    const userContent = [];
    if (img) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: img.split(";")[0].split(":")[1], data: img.split(",")[1] }
      });
    }
    userContent.push({
      type: "text",
      text: desc
        ? `User describes the expense as: "${desc}". ${img ? "A receipt image is also attached — extract all line items from it and evaluate each one individually." : "No receipt image provided."}`
        : "A receipt image has been attached. Extract ALL line items individually. For each, decide if it qualifies for LHDN tax relief. Sum only the qualifying line items for suggested_amount. Sum full receipt total for total_amount."
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
          // FIX 3: Updated model name to current Claude Sonnet
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }]
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "API error");

      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) throw new Error("No response from Claude");

      let jsonText = textBlock.text.trim();

console.log("Raw Claude response:", jsonText); // ✅ Debug log

// Remove ALL markdown and extract ONLY the JSON object
jsonText = jsonText.replace(/```json/gi, "").replace(/```/g, "");

// Find JSON by looking for the opening { and closing } with proper nesting
const firstBrace = jsonText.indexOf('{');
const lastBrace = jsonText.lastIndexOf('}');

if (firstBrace === -1 || lastBrace === -1) {
  throw new Error("No JSON found in Claude's response");
}

// Extract just the JSON portion
const jsonOnly = jsonText.substring(firstBrace, lastBrace + 1);

try {
  const parsed = JSON.parse(jsonOnly);
  setResult(parsed);
  setStep("result");
} catch (parseErr) {
  console.error("JSON parse failed. Extracted text was:", jsonOnly);
  throw new Error("Claude returned invalid JSON: " + parseErr.message);
}

    } catch (e) {
      console.error("Scanner error:", e);
      // FIX 3: More descriptive error so user knows what went wrong
      const msg = e.message?.includes("401") ? "Invalid API key — check VITE_ANTHROPIC_API_KEY in Vercel env vars."
        : e.message?.includes("403") ? "API key doesn't have permission. Check Anthropic dashboard."
        : "Analysis failed: " + (e.message || "Unknown error");
      setErr(msg);
      setStep("idle");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadein 0.2s" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: t.bg, borderRadius: "24px 24px 0 0", padding: "12px 20px 28px", maxHeight: "90vh", overflow: "auto", fontFamily: FONT, animation: "slideup 0.3s cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div style={{ width: 40, height: 4, background: t.hairStrong, borderRadius: 2 }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: t.red, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="sparkleAi" size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.ink, letterSpacing: -0.3 }}>AI Receipt Check</div>
              <div style={{ fontSize: 11, color: t.inkMute }}>Powered by Claude · LHDN validated</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: "none", borderRadius: 10, background: t.bgAlt, color: t.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" size={16} color={t.inkSoft} />
          </button>
        </div>

        {seededItem && step === "idle" && (
          <div style={{ padding: "8px 12px", background: t.redSoft, borderRadius: 10, marginBottom: 12, fontSize: 12, color: t.red, fontWeight: 600 }}>
            Checking against {seededItem.id} · {seededItem.name}
          </div>
        )}

        {step === "idle" && (
          <>
            <button onClick={() => fRef.current?.click()} style={{ width: "100%", padding: "24px 16px", background: t.surface, border: `1.5px dashed ${t.hairStrong}`, borderRadius: 16, cursor: "pointer", fontFamily: FONT, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              {img ? (
                <>
                  <img src={img} style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 10, objectFit: "contain" }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.green }}>Receipt attached ✓ (tap to change)</div>
                </>
              ) : (
                <>
                  <Icon name="camera" size={32} color={t.inkSoft} />
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>Upload receipt</div>
                  <div style={{ fontSize: 11, color: t.inkMute }}>Photo or screenshot · optional</div>
                </>
              )}
            </button>
            <input ref={fRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />

            <div style={{ marginTop: 14 }}>
              <textarea value={desc} onChange={e => setDesc(e.target.value)}
                placeholder='Or describe the expense — e.g. "gym membership RM250"'
                style={{ width: "100%", minHeight: 70, padding: "12px 14px", border: `1px solid ${t.hair}`, borderRadius: 12, background: t.surface, color: t.ink, fontSize: 13, fontFamily: FONT, outline: "none", boxSizing: "border-box", resize: "none" }} />
            </div>

            <div style={{ marginTop: 12, padding: "10px 12px", background: t.goldSoft, borderRadius: 10, borderLeft: `3px solid ${t.gold}`, fontSize: 11, color: t.inkSoft, lineHeight: 1.5 }}>
              LHDN requires <b style={{ color: t.gold }}>7 years</b> of receipt retention for audits. Snap a photo now.
            </div>

            {err && <div style={{ color: t.red, fontSize: 12, fontWeight: 600, marginTop: 10, padding: "10px 12px", background: t.redSoft, borderRadius: 10, lineHeight: 1.5 }}>{err}</div>}

            <button onClick={runAI} disabled={!img && !desc}
              style={{ width: "100%", marginTop: 14, padding: 16, border: "none", borderRadius: 14, background: (!img && !desc) ? t.inkMute : t.ink, color: t.bg, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: (!img && !desc) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (!img && !desc) ? 0.5 : 1 }}>
              <Icon name="sparkleAi" size={16} color={t.bg} />
              Check if claimable
            </button>
          </>
        )}

        {step === "analyzing" && (
          <div style={{ padding: "50px 0", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, border: `3px solid ${t.hair}`, borderTopColor: t.red, borderRadius: "50%", margin: "0 auto", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: t.ink, marginTop: 18 }}>
              Checking against LHDN YA{ya} reliefs...
            </div>
            <div style={{ fontSize: 11, color: t.inkMute, marginTop: 4 }}>Claude is reading your receipt</div>
          </div>
        )}

        {step === "result" && result && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: result.claimable ? t.greenSoft : t.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={result.claimable ? "check" : "close"} size={20} color={result.claimable ? t.green : t.red} weight={2.2} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: result.claimable ? t.green : t.red, letterSpacing: -0.4 }}>
                {result.claimable ? "Claimable!" : "Not claimable"}
              </div>
            </div>
            <div style={{ fontSize: 13, color: t.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>
              {result.explanation}
            </div>

            {result.claimable && (
              <>
                <div style={{ background: t.surface, border: `1px solid ${t.hair}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: t.inkMute }}>
                    <span>Category</span>
                    <span style={{ color: t.ink, fontWeight: 600 }}>{result.category_id} · {result.category_name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: t.inkMute }}>
                    <span>Total on receipt</span>
                    <span style={{ color: t.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      RM {(result.total_amount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 2px", marginTop: 4, borderTop: `1px solid ${t.hair}` }}>
                    <span style={{ fontSize: 12, color: t.inkMute }}>Claimable</span>
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
                  Add suggested (RM {(result.suggested_amount || 0).toLocaleString()})
                </button>
                {result.total_amount !== result.suggested_amount && (
                  <button onClick={() => { onAdd(result, true, img); onClose(); }}
                    style={{ width: "100%", padding: 13, border: `1px solid ${t.hair}`, borderRadius: 14, background: "transparent", color: t.ink, fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
                    Add full (RM {(result.total_amount || 0).toLocaleString()})
                  </button>
                )}
              </>
            )}
            {!result.claimable && (
              <button onClick={onClose} style={{ width: "100%", padding: 15, border: "none", borderRadius: 14, background: t.ink, color: t.bg, fontSize: 14, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Global styles + base wrapper
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

// FIX 2: body background is now controlled by useEffect, not hardcoded here
const globalCSS = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
input::placeholder, textarea::placeholder { color: rgba(139,130,117,0.8); }
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
button { transition: transform 0.15s, opacity 0.15s, background 0.2s; }
button:active { transform: scale(0.97); opacity: 0.9; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
