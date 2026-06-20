import Anthropic from '@anthropic-ai/sdk';
import { generateKeyPair, generateId } from '@nobulex/crypto';
import { buildCovenant, type Issuer, type Beneficiary } from '@nobulex/core';
import { parse as parseCcl, evaluate } from '@nobulex/ccl';
import { ActionLogBuilder } from '@nobulex/action-log';
import { AGENT_MODEL } from './config';
import { agentDid, buildRunManifest, type RunManifest } from './manifest';

// The policy the agent operates under. The same source builds the signed covenant
// and drives runtime enforcement, so what the agent is allowed to do and what the
// covenant promises can never drift apart.
const POLICY = [
  "permit read on '/market/**'",
  "permit analyze on '/market/**'",
  "permit notify on '/owner/**'",
  "deny read on '/secrets/**'",
  "deny notify on '/public/**'",
].join('\n');

// Each tool maps to a governed (action, resource) pair. The agent never touches the
// covenant directly — it calls a tool, and the enforcement layer decides.
const tools: Anthropic.Tool[] = [
  {
    name: 'fetch_market_data',
    description: 'Fetch the latest price and 24h volatility for an asset.',
    input_schema: {
      type: 'object',
      properties: { asset: { type: 'string', description: 'Asset symbol, e.g. SUI' } },
      required: ['asset'],
    },
  },
  {
    name: 'assess_risk',
    description: 'Score the downside risk of holding an asset from its price and volatility.',
    input_schema: {
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
    input_schema: {
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
  return { price: Number((10 + (seed % 90) + (seed % 17) / 10).toFixed(2)), volatility: Number(((seed % 13) / 100 + 0.02).toFixed(3)) };
}

/** Map a tool call to the (action, resource) the covenant reasons about. */
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
      const score = Math.min(100, Math.round((input.volatility as number) * 600));
      const band = score < 25 ? 'low' : score < 60 ? 'moderate' : 'high';
      return JSON.stringify({ asset: input.asset, riskScore: score, band });
    }
    case 'notify_owner':
      return JSON.stringify({ delivered: true });
    default:
      return JSON.stringify({ ok: false });
  }
}

/**
 * Run a real Claude agent on a concrete task, governed by a Nobulex covenant.
 *
 * Every tool the model invokes is checked against the covenant before it runs. The
 * decision, its inputs, and its outcome become a hash-chained receipt. The returned
 * manifest is the same shape `simulateAgentRun` produces, so persisting, anchoring,
 * and verifying it are unchanged — only the actor is now a live LLM.
 */
export async function runClaudeAgent(task?: string): Promise<RunManifest> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env to run the live agent.');
  }

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

  const policy = parseCcl(POLICY);
  const log = new ActionLogBuilder(agentDid(agentKeys.publicKeyHex));
  const anthropic = new Anthropic();

  const prompt =
    task ??
    'Check the current market data for SUI, assess its downside risk, then brief the portfolio owner with a one-line recommendation.';

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];

  for (let turn = 0; turn < 8; turn++) {
    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system:
        'You are a portfolio risk agent. Use fetch_market_data, then assess_risk, then ' +
        'notify_owner exactly once with a concise recommendation. Do not invent prices — ' +
        'always read them with the tool first.',
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as Record<string, unknown>;
      const { action, resource } = govern(block.name, input);
      const decision = evaluate(policy, action, resource);

      if (!decision.permitted) {
        log.append({ action, resource, params: input, outcome: 'blocked' });
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Blocked by covenant: ${decision.reason ?? 'no matching permit'}`,
          is_error: true,
        });
        continue;
      }

      const output = runTool(block.name, input);
      log.append({ action, resource, params: input, outcome: 'success' });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: output });
    }

    messages.push({ role: 'user', content: results });
  }

  return buildRunManifest({
    runId: generateId(),
    agentKeys,
    covenant,
    actionLog: log.toLog(),
    citedInputBlobIds: [],
  });
}
