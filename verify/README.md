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

Optional: `npm install -g ./verify` (or `cd verify && npm link`) gives you the
`trustchain-verify` command, so you can type `trustchain-verify 5c79fbb0`.

You can pass the link or just the Registry ID (`5c79fbb0`). Options:

| Option | What it does |
|---|---|
| `--rpc <url>` | Use this Polygon RPC. Repeat it to give fallbacks. Fallbacks are tried in order. They are not compared with each other. |
| `--record <file>` | Recompute the fingerprint from a record file and compare it with the chain. The app has no export for this file yet (see below). |
| `--json` | Print the full result as JSON. |
| `--timeout <ms>` | Timeout per request, a whole number of milliseconds. Default 20000. |

Exit code 0 means every check passed, 1 means a check failed, 2 means the tool
could not run or could not finish (bad input, network down, or no RPC returned
the transaction). Exit code 2 is never a verdict on the record.

## What it checks

| # | Check | How |
|---|---|---|
| 1 | Public record found | `GET agreement_publicProof?publicId=<id>`, the endpoint behind `trustchain.biz/verify/<id>`. |
| 2 | Record lists an anchor | The answer has a fingerprint and a Polygon transaction hash. |
| 3 | RPC is Polygon | `eth_chainId` is 137. Any fallback RPC is asked for its chain ID before it is used, and skipped if it is not 137. |
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
  fingerprint covers both account IDs, which are not shown on any public page,
  so the agreement text alone cannot reproduce it.
- **Who the people are, or that anyone signed.** Signing happens in TrustChain's
  app. Signatures and their times come from TrustChain's database. The two wallet
  slots are empty in every TrustChain anchor so far.
- **That the Registry ID belongs to this anchor**, beyond TrustChain's word. The
  Registry ID is not written on-chain. The link is the transaction hash that
  TrustChain's endpoint returns.
- **The currency, or any field other than title, terms text and amount.** For
  records made with the app's step-by-step form, the terms text includes the
  scope, deliverables, dates and additional terms. Other fields on the record
  page are not covered.

The record page on trustchain.biz shows the time TrustChain's server saved the
anchor. It is usually a few seconds after the block time. Use the block time.

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
- There is no secret salt. The fingerprint hides its inputs only as well as they
  are hard to guess. The record ID is on-chain, so someone who also has both
  account IDs can test guesses of a short title, terms and amount against it.

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
parsed object to run checks 12 and 13. The result never contains the canonical
string, because it holds both account IDs. Call `canonicalRecordString(record)`
yourself if you need it. Other exports: `recordFingerprint`, `keccak256`, and
the constants in [`src/constants.js`](src/constants.js).

`verifyRecord` rejects (and the command exits 2) when it cannot finish: the
endpoint or every RPC is unreachable, or no RPC returns the transaction.

## Data sources

- Public record endpoint:
  `https://us-central1-trust-chain-cc62c.cloudfunctions.net/agreement_publicProof?publicId=<id>`.
  This is the call the public record page makes, and the only call this tool
  makes to TrustChain. That call returns the status, the title only when the
  owner made it public, the anchor details, and signed flags with times. It
  never returns names, emails, terms, amount or account IDs.
- Polygon RPCs, tried in order: `polygon.drpc.org`,
  `polygon.gateway.tenderly.co`, `1rpc.io/matic`,
  `polygon-bor-rpc.publicnode.com`. Some free nodes keep only recent history,
  so a "not found" answer for an old transaction moves on to the next one. On
  2026-10-08 the last two answered "not found" for TrustChain's July 2026
  anchor, so they are last. If every RPC says "not found", the tool exits 2 and
  says so. It does not report FAIL for that. Free RPCs come and go. Use `--rpc`
  with your own if these fail.
- Responses larger than 5 MB are not read.

### Who sees what

- TrustChain's endpoint sees your IP address and the Registry ID you check.
- Each RPC the tool asks sees your IP address and the transaction hash. When
  an RPC answers "not found", the same question goes to the next one, so
  several RPC operators can see it.
- The record file never leaves your machine. Only its fingerprint is compared,
  locally.
- To keep the RPC part to yourself, use your own Polygon node with `--rpc`.
  The tool warns when an RPC URL uses plain `http://`.
- The output shows only the scheme and host of an RPC URL, so an API key in
  the URL is not printed.

## Tests

```sh
cd verify
node --test                       # offline, uses recorded fixtures
TRUSTCHAIN_LIVE=1 node --test     # adds a live, read-only check of the sample record
npm run test:live                 # the same, in any shell
node scripts/record-fixtures.js   # re-records test/fixtures from the live sample record
node scripts/record-fixtures.js --rpc <url>   # same, from one RPC that keeps full history
```

The offline fixture in `test/fixtures/` was recorded from the founder's own
sample record, `trustchain.biz/verify/5c79fbb0`. It holds only the endpoint
fields the verifier reads (a test checks this) and public chain data. The
recorder refuses any other Registry ID unless you pass `--allow-other-record`,
because fixtures are committed to this public repository. The record-file path
is tested end to end with synthetic data, because a real record's account IDs
are not public.

## License

MIT. See [`LICENSE`](LICENSE).

Not legal advice.
