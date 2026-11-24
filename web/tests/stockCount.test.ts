// ทดสอบลอจิกหน้านับสต็อก: สรุปรอบ, ฉบับร่าง, การหาแมพ/Account/การ์ดถัดไป และการอัปเดตยอดในเครื่องหลังบันทึก
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyCountedStock, buildStockCountItems, findNextPendingAccount, findNextPendingMap, parseStockDraft,
  planNextAfterCount, stockLevelMatches, summarizeStockCount, type StockCountItem,
} from '../src/lib/stockCount.ts';

const P = (o: any) => ({ id: 'x', name: 'x', mapId: null, shopIdRef: null, stock: 0, description: null, status: 'active', thumbnail: null,
  isBundle: false, bundleItems: [], sortOrder: null, createdAt: '', updatedAt: 'old', ...o });
const G = (o: any) => ({ id: 'g', name: 'g', stock: 0, note: null, sortOrder: null, updatedAt: 'old', ...o });
const item = (key: string, ...locations: [string | null, string | null][]): StockCountItem =>
  ({ key, locations: locations.map(([mapId, shopIdRef]) => ({ mapId, shopIdRef })) });

test('summary separates counted, skipped and pending items', () => {
  const bundleA = P({ id: 'bundle-a', mapId: 'm1', isBundle: true });
  const bundleB = P({ id: 'bundle-b', mapId: 'm2', isBundle: true });
  const countItems = buildStockCountItems([
    P({ id: 'verified', mapId: 'm1' }),
    P({ id: 'skipped', mapId: 'm1' }),
    P({ id: 'unassigned', mapId: 'm2' }),
    P({ id: 'banned', mapId: 'm2', shopIdRef: 'banned-account' }),
    P({ id: 'inactive', status: 'inactive' }),
    bundleA, bundleB,
  ], [G({ id: 'shared' }), G({ id: 'only-skipped' }), G({ id: 'no-map' })],
  new Map([['shared', [bundleA, bundleB]], ['only-skipped', [bundleA]]]), new Set(['banned-account\u0000m2']));
  const alreadyCounted = new Set(['p:verified']);
  const skippedSummary = summarizeStockCount(countItems, alreadyCounted, new Set(['m1']));
  assert.equal(skippedSummary.counted, 1);
  assert.equal(skippedSummary.skipped, 2);
  assert.deepEqual(skippedSummary.pending.map((i) => i.key), ['p:unassigned', 'g:shared', 'g:no-map']);
  const restoredSummary = summarizeStockCount(countItems, alreadyCounted, new Set());
  assert.equal(restoredSummary.counted, 1);
  assert.equal(restoredSummary.skipped, 0);
  assert(restoredSummary.pending.some((i) => i.key === 'p:skipped'), 'restored map comes back as pending');
});

test('parseStockDraft keeps only valid entries and survives bad JSON', () => {
  assert.deepEqual(parseStockDraft('{"roundId":"a","entries":{"p:zero":{"stock":0,"expectedStock":7},"g:bad":{"stock":-1,"expectedStock":0}}}'),
    { roundId: 'a', entries: { 'p:zero': { stock: 0, expectedStock: 7 } } });
  assert.deepEqual(parseStockDraft('not json'), { roundId: null, entries: {} });
  assert.deepEqual(parseStockDraft(null), { roundId: null, entries: {} });
  assert.deepEqual(parseStockDraft('{"roundId":5,"entries":{}}'), { roundId: null, entries: {} });
});

test('stockLevelMatches', () => {
  assert.equal(stockLevelMatches(5, 'low', 5), true);
  assert.equal(stockLevelMatches(6, 'low', 5), false);
  assert.equal(stockLevelMatches(0, 'zero', 5), true);
  assert.equal(stockLevelMatches(1, 'zero', 5), false);
  assert.equal(stockLevelMatches(6, 'ok', 5), true);
  assert.equal(stockLevelMatches(5, 'ok', 5), false);
  assert.equal(stockLevelMatches(0, '', 5), true);
});

const maps = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
const accounts = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];

