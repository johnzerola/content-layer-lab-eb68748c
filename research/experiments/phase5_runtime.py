"""Local research adapter for pinned MMEditing v0.16.0, no production imports.

Executes unchanged official architecture definitions with a narrow replacement
for MMCV's ConvModule (only Conv2d + optional ReLU), registration and init helpers.
Strict checkpoint loading is mandatory. This is NOT certified old-runtime parity.
"""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import time

import torch
from torch import nn

ROOT = Path('G:/cleaneria-runtime/phase5-mmediting')
REV = '8b819f1d28d6eed6244721278a099f5dc0848a20'
WEIGHT = ROOT.parent / 'phase5-realbasicvsr.pth'
# Full digest copied from the previously verified official checkpoint record.
SHA = '52f77c2c835aaa3fe675b3959b2f85010a6c6f63f77f7e279394646e55a4e376'
URL = 'https://download.openmmlab.com/mmediting/restorers/real_basicvsr/realbasicvsr_c64b20_1x30x8_lr5e-5_150k_reds_20211104-52f77c2c.pth'


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


class ConvModule(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride, padding,
                 norm_cfg, act_cfg):
        super().__init__()
        assert norm_cfg is None and act_cfg in (None, {'type': 'ReLU'})
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size, stride, padding, bias=True)
        self.activate = nn.ReLU(inplace=True) if act_cfg else nn.Identity()

    def forward(self, x):
        return self.activate(self.conv(x))


class Registry:
    def register_module(self):
        return lambda cls: cls


def kaiming_init(module, a, mode, bias):
    nn.init.kaiming_normal_(module.weight, a=a, mode=mode)
    if module.bias is not None:
        nn.init.constant_(module.bias, bias)


def forbidden(*a, **kw):
    raise RuntimeError('Unsupported legacy dependency path; no silent fallback')


def load_model():
    rev = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    assert rev == REV, rev
    subprocess.run(['git', '-C', str(ROOT), 'diff', '--exit-code', '--', 'mmedit/models'], check=True, stdout=subprocess.DEVNULL)
    if not WEIGHT.exists():
        print('Downloading official checkpoint', flush=True)
        partial = WEIGHT.with_suffix('.download')
        subprocess.run(['curl.exe', '--fail', '--location', '--silent', '--show-error',
                        '--max-time', '180', '--output', str(partial), URL], check=True)
        assert sha(partial) == SHA, 'Checkpoint hash mismatch'
        partial.replace(WEIGHT)
    assert sha(WEIGHT) == SHA
    env = dict(torch=torch, nn=nn, F=torch.nn.functional, ConvModule=ConvModule,
               BACKBONES=Registry(), load_checkpoint=forbidden, get_root_logger=forbidden,
               kaiming_init=kaiming_init, constant_init=forbidden,
               _BatchNorm=nn.modules.batchnorm._BatchNorm)
    paths = ['common/sr_backbone_utils.py', 'common/flow_warp.py', 'common/upsample.py',
             'backbones/sr_backbones/basicvsr_net.py', 'backbones/sr_backbones/real_basicvsr_net.py']
    provenance = {}
    for relative in paths:
        path = ROOT / 'mmedit/models' / relative
        # Remove import statements only. Class/function bodies are unchanged.
        tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        tree.body = [node for node in tree.body if not isinstance(node, (ast.Import, ast.ImportFrom))]
        exec(compile(tree, str(path), 'exec'), env)
        provenance[relative] = sha(path)
    model = env['RealBasicVSRNet'](mid_channels=64, num_propagation_blocks=20,
                                 num_cleaning_blocks=20, dynamic_refine_thres=255,
                                 is_sequential_cleaning=False)
    checkpoint = torch.load(WEIGHT, map_location='cpu', weights_only=True)['state_dict']
    prefix = 'generator_ema.' if any(k.startswith('generator_ema.') for k in checkpoint) else 'generator.'
    state = {k[len(prefix):]: v for k, v in checkpoint.items() if k.startswith(prefix)}
    result = model.load_state_dict(state, strict=True)
    return model.eval(), dict(source_revision=rev, source_hashes=provenance,
                             weights_url=URL, weights_sha256=SHA, prefix=prefix,
                             keys=len(state), strict_load=str(result), adapter_sha256=sha(__file__))


def smoke(output):
    output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    torch.manual_seed(51)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    torch.backends.cuda.matmul.allow_tf32 = False
    assert torch.cuda.is_available(), 'CUDA required for this bounded local test'
    start = time.perf_counter()
    model, info = load_model()
    model = model.cuda()
    base = torch.rand(1, 1, 3, 64, 64, device='cuda')
    x = torch.cat([base, base.roll(1, -1), base.roll(2, -1)], dim=1)
    with torch.inference_mode():
        a = model(x.clone())
        b = model(x.clone())
    torch.cuda.synchronize()
    assert a.shape == (1, 3, 3, 256, 256) and torch.isfinite(a).all()
    delta = float((a-b).abs().max())
    assert delta <= 1e-6, delta
    info.update(status='PASS', torch=torch.__version__, cuda=torch.version.cuda,
                gpu=torch.cuda.get_device_name(), input_shape=list(x.shape), output_shape=list(a.shape),
                repeat_max_abs=delta, raw_min=float(a.min()), raw_max=float(a.max()),
                peak_vram_bytes=torch.cuda.max_memory_allocated(), seconds=time.perf_counter()-start,
                cloud_cost_usd=0, quality_validation=False)
    torch.save({'input': x.cpu(), 'output': a.cpu()}, output/'smoke-tensors.pt')
    (output/'smoke.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    print(json.dumps(info, indent=2), flush=True)


if __name__ == '__main__':
    smoke(Path('G:/dowloand/teste/phase-5-20260911/runtime'))
