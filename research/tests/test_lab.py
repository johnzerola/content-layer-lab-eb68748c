import asyncio
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab import core, remote, benchmark
from bootstrap import make_case


def test_inspection_has_real_signature_and_no_import():
    data = core.inspect_component('backend/app/workers/tasks.py', 'run_pipeline')
    assert 'job_id' in data['symbols'][0]['inputs']
    assert 'detect_scenes' in data['symbols'][0]['callees_syntactic']
    assert data['deployment'] == 'UNVERIFIED'
    with pytest.raises(ValueError):
        core.inspect_component('.env')
    with pytest.raises(ValueError):
        core.confined(core.ROOT, '../outside.py', exists=False)


def test_records_do_not_overwrite_and_validate(tmp_path, monkeypatch):
    monkeypatch.setattr(core, 'ROOT', tmp_path)
    a = core.record_research('failures', 'Halo', 'Observed halo', ['test-artifact'])
    b = core.record_research('failures', 'Halo', 'Other observation', ['test-artifact'])
    assert a['id'] != b['id']
    assert core.search_knowledge('halo')['total'] == 2
    with pytest.raises(ValueError):
        core.record_research('../production', 'x', 'x', ['x'])
    with pytest.raises(ValueError):
        core.record_research('failures', 'x', 'x', [], 'CONFIRMED')


@pytest.mark.parametrize('url', ['http://api.github.com', 'https://127.0.0.1',
                               'https://api.github.com@localhost/', 'file:///etc/passwd',
                               'https://api.github.com:1234/'])
def test_remote_rejects_nonpublic_destinations(url):
    with pytest.raises(ValueError):
        remote.fetch(url)


def test_benchmark_detects_leakage_truncation_and_mismatched_cases(tmp_path, monkeypatch):
    monkeypatch.setattr(benchmark, 'ROOT', tmp_path)
    base = tmp_path / 'research/benchmarks'
    manifest = make_case(base, frames=3)
    case, streams = benchmark.load_case(str(manifest.relative_to(base)))
    identity = benchmark.benchmark_engine(str(manifest.relative_to(base)))
    assert identity['metrics']['outside_mask_mae'] == 0
    assert identity['metrics']['mse_gt'] > 0  # control does not remove subtitle
    telea = benchmark.benchmark_engine(str(manifest.relative_to(base)), 'opencv-telea')
    assert telea['metrics']['outside_mask_mae'] == 0
    assert telea['metrics']['mse_gt'] < identity['metrics']['mse_gt']
    output = tmp_path / identity['result_path']
    first = sorted(output.glob('*.png'))[0]
    frame = cv2.imread(str(first))
    frame[0, 0] = [255, 255, 255]
    cv2.imwrite(str(first), frame)
    assert benchmark.evaluate(streams, benchmark.sequence(output))['outside_mask_mae'] > 0
    with pytest.raises(ValueError):
        benchmark.evaluate(streams, benchmark.sequence(output)[:-1])
    paths = [str(Path(r['report_path']).relative_to('research/benchmarks')) for r in (identity, telea)]
    assert benchmark.compare_results(paths)['verdict'] == 'REVIEW_REQUIRED'
    report = base / paths[1]
    data = json.loads(report.read_text())
    data['fps'] = 60
    report.write_text(json.dumps(data))
    with pytest.raises(ValueError):
        benchmark.compare_results(paths)


def test_ssim_identity_and_perfect_gt(tmp_path):
    manifest = make_case(tmp_path, frames=2)
    folder = manifest.parent
    streams = {k: benchmark.sequence(folder / k) for k in ('input', 'mask', 'ground_truth')}
    result = benchmark.evaluate(streams, streams['ground_truth'])
    assert result['ssim_gt'] == pytest.approx(1)
    assert result['perfect_gt_match']
    assert result['psnr_db'] is None  # JSON-safe representation of positive infinity


