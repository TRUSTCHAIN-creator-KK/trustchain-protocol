# Security

## Report a problem

Email **founder@trustchain.biz** with "Security" in the subject line.

Please include:

- what you found and where (file, function, or command);
- how to reproduce it, step by step;
- what an attacker could do with it.

Please do not open a public issue for a security problem. We aim to reply within 5 working days. We will keep you updated while we fix it, and credit you in the fix if you want.

## Scope

In scope:

- the code in this repository;
- the public verifier (`verify/`), including any case where it reports PASS for something it did not check, or for a record that does not match the chain;
- the build files in `contracts/` not matching the deployed contract.

The deployed contract at `0x649Bc303d15E173D95B4d379e163868b03cf5Fec` on Polygon cannot be changed. If you find a problem with it, report it anyway. We will document it and handle it in TrustChain's own anchoring service.

Out of scope here, but still welcome at the same address: the trustchain.biz app and its servers. Please do not run load tests or automated scanners against them, and do not access data that is not yours.

## What the verifier trusts

`trustchain-verify` trusts:

- TrustChain's public record endpoint, to name the right transaction for a Registry ID;
- the Polygon RPC you use, to return real chain data. Use your own node or several RPCs (`--rpc`) if this matters to you;
- the constants in `verify/src/constants.js`: the registry address, the anchoring wallet and the registry code hash. Compare them with [`contracts/DEPLOYMENTS.md`](contracts/DEPLOYMENTS.md) and the chain.

Not legal advice.
