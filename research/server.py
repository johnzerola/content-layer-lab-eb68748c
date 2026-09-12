"""Cleaner Research MCP server and equivalent CLI. Run from any working directory."""
from __future__ import annotations

import argparse
import inspect
import json

from mcp.server.fastmcp import FastMCP

from lab import core, remote, benchmark, video, license_graph, associated_effects

mcp = FastMCP('cleaner-research-mcp')
TOOLS = {}


def expose(fn, description):
    fn.__doc__ = description
    # FastMCP derives schemas from explicitly annotated public wrappers below.
    TOOLS[fn.__name__] = fn
    mcp.tool()(fn)
    return fn


def inspect_project(query: str = '', limit: int = 60) -> dict:
    return core.inspect_project(query, limit)

def inspect_component(path: str, symbol: str = '') -> dict:
    return core.inspect_component(path, symbol)

def trace_pipeline(stage: str = 'all') -> dict:
    return core.trace_pipeline(stage)

def search_knowledge(query: str, limit: int = 20) -> dict:
    return core.search_knowledge(query, limit)

def record_research(category: str, title: str, body: str, sources: list[str], evidence: str = 'HYPOTHESIS') -> dict:
    return core.record_research(category, title, body, sources, evidence)

def create_experiment(problem: str, hypothesis: str, baseline: str, change: str, dataset: str, metrics: list[str]) -> dict:
    return core.create_experiment(problem, hypothesis, baseline, change, dataset, metrics)

def analyze_video_failure(observations: str, artifacts: list[str]) -> dict:
    return core.analyze_video_failure(observations, artifacts)

def search_github_projects(query: str, limit: int = 10) -> dict:
    return remote.search_github_projects(query, limit)

def analyze_github_repository(repository: str, paths: list[str] | None = None) -> dict:
    return remote.analyze_github_repository(repository, paths)

def search_papers(query: str, limit: int = 8) -> dict:
    return remote.search_papers(query, limit)

def analyze_paper(arxiv_id: str) -> dict:
    return remote.analyze_paper(arxiv_id)

def search_models(query: str, limit: int = 10) -> dict:
    return remote.search_models(query, limit)

def search_commercial_research(query: str) -> dict:
    return remote.search_commercial_research(query)

def fetch_public_source(url: str) -> dict:
    result = remote.fetch(url)
    return {**result, 'body': result['body'][:60000], 'truncated': len(result['body']) > 60000}

def inspect_license(repository: str) -> dict:
    return remote.inspect_license(repository)

def build_license_dependency_graph(project: str = '') -> dict:
    return license_graph.build_license_dependency_graph(project)

def detect_associated_effects(video: str, overlay_mask: str, temporal_window: int = 9) -> dict:
    return associated_effects.detect_associated_effects(video, overlay_mask, temporal_window)

def benchmark_engine(manifest: str, engine: str = 'identity', radius: int = 3) -> dict:
    return benchmark.benchmark_engine(manifest, engine, radius)

def compare_results(report_paths: list[str]) -> dict:
    return benchmark.compare_results(report_paths)

def import_result(manifest: str, output_directory: str, engine: str, provenance: list[str]) -> dict:
    return benchmark.import_result(manifest, output_directory, engine, provenance)

def extract_comparison_frames(video_path: str, max_frames: int = 3000) -> dict:
    return video.extract_comparison_frames(video_path, max_frames)

DESCRIPTIONS = {
 'inspect_project': 'Read allowlisted project sources; Python AST symbols/imports and textual references. No source execution. Deployment unverified.',
 'inspect_component': 'Inspect a source file and optional Python symbol with hashes, inputs, callees and configuration names. Runtime semantics require review.',
 'trace_pipeline': 'Read the curated Cleaner pipeline graph and verify referenced files exist. Optional stage substring.',
 'search_knowledge': 'Search persistent internal research records before repeating external research.',
 'record_research': 'Create an immutable research record with sources and evidence level in research/category.',
 'create_experiment': 'Create a designed, isolated experiment record; does not run or change production.',
 'analyze_video_failure': 'Generate prioritized investigation hypotheses from English symptom keywords; does not perform visual diagnosis.',
 'search_github_projects': 'Search public GitHub repositories through the GitHub API.',
 'analyze_github_repository': 'Retrieve pinned source files, repository tree and sampled issues/PRs/forks/releases for skill analysis; not automatic semantic understanding.',
 'search_papers': 'Search arXiv metadata and abstracts; other proceedings are not covered by this provider.',
 'analyze_paper': 'Retrieve arXiv abstract and available HTML for structured skill review; does not invent unavailable paper findings.',
 'search_models': 'Search Hugging Face metadata; VRAM/speed/quality remain unmeasured.',
 'search_commercial_research': 'Search the curated public commercial-source index; not general web search.',
 'fetch_public_source': 'Retrieve a bounded HTTPS page from an allowlisted public research host. No redirects, credentials or code execution.',
 'inspect_license': 'Retrieve repository license evidence; separate weights, models, datasets and commercial permission require review.',
 'build_license_dependency_graph': 'Return the documented artifact/dependency license graph and unresolved commercial blockers; it does not grant permission.',
 'detect_associated_effects': 'Return the research-gated interface for primary, shadow, glow, reflection and transparency masks. No heuristic detector is claimed or executed yet.',
 'benchmark_engine': 'Run CPU identity or OpenCV Telea controls on an aligned PNG case and persist measured metrics; never invokes production/GPU.',
 'compare_results': 'Compare 2..10 reports after verifying identical inputs, masks, GT, FPS and frame counts; no automatic overall quality verdict.',
 'import_result': 'Evaluate aligned frames exported from an external engine with provenance; does not fabricate execution telemetry.',
 'extract_comparison_frames': 'Extract all frames from a local CFR video under research/benchmarks, preserving timestamps and hashes. Reject VFR, truncation and excessive frame budgets. Requires FFmpeg/ffprobe.',
}
for name, description in DESCRIPTIONS.items():
    expose(globals()[name], description)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--call', choices=TOOLS)
    parser.add_argument('--args', default='{}')
    parser.add_argument('--args-file')
    parser.add_argument('--list', action='store_true')
    args = parser.parse_args()
    if args.list:
        print(json.dumps({k: {'description': DESCRIPTIONS[k], 'signature': str(inspect.signature(v))}
                          for k,v in TOOLS.items()}, indent=2))
    elif args.call:
        from pathlib import Path
        arguments = json.loads(Path(args.args_file).read_text(encoding='utf-8') if args.args_file else args.args)
        print(json.dumps(TOOLS[args.call](**arguments), ensure_ascii=True, indent=2, allow_nan=False))
    else:
        mcp.run(transport='stdio')


if __name__ == '__main__':
    main()
