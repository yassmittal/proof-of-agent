import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Generates a fresh Ed25519 keypair for the project wallet.
// Copy the printed secret into .env as SUI_PRIVATE_KEY.
const keypair = Ed25519Keypair.generate();

console.log('Sui address :', keypair.toSuiAddress());
console.log('Secret key  :', keypair.getSecretKey()); // bech32 "suiprivkey1..."
console.log('\nAdd to .env:  SUI_PRIVATE_KEY=' + keypair.getSecretKey());
