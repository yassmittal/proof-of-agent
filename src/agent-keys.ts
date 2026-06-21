import { generateKeyPair, toHex } from '@nobulex/crypto';
import { agentDid } from './manifest';

// Generate stable agent + issuer identities. Paste the two lines into .env so the agent
// keeps the same DID across runs (see ISSUER/AGENT_PRIVATE_KEY in agent-core.ts).
const agent = await generateKeyPair();
const issuer = await generateKeyPair();

console.log('# Persistent agent + issuer identity — paste into .env');
console.log(`AGENT_PRIVATE_KEY=${toHex(agent.privateKey)}`);
console.log(`ISSUER_PRIVATE_KEY=${toHex(issuer.privateKey)}`);
console.log(`# stable agent DID: ${agentDid(agent.publicKeyHex)}`);
