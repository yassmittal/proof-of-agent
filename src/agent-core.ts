import { generateKeyPair, generateId, type KeyPair } from '@nobulex/crypto';
import { buildCovenant, type Issuer, type Beneficiary, type CovenantDocument } from '@nobulex/core';
import { parse as parseCcl, evaluate, type CCLDocument } from '@nobulex/ccl';
import { ActionLogBuilder } from '@nobulex/action-log';
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
  'You are a portfolio risk agent. Use fetch_market_data, then assess_risk, then ' +
  'notify_owner exactly once with a concise recommendation. Do not invent prices — ' +
  'always read them with the tool first.';

export const DEFAULT_TASK =
  'Check the current market data for SUI, assess its downside risk, then brief the ' +
  'portfolio owner with a one-line recommendation.';

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
];

// Deterministic stand-in for live market feeds. Swapping these for real APIs would not
// touch the governance or receipt path — they only change what a permitted tool returns.
function marketData(asset: string): { price: number; volatility: number } {
  const seed = [...asset.toUpperCase()].reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    price: Number((10 + (seed % 90) + (seed % 17) / 10).toFixed(2)),
    volatility: Number(((seed % 13) / 100 + 0.02).toFixed(3)),
  };
}

// Map a tool call to the (action, resource) the covenant reasons about.
function govern(name: string, input: Record<string, unknown>): { action: string; resource: string } {
  switch (name) {
    case 'fetch_market_data':
      return { action: 'read', resource: `/market/${String(input.asset).toLowerCase()}` };
    case 'assess_risk':
      return { action: 'analyze', resource: `/market/${String(input.asset).toLowerCase()}` };
    case 'notify_owner':
      return { action: 'notify', resource: '/owner/inbox' };
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
}

/** Mint the agent identity, sign the covenant, and open an empty receipt chain. */
export async function startRun(): Promise<RunContext> {
  const issuerKeys = await generateKeyPair();
  const agentKeys = await generateKeyPair();

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
    citedInputBlobIds: [],
  });
}
