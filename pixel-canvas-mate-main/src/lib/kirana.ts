export type Product = {
  id: string;
  name: string;
  hindi: string;
  price: number;
  unit: string;
  loose: boolean;
  aliases: string[];
  barcode: string | null;
  image: string | null;
};

import { supabase } from "@/integrations/supabase/client";

let CATALOG: Product[] = [];
export const getCatalog = () => CATALOG;

export async function loadProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,hindi_name,aliases,barcode,price,unit,product_type,image")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  CATALOG = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    hindi: r.hindi_name,
    aliases: r.aliases,
    barcode: r.barcode,
    price: Number(r.price),
    unit: r.unit as Product["unit"],
    loose: r.product_type === "loose",
    image: r.image,
  }));
  return CATALOG;
}

export const byBarcode = (code: string) => CATALOG.find((p) => p.barcode === code);

const MISSING: Product = { id: "?", name: "Unknown", hindi: "", price: 0, unit: "pkt", loose: false, aliases: [], barcode: null, image: null };
export const byId = (id: string) => CATALOG.find((p) => p.id === id) ?? MISSING;

function lev(a: string, b: string) {
  const w = b.length + 1;
  const d = new Array<number>((a.length + 1) * w).fill(0);
  const g = (i: number, j: number) => d[i * w + j] ?? 0;
  for (let i = 0; i <= a.length; i++) d[i * w] = i;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i * w + j] = Math.min(g(i - 1, j) + 1, g(i, j - 1) + 1, g(i - 1, j - 1) + (a[i - 1] === b[j - 1] ? 0 : 1));
  return g(a.length, b.length);
}

export function fuzzySearch(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  return CATALOG.map((p) => {
    const terms = [p.name.toLowerCase(), ...p.aliases];
    let best = 99;
    let hit = "";
    for (const t of terms) {
      const score = t.startsWith(s) || t.includes(s) ? 0 : lev(s, t.slice(0, Math.max(s.length, 3)));
      if (score < best) { best = score; hit = t; }
    }
    return { p, best, hit };
  })
    .filter((r) => r.best <= Math.max(1, Math.floor(s.length / 3)))
    .sort((a, b) => a.best - b.best)
    .slice(0, 6);
}

export const rupee = (n: number) => "₹" + (Math.round(n * 100) / 100).toLocaleString("en-IN");
