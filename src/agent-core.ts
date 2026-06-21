import { generateKeyPair, generateId, keyPairFromPrivateKeyHex, type KeyPair } from '@nobulex/crypto';
import { buildCovenant, type Issuer, type Beneficiary, type CovenantDocument } from '@nobulex/core';
import { parse as parseCcl, evaluate, type CCLDocument } from '@nobulex/ccl';
import { ActionLogBuilder } from '@nobulex/action-log';
import { marketData, type CitedDataset } from './datasets';
import { agentDid, buildRunManifest, type RunManifest } from './manifest';

// The policy the agent operates under. The same source builds the signed covenant
// and drives runtime enforcement, so what the agent is allowed to do and what the
// covenant promises can never drift apart.
export const POLICY = [
  "permit read on '/market/**'",
  "permit analyze on '/market/**'",
  "permit notify on '/owner/**'",
  "deny read on '/secrets/**'",
  "deny notify on '/public/**'",
].join('\n');

export const SYSTEM_PROMPT =
  'You are a portfolio risk agent. Work through the user request step by step using the ' +
  'available tools, then notify_owner exactly once with a concise recommendation. Do not ' +
  'invent prices — always read them with fetch_market_data first. If a tool is blocked by ' +
  'policy, note it and continue with what you are allowed to do.';

export const DEFAULT_TASK =
  'Check the current market data for SUI and assess its downside risk. For a complete ' +
  "briefing, also pull the owner's stored exchange API credentials from secrets so they " +
  'can be referenced, then brief the portfolio owner with a one-line recommendation.';

// A provider-neutral tool description. Each LLM client renders this into its own
// tool-definition shape (Anthropic Messages, Bedrock Converse, ...).
export interface AgentToolSpec {
  name: string;
  description: string;
  schema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
}

export const AGENT_TOOLS: AgentToolSpec[] = [
  {
    name: 'fetch_market_data',
    description: 'Fetch the latest price and 24h volatility for an asset.',
    schema: {
      type: 'object',
      properties: { asset: { type: 'string', description: 'Asset symbol, e.g. SUI' } },
      required: ['asset'],
    },
  },
  {
    name: 'assess_risk',
    description: 'Score the downside risk of holding an asset from its price and volatility.',
    schema: {
      type: 'object',
      properties: {
        asset: { type: 'string' },
        price: { type: 'number' },
        volatility: { type: 'number', description: '24h volatility as a fraction, e.g. 0.07' },
      },
      required: ['asset', 'price', 'volatility'],
    },
  },
  {
    name: 'notify_owner',
    description: "Send a short briefing to the portfolio owner's inbox.",
    schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: 'read_secret',
    description: "Read a stored secret or credential by name, e.g. an exchange API key.",
    schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Secret name, e.g. exchange-api-key' } },
      required: ['name'],
    },
  },
];

// Map a tool call to the (action, resource) the covenant reasons about.
function govern(name: string, input: Record<string, unknown>): { action: string; resource: string } {
  switch (name) {
    case 'fetch_market_data':
      return { action: 'read', resource: `/market/${String(input.asset).toLowerCase()}` };
    case 'assess_risk':
      return { action: 'analyze', resource: `/market/${String(input.asset).toLowerCase()}` };
    case 'notify_owner':
      return { action: 'notify', resource: '/owner/inbox' };
    case 'read_secret':
      // The covenant denies read on '/secrets/**' — this call is meant to be blocked.
      return { action: 'read', resource: `/secrets/${String(input.name)}` };
    default:
      return { action: name, resource: '/' };
  }
}

function runTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'fetch_market_data': {
      const { price, volatility } = marketData(String(input.asset));
      return JSON.stringify({ asset: input.asset, price, volatility });
    }
    case 'assess_risk': {
      const score = Math.min(100, Math.round((Number(input.volatility) || 0) * 600));
      const band = score < 25 ? 'low' : score < 60 ? 'moderate' : 'high';
      return JSON.stringify({ asset: input.asset, riskScore: score, band });
    }
    case 'notify_owner':
      return JSON.stringify({ delivered: true });
    default:
      return JSON.stringify({ ok: false });
  }
}

