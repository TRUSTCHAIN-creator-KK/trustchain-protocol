# trustchain-verify

Check a TrustChain record against the Polygon chain yourself.

- Node.js 18 or newer. No dependencies to install.
- Read-only. It reads TrustChain's public record endpoint and public Polygon RPCs.
  It never sends a transaction and needs no keys or account.
- It prints every check it made, what it compared, and what the checks do not show.

## Run it

```sh
git clone https://github.com/TRUSTCHAIN-creator-KK/trustchain-protocol.git
cd trustchain-protocol
node verify/bin/trustchain-verify.js https://trustchain.biz/verify/5c79fbb0
```

You can pass the link or just the Registry ID (`5c79fbb0`). Options:

| Option | What it does |
|---|---|
| `--rpc <url>` | Use this Polygon RPC. Repeat it to give fallbacks. |
| `--record <file>` | Recompute the fingerprint from a party's record file and compare it with the chain. |
| `--json` | Print the full result as JSON. |
| `--timeout <ms>` | Timeout per request. Default 20000. |

Exit code 0 means every check passed, 1 means a check failed, 2 means the tool
could not run (bad input, network down).

## What it checks

| # | Check | How |
|---|---|---|
| 1 | Public record found | `GET agreement_publicProof?publicId=<id>`, the endpoint behind `trustchain.biz/verify/<id>`. |
| 2 | Record lists an anchor | The answer has a fingerprint and a Polygon transaction hash. |
| 3 | RPC is Polygon | `eth_chainId` is 137. |
| 4 | Transaction succeeded | `eth_getTransactionByHash` and `eth_getTransactionReceipt`; status 1. |
| 5 | Sent to the registry | The transaction's `to` is `0x649Bc303d15E173D95B4d379e163868b03cf5Fec`. |
| 6 | Registry code is the published build | Keccak-256 of `eth_getCode` equals the hash of [`contracts/TrustChainRegistry.sol`](../contracts/TrustChainRegistry.sol) as built. |
| 7 | Sent by TrustChain's anchoring wallet | The transaction's `from` is `0xF9505f8763649481DD1f604C92b4c0c2fffE7153`. Anyone can write to the registry, so this matters. |
| 8 | Fingerprint in the transaction matches the record | Decodes `anchor(id, fingerprint, creator, counterparty)` and compares the fingerprint with the one the record shows. |
| 9 | Event matches | The `Anchored` event in the same receipt has `keccak256(id)` as its key and the same ID and fingerprint. |
| 10 | Block time | Reads the block and compares its time with the time in the event. |
| 11 | Still stored | `eth_call getProof(id)` at the latest block returns the same fingerprint and the same time. |
| 12 | Record file ID (optional) | The record file's `agreementId` equals the ID in the transaction. |
| 13 | Recomputed fingerprint (optional) | Keccak-256 of the record file's canonical form equals the fingerprint on-chain. |

## What a pass shows

- The fingerprint was written to TrustChain's registry on Polygon at the block
  time shown, by TrustChain's anchoring wallet.
- The registry still holds it. The contract has no function to change or
  delete an entry.
- TrustChain's public endpoint reports the same fingerprint for that Registry ID.
- With a matching record file: the record's title, terms text, amount and the
  two account IDs existed in exactly that form no later than the block time.

## What it does not show

- **What the fingerprint was made from**, unless you give a record file. The
  fingerprint covers private account IDs, so the agreement text alone cannot
  reproduce it.
- **Who the people are, or that anyone signed.** Signing happens in TrustChain's
  app. Signatures and their times come from TrustChain's database. The two wallet
  slots in each entry are empty.
- **That the Registry ID belongs to this anchor**, beyond TrustChain's word. The
  Registry ID is not written on-chain. The link is the transaction hash that
  TrustChain's endpoint returns.
- **The currency, or any field other than title, terms text and amount.** For
  records made with the app's step-by-step form, the terms text includes the
  scope, deliverables, dates and additional terms. Other fields on the record
  page are not covered.

The record page on trustchain.biz shows the time TrustChain's server saved the
anchor. That is a few seconds after the block time. Use the block time.

## The record file (`--record`)

To recompute the fingerprint you need the inputs TrustChain hashed. Save them as
JSON:

