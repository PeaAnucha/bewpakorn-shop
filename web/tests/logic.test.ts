// รัน: node --experimental-strip-types tests/logic.test.ts
import assert from 'node:assert/strict';
import { calcBundle } from '../src/lib/bundle.ts';
import { cleanPerms, toggleAction } from '../src/lib/perms.ts';
import { userSetCommand } from '../src/lib/cmd.ts';
import { emptyShopIds, filterSortProducts, mergeIntoGlobal, orderShopIds } from '../src/lib/products.ts';

const P = (o: any) => ({ id: 'x', name: 'x', mapId: null, shopIdRef: null, stock: 0, description: null, status: 'active', thumbnail: null,
  isBundle: false, bundleItems: [], sortOrder: null, createdAt: '', updatedAt: '', ...o });
const G = (o: any) => ({ id: 'g', name: 'g', stock: 0, note: null, sortOrder: null, updatedAt: '', ...o });

// ── calcBundle (ต้องตรงกับ calc_bundle_stock ในฐานข้อมูล) ──
const prods = [P({ id: 'a', name: 'A', stock: 23 }), P({ id: 'b', name: 'B', stock: 10 }), P({ id: 'bundle', isBundle: true, stock: 99 })];
const ghosts = [G({ name: 'กล่อง', stock: 9 })];
assert.equal(calcBundle([{ productId: 'a', ratio: 3 }], prods, ghosts).computed, 7, 'floor(23/3)');
assert.equal(calcBundle([{ productId: 'a', ratio: 3 }, { productId: 'b', ratio: 5 }], prods, ghosts).computed, 2, 'min of 7 and 2');
assert.equal(calcBundle([{ productId: 'a', ratio: 0 }], prods, ghosts).computed, 23, 'ratio 0 => 1');
assert.equal(calcBundle([{ productId: 'missing', ratio: 1 }], prods, ghosts).computed, 0, 'missing product skipped => 0');
assert.equal(calcBundle([{ productId: 'missing', ratio: 1 }, { productId: 'a', ratio: 1 }], prods, ghosts).computed, 23, 'missing skipped, others count');
assert.equal(calcBundle([{ productId: 'bundle', ratio: 1 }], prods, ghosts).computed, 0, 'a bundle cannot be a component');
assert.equal(calcBundle([{ productId: '__ghost__:  กล่อง ', ratio: 2 }], prods, ghosts).computed, 4, 'ghost looked up case/space-insensitively');
assert.equal(calcBundle([{ productId: '__ghost__:กล่อง', ratio: 2, ghostStock: 1 }], prods, ghosts).computed, 0, 'form override wins');
assert.equal(calcBundle([{ productId: '__ghost__:ใหม่', ratio: 1 }], prods, ghosts).computed, 0, 'unknown ghost => 0 stock');
assert.equal(calcBundle([], prods, ghosts).computed, 0);

// ── filter / sort ──
const maps = [{ id: 'm1', name: 'Anime', icon: null, description: null }, { id: 'm2', name: 'Blox', icon: null, description: null }];
const shops = [
  { id: 's1', shopId: 'ACC-1', password: null, mapId: 'm1', note: null },
  { id: 's2', shopId: 'ACC-2', password: null, mapId: 'm1', note: null },
  { id: 's3', shopId: 'ACC-3', password: null, mapId: 'm2', note: null },
];
const list = [
  P({ id: '1', name: 'ดาบ', mapId: 'm1', shopIdRef: 's1', stock: 5, sortOrder: 2 }),
  P({ id: '2', name: 'กระบี่', mapId: 'm1', shopIdRef: 's1', stock: 0, sortOrder: 1, status: 'inactive' }),
  P({ id: '3', name: 'Set', mapId: 'm2', shopIdRef: 's3', stock: 9, isBundle: true }),
];
const F = { q: '', status: '', type: 'all', mapId: 'all', sort: 'stock-desc' } as const;
assert.deepEqual(filterSortProducts(list, maps, shops, F).map((p) => p.id), ['3', '1', '2'], 'stock desc');
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, sort: 'custom' }).map((p) => p.id), ['2', '1', '3'], 'custom; null last');
{ const ids = filterSortProducts(list, maps, shops, { ...F, sort: 'name' }).map((p) => p.id); assert.ok(ids.indexOf('2') < ids.indexOf('1'), 'name (th): กระบี่ before ดาบ'); }
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, q: 'acc-3' }).map((p) => p.id), ['3'], 'search by shop id');
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, q: 'anime' }).map((p) => p.id), ['1', '2'], 'search by map name');
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, type: 'bundle' }).map((p) => p.id), ['3']);
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, type: 'normal' }).map((p) => p.id).sort(), ['1', '2']);
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, status: 'inactive' }).map((p) => p.id), ['2']);
assert.deepEqual(filterSortProducts(list, maps, shops, { ...F, mapId: 'm2' }).map((p) => p.id), ['3']);

