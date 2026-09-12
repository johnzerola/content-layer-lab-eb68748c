"""CPU runtime/checkpoint smoke; does not measure restoration quality or GPU speed."""
import hashlib
import json
import sys
import torch
from mmedit.models import build_backbone

path = sys.argv[1]
with open(path, 'rb') as stream:
    actual = hashlib.sha256(stream.read()).hexdigest()
expected = '52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376'
assert actual == expected, 'official checkpoint hash mismatch'
torch.set_num_threads(2)
model = build_backbone(dict(type='RealBasicVSRNet', is_sequential_cleaning=True)).eval()
state = torch.load(path, map_location='cpu')['state_dict']
prefix = 'generator_ema.' if any(k.startswith('generator_ema.') for k in state) else 'generator.'
weights = {k[len(prefix):]: v for k, v in state.items() if k.startswith(prefix)}
assert weights, 'checkpoint has no generator'
model.load_state_dict(weights, strict=True)
with torch.no_grad():
    result = model(torch.full((1, 2, 3, 64, 64), .5))
assert result.shape == (1, 2, 3, 256, 256)
assert torch.isfinite(result).all()
print(json.dumps({'status':'passed', 'scope':'CPU synthetic runtime smoke only',
                  'checkpoint_sha256':actual, 'weights_prefix':prefix,
                  'output_shape':list(result.shape), 'torch':torch.__version__,
                  'quality_verdict':None, 'gpu_cost':None}))
