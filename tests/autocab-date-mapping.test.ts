import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseDate} from '../lib/autocab/booking-mappers';
test('Autocab naive booking times are UK wall times; offsets, winter and ambiguous DST are handled explicitly',()=>{
 assert.equal(normaliseDate('2026-10-22T04:54:41.4703388')?.toISOString(),'2026-10-22T03:54:41.470Z');
 assert.equal(normaliseDate('2026-10-22T05:04:51.8446053+01:00')?.toISOString(),'2026-10-22T04:04:51.844Z');
 assert.equal(normaliseDate('2026-12-22T04:54:00')?.toISOString(),'2026-12-22T04:54:00.000Z');
 assert.equal(normaliseDate('2026-10-25T01:30:00'),null);
 assert.equal(normaliseDate('0001-01-01T00:00:00Z'),null);
});
