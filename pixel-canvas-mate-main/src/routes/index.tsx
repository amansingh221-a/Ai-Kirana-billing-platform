import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Barcode, Search, X, Check, ChevronLeft, Receipt, BookOpen, Settings, ScanLine, Plus, Minus, HelpCircle } from "lucide-react";
import cameraImg from "@/assets/camera.jpg";
import { byId, byBarcode, fuzzySearch, loadProducts, rupee, type Product } from "@/lib/kirana";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kirana Smart Billing — Fast billing for your shop" },
      { name: "description", content: "Camera-based grocery billing for Indian kirana shops. Detect, confirm, weigh and bill in seconds, with Udhaar khata." },
      { property: "og:title", content: "Kirana Smart Billing" },
      { property: "og:description", content: "Fast camera billing and Udhaar khata for kirana shopkeepers." },
    ],
  }),
  component: Gate,
});

function Gate() {
  const q = useQuery({ queryKey: ["products"], queryFn: loadProducts, staleTime: 5 * 60_000 });
  if (q.isError)
    return (
      <Shell>
        <div className="m-auto p-6 text-center">
          <p className="text-lg font-bold">Could not load products</p>
          <button className={`${primary} mt-4 px-6 py-3`} onClick={() => q.refetch()}>Try again</button>
        </div>
      </Shell>
    );
  if (!q.data) return <Shell><p className="m-auto text-muted-foreground">Loading products…</p></Shell>;
  return <App />;
}

type Line = { uid: number; id: string; qty: number };
type Customer = { id: string; name: string; uid: string; due: number; tx: { date: string; amt: number }[] };
type Bill = { no: number; total: number; status: "Paid" | "Udhaar"; who?: string | undefined };
type Sheet =
  | null
  | { k: "suggest" }
  | { k: "unknown" }
  | { k: "confirm"; id: string; conf: number }
  | { k: "changeProduct" }
  | { k: "search" }
  | { k: "qty"; id: string }
  | { k: "barcode" }
  | { k: "correct"; uid: number }
  | { k: "bill" }
  | { k: "checkout" }
  | { k: "paid"; no: number }
  | { k: "udhaar" }
  | { k: "confirmKhata"; cid: string }
  | { k: "khataDone"; cid: string; amt: number };

const DETECT_SEQ: { id: string; conf: number; mode: "sure" | "suggest" | "unknown" }[] = [
  { id: "toor", conf: 92, mode: "sure" },
  { id: "toor", conf: 78, mode: "suggest" },
  { id: "soyoil", conf: 88, mode: "sure" },
  { id: "sugar", conf: 0, mode: "unknown" },
  { id: "parleg", conf: 95, mode: "sure" },
];
const CONT_SEQ = ["toor", "parleg", "sugar", "rice"];
const QUICK = ["sugar", "rice", "atta", "toor", "chana", "potato", "onion"];

const btn = "rounded-xl font-bold active:scale-[0.98] transition-transform";
const primary = `${btn} bg-brand text-brand-foreground`;
const ghost = `${btn} bg-card text-foreground ring-1 ring-border`;

