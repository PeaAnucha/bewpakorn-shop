import { GHOST_PREFIX } from './types.ts';
import type { BundleItem, Ghost, Product } from './types.ts';

export const isGhostItem = (it: { productId: string }) => it.productId.startsWith(GHOST_PREFIX);

export const ghostNameOf = (it: BundleItem): string =>
  (it.ghostName || it.productId.slice(GHOST_PREFIX.length)).trim();

const norm = (s: string) => s.trim().toLowerCase();

const safeRatio = (r: unknown): number => {
  const n = Math.floor(Number(r));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

export interface BreakdownRow {
  name: string;
  ghost: boolean;
  ratio: number;
  stock: number;
  possible: number;
}

/**
 * คำนวณสต็อกของ Bundle (ต้องให้ผลเหมือน calc_bundle_stock ในฐานข้อมูล)
 * สต็อกเซ็ต = ค่าต่ำสุดของ floor(สต็อกส่วนประกอบ / จำนวนต่อชุด)
 *  - สินค้าในระบบที่หาไม่เจอจะถูกข้าม
 *  - Ghost: ถ้า item มี ghostStock (ค่าที่กรอกในฟอร์ม) ใช้ค่านั้น ไม่งั้นดูจากตาราง ghost_items
 */
export function calcBundle(items: BundleItem[], products: Product[], ghosts: Ghost[]) {
  const byId = new Map(products.filter((p) => !p.isBundle).map((p) => [p.id, p]));
  const ghostByName = new Map(ghosts.map((g) => [norm(g.name), g]));
  const breakdown: BreakdownRow[] = [];
  let min: number | null = null;

  for (const it of items) {
    if (!it.productId) continue;
    const ratio = safeRatio(it.ratio);
    let name: string;
    let stock: number;
    let ghost = false;
    if (isGhostItem(it)) {
      const gn = ghostNameOf(it);
      if (!gn) continue;
      ghost = true;
      name = gn;
      stock = it.ghostStock !== undefined ? it.ghostStock : (ghostByName.get(norm(gn))?.stock ?? 0);
    } else {
      const p = byId.get(it.productId);
      if (!p) continue;
      name = p.name;
      stock = p.stock;
    }
    stock = Math.max(0, Math.floor(Number(stock) || 0));
    const possible = Math.floor(stock / ratio);
    breakdown.push({ name, ghost, ratio, stock, possible });
    if (min === null || possible < min) min = possible;
  }
  return { computed: min ?? 0, breakdown };
}