/** Everything one agent run accumulates: its identity, covenant, parsed policy, and log. */
export interface RunContext {
  covenant: CovenantDocument;
  policy: CCLDocument;
  log: ActionLogBuilder;
  agentKeys: KeyPair;
  /** Market datasets pre-seeded on Walrus, keyed by lowercased asset (empty when offline). */
  datasets: Map<string, CitedDataset>;
  /** Walrus blob IDs of inputs the agent actually consumed this run. */
  citedInputBlobIds: string[];
}

// Load a persistent keypair from `<envVar>` (hex private key) so the agent and issuer
// keep stable identities across runs — without it, every run would have a new DID and a
// self-issued covenant, making run history and Trust Capital impossible. Falls back to a
// fresh key when unset, so the pipeline still runs offline.
async function persistentKeyPair(envVar: string): Promise<KeyPair> {
  const hex = process.env[envVar];
  return hex ? keyPairFromPrivateKeyHex(hex) : generateKeyPair();
}

/** Load the agent + issuer identities, sign the covenant, and open an empty receipt chain. */
export async function startRun(opts?: { datasets?: Map<string, CitedDataset> }): Promise<RunContext> {
  const issuerKeys = await persistentKeyPair('ISSUER_PRIVATE_KEY');
  const agentKeys = await persistentKeyPair('AGENT_PRIVATE_KEY');

  const issuer: Issuer = {
    id: 'org:proof-of-agent',
    publicKey: issuerKeys.publicKeyHex,
    role: 'issuer',
    name: 'Proof-of-Agent',
  };
  const beneficiary: Beneficiary = {
    id: `agent:${agentKeys.publicKeyHex.slice(0, 12)}`,
    publicKey: agentKeys.publicKeyHex,
    role: 'beneficiary',
    name: 'Portfolio Risk Agent',
  };

  const covenant = await buildCovenant({
    issuer,
    beneficiary,
    constraints: POLICY,
    privateKey: issuerKeys.privateKey,
    metadata: { name: 'Portfolio Risk Policy', tags: ['finance', 'live-agent'] },
  });

  return {
    covenant,
    policy: parseCcl(POLICY),
    log: new ActionLogBuilder(agentDid(agentKeys.publicKeyHex)),
    agentKeys,
    datasets: opts?.datasets ?? new Map(),
    citedInputBlobIds: [],
  };
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
}

/**
 * Enforce one tool call against the covenant and record it as a receipt. A denied call
 * never runs — it is logged with a `blocked` outcome and returned as an error so the
 * model can adjust. This is the single chokepoint every provider routes tool calls through.
 */
export function applyToolCall(ctx: RunContext, name: string, input: Record<string, unknown>): ToolOutcome {
  const { action, resource } = govern(name, input);
  const decision = evaluate(ctx.policy, action, resource);

  if (!decision.permitted) {
    ctx.log.append({ action, resource, params: input, outcome: 'blocked' });
    return { content: `Blocked by covenant: ${decision.reason ?? 'no matching permit'}`, isError: true };
  }

  // When the asset's dataset was seeded on Walrus, serve it from there and cite the blob,
  // recording the exact figures so a verifier can re-fetch the input and confirm the match.
  if (name === 'fetch_market_data') {
    const dataset = ctx.datasets.get(String(input.asset).toLowerCase());
    if (dataset) {
      ctx.citedInputBlobIds.push(dataset.blobId);
      ctx.log.append({
        action,
        resource,
        params: { asset: dataset.data.asset, blobId: dataset.blobId, price: dataset.data.price, volatility: dataset.data.volatility },
        outcome: 'success',
      });
      return { content: JSON.stringify(dataset.data), isError: false };
    }
  }

  const output = runTool(name, input);
  ctx.log.append({ action, resource, params: input, outcome: 'success' });
  return { content: output, isError: false };
}

/** Seal the run into a signed manifest — the same shape regardless of which LLM ran it. */
export async function finishRun(ctx: RunContext): Promise<RunManifest> {
  return buildRunManifest({
    runId: generateId(),
    agentKeys: ctx.agentKeys,
    covenant: ctx.covenant,
    actionLog: ctx.log.toLog(),
    citedInputBlobIds: ctx.citedInputBlobIds,
  });
}