def test_mcp_stdio_handshake_and_skill_workflow():
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    async def run():
        params = StdioServerParameters(command=sys.executable, args=[str(core.ROOT / 'research/server.py')])
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                listed = await session.list_tools()
                assert len(listed.tools) == 21
                result = await session.call_tool('inspect_component', {'path': 'backend/app/workers/tasks.py', 'symbol': 'run_pipeline'})
                assert not result.isError
                assert 'run_pipeline' in result.content[0].text
                trace = await session.call_tool('trace_pipeline', {})
                assert not trace.isError
                invalid = await session.call_tool('inspect_component', {'path': '../outside.py'})
                assert invalid.isError
    asyncio.run(run())


def test_new_research_gates_do_not_infer_license_or_effect_detection():
    from lab import associated_effects, license_graph
    graph = license_graph.build_license_dependency_graph('DiffuEraser')
    assert graph['commercial_decision'] == 'REVIEW_REQUIRED'
    assert graph['projects'][0]['commercial_status'] == 'BLOCKED_PENDING_ARTIFACT_REVIEW'
    result = associated_effects.detect_associated_effects('data/case/video.mp4', 'data/case/mask.png', 9)
    assert result['status'] == 'RESEARCH_GATE_NOT_EXECUTED'
    assert result['output_contract']['glow_mask'] is None


def test_video_extraction_preserves_count_and_rejects_budget(tmp_path, monkeypatch):
    import shutil
    import subprocess
    from lab import video
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        pytest.skip('FFmpeg is optional for PNG-only benchmarks')
    monkeypatch.setattr(video, 'ROOT', tmp_path)
    folder = tmp_path / 'research/benchmarks'
    folder.mkdir(parents=True)
    sample = folder / 'sample.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=30',
                    '-frames:v', '5', '-c:v', 'ffv1', str(sample)], check=True, timeout=30)
    result = video.extract_comparison_frames('sample.mkv', 5)
    assert result['frames'] == 5
    assert result['fps'] == 30
    with pytest.raises(ValueError):
        video.extract_comparison_frames('sample.mkv', 4)
    variable = folder / 'variable.mkv'
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=30',
                    '-frames:v', '5', '-vf', 'setpts=N*N/(30*TB)', '-fps_mode', 'vfr',
                    '-c:v', 'ffv1', str(variable)], check=True, timeout=30)
    with pytest.raises(ValueError, match='Variable or discontinuous'):
        video.extract_comparison_frames('variable.mkv', 10)


def test_public_fetch_cache_and_redirect_boundary(tmp_path, monkeypatch):
    import httpx
    monkeypatch.setattr(remote, 'ROOT', tmp_path)
    (tmp_path / 'research').mkdir()
    calls = []
    def respond(request):
        calls.append(str(request.url))
        if request.url.path == '/redirect':
            return httpx.Response(302, headers={'Location': 'https://127.0.0.1/private'})
        return httpx.Response(200, json={'ok': True})
    real_client = httpx.Client
    monkeypatch.setattr(remote.httpx, 'Client', lambda **kw: real_client(**kw, transport=httpx.MockTransport(respond)))
    first = remote.fetch('https://api.github.com/example')
    second = remote.fetch('https://api.github.com/example')
    assert first['sha256'] == second['sha256']
    assert second['cached'] and len(calls) == 1
    with pytest.raises(httpx.HTTPStatusError):
        remote.fetch('https://api.github.com/redirect')
    assert not any('127.0.0.1' in c for c in calls)


def test_paper_provider_parses_primary_metadata(monkeypatch):
    atom = '''<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>https://arxiv.org/abs/2309.03897</id>
        <title>ProPainter</title><summary>Abstract</summary><published>2023-09-07</published>
        <author><name>Author</name></author></entry></feed>'''
    monkeypatch.setattr(remote, 'fetch', lambda url: {'url': url, 'body': atom, 'sha256': 'fixture'})
    result = remote.search_papers('id:2309.03897')
    assert result['papers'][0]['title'] == 'ProPainter'
    assert result['papers'][0]['authors'] == ['Author']
