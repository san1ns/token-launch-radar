// Paper-research farm plans — clean-room implementation from the model spec.
// Every row gets eight steps. Each step is a short paragraph, states its own
// time estimate, and costs $0 because it is a paper exercise: no funds move,
// no transaction is signed, nothing is deposited. Steps are specific to the
// protocol (name, category, chains, TVL, 7d change) so a reader can follow
// them without guessing which protocol they belong to.

import type { SnapshotProtocol } from './model.ts';

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function pct(g: number | null): string {
  if (g === null) return 'no 7d change published';
  const sign = g > 0 ? '+' : '';
  return `${sign}${g.toFixed(2)}% over 7d`;
}

// One paper reproduction, chosen by category. Lending tracks a deposit and a
// redemption; an exchange copies a bid/ask pair; real-world assets check
// eligibility and redemption; anything else traces a typical user flow.
function reproduceStep(p: SnapshotProtocol): string {
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (cat.includes('lend') || cat.includes('borrow') || cat.includes('credit')) {
    return `Paper-reproduce ${name} once: track a 100-unit virtual deposit and a redemption through its lending flow, note the quoted rate and any lock or cooldown, and write down the assumption that the quote stays put. Actual cost $0 (paper exercise). About 12 minutes.`;
  }
  if (cat.includes('dex') || cat.includes('exchange') || cat.includes('swap') || cat.includes('amm')) {
    return `Paper-reproduce ${name} once: copy the bid and ask of one trading pair it lists, compute the spread, and note the pair, the time and the venue. Do not place an order. Actual cost $0 (paper exercise). About 12 minutes.`;
  }
  if (cat.includes('rwa') || cat.includes('real world') || cat.includes('treasur') || cat.includes('yield')) {
    return `Paper-reproduce ${name} once: check who is eligible, what the redemption window is, and what backs the yield, then record the source and the date. Treat any missing term as unconfirmed rather than assuming it. Actual cost $0 (paper exercise). About 12 minutes.`;
  }
  return `Paper-reproduce ${name} once: walk one typical user flow end to end with virtual units, note each screen or call that asks for funds, and write down where the flow stops being checkable. Actual cost $0 (paper exercise). About 12 minutes.`;
}

export function makeFarmSteps(p: SnapshotProtocol, rank: number): string[] {
  const name = p.name;
  const chains = (p.chains ?? []).slice(0, 3).join(', ') || 'no chain listed';
  const change = pct(p.change_7d);
  const tvl = money(p.tvl_usd);
  const reviewDays = p.change_7d !== null && Math.abs(p.change_7d) >= 25 ? 3 : 7;
  const steps: string[] = [];
  steps.push(
    `Check the program notice for ${name} (rank ${rank}). Read its official documentation, match the name and the network (${chains}) to a dated campaign notice, and note the eligibility terms. Leave eligibility unconfirmed if no public terms are available. Actual cost $0 (paper exercise). About 5 minutes.`,
  );
  steps.push(reproduceStep(p));
  steps.push(
    `Work out the simulated cost for ${name}: list the assumed entry fee and the assumed exit fee separately from the actual spend, which is $0 here, and write "unknown" for any quote that is missing instead of guessing a number. Actual cost $0 (paper exercise). About 5 minutes.`,
  );
  steps.push(
    `Set the next review date for ${name}: keep the slug ${p.slug}, the evidence date, and the open questions in one note. Recheck in ${reviewDays} days (${change}). Actual cost $0 (paper exercise). About 3 minutes.`,
  );
  steps.push(
    `Confirm the headline numbers for ${name}: TVL ${tvl} and ${change}. Compare them with the board's implied value and note whether the gap comes from size, category or age rather than from a single number. Actual cost $0 (paper exercise). About 6 minutes.`,
  );
  steps.push(
    `Look at the reference peers on ${name}'s detail page and note how its multiple compares with theirs. If a peer is much larger or much smaller, write down why before treating the comparison as meaningful. Actual cost $0 (paper exercise). About 6 minutes.`,
  );
  steps.push(
    `Check the chains ${name} lists (${chains}) and confirm at least one of them is a network you can read. If a chain is unfamiliar, note it as a question instead of assuming the protocol runs there. Actual cost $0 (paper exercise). About 4 minutes.`,
  );
  steps.push(
    `File the model inputs for ${name} for the next review: its TVL, its 7d change, and the date of this snapshot, so the next pass can tell what moved and by how much. Actual cost $0 (paper exercise). About 3 minutes.`,
  );
  return steps;
}
