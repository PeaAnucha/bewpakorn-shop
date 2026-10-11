export const GHOST_PREFIX = '__ghost__:';

export interface MapRow {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  sortOrder: number | null;
}

export interface ShopIdRow {
  id: string;
  shopId: string;
  password: string | null;
  mapId: string | null;
  note: string | null;
  sortOrder: number | null;
}

/** ส่วนประกอบของ Bundle: สินค้าในระบบ หรือ Ghost (Non-sale component) */
export interface BundleItem {
  productId: string; // รหัสสินค้า หรือ "__ghost__:<ชื่อ>"
  ratio: number; // จำนวนที่ใช้ต่อ 1 ชุด
  ghostName?: string;
  ghostStock?: number; // ใช้เฉพาะในฟอร์ม/พรีวิว ฐานข้อมูลเก็บสต็อก ghost ในตาราง ghost_items
}

export interface Product {
  id: string;
  name: string;
  mapId: string | null;
  shopIdRef: string | null;
  stock: number;
  description: string | null;
  status: string;
  thumbnail: string | null;
  isBundle: boolean;
  bundleItems: BundleItem[];
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ghost {
  id: string;
  name: string;
  stock: number;
  note: string | null;
  sortOrder: number | null;
  updatedAt: string;
}
