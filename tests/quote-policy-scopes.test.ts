import assert from 'node:assert/strict';
import test from 'node:test';
import {defaultQuotePolicy} from '../lib/quote-policy';
import {mergeQuotePolicyScope} from '../lib/quote-policy-scopes';

test('saving Autocab source preserves shared price additions',()=>{
 const current={...defaultQuotePolicy,lowPercent:12};
 const stale={...defaultQuotePolicy,priceUnit:'pence' as const};
 const merged=mergeQuotePolicyScope(current,stale,'autocab');
 assert.equal(merged.lowPercent,12);
 assert.equal(merged.priceUnit,'pence');
});

test('saving shared rules preserves Autocab response settings and booking timing',()=>{
 const current={...defaultQuotePolicy,priceUnit:'pence' as const,minPrebookMinutes:45};
 const stale={...defaultQuotePolicy,lowPercent:12};
 const merged=mergeQuotePolicyScope(current,stale,'shared');
 assert.equal(merged.lowPercent,12);
 assert.equal(merged.priceUnit,'pence');
 assert.equal(merged.minPrebookMinutes,45);
});
