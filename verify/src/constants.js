// Public facts this verifier checks against.
// Every value here can be checked on the Polygon chain without an account.
// One is TrustChain's own statement: that ANCHOR_WALLET, the wallet that
// deployed the registry, is the wallet TrustChain anchors with.
// See ../../contracts/DEPLOYMENTS.md for where each one comes from.

/** Polygon PoS mainnet. */
export const CHAIN_ID = 137;

/** TrustChainRegistry, the only anchor contract TrustChain uses in production. */
export const REGISTRY_ADDRESS = '0x649Bc303d15E173D95B4d379e163868b03cf5Fec';

/**
 * The wallet that deployed the registry and sends TrustChain's anchor
 * transactions. The contract lets anyone call anchor(), and it does not store
 * who sent a transaction. So the transaction sender is the only on-chain sign
 * that an entry came from TrustChain.
 */
export const ANCHOR_WALLET = '0xF9505f8763649481DD1f604C92b4c0c2fffE7153';

/**
 * Keccak-256 of the registry's runtime bytecode as returned by eth_getCode.
 * It equals the deployedBytecode of contracts/TrustChainRegistry.sol built
 * with solc 0.8.20, optimizer off, EVM version paris.
 */
export const REGISTRY_CODE_HASH = '0x4ed4a1d4ea7107f7b78a50a2224c4e3e42c8edd9ee4c60127478487c4f43df10';

/** Block in which the registry was deployed. Nothing older can be an anchor. */
export const REGISTRY_DEPLOY_BLOCK = 84937555;

/** Function selectors and event topic of TrustChainRegistry. */
export const SELECTOR_ANCHOR = '0x8572fafa'; // anchor(string,bytes32,address,address)
export const SELECTOR_GET_PROOF = '0xd57763a1'; // getProof(string)
export const TOPIC_ANCHORED = '0x1b7ca7bf2a9d218c36588a8decfdf5aa3f1fa20a10a4a8d02df7d6d60527fb55'; // Anchored(bytes32,string,bytes32,address,uint48)

/**
 * The public record endpoint behind https://trustchain.biz/verify/<id>.
 * This tool calls it with ?publicId=<Registry ID>, the same call the public
 * page makes. That call needs no account and returns only what the public
 * page shows.
 */
export const PUBLIC_RECORD_ENDPOINT =
  'https://us-central1-trust-chain-cc62c.cloudfunctions.net/agreement_publicProof';

/**
 * Public Polygon RPC endpoints that need no API key, tried in order.
 * Some public nodes keep only recent history and answer null for an older
 * transaction, so a null answer also moves on to the next endpoint.
 * On 2026-10-08 the first two returned TrustChain's July 2026 anchor
 * transaction. The last two answered null for it: they keep only recent
 * history for transaction lookups, so they are last, as fallbacks for the
 * other calls. Free endpoints come and go. Pass your own with --rpc.
 */
export const DEFAULT_RPC_URLS = [
  'https://polygon.drpc.org',
  'https://polygon.gateway.tenderly.co',
  'https://1rpc.io/matic',
  'https://polygon-bor-rpc.publicnode.com',
];

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
