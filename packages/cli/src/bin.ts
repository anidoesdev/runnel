#!/usr/bin/env node
import { getLoadedNodeTypeNames } from './index.js';

// `n8n-clone start` / `worker` / `webhook` / `execute` subcommands land in M6/M7/M10.
console.log('n8n-clone CLI — loaded node types:', getLoadedNodeTypeNames());