test('findNextPendingMap wraps around, skips skipped maps and never returns the current map', () => {
  const pending = [item('p:1', ['m1', 'a1']), item('p:3', ['m3', 'a1'])];
  assert.equal(findNextPendingMap(maps, 'm1', pending, new Set())?.id, 'm3');
  assert.equal(findNextPendingMap(maps, 'm3', pending, new Set())?.id, 'm1', 'wraps to the start');
  assert.equal(findNextPendingMap(maps, 'm1', pending, new Set(['m3'])), undefined, 'skipped map is not offered');
  assert.equal(findNextPendingMap(maps, 'm1', [item('p:1', ['m1', 'a1'])], new Set()), undefined, 'current map is excluded');
});

test('findNextPendingMap checks every map when the current one is unknown (including the last one)', () => {
  // เดิมเมื่อหาแมพปัจจุบันไม่เจอ ระบบจะข้ามแมพสุดท้ายในรายการไป
  assert.equal(findNextPendingMap(maps, '', [item('p:3', ['m3', null])], new Set())?.id, 'm3');
  assert.equal(findNextPendingMap(maps, 'deleted-map', [item('p:1', ['m1', null])], new Set())?.id, 'm1');
});

test('findNextPendingAccount only looks inside the given map', () => {
  const pending = [item('p:1', ['m1', 'a3']), item('p:2', ['m2', 'a2'])];
  assert.equal(findNextPendingAccount(accounts, 'm1', 'a1', pending)?.id, 'a3');
  assert.equal(findNextPendingAccount(accounts, 'm1', 'a3', pending), undefined, 'current account excluded');
  assert.equal(findNextPendingAccount(accounts, 'm1', 'gone', pending)?.id, 'a3', 'unknown current account checks all');
});

test('planNextAfterCount: next visible card wraps after the current card', () => {
  const pending = [item('p:a', ['m1', 'a1']), item('p:c', ['m1', 'a1'])];
  const base = { pending, skippedMaps: new Set<string>(), mapId: 'm1', accountId: 'a1', maps, accounts };
  assert.deepEqual(planNextAfterCount({ ...base, sequence: ['p:a', 'p:b', 'p:c'], currentKey: 'p:b' }), { kind: 'card', key: 'p:c' });
  assert.deepEqual(planNextAfterCount({ ...base, sequence: ['p:a', 'p:b', 'p:c'], currentKey: 'p:c' }), { kind: 'card', key: 'p:a' });
});

test('planNextAfterCount: round finished', () => {
  const base = { sequence: ['p:a'], currentKey: 'p:a', pending: [], mapId: 'm1', accountId: '', maps, accounts };
  assert.deepEqual(planNextAfterCount({ ...base, skippedMaps: new Set() }), { kind: 'done', hasSkipped: false });
  assert.deepEqual(planNextAfterCount({ ...base, skippedMaps: new Set(['m2']) }), { kind: 'done', hasSkipped: true });
});

test('planNextAfterCount: account finished moves to the next account in the same map', () => {
  const step = planNextAfterCount({ sequence: ['p:a'], currentKey: 'p:a', pending: [item('p:z', ['m1', 'a2'])], skippedMaps: new Set(),
    mapId: 'm1', accountId: 'a1', maps, accounts });
  assert.deepEqual(step, { kind: 'account', mapId: 'm1', account: { id: 'a2' } });
});

test('planNextAfterCount: pending item without account in this map shows the whole map', () => {
  const step = planNextAfterCount({ sequence: ['p:a'], currentKey: 'p:a', pending: [item('p:z', ['m1', null])], skippedMaps: new Set(),
    mapId: 'm1', accountId: 'a1', maps, accounts });
  assert.deepEqual(step, { kind: 'map', mapId: 'm1' });
});

test('planNextAfterCount: map finished moves to the next map, or to all maps when none is left', () => {
  const next = planNextAfterCount({ sequence: ['p:a'], currentKey: 'p:a', pending: [item('p:z', ['m2', 'a1'])], skippedMaps: new Set(),
    mapId: 'm1', accountId: 'a1', maps, accounts });
  assert.deepEqual(next, { kind: 'map', mapId: 'm2', map: { id: 'm2' } });
  const noMap = planNextAfterCount({ sequence: ['p:a'], currentKey: 'p:a', pending: [item('g:z')], skippedMaps: new Set(),
    mapId: 'm1', accountId: '', maps, accounts });
  assert.deepEqual(noMap, { kind: 'map', mapId: '', map: undefined }, 'ghost with no map: go to the all-maps view');
});

