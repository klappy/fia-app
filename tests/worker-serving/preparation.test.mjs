// Include focused preparation contracts/runtime in the existing required worker CI gate.
import '../preparation/contract.test.mjs';
import '../preparation/original.test.mjs';
import '../preparation/source-store.test.mjs';
import '../preparation/published.test.mjs';
import '../preparation/worker.test.mjs';

import '../preparation-executor/reviewed-original.test.mjs';
import '../preparation-executor/reviewed-original-store.test.mjs';

import '../preparation/stable-coordinator.test.mjs';
import '../preparation-executor/known-source-stream.test.mjs';
