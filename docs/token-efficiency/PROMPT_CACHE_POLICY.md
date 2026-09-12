# Prompt-cache policy

The current Codex surface does not expose per-task prompt-cache accounting to this repository; cache metrics are `NOT_AVAILABLE` until it does.

Keep stable material first when the client supports caching: universal rules, narrow tool contracts, and stable domain references. Put task-specific instructions, diffs, failures and exact ranges after that prefix. Do not mutate a stable prefix for incidental task narration. Never report cache savings without account-provided cache-token data.