test('planNextAfterCount: pending items hidden by other filters', () => {
  const step = planNextAfterCount({ sequence: ['p:a'], currentKey: 'p:a', pending: [item('p:z', ['m1', 'a1'])], skippedMaps: new Set(),
    mapId: 'm1', accountId: 'a1', maps, accounts });
  assert.deepEqual(step, { kind: 'elsewhere' });
  const allMaps = planNextAfterCount({ sequence: ['p:a'], currentKey: 'p:a', pending: [item('p:z', ['m1', 'a1'])], skippedMaps: new Set(),
    mapId: '', accountId: '', maps, accounts });
  assert.deepEqual(allMaps, { kind: 'elsewhere' });
});

test('applyCountedStock updates counted rows and recalculates only bundles that use them', () => {
  const products = [
    P({ id: 'a', stock: 10 }),
    P({ id: 'b', stock: 4 }),
    P({ id: 'set-a', isBundle: true, stock: 5, bundleItems: [{ productId: 'a', ratio: 2 }] }),
    // เซ็ตที่ไม่เกี่ยวกับของที่นับ ต้องไม่ถูกคำนวณใหม่ แม้ยอดที่เก็บไว้จะไม่ตรงสูตรในเครื่อง
    P({ id: 'set-b', isBundle: true, stock: 99, bundleItems: [{ productId: 'b', ratio: 1 }] }),
  ];
  const next = applyCountedStock(products, [], { products: [{ id: 'a', stock: 7 }], ghosts: [] }, 'new');
  const byId = new Map(next.products.map((p) => [p.id, p]));
  assert.deepEqual([byId.get('a')!.stock, byId.get('a')!.updatedAt], [7, 'new']);
  assert.deepEqual([byId.get('set-a')!.stock, byId.get('set-a')!.updatedAt], [3, 'new'], 'floor(7/2)');
  assert.equal(byId.get('set-b'), products[3], 'unrelated bundle left untouched');
  assert.equal(byId.get('b'), products[1], 'uncounted product left untouched');
});

test('applyCountedStock keeps updatedAt of a bundle whose stock did not change', () => {
  const products = [P({ id: 'a', stock: 10 }), P({ id: 'set', isBundle: true, stock: 5, bundleItems: [{ productId: 'a', ratio: 2 }] })];
  const next = applyCountedStock(products, [], { products: [{ id: 'a', stock: 11 }], ghosts: [] }, 'new');
  assert.equal(next.products[1], products[1], 'floor(11/2) is still 5');
  assert.equal(next.products[0].updatedAt, 'new', 'counted product gets the save time even if the value is unchanged elsewhere');
});

test('applyCountedStock uses ghost_items stock like the database, not the ghostStock saved in JSON', () => {
  const ghosts = [G({ id: 'g1', name: 'กล่อง', stock: 9 })];
  const products = [
    P({ id: 'a', stock: 100 }),
    P({ id: 'set', isBundle: true, stock: 4, bundleItems: [{ productId: '__ghost__:กล่อง', ghostName: ' กล่อง ', ghostStock: 50, ratio: 2 }, { productId: 'a', ratio: 1 }] }),
  ];
  const next = applyCountedStock(products, ghosts, { products: [], ghosts: [{ id: 'g1', stock: 3 }] }, 'new');
  assert.deepEqual([next.ghosts[0].stock, next.ghosts[0].updatedAt], [3, 'new']);
  assert.equal(next.products[1].stock, 1, 'floor(3/2) from the table, ignoring stale ghostStock 50');
});

test('applyCountedStock falls back to ghostStock only for a ghost missing from the table', () => {
  const products = [
    P({ id: 'a', stock: 8 }),
    P({ id: 'set', isBundle: true, stock: 0, bundleItems: [{ productId: '__ghost__:ไม่มีในตาราง', ghostStock: 6, ratio: 3 }, { productId: 'a', ratio: 1 }] }),
  ];
  const next = applyCountedStock(products, [], { products: [{ id: 'a', stock: 5 }], ghosts: [] }, 'new');
  assert.equal(next.products[1].stock, 2, 'min(floor(6/3), 5)');
});

test('applyCountedStock never writes a count onto a bundle row', () => {
  const products = [P({ id: 'set', isBundle: true, stock: 2, bundleItems: [] })];
  const next = applyCountedStock(products, [], { products: [{ id: 'set', stock: 40 }], ghosts: [] }, 'new');
  assert.equal(next.products[0], products[0]);
});