// ── empty / out-of-stock account IDs ──
const e = emptyShopIds(shops, list, 'm1');
assert.deepEqual(e.empty.map((s) => s.id), ['s2'], 's2 has no products');
assert.deepEqual(e.outOfStock.map((s) => s.id), [], 's1 has stock 5');
const all = emptyShopIds(shops, list.map((p) => (p.id === '1' ? { ...p, stock: 0 } : p)), 'all');
assert.deepEqual(all.outOfStock.map((s) => s.id), ['s1'], 's1 total stock 0');
assert.deepEqual(all.empty.map((s) => s.id), ['s2']);

// ── custom/map sort follow the user's map order (Zed first even though Alpha < Zed alphabetically) ──
{
  const M = [{ id: 'z', name: 'Zed', icon: null, description: null, sortOrder: 1 }, { id: 'a', name: 'Alpha', icon: null, description: null, sortOrder: 2 }];
  const L = [P({ id: 'p1', name: 'A1', mapId: 'a', sortOrder: 1 }), P({ id: 'p2', name: 'Z2', mapId: 'z', sortOrder: 2 }), P({ id: 'p3', name: 'Z1', mapId: 'z', sortOrder: 1 }), P({ id: 'p4', name: 'N', mapId: null, sortOrder: 1 })];
  const G = { q: '', status: '', type: 'all', mapId: 'all', sort: 'custom' } as const;
  assert.deepEqual(filterSortProducts(L, M, [], G).map((p) => p.id), ['p3', 'p2', 'p1', 'p4'], 'custom: map order, then sortOrder; no-map last');
  assert.deepEqual(filterSortProducts(L, M, [], { ...G, sort: 'map' }).map((p) => p.id), ['p3', 'p2', 'p1', 'p4'], 'map sort follows user map order');
  const S = [
    { id: 's1', shopId: 'b', password: null, mapId: 'a', note: null, sortOrder: 2 },
    { id: 's2', shopId: 'a', password: null, mapId: 'a', note: null, sortOrder: 1 },
    { id: 's3', shopId: 'c', password: null, mapId: 'z', note: null, sortOrder: 9 },
    { id: 's4', shopId: 'd', password: null, mapId: null, note: null, sortOrder: 1 },
    { id: 's5', shopId: 'e', password: null, mapId: 'z', note: null, sortOrder: null },
  ];
  assert.deepEqual(orderShopIds(S).map((s) => s.id), ['s2', 's4', 's1', 's3', 's5'], 'shop ids: one global order (null last), maps ignored');
  // reordering a filtered subset keeps everyone else exactly where they were
  const g = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(mergeIntoGlobal(g, ['e', 'b', 'd']), ['a', 'e', 'c', 'b', 'd', 'f'], 'subset b,d,e permuted inside its own slots');
  assert.deepEqual(mergeIntoGlobal(g, ['f', 'e', 'd', 'c', 'b', 'a']), ['f', 'e', 'd', 'c', 'b', 'a'], 'full list = plain reorder');
  assert.deepEqual(mergeIntoGlobal(g, ['b', 'd']), g, 'unchanged subset = unchanged list');
  assert.deepEqual(mergeIntoGlobal(g, ['d', 'b']).filter((x) => !['b', 'd'].includes(x)), ['a', 'c', 'e', 'f'], 'others untouched');
}

// ── permission matrix rules ──
{
  let m: any = {};
  m = toggleAction(m, 'products', 'edit', true);
  assert.deepEqual(m.products, ['view', 'edit'], 'ticking edit also ticks view');
  m = toggleAction(m, 'products', 'export', true);
  assert.deepEqual(m.products, ['view', 'edit', 'export'], 'canonical order');
  m = toggleAction(m, 'products', 'edit', false);
  assert.deepEqual(m.products, ['view', 'export'], 'unticking edit keeps others');
  m = toggleAction(m, 'products', 'view', false);
  assert.deepEqual(m.products, [], 'unticking view clears the whole page');
  assert.deepEqual(cleanPerms({ a: ['edit', 'view', 'view'], b: [], c: ['view'] }), { a: ['view', 'edit'], c: ['view'] }, 'cleanPerms drops empty + dedupes + orders');
}

// ── command generator ──
{
  const r = userSetCommand({ username: 'mark2', pin: '123456', roles: ['staff', 'admin_สำรอง'], employeeId: 'ABC123', displayName: 'มาร์ค' });
  assert.ok(r.ok && r.cmd === 'npm run user:set -- "mark2" "123456" --roles "staff,admin_สำรอง" --employee "ABC123" --name "มาร์ค"', r.ok ? r.cmd : r.error);
  const reset = userSetCommand({ username: 'mark2', pin: 'newpin99' });
  assert.ok(reset.ok && reset.cmd === 'npm run user:set -- "mark2" "newpin99"');
  assert.equal(userSetCommand({ username: 'x', pin: '123' }).ok, false, 'PIN < 6 rejected');
  assert.equal(userSetCommand({ username: 'a"b', pin: '123456' }).ok, false, 'quote rejected');
  assert.equal(userSetCommand({ username: 'a', pin: '12$456' }).ok, false, '$ rejected');
  assert.equal(userSetCommand({ username: '  ', pin: '123456' }).ok, false, 'empty username rejected');
  const rolesOnly = userSetCommand({ username: 'u', roles: ['staff'] });
  assert.ok(rolesOnly.ok && rolesOnly.cmd === 'npm run user:set -- "u" --roles "staff"');
}

console.log('logic tests: all passed');
