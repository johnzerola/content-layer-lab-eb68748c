"""Offline imports and invariants only: no API calls, model loads or GPU jobs."""
import numpy as np
from app.services.chunking import plan_chunks
from app.services.mask_modes import karaoke_union
from app.services.quality_policy import review_issues
from app.workers.tasks import _run_official_pipeline, _run_diffusion_pipeline

masks = np.zeros((3, 20, 20), np.uint8)
masks[0, 2:4, 2:4] = 255
masks[2, 10:12, 10:12] = 255
assert not karaoke_union(masks)[1].any()
assert len(plan_chunks(5, cuts=[2])) == 2
assert review_issues({})
print("scene-masks-v1: imports, masks, scene planning and quality guards OK (no inference)")
