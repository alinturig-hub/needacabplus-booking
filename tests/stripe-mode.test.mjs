import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStripeKeys,mergeStripeSecrets} from '../lib/stripe-mode.ts';
test('wallet accepts sandbox keys without a payment webhook but rejects mixed modes',()=>{
 assert.doesNotThrow(()=>validateStripeKeys('test','pk_test_example','sk_test_example'));
 assert.throws(()=>validateStripeKeys('test','pk_test_example','sk_live_example'));
 assert.throws(()=>validateStripeKeys('test','pk_live_example','sk_test_example'));
 assert.throws(()=>validateStripeKeys('test','pk_test_example',''));
});
test('changing environments never retains live secret or signing keys in sandbox',()=>{
 const live={secretKey:'sk_live_example',webhookSecret:'whsec_live'};
 assert.deepEqual(mergeStripeSecrets('test','live',live,{secretKey:'sk_test_example'}),{secretKey:'sk_test_example',webhookSecret:''});
 assert.deepEqual(mergeStripeSecrets('live','live',live,{}),live);
 assert.deepEqual(mergeStripeSecrets('test','test',{secretKey:'sk_test_example'},{webhookSecret:'whsec_test'}),{secretKey:'sk_test_example',webhookSecret:'whsec_test'});
});
