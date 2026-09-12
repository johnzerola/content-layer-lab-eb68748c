"""Instrument an unmodified local ProPainter runner for research artifacts."""
import os
from pathlib import Path
import random
import sys

import numpy as np
import torch

root = Path(os.environ['PHASE23_PROPAINTER_ROOT'])
sys.path.insert(0, str(root))
random.seed(1234)
np.random.seed(1234)
torch.manual_seed(1234)
torch.cuda.manual_seed_all(1234)
source = (root / 'inference_propainter.py').read_text(encoding='utf-8')
needle = '            for i in range(len(neighbor_ids)):'
if source.count(needle) != 1:
    raise RuntimeError('Unexpected upstream runner; instrumentation refused')
insertion = '''            _audit_dir = os.path.join(args.output, 'raw_predictions')
            os.makedirs(_audit_dir, exist_ok=True)
            np.savez(os.path.join(_audit_dir, f'window-{f:04d}.npz'),
                     pred_img=pred_img, neighbor_ids=np.asarray(neighbor_ids),
                     ref_ids=np.asarray(ref_ids), binary_masks=binary_masks,
                     center=np.asarray(f))
'''
source = source.replace(needle, insertion + needle)
exec(compile(source, str(root / 'inference_propainter.py'), 'exec'), {'__name__': '__main__', '__file__': str(root / 'inference_propainter.py')})