function App() {
  const [stage, setStage] = useState<"login" | "setup" | "app">("login");
  const [shop, setShop] = useState({ phone: "", shop: "Pandey General Store", owner: "Rajesh Pandey" });
  const [tab, setTab] = useState<"billing" | "history" | "khata" | "settings">("billing");
  const [lines, setLines] = useState<Line[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [step, setStep] = useState(0);
  const [continuous, setContinuous] = useState(false);
  const [billNo, setBillNo] = useState(1024);
  const [history, setHistory] = useState<Bill[]>([
    { no: 1023, total: 420, status: "Udhaar", who: "Gupta" },
    { no: 1022, total: 95, status: "Paid" },
  ]);
  const [customers, setCustomers] = useState<Customer[]>([
    { id: "pandey", name: "Pandey Ji", uid: "4821", due: 400, tx: [{ date: "02 Oct", amt: 200 }, { date: "29 Sep", amt: 200 }] },
    { id: "ramesh", name: "Ramesh", uid: "3307", due: 250, tx: [{ date: "01 Oct", amt: 250 }] },
    { id: "gupta", name: "Gupta", uid: "5190", due: 800, tx: [{ date: "03 Oct", amt: 420 }, { date: "27 Sep", amt: 380 }] },
  ]);
  const [openCust, setOpenCust] = useState<string | null>(null);
  const uidRef = useRef(1);

  const total = lines.reduce((s, l) => s + byId(l.id).price * l.qty, 0);
  const det = DETECT_SEQ[step % DETECT_SEQ.length]!;
  const detP = byId(det.id);

  const addLine = (id: string, qty: number) => {
    setLines((ls) => [...ls, { uid: uidRef.current++, id, qty }]);
  };
  const nextDetect = () => setStep((s) => s + 1);

  // continuous mode simulation
  useEffect(() => {
    if (!continuous) return;
    let i = 0;
    const t = setInterval(() => {
      const id = CONT_SEQ[i]!;
      addLine(id, 1);
      i++;
      if (i >= CONT_SEQ.length) { clearInterval(t); setContinuous(false); }
    }, 1200);
    return () => clearInterval(t);
  }, [continuous]);

  const onAdd = () => {
    if (det.mode === "suggest") return setSheet({ k: "suggest" });
    if (det.mode === "unknown") return setSheet({ k: "unknown" });
    setSheet({ k: "confirm", id: det.id, conf: det.conf });
  };

  const finishBill = (status: "Paid" | "Udhaar", who?: string) => {
    setHistory((h) => [{ no: billNo, total, status, who }, ...h]);
    setBillNo((n) => n + 1);
    setLines([]);
    setStep(0);
  };

  if (stage === "login")
    return (
      <Shell>
        <div className="flex flex-1 flex-col px-5 pt-14">
          <div className="grid size-14 place-items-center rounded-2xl bg-brand text-2xl font-extrabold text-brand-foreground">K</div>
          <h1 className="mt-6 text-3xl font-extrabold">Kirana Smart Billing</h1>
          <p className="mt-1 text-lg text-muted-foreground">Fast billing for your shop</p>
          <Field label="Mobile Number" value={shop.phone} onChange={(v) => setShop({ ...shop, phone: v.replace(/\D/g, "").slice(0, 10) })} placeholder="98XXXXXXXX" type="tel" prefix="+91" />
          <Field label="Shop Name" value={shop.shop} onChange={(v) => setShop({ ...shop, shop: v })} placeholder="Pandey General Store" />
          <button className={`${primary} mt-8 py-4 text-lg`} onClick={() => setStage("setup")}>Continue</button>
          <button className="mt-4 flex items-center justify-center gap-2 py-2 font-semibold text-muted-foreground"><HelpCircle className="size-5" /> Need Help?</button>
        </div>
      </Shell>
    );

  if (stage === "setup")
    return (
      <Shell>
        <div className="flex flex-1 flex-col px-5 pt-10">
          <button onClick={() => setStage("login")} className="-ml-2 flex items-center text-muted-foreground"><ChevronLeft /> Back</button>
          <h1 className="mt-4 text-3xl font-extrabold">Set up your shop</h1>
          <Field label="Shop Name" value={shop.shop} onChange={(v) => setShop({ ...shop, shop: v })} placeholder="Pandey General Store" />
          <Field label="Shopkeeper Name" value={shop.owner} onChange={(v) => setShop({ ...shop, owner: v })} placeholder="Rajesh Pandey" />
          <div className="mt-5">
            <p className="text-sm font-semibold text-muted-foreground">Currency</p>
            <div className="mt-2 rounded-xl bg-tint px-4 py-4 text-lg font-bold">₹ INR</div>
          </div>
          <button className={`${primary} mt-auto mb-8 py-4 text-lg`} onClick={() => setStage("app")}>Start Billing</button>
        </div>
      </Shell>
    );

  return (
    <Shell>
      <header className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="grid size-10 place-items-center rounded-full bg-brand/15 font-extrabold text-brand">{shop.shop[0] ?? "K"}</div>
        <div className="leading-tight">
          <p className="text-base font-bold">{shop.shop || "My Shop"}</p>
          <p className="text-xs text-muted-foreground">{shop.owner} · Bill #{billNo}</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
          <span className="size-1.5 rounded-full bg-brand" />Online
        </span>
      </header>

      <main className="flex-1 overflow-y-auto pb-4">
        {tab === "billing" && (
          <>
            <div className="px-4">
              <div className="relative h-[220px] overflow-hidden rounded-xl ring-1 ring-border">
                <img src={cameraImg} alt="Camera view" width={1056} height={624} className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-b from-overlay/40 via-transparent to-overlay" />
                <div className="absolute top-3 left-3 rounded-full bg-overlay px-3 py-1 text-xs font-semibold text-brand-foreground">
                  <span className="text-warn">●</span> {continuous ? "Continuous scan" : "Point camera at product"}
                </div>
                <div className={`absolute top-[22%] right-[22%] bottom-[26%] left-[22%] rounded-xl border-2 ${det.mode === "unknown" ? "border-warn" : "border-brand"}`} />
                <div className="absolute right-3 bottom-3 left-3 flex items-end justify-between gap-2">
                  <div className="rounded-xl bg-overlay px-3 py-2">
                    {det.mode === "unknown" ? (
                      <p className="text-base font-bold text-brand-foreground">Product not recognized</p>
                    ) : (
                      <>
                        <p className="text-base font-bold text-brand-foreground">{detP.name} · {detP.hindi} detected</p>
                        <p className="text-xs text-brand-foreground/75">{rupee(detP.price)} / {detP.unit}</p>
                      </>
                    )}
                  </div>
                  {det.mode !== "unknown" && (
                    <div className="rounded-xl bg-overlay px-2.5 py-1.5 text-center">
                      <p className="text-[10px] tracking-widest text-brand-foreground/70 uppercase">Conf</p>
                      <p className={`text-xl leading-none font-extrabold ${det.conf >= 85 ? "text-brand" : "text-warn"}`}>{det.conf}%</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-4 pt-3">
              <div className="flex rounded-xl bg-tint p-1">
                {(["One-by-one", "Continuous"] as const).map((m, i) => {
                  const on = (i === 1) === continuous;
                  return (
                    <button key={m} onClick={() => setContinuous(i === 1)} className={`flex-1 rounded-lg py-2.5 text-sm ${on ? "bg-card font-bold ring-1 ring-border" : "font-medium text-muted-foreground"}`}>{m}</button>
                  );
                })}
              </div>
            </div>

            <div className="px-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <button className={`${primary} py-4 text-lg`} onClick={onAdd}>+ ADD TO BILL</button>
                <button className={`${ghost} py-4 text-lg`} onClick={() => (det.mode === "sure" && det.id === "soyoil" ? setSheet({ k: "correct", uid: -1 }) : det.mode === "suggest" ? setSheet({ k: "suggest" }) : setSheet({ k: "changeProduct" }))}>CHANGE</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button className={`${ghost} flex items-center justify-center gap-2 py-3.5`} onClick={() => setSheet({ k: "barcode" })}><Barcode className="size-5" /> Scan Barcode</button>
                <button className={`${ghost} flex items-center justify-center gap-2 py-3.5`} onClick={() => setSheet({ k: "search" })}><Search className="size-5" /> Search Product</button>
              </div>
            </div>

            <div className="px-4 pt-3">
              <BillCard lines={lines} total={total} onRemove={(uid) => setLines((ls) => ls.filter((l) => l.uid !== uid))} onOpen={() => setSheet({ k: "bill" })} />
            </div>
          </>
        )}

        {tab === "history" && (
          <div className="px-4">
            <h2 className="text-2xl font-extrabold">Today's Transactions</h2>
            <div className="mt-4 divide-y divide-border rounded-xl bg-card ring-1 ring-border">
              {history.map((b) => (
                <div key={b.no} className="flex items-center px-4 py-4">
                  <div>
                    <p className="font-bold">Bill #{b.no}</p>
                    {b.who && <p className="text-sm text-muted-foreground">{b.who}</p>}
                  </div>
                  <p className="ml-auto text-lg font-bold">{rupee(b.total)}</p>
                  <span className={`ml-3 rounded-full px-2.5 py-1 text-xs font-bold ${b.status === "Paid" ? "bg-brand/15 text-brand" : "bg-warn/20 text-foreground"}`}>{b.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "khata" && (
          <div className="px-4">
            {openCust ? (
              (() => {
                const c = customers.find((x) => x.id === openCust)!;
                return (
                  <div>
                    <button onClick={() => setOpenCust(null)} className="-ml-2 flex items-center text-muted-foreground"><ChevronLeft /> Khata</button>
                    <div className="mt-3 rounded-xl bg-card p-5 ring-1 ring-border">
                      <p className="text-2xl font-extrabold">{c.name}</p>
                      <p className="text-sm text-muted-foreground">UID {c.uid}</p>
                      <p className="mt-4 text-sm font-semibold text-muted-foreground">Current Udhaar</p>
                      <p className="text-4xl font-extrabold text-brand">{rupee(c.due)}</p>
                    </div>
                    <p className="mt-5 text-xs font-bold tracking-widest text-muted-foreground uppercase">Transaction History</p>
                    <div className="mt-2 divide-y divide-border rounded-xl bg-card ring-1 ring-border">
                      {c.tx.map((t, i) => (
                        <div key={i} className="flex px-4 py-3.5"><span>{t.date}</span><span className="ml-auto font-bold">{rupee(t.amt)}</span></div>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : (
              <>
                <h2 className="text-2xl font-extrabold">Khata</h2>
                <p className="text-muted-foreground">Total due {rupee(customers.reduce((s, c) => s + c.due, 0))}</p>
                <CustomerList customers={customers} onPick={setOpenCust} />
              </>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="px-4">
            <h2 className="text-2xl font-extrabold">Settings</h2>
            <div className="mt-4 divide-y divide-border rounded-xl bg-card ring-1 ring-border">
              {[["Shop", shop.shop], ["Shopkeeper", shop.owner], ["Mobile", shop.phone ? `+91 ${shop.phone}` : "—"], ["Currency", "₹ INR"]].map(([k, v]) => (
                <div key={k} className="flex px-4 py-4"><span className="text-muted-foreground">{k}</span><span className="ml-auto font-semibold">{v}</span></div>
              ))}
            </div>
            <button className={`${ghost} mt-4 w-full py-4`} onClick={() => setStage("setup")}>Edit shop details</button>
          </div>
        )}
      </main>

      {tab === "billing" && lines.length > 0 && (
        <div className="px-4 pb-2">
          <button className={`${btn} w-full bg-foreground py-4 text-lg text-background`} onClick={() => setSheet({ k: "checkout" })}>CHECKOUT · {rupee(total)}</button>
        </div>
      )}

      <nav className="sticky bottom-0 grid grid-cols-4 bg-card ring-1 ring-border">
        {([["billing", "Billing", ScanLine], ["history", "History", Receipt], ["khata", "Khata", BookOpen], ["settings", "Settings", Settings]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => { setTab(k); setOpenCust(null); }} className={`flex flex-col items-center gap-1 py-3 ${tab === k ? "text-brand" : "text-muted-foreground"}`}>
            <I className="size-6" />
            <span className={`text-xs ${tab === k ? "font-bold" : "font-medium"}`}>{l}</span>
          </button>
        ))}
      </nav>

      {sheet && (
        <SheetView onClose={() => setSheet(null)}>
          {sheet.k === "suggest" && (
            <>
              <SheetTitle>What did we detect?</SheetTitle>
              {[["toor", 78], ["chana", 51], ["besan", 16]].map(([id, c]) => {
                const p = byId(id as string);
                return (
                  <button key={id} className={`${ghost} mb-3 flex w-full items-center px-4 py-4 text-left`} onClick={() => setSheet({ k: "qty", id: p.id })}>
                    <span className="text-lg">{p.name} <span className="text-muted-foreground">· {p.hindi}</span></span>
                    <span className="ml-auto text-lg text-brand">{c}%</span>
                  </button>
                );
              })}
              <button className={`${ghost} flex w-full items-center justify-center gap-2 py-4`} onClick={() => setSheet({ k: "search" })}><Search className="size-5" /> Search Product</button>
            </>
          )}

          {sheet.k === "unknown" && <UnknownSheet onPick={(id) => setSheet({ k: "qty", id })} onSearch={() => setSheet({ k: "search" })} onBarcode={() => setSheet({ k: "barcode" })} />}

          {sheet.k === "confirm" && (() => {
            const p = byId(sheet.id);
            return (
              <>
                <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">AI detected</p>
                <div className="mt-2 flex items-center gap-4 rounded-xl bg-card p-5 ring-1 ring-border">
                  <div className="grid size-16 place-items-center rounded-xl bg-tint text-4xl">{p.image}</div>
                  <div className="flex-1">
                    <p className="text-2xl font-extrabold">{p.name}</p>
                    <p className="text-muted-foreground">{p.hindi} · {rupee(p.price)}/{p.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Confidence</p>
                    <p className={`text-3xl font-extrabold ${sheet.conf >= 85 ? "text-brand" : "text-warn"}`}>{sheet.conf}%</p>
                  </div>
                </div>
                <button className={`${primary} mt-4 w-full py-5 text-xl`} onClick={() => setSheet({ k: "qty", id: p.id })}>ADD TO BILL</button>
                <button className={`${ghost} mt-3 w-full py-5 text-xl`} onClick={() => setSheet({ k: "changeProduct" })}>CHANGE PRODUCT</button>
              </>
            );
          })()}

          {sheet.k === "changeProduct" && <ChangeProductSheet onPick={(id) => setSheet({ k: "qty", id })} onSearchAll={() => setSheet({ k: "search" })} />}

          {sheet.k === "search" && <SearchSheet onPick={(id) => setSheet({ k: "qty", id })} />}

          {sheet.k === "qty" && (
            <QtySheet
              key={sheet.id}
              p={byId(sheet.id)}
              initial={sheet.id === "pumpkin" ? 1.4 : byId(sheet.id).loose ? 1 : sheet.id === "parleg" ? 2 : 1}
              onAdd={(q) => { addLine(sheet.id, q); setSheet(null); nextDetect(); }}
              onChange={() => setSheet({ k: "changeProduct" })}
            />
          )}

          {sheet.k === "barcode" && <BarcodeSheet onAdd={(id) => { setSheet(null); setSheet({ k: "qty", id }); }} onSearch={() => setSheet({ k: "search" })} onAI={() => setSheet(null)} />}

          {sheet.k === "correct" && (
            <>
              <SheetTitle sub="AI detected Soybean Oil">Choose correct product</SheetTitle>
              {["mustard", "soyoil", "sunoil", "groundnut"].map((id) => {
                const p = byId(id);
                return (
                  <button key={id} className={`${ghost} mb-3 flex w-full items-center px-4 py-4 text-left`} onClick={() => {
                    if (sheet.uid === -1) setSheet({ k: "qty", id });
                    else { setLines((ls) => ls.map((l) => (l.uid === sheet.uid ? { ...l, id } : l))); setSheet(null); }
                  }}>
                    <span className="text-lg">{p.name}</span>
                    <span className="ml-auto text-muted-foreground">{rupee(p.price)}/{p.unit}</span>
                  </button>
                );
              })}
            </>
          )}

          {sheet.k === "bill" && (
            <>
              <SheetTitle>Current Bill</SheetTitle>
              <div className="divide-y divide-border">
                {lines.map((l) => {
                  const p = byId(l.id);
                  return (
                    <div key={l.uid} className="flex items-center py-3">
                      <div>
                        <p className="font-bold">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{l.qty}{p.loose ? " kg" : ""} × {rupee(p.price)} = {rupee(p.price * l.qty)}</p>
                      </div>
                      {p.name.includes("Oil") && <button className="ml-auto mr-3 text-sm font-semibold text-brand" onClick={() => setSheet({ k: "correct", uid: l.uid })}>Change</button>}
                      <p className={`${p.name.includes("Oil") ? "" : "ml-auto"} font-bold`}>{rupee(p.price * l.qty)}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex border-t border-border pt-3 text-muted-foreground"><span>Subtotal</span><span className="ml-auto">{rupee(total)}</span></div>
              <div className="flex pt-1 text-2xl font-extrabold"><span>TOTAL</span><span className="ml-auto text-brand">{rupee(total)}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button className={`${ghost} py-4`} onClick={() => setSheet(null)}>ADD PRODUCT</button>
                <button className={`${primary} py-4`} disabled={!lines.length} onClick={() => setSheet({ k: "checkout" })}>CHECKOUT</button>
              </div>
            </>
          )}

          {sheet.k === "checkout" && (
            <>
              <SheetTitle>Checkout</SheetTitle>
              <p className="text-center text-6xl font-extrabold">{rupee(total)}</p>
              <p className="mt-1 text-center text-muted-foreground">{lines.length} items · Bill #{billNo}</p>
              <button className={`${primary} mt-6 w-full py-5 text-xl`} onClick={() => { const no = billNo; finishBill("Paid"); setSheet({ k: "paid", no }); }}>PAYMENT DONE</button>
              <button className={`${btn} mt-3 w-full bg-warn py-5 text-xl text-foreground`} onClick={() => setSheet({ k: "udhaar" })}>UDHAAR</button>
            </>
          )}

          {sheet.k === "paid" && (
            <Done title="Payment saved" sub={`Bill #${sheet.no}`} action="NEW BILL" onAction={() => setSheet(null)} />
          )}

          {sheet.k === "udhaar" && (
            <>
              <SheetTitle>Select Customer</SheetTitle>
              <CustomerList customers={customers} onPick={(cid) => setSheet({ k: "confirmKhata", cid })} />
              <button className={`${ghost} mt-3 flex w-full items-center justify-center gap-2 py-4`} onClick={() => {
                const name = prompt("Customer name");
                if (!name) return;
                const c: Customer = { id: name + Date.now(), name, uid: String(1000 + Math.floor(Math.random() * 9000)), due: 0, tx: [] };
                setCustomers((cs) => [...cs, c]);
                setSheet({ k: "confirmKhata", cid: c.id });
              }}><Plus className="size-5" /> New Customer</button>
            </>
          )}

          {sheet.k === "confirmKhata" && (() => {
            const c = customers.find((x) => x.id === sheet.cid)!;
            return (
              <>
                <SheetTitle>Add {rupee(total)} to {c.name}'s Khata?</SheetTitle>
                <p className="text-muted-foreground">Current due {rupee(c.due)} → New due {rupee(c.due + total)}</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button className={`${ghost} py-4`} onClick={() => setSheet({ k: "udhaar" })}>CANCEL</button>
                  <button className={`${primary} py-4`} onClick={() => {
                    const amt = total;
                    setCustomers((cs) => cs.map((x) => (x.id === c.id ? { ...x, due: x.due + amt, tx: [{ date: "04 Oct", amt }, ...x.tx] } : x)));
                    finishBill("Udhaar", c.name);
                    setSheet({ k: "khataDone", cid: c.id, amt });
                  }}>CONFIRM</button>
                </div>
              </>
            );
          })()}

          {sheet.k === "khataDone" && (
            <Done
              title={`${rupee(sheet.amt)} added to ${customers.find((c) => c.id === sheet.cid)!.name}'s Khata`}
              sub="Transaction saved"
              action="NEW BILL"
              onAction={() => setSheet(null)}
              secondary={{ label: "View Khata", fn: () => { setOpenCust(sheet.cid); setTab("khata"); setSheet(null); } }}
            />
          )}
        </SheetView>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-screen max-w-[440px] flex-col bg-background ring-1 ring-border">{children}</div>;
}

function Field({ label, value, onChange, placeholder, type = "text", prefix }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string; prefix?: string }) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      <div className="mt-2 flex items-center rounded-xl bg-card px-4 ring-1 ring-input focus-within:ring-2 focus-within:ring-ring">
        {prefix && <span className="mr-2 text-lg font-semibold text-muted-foreground">{prefix}</span>}
        <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent py-4 text-lg font-semibold outline-none" />
      </div>
    </label>
  );
}

function BillCard({ lines, total, onRemove, onOpen }: { lines: Line[]; total: number; onRemove: (uid: number) => void; onOpen: () => void }) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-border">
      <button className="flex w-full items-center" onClick={onOpen}>
        <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Current Bill</span>
        <span className="ml-auto text-xs font-bold text-brand">{lines.length} {lines.length === 1 ? "item" : "items"} · View</span>
      </button>
      {lines.length === 0 ? (
        <p className="py-5 text-center text-muted-foreground">No items yet. Point camera at a product.</p>
      ) : (
        <div className="mt-2 divide-y divide-border">
          {lines.map((l) => {
            const p = byId(l.id);
            return (
              <div key={l.uid} className="flex items-center gap-3 py-2.5 animate-in fade-in slide-in-from-top-1">
                <div className="leading-tight">
                  <p className="text-base font-bold">{p.name} <span className="font-medium text-muted-foreground">· {p.hindi}</span></p>
                  <p className="text-sm text-muted-foreground">{p.loose ? `${l.qty} kg` : `× ${l.qty}`} · {rupee(p.price)}/{p.unit}</p>
                </div>
                <p className="ml-auto text-base font-bold">{rupee(p.price * l.qty)}</p>
                <button aria-label="Remove" onClick={() => onRemove(l.uid)} className="text-muted-foreground"><X className="size-4" /></button>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-1 flex items-center border-t border-border pt-3">
        <span className="text-lg font-bold">Total</span>
        <span className="ml-auto text-3xl font-extrabold text-brand">{rupee(total)}</span>
      </div>
    </div>
  );
}

function CustomerList({ customers, onPick }: { customers: Customer[]; onPick: (id: string) => void }) {
  return (
    <div className="mt-3 divide-y divide-border rounded-xl bg-card ring-1 ring-border">
      {customers.map((c) => (
        <button key={c.id} className="flex w-full items-center px-4 py-4 text-left" onClick={() => onPick(c.id)}>
          <div className="mr-3 grid size-10 place-items-center rounded-full bg-tint font-bold">{c.name[0]}</div>
          <span className="text-lg font-bold">{c.name}</span>
          <span className="ml-auto text-lg font-bold">{rupee(c.due)}</span>
        </button>
      ))}
    </div>
  );
}

function SheetView({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 animate-in slide-in-from-bottom-8 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex justify-end">
          <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-tint"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SheetTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-2xl font-extrabold">{children}</h3>
      {sub && <p className="text-muted-foreground">{sub}</p>}
    </div>
  );
}

function UnknownSheet({ onPick, onSearch, onBarcode }: { onPick: (id: string) => void; onSearch: () => void; onBarcode: () => void }) {
  return (
    <>
      <SheetTitle sub="We did not match this item reliably. Pick a nearby product or try another method.">Unknown product</SheetTitle>
      <div className="space-y-2">
        {QUICK.map((id) => {
          const p = byId(id);
          return (
            <button key={id} className={`${ghost} flex w-full items-center px-4 py-4 text-left`} onClick={() => onPick(p.id)}>
              <span className="text-lg">{p.image} {p.name}</span>
              <span className="ml-auto text-muted-foreground">{rupee(p.price)}/{p.unit}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button className={`${ghost} py-3.5`} onClick={onBarcode}>Scan Barcode</button>
        <button className={`${ghost} py-3.5`} onClick={onSearch}>Search Product</button>
      </div>
    </>
  );
}

function ChangeProductSheet({ onPick, onSearchAll }: { onPick: (id: string) => void; onSearchAll: () => void }) {
  return (
    <>
      <SheetTitle sub="Pick the correct product for this line item">Change product</SheetTitle>
      <div className="space-y-2">
        {QUICK.map((id) => {
          const p = byId(id);
          return (
            <button key={id} className={`${ghost} flex w-full items-center px-4 py-4 text-left`} onClick={() => onPick(p.id)}>
              <span className="text-lg">{p.image} {p.name}</span>
              <span className="ml-auto text-muted-foreground">{rupee(p.price)}/{p.unit}</span>
            </button>
          );
        })}
      </div>
      <button className={`${ghost} mt-4 flex w-full items-center justify-center gap-2 py-4`} onClick={onSearchAll}><Search className="size-5" /> Search all products</button>
    </>
  );
}

function SearchSheet({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("cheni");
  const res = useMemo(() => fuzzySearch(q), [q]);
  return (
    <>
      <SheetTitle sub="Type in Hindi or English — spelling mistakes are fine">Search Product</SheetTitle>
      <div className="flex items-center rounded-xl bg-card px-4 ring-2 ring-ring">
        <Search className="size-5 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="w-full bg-transparent px-3 py-4 text-lg font-semibold outline-none" placeholder="cheeni, sugar, shakar…" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {["cheeni", "chini", "chawal", "arhar"].map((s) => (
          <button key={s} onClick={() => setQ(s)} className="rounded-full bg-tint px-3 py-1.5 text-sm font-semibold">{s}</button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {res.map(({ p, hit, best }) => (
          <button key={p.id} className={`${ghost} flex w-full items-center px-4 py-4 text-left`} onClick={() => onPick(p.id)}>
            <div>
              <p className="text-lg">{p.image} {p.name} / {p.hindi}</p>
              <p className="text-sm font-medium text-muted-foreground">{best === 0 ? "Match" : "Close match"}: “{hit}”</p>
            </div>
            <span className="ml-auto">{rupee(p.price)}/{p.unit}</span>
          </button>
        ))}
        {q && !res.length && <p className="py-4 text-center text-muted-foreground">No match. Try another spelling.</p>}
      </div>
    </>
  );
}

function QtySheet({ p, initial, onAdd, onChange }: { p: Product; initial: number; onAdd: (q: number) => void; onChange: () => void }) {
  const [q, setQ] = useState(initial);
  const [manual, setManual] = useState(false);
  const r = (n: number) => Math.max(0, Math.round(n * 10) / 10);
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-extrabold">{p.name}</h3>
          <p className="text-muted-foreground">{p.hindi} · {rupee(p.price)} / {p.unit}</p>
        </div>
        <button onClick={onChange} className="rounded-full bg-tint px-3 py-1.5 text-sm font-bold text-brand">Change</button>
      </div>
      <div className="rounded-xl bg-card p-5 ring-1 ring-border">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">{p.loose ? "Weight" : "Quantity"}</p>
            {manual ? (
              <input autoFocus type="number" step="0.05" inputMode="decimal" value={q} onChange={(e) => setQ(Number(e.target.value))} className="w-32 border-b-2 border-brand bg-transparent text-4xl font-extrabold outline-none" />
            ) : (
              <p className="text-4xl font-extrabold">{q}{p.loose ? " kg" : ""}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-muted-foreground">Amount</p>
            <p className="text-4xl font-extrabold text-brand">{rupee(p.price * q)}</p>
          </div>
        </div>
      </div>
      {p.loose ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          {[0.1, 0.5, 1].map((d) => (
            <button key={d} className={`${ghost} py-4 text-lg`} onClick={() => setQ((x) => r(x + d))}>+ {d} kg</button>
          ))}
          <button className={`${ghost} py-3`} onClick={() => setQ((x) => r(x - 0.1))}>− 0.1</button>
          <button className={`${ghost} col-span-2 py-3`} onClick={() => setManual(true)}>Enter Weight</button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button className={`${ghost} grid flex-1 place-items-center py-4`} onClick={() => setQ((x) => Math.max(1, x - 1))}><Minus /></button>
          <button className={`${ghost} grid flex-1 place-items-center py-4`} onClick={() => setQ((x) => x + 1)}><Plus /></button>
        </div>
      )}
      <button className={`${primary} mt-4 w-full py-5 text-xl`} disabled={q <= 0} onClick={() => onAdd(q)}>ADD TO BILL</button>
    </>
  );
}

function BarcodeSheet({ onAdd, onSearch, onAI }: { onAdd: (id: string) => void; onSearch: () => void; onAI: () => void }) {
  const [hit, setHit] = useState<Product | null>(null);
  const found = !!hit;
  useEffect(() => { const t = setTimeout(() => setHit(byBarcode("8901719110016") ?? null), 1200); return () => clearTimeout(t); }, []);
  return (
    <>
      <SheetTitle>Scan Barcode</SheetTitle>
      <div className="relative grid h-36 place-items-center rounded-xl bg-foreground">
        <Barcode className="size-20 text-background/80" />
        {!found && <div className="absolute inset-x-6 top-1/2 h-0.5 bg-destructive animate-pulse" />}
      </div>
      {found ? (
        <div className="mt-4 flex items-center rounded-xl bg-card p-4 ring-1 ring-border">
          <div><p className="text-lg font-bold">{hit?.name}</p><p className="text-sm text-muted-foreground">Barcode {hit?.barcode}</p><p className="text-muted-foreground">Price {rupee(hit?.price ?? 0)}</p></div>
          <Check className="ml-auto size-7 text-brand" />
        </div>
      ) : (
        <p className="mt-4 text-center text-muted-foreground">Hold barcode inside the box…</p>
      )}
      <button className={`${primary} mt-4 w-full py-5 text-xl`} disabled={!found} onClick={() => hit && onAdd(hit.id)}>ADD TO BILL</button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button className={`${ghost} py-3.5`} onClick={onAI}>Use AI Detection</button>
        <button className={`${ghost} py-3.5`} onClick={onSearch}>Search Product</button>
      </div>
    </>
  );
}

function Done({ title, sub, action, onAction, secondary }: { title: string; sub: string; action: string; onAction: () => void; secondary?: { label: string; fn: () => void } }) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-brand text-brand-foreground"><Check className="size-10" /></div>
      <h3 className="mt-5 text-2xl font-extrabold">{title}</h3>
      <p className="text-muted-foreground">{sub}</p>
      <button className={`${primary} mt-6 w-full py-5 text-xl`} onClick={onAction}>{action}</button>
      {secondary && <button className={`${ghost} mt-3 w-full py-4`} onClick={secondary.fn}>{secondary.label}</button>}
    </div>
  );
}

