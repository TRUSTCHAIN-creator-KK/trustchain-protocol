# Deployments

TrustChain uses one contract in production: `TrustChainRegistry` on Polygon PoS.
This folder holds its exact source, its ABI and the files needed to rebuild it.

## TrustChainRegistry

| Item | Value |
|---|---|
| Network | Polygon PoS mainnet, chain ID 137 |
| Address | `0x649Bc303d15E173D95B4d379e163868b03cf5Fec` |
| Deployed in block | 84,937,555 (2026-03-31 22:12:27 UTC) |
| Deployment transaction | `0x0fc4711f17e6fa79107768578b09fe4ec1612685861989ef42ee0c517513a672` |
| Deployed by | `0xF9505f8763649481DD1f604C92b4c0c2fffE7153` (also the wallet that sends TrustChain's anchors) |
| Constructor arguments | none |
| Compiler | solc `0.8.20+commit.a1b79de6` |
| Optimizer | off (runs 200, unused while off) |
| EVM version | `paris` |
| Source | [`TrustChainRegistry.sol`](TrustChainRegistry.sol), byte for byte the file that was compiled |
| ABI | [`abi/TrustChainRegistry.json`](abi/TrustChainRegistry.json) |
| Runtime code size | 2,270 bytes |
| Runtime code hash (Keccak-256) | `0x4ed4a1d4ea7107f7b78a50a2224c4e3e42c8edd9ee4c60127478487c4f43df10` |
| Source hash (Keccak-256) | `0xa2b5eca9b2f6a396ee88d39e762c266a44a88191e4803145f73c7dd37310e224` |
| License | MIT (SPDX header in the source) |
| Sourcify | exact match, verified 2026-10-12: <https://repo.sourcify.dev/137/0x649Bc303d15E173D95B4d379e163868b03cf5Fec> |
| Polygonscan | exact match, verified 2026-10-12: <https://polygonscan.com/address/0x649Bc303d15E173D95B4d379e163868b03cf5Fec#code> |

Explorer: <https://polygonscan.com/address/0x649Bc303d15E173D95B4d379e163868b03cf5Fec>

The source is verified on Sourcify (exact match, 2026-10-12) and on Polygonscan
(exact match, 2026-10-12). Both compiled the published source and found it matches
the code at this address. Polygonscan can decode anchor transactions and their
Anchored logs. The steps below also work without those views.

## What the contract does

- `anchor(agreementId, documentHash, creator, counterparty)` writes one entry.
  The key is `keccak256(agreementId)`. It stores the fingerprint, the two wallet
  slots and the block time.
- An entry is written once. A second `anchor()` for the same ID reverts with
  `AlreadyAnchored()`. A zero fingerprint reverts with `ZeroHash()`.
- `getProof(agreementId)` and `isAnchored(agreementId)` read an entry.
  `proofs(key)` reads it by key.
- Every write emits `Anchored(key, agreementId, documentHash, creator, anchoredAt)`.
- There is no owner, no admin function, no upgrade path, and no function that
  changes or deletes an entry.

The comments in the source are exactly as deployed, so they cannot be corrected
without breaking the match. Two are loose. "Used only to derive the key": the ID
is also written in plain text in the transaction and in the `Anchored` event.
"No content": no agreement text is stored, but the internal record ID is. The
source also contains three em dashes. The repository's no-dash rule does not
apply to this file or its build files.

Things to know before you rely on an entry:

- **Anyone can call `anchor()`.** The contract does not store who sent the
  transaction. TrustChain's anchors are sent by
  `0xF9505f8763649481DD1f604C92b4c0c2fffE7153`. An entry sent by any other
  wallet is not a TrustChain anchor. The verifier in [`../verify`](../verify)
  checks the sender for this reason. So someone who sees TrustChain's anchor
  transaction before it is mined could write a different fingerprint under the
  same internal record ID first. TrustChain's transaction would then fail and
  that record could not be anchored in this contract. The verifier would not
  pass that record.
- **`agreementId` is TrustChain's internal record ID**, a 20-character string.
  It is not the 8-character Registry ID in a public link such as
  `trustchain.biz/verify/5c79fbb0`. The internal ID is readable in the
  transaction input and in the event.
- **The wallet slots are empty in every TrustChain anchor so far.** TrustChain
  passes the zero address for `creator` and `counterparty`. Nothing on-chain
  says who the people are.
- **What goes on-chain per anchor:** the internal record ID, the fingerprint,
  the two wallet slots and the block time. Not on-chain: title, terms, amount,
  names, emails, account IDs, signatures, signing times, or the Registry ID.
- **An anchor from TrustChain's wallet means TrustChain's server wrote it.** It
  does not by itself mean a real deal sits behind it. The wallet has also
  written at least one test entry with no record behind it:
  `verify-d3-real-8sK9i9nWRy`, from a test run on 2026-06-26 with a throwaway
  test account.

## How the fingerprint is made

`documentHash` is Keccak-256 over the UTF-8 bytes of

```
JSON.stringify({ id, title, terms, amount, parties: [creatorAccountId, counterpartyAccountId] })
```

in that key order, with no spaces, where `id` is the internal record ID. The
account IDs are not shown on any public page, so the fingerprint cannot be
recomputed from the agreement text alone. There is no secret salt, so the
fingerprint hides its inputs only as well as they are hard to guess.
[`../verify/README.md`](../verify/README.md) lists the exact rules and test
vectors.

## Read it on Polygonscan

1. Open the address page linked above and choose the **Transactions** tab.
   Anchor calls show method `0x8572fafa` (or "Anchor").
2. Open a transaction, then **Click to show more**, then **Input Data**, and
   choose **View Input As: Original**. After the 4-byte selector `0x8572fafa`
   come four 32-byte words: the offset of the ID string, the fingerprint, the
   creator slot, the counterparty slot. Then the ID length and the ID bytes.
   The ID bytes are plain ASCII text.
3. Open the **Logs** tab of the same transaction. The `Anchored` log has
   `topic0 = 0x1b7ca7bf2a9d218c36588a8decfdf5aa3f1fa20a10a4a8d02df7d6d60527fb55`,
   `topic1 = keccak256(internal record ID)`, `topic2` = creator slot, and in its
   data the ID, the fingerprint and the block time.
4. The **From** field of the transaction must be
   `0xF9505f8763649481DD1f604C92b4c0c2fffE7153`.

The founder's sample record (`trustchain.biz/verify/5c79fbb0`) was anchored in
transaction
[`0x8ff5cf35...086b2d`](https://polygonscan.com/tx/0x8ff5cf3555849eb4d8bf5214f6982ce54906820d1ea2b9aad358d251f8086b2d),
block 90,900,029, 2026-07-26 08:37:21 UTC.

## Read it with one command

`getProof` for the sample record, against a public RPC:

```sh
curl -s -X POST https://polygon.drpc.org -H 'content-type: application/json' --data '{
  "jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
    "to":"0x649Bc303d15E173D95B4d379e163868b03cf5Fec",
    "data":"0xd57763a100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000014396466634234694d7777566a48436a74666b6470000000000000000000000000"
  },"latest"]}'
```

The result is four 32-byte words: the fingerprint
(`0x2730c801...07877128`), the creator slot, the counterparty slot (both zero),
and the block time (`0x6a65c741` = 1785055041 = 2026-07-26 08:37:21 UTC).

## Check that this source is what runs on Polygon

Three ways, from quickest to strongest.

1. **Run the verifier.** `node verify/bin/trustchain-verify.js 5c79fbb0` compares
   the Keccak-256 of the code at the address with the runtime code hash above.
2. **Check the build files without a compiler.**
   `node contracts/check-build.mjs --live` checks that the compiler input holds
   this exact source, that the source hash matches the metadata file, that the
   metadata file's IPFS hash is embedded at the end of the runtime bytecode,
   that the code on Polygon equals that bytecode, and that the deployment
   transaction's input equals the creation bytecode. If no RPC answers, it says
   so and exits 2. It never reports an RPC failure as a mismatch.
3. **Compile it yourself.** With solc 0.8.20:

   ```sh
   solc --standard-json < contracts/build/TrustChainRegistry.standard-input.json > out.json
   ```

   Then compare `contracts["contracts/TrustChainRegistry.sol"].TrustChainRegistry.evm.deployedBytecode.object`
   in `out.json` with the result of `eth_getCode` for the address. They should
   be equal, metadata included. The creation bytecode should equal the input of
   the deployment transaction, since there are no constructor arguments.

Build files in [`build/`](build):

| File | What it is |
|---|---|
| `TrustChainRegistry.standard-input.json` | solc standard JSON input exactly as compiled: the source and the settings |
| `TrustChainRegistry.metadata.json` | the compiler's metadata file, byte for byte; its IPFS hash is in the bytecode |
| `TrustChainRegistry.bytecode.json` | creation and runtime bytecode from that build |

## Not published here

TrustChain's private codebase also holds two other contracts, an older anchor
contract and an NFT contract. Neither is used in production, so neither is part
of this repository.