```json
{
  "agreementId": "the 20-character internal record ID",
  "title": "the title, exactly as stored",
  "terms": "the terms text, exactly as stored",
  "amount": 150,
  "parties": ["creator account ID", "counterparty account ID"]
}
```

TrustChain's stored record shape is also accepted: `creatorUid` (or
`parties.originator.uid`) and `parties.counterparty.uid` instead of the
`parties` array, and `id` instead of `agreementId`.

There is no button in the TrustChain app that exports this file yet. Until there
is, this mode is for TrustChain itself, for auditors, and for parties who get
their raw record from TrustChain. A PDF or certificate from the app is not
enough: none of them contains the account IDs.

### Exact rules

The fingerprint is Keccak-256 (the Ethereum variant, not NIST SHA3-256) over the
UTF-8 bytes of:

```js
JSON.stringify({
  id: agreementId,
  title: title || "",
  terms: terms || "",
  amount: amount || "",
  parties: [creatorId || "", counterpartyId || ""],
})
```

- Keys in exactly this order. No spaces.
- `title` and `terms` are used raw: no trimming, no Unicode normalization.
- `amount` keeps its JSON type. The number `150` and the string `"150"` hash
  differently. `0`, `null` or a missing amount become the string `""`.
- A guest who signed without an account has no account ID, so the second party
  entry can be `""`.
- String escaping is JavaScript's `JSON.stringify`: non-ASCII stays as raw
  UTF-8, `/` is not escaped, U+2028 and U+2029 are not escaped.
- In Python, `json.dumps(obj, separators=(",", ":"), ensure_ascii=False)` gives
  the same string, as long as whole-number floats are turned into `int` first
  (Python prints `150.0`, JavaScript prints `150`).

Test vectors (synthetic inputs, hashed by TrustChain's own anchoring code) are
in [`test/record.test.js`](test/record.test.js). The first one:

```
{"id":"TestAgreementId00001","title":"Golf Clubs ","terms":"SCOPE OF WORK:\nSell 1 set\n\nDELIVERABLES:\n1. Clubs","amount":150,"parties":["uidCreatorAAAA","uidCounterBBBB"]}
-> 0x4852491ea3a487a078d6ddac36e5e62e49e87533d492bb5ed6c8b7b44cc83d21
```

## Use it as a library

```js
import { verifyRecord, formatReport } from './verify/index.js';

const result = await verifyRecord('5c79fbb0');
console.log(result.ok);              // true when every required check passed
console.log(result.checks);          // [{ id, label, status: 'pass'|'fail'|'skip', detail }]
console.log(result.facts.blockTime); // '2026-07-26T08:37:21Z'
console.log(formatReport(result));
```

`verifyRecord(input, { rpcUrls, record, timeoutMs, fetch })`. Pass `record` as a
parsed object to run checks 12 and 13. Other exports: `recordFingerprint`,
`canonicalRecordString`, `keccak256`, and the constants in
[`src/constants.js`](src/constants.js).

## Data sources

- Public record endpoint:
  `https://us-central1-trust-chain-cc62c.cloudfunctions.net/agreement_publicProof?publicId=<id>`.
  This is what the public record page calls. It returns the status, the title
  only when the owner made it public, the anchor details, and signed flags with times. It
  never returns names, emails, terms, amount or account IDs.
- Polygon RPCs, tried in order: `polygon.drpc.org`, `1rpc.io/matic`,
  `polygon.gateway.tenderly.co`, `polygon-bor-rpc.publicnode.com`. Some free
  nodes keep only recent history, so a "not found" answer for an old
  transaction moves on to the next one. Free RPCs come and go. Use `--rpc` with
  your own if these fail.

## Tests

```sh
cd verify
node --test                       # offline, uses recorded fixtures
TRUSTCHAIN_LIVE=1 node --test     # adds a live, read-only check of the sample record
node scripts/record-fixtures.js   # re-records test/fixtures from the live sample record
```

The offline fixture in `test/fixtures/` was recorded from the founder's own
sample record, `trustchain.biz/verify/5c79fbb0`. It holds only what the public
endpoint and the public chain return. The record-file path is tested end to end
with synthetic data, because a real record's account IDs are private.

## License

MIT. See [`../LICENSE`](../LICENSE).

Not legal advice.
