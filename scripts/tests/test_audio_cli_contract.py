import subprocess
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def test_mute_requires_actual_render():
    result=subprocess.run([sys.executable,str(ROOT/'scripts/validate_audio_stems.py'),'--voice','absent.wav','--music','absent.wav','--check-muted'],capture_output=True,text=True)
    assert result.returncode==2
    assert 'requires --rendered-muted' in result.stderr

def test_benchmark_requires_explicit_model_and_device():
    result=subprocess.run([sys.executable,str(ROOT/'scripts/benchmark_audio_separation.py')],capture_output=True,text=True)
    assert result.returncode==2
    assert '--manifest' in result.stderr and '--output' in result.stderr
