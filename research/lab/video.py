"""Extract complete CFR comparison videos without silently resampling/truncating."""
import json
import math
import subprocess
from fractions import Fraction
from uuid import uuid4

from lab.core import ROOT, confined, digest, now
from lab.benchmark import sequence, sequence_hash


def extract_comparison_frames(video_path, max_frames=3000):
    source = confined(ROOT / 'research/benchmarks', video_path)
    if source.suffix.lower() not in {'.mp4', '.mov', '.mkv', '.avi', '.webm'}:
        raise ValueError('Expected a local video file')
    if not 1 <= max_frames <= 10000:
        raise ValueError('max_frames must be 1..10000')
    # Inspection and extraction both limit protocols to local file/pipe.
    probed = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-select_streams', 'v:0', '-show_entries',
        'stream=width,height,avg_frame_rate,time_base:frame=best_effort_timestamp_time',
        '-show_frames', '-of', 'json', str(source)], capture_output=True, text=True,
        encoding='utf-8', check=True, timeout=90)
    metadata = json.loads(probed.stdout)
    stream = metadata['streams'][0]
    fps = float(Fraction(stream['avg_frame_rate']))
    timestamps = [float(f['best_effort_timestamp_time']) for f in metadata['frames']
                  if 'best_effort_timestamp_time' in f]
    if not timestamps or len(timestamps) > max_frames or not math.isfinite(fps) or fps <= 0:
        raise ValueError('Invalid timing or complete video exceeds frame budget; trim explicitly first')
    if len(timestamps) != len(metadata['frames']):
        raise ValueError('Missing frame timestamps; cannot establish comparison alignment')
    if stream['width'] * stream['height'] > 4096 * 4096:
        raise ValueError('Video exceeds pixel budget')
    # Matroska can quantize a 30 FPS clock to millisecond timestamps (33/34 ms).
    # Accept one container tick, but reject accumulated drift from the CFR grid.
    tolerance = max(float(Fraction(stream['time_base'])) + 1e-6, 0.005 / fps)
    if any(b <= a for a,b in zip(timestamps, timestamps[1:])) or any(
            abs(t - timestamps[0] - i/fps) > tolerance for i,t in enumerate(timestamps)):
        raise ValueError('Variable or discontinuous timestamps; prepare an explicit timing-aware case')
    folder = ROOT / 'research/benchmarks/data' / ('extract-' + uuid4().hex)
    output = folder / 'frames'
    output.mkdir(parents=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
        '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn', '-fps_mode', 'passthrough',
        '-start_number', '0', str(output / '%06d.png')], capture_output=True, check=True, timeout=180)
    files = sequence(output)
    if len(files) != len(timestamps):
        raise ValueError('Decoded frame count does not match probed timestamps')
    result = {'source': source.relative_to(ROOT).as_posix(), 'source_sha256': digest(source),
              'at': now(), 'fps': fps, 'timestamps': timestamps, 'frames': len(files),
              'width': stream['width'], 'height': stream['height'],
              'timestamp_tolerance_seconds': tolerance,
              'output_directory': output.relative_to(ROOT / 'research/benchmarks').as_posix(),
              'output_sha256': sequence_hash(files),
              'limitations': 'Decoded RGB from source codec; not original pre-encode pixels. Audio not evaluated.'}
    (folder / 'extraction.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result
