// Anchors a persisted agent run on Sui: it binds the receipt-chain root to the
// exact Walrus blob (by content blob ID and Sui object ID) that stores the run
// manifest, immutably. Anyone can later fetch the anchor by object ID, read the
// chain root, fetch the manifest from Walrus by blob ID, and confirm the root
// they recompute matches — without trusting the publisher.
//
// The contract is intentionally dependency-free: it records the Walrus blob's
// identifiers (supplied by the caller) rather than importing the Walrus Move
// package. Authenticity is established off-chain by the verifier, which reads the
// content-addressed blob and the referenced Sui Blob object directly.
module audit_anchor::audit_anchor {
    use sui::event;

    /// An immutable, on-chain attestation of one agent run.
    public struct AuditAnchor has key {
        id: UID,
        /// Agent DID (did:nobulex:<ed25519 pubkey hex>) as bytes.
        agent_did: vector<u8>,
        /// Hash of the covenant the agent operated under.
        covenant_hash: vector<u8>,
        /// Head of the receipt hash chain (the value a verifier recomputes).
        chain_root: vector<u8>,
        /// Walrus content blob ID (u256) of the run manifest.
        walrus_blob_id: u256,
        /// Sui object address of the on-chain Walrus Blob.
        walrus_object_id: address,
        anchored_at_ms: u64,
        publisher: address,
    }

    /// Emitted on every anchor so indexers and the verifier can discover runs.
    public struct RunAnchored has copy, drop {
        anchor_id: ID,
        agent_did: vector<u8>,
        covenant_hash: vector<u8>,
        chain_root: vector<u8>,
        walrus_blob_id: u256,
        walrus_object_id: address,
        publisher: address,
    }

    /// Anchor a run: freeze an immutable attestation and emit a discovery event.
    public fun anchor_run(
        agent_did: vector<u8>,
        covenant_hash: vector<u8>,
        chain_root: vector<u8>,
        walrus_blob_id: u256,
        walrus_object_id: address,
        ctx: &mut TxContext,
    ) {
        let anchor = AuditAnchor {
            id: object::new(ctx),
            agent_did,
            covenant_hash,
            chain_root,
            walrus_blob_id,
            walrus_object_id,
            anchored_at_ms: ctx.epoch_timestamp_ms(),
            publisher: ctx.sender(),
        };

        event::emit(RunAnchored {
            anchor_id: object::id(&anchor),
            agent_did: anchor.agent_did,
            covenant_hash: anchor.covenant_hash,
            chain_root: anchor.chain_root,
            walrus_blob_id: anchor.walrus_blob_id,
            walrus_object_id: anchor.walrus_object_id,
            publisher: anchor.publisher,
        });

        // Immutable: no one (not even the publisher) can rewrite an anchor.
        transfer::freeze_object(anchor);
    }

    // --- read-only accessors (for on-chain composability) ---
    public fun chain_root(self: &AuditAnchor): vector<u8> { self.chain_root }
    public fun walrus_blob_id(self: &AuditAnchor): u256 { self.walrus_blob_id }
    public fun walrus_object_id(self: &AuditAnchor): address { self.walrus_object_id }
    public fun agent_did(self: &AuditAnchor): vector<u8> { self.agent_did }
    public fun covenant_hash(self: &AuditAnchor): vector<u8> { self.covenant_hash }
    public fun publisher(self: &AuditAnchor): address { self.publisher }
}
