"""Research gate for effect-aware masks. Detection is deliberately not yet heuristic."""
from __future__ import annotations


def detect_associated_effects(video: str, overlay_mask: str, temporal_window: int = 9) -> dict:
    if not video or not overlay_mask or not 1 <= temporal_window <= 121 or temporal_window % 2 != 1:
        raise ValueError('video and overlay_mask required; temporal_window must be an odd number from 1 to 121')
    return {
        'status': 'RESEARCH_GATE_NOT_EXECUTED',
        'inputs': {'video': video, 'overlay_mask': overlay_mask, 'temporal_window': temporal_window},
        'output_contract': {
            'primary_mask': 'required input-aligned overlay extent',
            'shadow_mask': None,
            'glow_mask': None,
            'reflection_mask': None,
            'transparency_mask': None,
            'effect_confidence': None,
        },
        'reason': 'No arbitrary pixel heuristics are installed. Establish annotations, evidence and a held-out experiment first.',
        'research_card': 'research/algorithms/associated-effect-removal.md',
        'next_gate': 'Annotate primary and associated effects separately; compare residual removal against background loss and temporal stability.'
    }
