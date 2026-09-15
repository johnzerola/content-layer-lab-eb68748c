# Cleaner specialist routing

Use the smallest team that covers the question: normally one primary and one reviewer, with a third specialist only for a real boundary. Do not activate every specialist or let multiple agents write the same files.

| Work | Primary | Reviewer / escalation | Existing narrow skills that may assist |
| --- | --- | --- | --- |
| E1 — mask and evaluation truth | `cleaner-video-reconstruction-engineer` | `reconstruction-quality-scientist` | `mask-engineer`, `subtitle-detection-researcher` |
| E2 — real-reference recovery | `temporal-correspondence-engineer` | Quality scientist; escalate unknown support to reconstruction engineer | `temporal-video-engineer` |
| E3 — temporal reconstruction | `cleaner-video-reconstruction-engineer` | `reconstruction-quality-scientist` | `video-inpainting-researcher`, `video-ai-license-researcher` |
| Quality harness operation | `video-restoration-benchmark-engineer` | Quality scientist retains verdict authority | — |
| GPU/memory/cost after quality | `cleaner-gpu-performance-engineer` | Reconstruction engineer for output equivalence | `gpu-video-performance-engineer` |
| VMake/external behavior | `clean-room-video-systems-analyst` | `reconstruction-quality-scientist` | `video-ai-license-researcher` when artifacts are imported |
| Current deployed-path mapping | `cleaner-ai-architect` | Relevant specialist above | — |

The five new roles own the question, contract, evidence, and decision boundary. Older skills remain bounded implementation/research helpers; this prevents duplicate authority.

## E1 / E2 / E3 handoffs

- E1 hands frozen presence/evaluation truth and separate mask layers to E2/E3. A reviewed development mask does not approve an automatic detector.
- E2 hands accepted observed/propagated pixels, provenance/confidence maps, rejection reasons, and an `UNKNOWN` escalation map to E3.
- E3 hands frozen raw and composed candidates to quality review. GPU work joins only after quality credibility or for an explicitly isolated capacity question.

## Examples

- E2 debugging: temporal correspondence + quality scientist.
- FGT memory feasibility: reconstruction + GPU performance.
- VMake behavioral study: clean-room analyst + quality scientist.
- Cross-stage ambiguity: reconstruction + relevant primary + quality scientist; cap the team at three.

Each agent inherits the parent model and reasoning unless a session explicitly overrides it. Project agent files deliberately do not hard-code model names. See [MODEL-AND-REASONING-ROUTING.md](MODEL-AND-REASONING-ROUTING.md).
