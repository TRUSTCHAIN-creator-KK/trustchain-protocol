import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRecordString, recordFingerprint } from '../src/record.js';

// Synthetic test vectors. They were produced by running TrustChain's own
// anchoring hash function on these made-up inputs. No real record or
// account ID appears here.

test('vector 1: export shape, numeric amount, trailing space kept', () => {
  const record = {
    agreementId: 'TestAgreementId00001',
    title: 'Golf Clubs ',
    terms: 'SCOPE OF WORK:\nSell 1 set\n\nDELIVERABLES:\n1. Clubs',
    amount: 150,
    parties: ['uidCreatorAAAA', 'uidCounterBBBB'],
  };
  assert.equal(
    canonicalRecordString(record),
    '{"id":"TestAgreementId00001","title":"Golf Clubs ","terms":"SCOPE OF WORK:\\nSell 1 set\\n\\nDELIVERABLES:\\n1. Clubs","amount":150,"parties":["uidCreatorAAAA","uidCounterBBBB"]}',
  );
  assert.equal(recordFingerprint(record), '0x4852491ea3a487a078d6ddac36e5e62e49e87533d492bb5ed6c8b7b44cc83d21');
});

test('vector 1 again, in the stored shape (creatorUid plus parties object)', () => {
  const record = {
    id: 'TestAgreementId00001',
    title: 'Golf Clubs ',
    terms: 'SCOPE OF WORK:\nSell 1 set\n\nDELIVERABLES:\n1. Clubs',
    amount: 150,
    creatorUid: 'uidCreatorAAAA',
    parties: { counterparty: { uid: 'uidCounterBBBB' } },
  };
  assert.equal(recordFingerprint(record), '0x4852491ea3a487a078d6ddac36e5e62e49e87533d492bb5ed6c8b7b44cc83d21');
});

test('vector 2: amount 0 becomes the empty string, missing counterparty becomes ""', () => {
  const record = { agreementId: 'TestAgreementId00002', title: 'Zero', terms: 't', amount: 0, creatorUid: 'u1' };
  assert.equal(
    canonicalRecordString(record),
    '{"id":"TestAgreementId00002","title":"Zero","terms":"t","amount":"","parties":["u1",""]}',
  );
  assert.equal(recordFingerprint(record), '0x79b86468e18b194b530dd943872793e916e0e9061502cb18e105a805e9adcc1f');
});

test('vector 3: a string amount hashes differently from a number', () => {
  const asString = { agreementId: 'TestAgreementId00003', title: 'Str', terms: 't', amount: '150', creatorUid: 'u1' };
  assert.equal(recordFingerprint(asString), '0x0ee163e737958a75474de4dbe1b92267d66b2d5658e3c97c0f834ce401022237');
  assert.notEqual(recordFingerprint({ ...asString, amount: 150 }), recordFingerprint(asString));
});

test('vector 4: non-ASCII, a raw U+2028, escaped quote and tab, legacy originator uid', () => {
  const record = {
    agreementId: 'TestAgreementId00004',
    title: 'Привет "q" \u2028 é',
    terms: 'tab\there',
    amount: 99.5,
    parties: { originator: { uid: 'legacyUid' }, counterparty: { uid: 'c' } },
  };
  const canonical = canonicalRecordString(record);
  assert.ok(canonical.includes('\u2028'), 'U+2028 stays raw, as JSON.stringify leaves it');
  assert.ok(canonical.includes('\\"q\\"'));
  assert.ok(canonical.includes('tab\\there'));
  assert.equal(recordFingerprint(record), '0x4348d978fbc17eb19967738c4145cd88d8987c1eb6041a0331fe91441b5c329c');
});

test('creatorUid wins over parties.originator.uid', () => {
  const a = { agreementId: 'X', creatorUid: 'one', parties: { originator: { uid: 'two' } } };
  assert.match(canonicalRecordString(a), /"parties":\["one",""\]/);
});

test('a record file without an ID is refused with a clear message', () => {
  assert.throws(() => canonicalRecordString({ title: 'x' }), /agreementId/);
  assert.throws(() => canonicalRecordString(null), /JSON object/);
  assert.throws(() => canonicalRecordString({ agreementId: 'X', parties: ['only one'] }), /exactly two/);
});

test('the agreement text alone does not reproduce a fingerprint', () => {
  // Same title, terms and amount, different hidden account IDs: different fingerprints.
  const base = { agreementId: 'TestAgreementId00001', title: 'T', terms: 'Same text', amount: 10 };
  const a = recordFingerprint({ ...base, parties: ['accountA', 'accountB'] });
  const b = recordFingerprint({ ...base, parties: ['accountC', 'accountD'] });
  assert.notEqual(a, b);
});
