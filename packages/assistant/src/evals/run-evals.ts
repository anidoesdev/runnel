import { writeFileSync } from 'node:fs';
import { OpenAiModelProvider } from '../providers/openai-model-provider.js';
import { ALL_EVAL_CASES } from './cases/index.js';
import { formatScorecard, scorecardToJson } from './reporter.js';
import { runEvalSuite } from './runner.js';

/**
 * CLI entry point for the eval suite (Part 7). Requires OPENAI_API_KEY — a fake or missing key
 * would score the prompt against nothing, which is worse than not running at all, so this exits
 * 0 with a clear skip message instead of failing the build when it's absent (letting CI gate on
 * whether the secret exists rather than this script pretending success).
 *
 * Env vars:
 *   OPENAI_API_KEY   required to actually run; missing key => skip (exit 0)
 *   OPENAI_BASE_URL  optional, for an OpenAI-compatible endpoint other than api.openai.com
 *   OPENAI_MODEL     optional, defaults to the provider's own default
 *   EVAL_REPORT_PATH optional, writes the JSON scorecard there for CI artifact upload
 */
async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('OPENAI_API_KEY not set — skipping eval suite.');
    return;
  }

  const provider = new OpenAiModelProvider({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
  });

  console.log(`Running ${ALL_EVAL_CASES.length} eval cases against ${process.env.OPENAI_MODEL ?? '(default model)'}...`);
  const scorecard = await runEvalSuite(ALL_EVAL_CASES, provider);

  console.log(formatScorecard(scorecard));

  const reportPath = process.env.EVAL_REPORT_PATH;
  if (reportPath) {
    writeFileSync(reportPath, scorecardToJson(scorecard));
    console.log(`Wrote JSON scorecard to ${reportPath}`);
  }

  if (scorecard.passed < scorecard.total) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
