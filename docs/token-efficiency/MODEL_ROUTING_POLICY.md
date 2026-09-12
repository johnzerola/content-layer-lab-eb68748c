# Model routing policy

No model name is bound in this repository. Tiers are resolved only from models actually exposed by the active Codex environment at task time.

| Tier | Task characteristics | Reasoning starting point |
| --- | --- | --- |
| T0/T1 | discovery, formatting, tests, simple docs, low blast radius | low |
| T1 | small covered change | low or medium |
| T2 | normal multi-file engineering | medium |
| T3 | FFmpeg/media/GPU/concurrency/hard debugging | high |
| T4 | security, destructive migration, deep root cause, ambiguous architecture | highest justified |

Escalate only after evidence: a reproducible failure, repeated reasoning error, unresolved architectural conflict, non-converging test, or elevated risk. De-escalate implementation and mechanical verification after a stronger model establishes the plan. The policy cannot promote a tier mapping until sufficient aggregated history is reviewed.
