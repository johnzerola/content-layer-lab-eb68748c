"""Load the official Chatterbox PT-BR V3 checkpoints with the pinned runtime.

The PT-BR finetune uses the same T3 and S3Gen architecture as Chatterbox
Multilingual, but has its own T3 and vocoder weights. No model is downloaded at
inference time, and the upstream PerTh watermarker remains in the model class.
"""

from pathlib import Path

import torch
from safetensors.torch import load_file

from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from chatterbox.models.s3gen import S3Gen
from chatterbox.models.t3 import T3
from chatterbox.models.t3.modules.t3_config import T3Config
from chatterbox.models.tokenizers import MTLTokenizer
from chatterbox.models.voice_encoder import VoiceEncoder


PTBR_V3_FILES = (
    "ve.pt",
    "t3_pt_br.safetensors",
    "s3gen_v3.safetensors",
    "grapheme_mtl_merged_expanded_v1.json",
)


def load_ptbr_v3(directory: str | Path, device: str) -> ChatterboxMultilingualTTS:
    root = Path(directory)
    missing = [name for name in PTBR_V3_FILES if not (root / name).is_file()]
    if missing:
        raise FileNotFoundError(f"PT-BR V3 checkpoint incomplete: {', '.join(missing)}")

    voice_encoder = VoiceEncoder()
    voice_encoder.load_state_dict(
        torch.load(root / "ve.pt", map_location="cpu", weights_only=True)
    )
    voice_encoder.to(device).eval()

    t3 = T3(T3Config.multilingual())
    t3.load_state_dict(load_file(root / "t3_pt_br.safetensors", device="cpu"))
    t3.to(device).eval()

    s3gen = S3Gen()
    result = s3gen.load_state_dict(
        load_file(root / "s3gen_v3.safetensors", device="cpu"), strict=False
    )
    # The safetensors export omits two deterministic tokenizer buffers. Any
    # other missing/unexpected parameter indicates incompatible checkpoints.
    if set(result.missing_keys) != {"tokenizer.window", "tokenizer._mel_filters"} or result.unexpected_keys:
        raise RuntimeError("PT-BR V3 vocoder checkpoint is incompatible with this runtime")
    s3gen.to(device).eval()

    tokenizer = MTLTokenizer(str(root / "grapheme_mtl_merged_expanded_v1.json"))
    return ChatterboxMultilingualTTS(t3, s3gen, voice_encoder, tokenizer, device)
