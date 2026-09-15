# Model and reasoning routing for Cleaner engineering

The canonical policy remains [MODEL_ROUTING_POLICY.md](../token-efficiency/MODEL_ROUTING_POLICY.md) and [REASONING_ROUTING_POLICY.md](../token-efficiency/REASONING_ROUTING_POLICY.md). It uses capability tiers and does not bind model names. Custom Cleaner agents inherit the parent model and reasoning so the current client/account can resolve supported options.

| Task | Initial capability / reasoning | Escalate when |
| --- | --- | --- |
| File discovery, hashes, mechanical validation | Fast economical / low | The task stops being mechanical |
| Normal adapter, schema, documentation, or test implementation | Strong general coding / medium | Integration or causality is ambiguous |
| Reconstruction, masks, motion, video, GPU, experimental interpretation | High-capability coding / high | Evidence conflicts after a well-formed experiment |
| Architecture or unresolved causal/numerical conflict | Highest available capability / high or xhigh | Use max only for one bounded exceptional problem |

Reasoning is independent from model choice. Escalate because evidence shows reasoning difficulty, not because a download, tool, or GPU failed. Return to medium/low once the contract is clear. Avoid maximum reasoning and multi-agent work for routine operations.

Named model mappings in dated external roadmaps are advisory snapshots. Verify the current client inventory and account availability before selecting one; never encode those names as permanent project requirements.
