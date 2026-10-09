# TrustChain: open verifier, anchor contract and templates

[TrustChain](https://trustchain.biz) is a web app for writing down everyday deals in plain words: a repair job, a freelance project, a loan between friends. Two people agree on the terms and both sign in the app. The record gets a public link that anyone can open without an account. The link shows the record's status, whether each side signed, the anchor details, and the title if the owner chose to make it public. It never shows the parties' names, their emails or the terms.

When a record is anchored, TrustChain writes a fingerprint of the record to the Polygon blockchain, together with TrustChain's internal ID for that record.

This repository holds the parts you need to check that yourself.

## Don't trust us. Check it yourself.

A record is only worth something if you can check it without asking the company that made it. So the checking side is open:

| Folder | What it is |
|---|---|
| [`verify/`](verify) | A small command line tool that checks a TrustChain record against the Polygon chain. Node.js 18+, no dependencies, read-only. |
| [`contracts/`](contracts) | The exact source of the anchor contract running on Polygon, its ABI, and the files to rebuild it and compare. |
| [`templates/`](templates) | Eight plain-words agreement templates. Use them with TrustChain, on paper, or in a text message. |

The TrustChain app itself stays private: the website, the servers, the database, identity checks, the AI assistant and payments. Nothing in this repository needs them.

## What a record proves, and what it does not

When the verifier passes, it shows:

- A specific fingerprint was written to TrustChain's registry contract on Polygon, at a specific block time, by TrustChain's anchoring wallet.
- The registry still holds that fingerprint. The contract has no function to change or delete an entry, no owner and no upgrade path.
- TrustChain's public page shows the same fingerprint for that record.
- With a record file from one of the parties: the record's title, terms text, amount and the two account IDs existed in exactly that form no later than that block time. Change one character and the fingerprint no longer matches. That is what tamper-evident means here: a change shows. It does not mean a change is impossible.

It does not show:

- **Who the people are, or that anyone signed.** Signing happens in TrustChain's app, and signatures are kept in TrustChain's database. Nothing about signing is on-chain.
- **What the fingerprint was made from**, without the record file. The fingerprint is Keccak-256 over a canonical record that includes TrustChain's internal record ID and both people's account IDs. The account IDs are private, so you cannot recompute the fingerprint from the agreement text alone.
- **The currency, or fields other than the title, the terms text and the amount.**
- **That this public link belongs to that anchor**, beyond TrustChain's word. The 8-character Registry ID in the link is not written on-chain. The link between them is the transaction that TrustChain's public endpoint names.
- **That a deal is fair, allowed where you live, or will be kept.** A record shows what two people agreed. It does not decide whether a term is allowed.

What goes on-chain for each anchor: TrustChain's internal record ID (as plain text), the fingerprint, two wallet slots (empty today) and the block time. What does not: the title, terms, amount, names, emails, account IDs, signatures, or the Registry ID.

## Try it on a real record

The founder's own sample record is public: <https://trustchain.biz/verify/5c79fbb0>. It is a test deal for a set of golf clubs, made and anchored from the founder's own account. It is a sample, not a customer deal.

```sh
git clone https://github.com/TRUSTCHAIN-creator-KK/trustchain-protocol.git
cd trustchain-protocol
node verify/bin/trustchain-verify.js https://trustchain.biz/verify/5c79fbb0
```

Part of the output:

```
PASS  Transaction was sent by TrustChain's anchoring wallet
      From 0xF9505f8763649481DD1f604C92b4c0c2fffE7153.
PASS  Fingerprint in the transaction matches the fingerprint the record shows
      anchor("9dfcB4iMwwVjHCjtfkdp", 0x2730c801...877128, ...).
PASS  Block time read from the chain matches the time in the event
      2026-07-26T08:37:21Z (Unix 1785055041).
PASS  Registry still stores the fingerprint the record shows, under the same record ID
      getProof("9dfcB4iMwwVjHCjtfkdp") returns 0x2730c801...877128, anchored at the same block time.

Result: PASS. All 11 required checks passed. No record file was checked.
```

The tool then lists what these checks do not show. Every check, its inputs and the record file format are in [`verify/README.md`](verify/README.md). The contract address, compiler settings and how to read the contract on Polygonscan are in [`contracts/DEPLOYMENTS.md`](contracts/DEPLOYMENTS.md).

## Repository map

```
.
├── README.md                  this file
├── LICENSE                    MIT, for the code
├── SECURITY.md                how to report a problem
├── CONTRIBUTING.md            how to suggest a template or a fix
├── CODE_OF_CONDUCT.md
├── verify/                    trustchain-verify: the checking tool
│   ├── bin/trustchain-verify.js
│   ├── src/                   keccak, ABI, RPC, record and check logic
│   └── test/                  offline tests with recorded fixtures, plus an opt-in live test
├── contracts/
│   ├── TrustChainRegistry.sol the deployed source, byte for byte
│   ├── abi/                   ABI JSON
│   ├── build/                 compiler input, metadata and bytecode
│   ├── check-build.mjs        checks the build files without a compiler
│   └── DEPLOYMENTS.md         network, address, compiler, how to read it
├── templates/                 eight plain-words templates (CC BY 4.0)
├── scripts/                   house-style checks run in CI
└── .github/                   CI workflow and issue templates
```

## Run the checks

```sh
cd verify && node --test && cd ..       # verifier tests, offline
node contracts/check-build.mjs          # contract build files match the source
node scripts/lint-templates.mjs         # template rules
node scripts/check-dashes.mjs           # house style for Markdown
```

`npm test` and `npm run check` at the root run the same things.

## Licenses

- Code (`verify/`, `scripts/`, `contracts/check-build.mjs`): [MIT](LICENSE).
- Contract source: MIT, as stated in its SPDX header.
- Templates (`templates/`): [CC BY 4.0](templates/LICENSE).

## Contact

- Website: <https://trustchain.biz>
- Security reports: founder@trustchain.biz (see [SECURITY.md](SECURITY.md))

Not legal advice. Nothing in this repository is a legal opinion, and no template replaces advice about the rules where you live.
