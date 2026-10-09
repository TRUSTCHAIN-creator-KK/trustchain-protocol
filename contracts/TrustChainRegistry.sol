// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  TrustChainRegistry
 * @notice Minimal proof-of-existence registry for TrustChain on Polygon PoS mainnet.
 *         Stores a cryptographic fingerprint per agreement. Proof only — no content.
 *
 * @dev    Gas-optimised for Polygon:
 *           - bytes32 key (keccak256 of agreementId) avoids dynamic string storage
 *           - uint48 anchoredAt packs with address counterparty into one 32-byte slot
 *           - custom errors instead of revert strings
 *           - calldata strings for external calls
 */
contract TrustChainRegistry {

    // ── Storage ──────────────────────────────────────────────────────────────

    struct Proof {
        bytes32 documentHash;   // keccak256 fingerprint of canonical agreement fields
        address creator;        // originator wallet address (zero if not provided)
        address counterparty;   // counterparty wallet address (zero if not provided)
        uint48  anchoredAt;     // unix timestamp — uint48 holds dates until year 281,474
    }

    // key = keccak256(abi.encodePacked(agreementId))
    mapping(bytes32 => Proof) public proofs;

    // ── Events ────────────────────────────────────────────────────────────────

    event Anchored(
        bytes32 indexed key,
        string          agreementId,
        bytes32         documentHash,
        address indexed creator,
        uint48          anchoredAt
    );

    // ── Errors ────────────────────────────────────────────────────────────────

    error AlreadyAnchored();
    error ZeroHash();

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * @notice Anchor an agreement's cryptographic fingerprint.
     * @param  agreementId   Firestore document ID — used only to derive the key.
     * @param  documentHash  keccak256 of canonical agreement fields.
     * @param  creator       Originator wallet. Pass address(0) if unavailable.
     * @param  counterparty  Counterparty wallet. Pass address(0) if unavailable.
     */
    function anchor(
        string  calldata agreementId,
        bytes32          documentHash,
        address          creator,
        address          counterparty
    ) external {
        if (documentHash == bytes32(0)) revert ZeroHash();
        bytes32 key = keccak256(abi.encodePacked(agreementId));
        if (proofs[key].anchoredAt != 0) revert AlreadyAnchored();

        proofs[key] = Proof({
            documentHash:  documentHash,
            creator:       creator,
            counterparty:  counterparty,
            anchoredAt:    uint48(block.timestamp)
        });

        emit Anchored(key, agreementId, documentHash, creator, uint48(block.timestamp));
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * @notice Retrieve the stored proof for an agreement.
     * @return documentHash  Anchored fingerprint (bytes32(0) if not found).
     * @return creator       Originator wallet.
     * @return counterparty  Counterparty wallet.
     * @return anchoredAt    Block timestamp of the anchor transaction.
     */
    function getProof(string calldata agreementId)
        external
        view
        returns (
            bytes32 documentHash,
            address creator,
            address counterparty,
            uint48  anchoredAt
        )
    {
        Proof storage p = proofs[keccak256(abi.encodePacked(agreementId))];
        return (p.documentHash, p.creator, p.counterparty, p.anchoredAt);
    }

    /**
     * @notice Returns true if this agreement has been anchored.
     */
    function isAnchored(string calldata agreementId) external view returns (bool) {
        return proofs[keccak256(abi.encodePacked(agreementId))].anchoredAt != 0;
    }
}
