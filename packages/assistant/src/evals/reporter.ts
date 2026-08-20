import type { IScorecard } from './types.js';

/** Human-readable console report — one line per case, then the headline "% requiring zero human correction" number Part 7 calls out. */
export function formatScorecard(scorecard: IScorecard): string {
  const lines: string[] = [];
  for (const result of scorecard.results) {
    const mark = result.passed ? 'PASS' : 'FAIL';
    lines.push(`[${mark}] ${result.caseId} (${result.toolCallCount} tool calls, ${result.durationMs}ms, status=${result.finalStatus})`);
    if (result.error) lines.push(`       error: ${result.error}`);
    for (const assertionResult of result.assertionResults) {
      if (!assertionResult.passed) {
        lines.push(`       failed: ${JSON.stringify(assertionResult.assertion)}${assertionResult.detail ? ` — ${assertionResult.detail}` : ''}`);
      }
    }
  }
  lines.push('');
  lines.push(`${scorecard.passed}/${scorecard.total} passed (${(scorecard.passRate * 100).toFixed(1)}%) — ${scorecard.totalToolCalls} tool calls, ${scorecard.totalTokens} tokens, ${scorecard.totalDurationMs}ms total`);
  return lines.join('\n');
}

/** Machine-readable form for a CI artifact upload. */
export function scorecardToJson(scorecard: IScorecard): string {
  return JSON.stringify(scorecard, null, 2);
}
