"""Convert floating tensors in one safetensors file to FP16 with verification."""
import argparse
import hashlib
import json
from pathlib import Path

import torch
from safetensors import safe_open
from safetensors.torch import save_file


def digest(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    if args.target.exists():
        raise FileExistsError(args.target)
    args.target.parent.mkdir(parents=True, exist_ok=True)
    converted = {}
    source_shapes = {}
    with safe_open(str(args.source), framework="pt", device="cpu") as archive:
        metadata = archive.metadata()
        for key in archive.keys():
            tensor = archive.get_tensor(key)
            source_shapes[key] = list(tensor.shape)
            converted[key] = tensor.to(torch.float16) if tensor.is_floating_point() else tensor.clone()
    save_file(converted, str(args.target), metadata=metadata)
    with safe_open(str(args.target), framework="pt", device="cpu") as archive:
        if set(archive.keys()) != set(source_shapes):
            raise RuntimeError("tensor keys changed")
        for key in archive.keys():
            view = archive.get_slice(key)
            if list(view.get_shape()) != source_shapes[key]:
                raise RuntimeError("tensor shape changed")
            if view.get_dtype() not in ("F16", "I64", "I32", "I16", "I8", "U8", "BOOL"):
                raise RuntimeError("unexpected target dtype " + view.get_dtype())
    print(json.dumps({"source_sha256": digest(args.source), "target_sha256": digest(args.target),
                      "source_bytes": args.source.stat().st_size, "target_bytes": args.target.stat().st_size,
                      "tensors": len(source_shapes)}))


if __name__ == "__main__":
    main()
