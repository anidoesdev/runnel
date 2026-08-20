import type { IEvalCase } from '../types.js';
import { SINGLE_NODE_BUILD_CASES } from './single-node-builds.js';
import { TRANSFORM_CASES } from './transforms.js';
import { AI_AGENT_CASES } from './ai-agent.js';
import { PIPELINE_CASES } from './pipelines.js';
import { CLARIFYING_QUESTION_CASES } from './clarifying-questions.js';
import { APPROVAL_GATE_CASES } from './approval-gates.js';
import { CREDENTIAL_CASES } from './credentials.js';
import { FIX_THIS_CASES } from './fix-this.js';
import { GROUNDING_CASES } from './grounding.js';

export const ALL_EVAL_CASES: IEvalCase[] = [
  ...SINGLE_NODE_BUILD_CASES,
  ...TRANSFORM_CASES,
  ...AI_AGENT_CASES,
  ...PIPELINE_CASES,
  ...CLARIFYING_QUESTION_CASES,
  ...APPROVAL_GATE_CASES,
  ...CREDENTIAL_CASES,
  ...FIX_THIS_CASES,
  ...GROUNDING_CASES,
];

export {
  SINGLE_NODE_BUILD_CASES,
  TRANSFORM_CASES,
  AI_AGENT_CASES,
  PIPELINE_CASES,
  CLARIFYING_QUESTION_CASES,
  APPROVAL_GATE_CASES,
  CREDENTIAL_CASES,
  FIX_THIS_CASES,
  GROUNDING_CASES,
};
