"""Editor Research MCP: read-only inspection and experiment design for the web editor."""
from __future__ import annotations

import argparse
import inspect
import json
import re
from pathlib import Path

from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'editor-research'
mcp = FastMCP('editor-development-mcp')
TOOLS = {}

EDITOR_FILES = {
    'studio': 'src/components/VideoStudio.tsx', 'timeline': 'src/components/EditorTimeline.tsx',
    'canvas': 'src/components/vtemplate/EditorCanvas.tsx', 'template_canvas': 'src/components/TemplateCanvas.tsx',
    'history': 'src/components/editor/useEditorHistory.ts', 'preedit': 'src/lib/preedit.ts',
    'route': 'src/routes/projects.$projectId.editor.$videoId.tsx', 'render_worker': 'src/workers/render.worker.ts',
    'audio': 'backend/app/audio_separation.py', 'render_queue': 'backend/app/render_queue.py',
}

def _read(key: str) -> dict:
    if key not in EDITOR_FILES:
        raise ValueError('Unknown editor component key')
    path = ROOT / EDITOR_FILES[key]
    if not path.is_file():
        return {'key': key, 'path': EDITOR_FILES[key], 'status': 'MISSING'}
    text = path.read_text(encoding='utf-8-sig')
    return {'key': key, 'path': EDITOR_FILES[key], 'lines': len(text.splitlines()),
            'exports': re.findall(r'export\s+(?:function|class|const|type|interface)\s+(\w+)', text)[:80],
            'references': sorted(set(re.findall(r'\b(?:undo|redo|timeline|canvas|render|audio|seek|split|trim|history)\w*\b', text, re.I)))[:80],
            'status': 'STATIC_SOURCE_EVIDENCE'}

def inspect_editor() -> dict:
    return {'scope': 'LOCAL_WORKING_TREE; deployment and runtime behaviour unverified',
            'components': [_read(k) for k in EDITOR_FILES],
            'architecture_record': 'editor-research/EDITOR_CURRENT_ARCHITECTURE.md'}

def trace_editor_state() -> dict:
    return json.loads((BASE / 'state-graph.json').read_text(encoding='utf-8'))

def inspect_timeline() -> dict: return _read('timeline')
def inspect_canvas() -> dict: return {'visual_canvas': _read('canvas'), 'template_canvas': _read('template_canvas')}
def inspect_player() -> dict: return _read('studio')
def inspect_render_pipeline() -> dict: return {'route': _read('route'), 'worker': _read('render_worker'), 'queue': _read('render_queue')}
def inspect_media_pipeline() -> dict: return {'preedit': _read('preedit'), 'studio': _read('studio'), 'note': 'Decode/container behaviour requires measured browser and backend runs.'}
def inspect_audio_pipeline() -> dict: return {'studio': _read('studio'), 'backend': _read('audio'), 'note': 'Quality, latency and VRAM are unmeasured.'}

def audit_editor_ux() -> dict:
    return {'status': 'STATIC_AUDIT_NOT_INTERACTION_MEASUREMENT',
            'report': 'editor-research/EDITOR_UX_AUDIT.md',
            'priorities': json.loads((BASE / 'ux-findings.json').read_text(encoding='utf-8')),
            'next_step': 'Run standardized tasks in an isolated browser profile and record clicks, time, errors, panels and viewport.'}

def profile_editor_performance() -> dict:
    return {'status': 'MEASUREMENT_PLAN_ONLY', 'metrics': ['time_to_first_frame', 'seek_latency_ms', 'dropped_frames', 'scrub_latency_ms', 'timeline_fps', 'canvas_fps', 'memory_mb', 'cpu_percent', 'gpu_utilization'],
            'protocol': 'editor-research/benchmarks/README.md', 'warning': 'No performance number is inferred from source code.'}

def run_editor_task_test(task: str) -> dict:
    tasks = json.loads((BASE / 'benchmarks/tasks.json').read_text(encoding='utf-8'))
    selected = [x for x in tasks if x['id'] == task]
    if not selected: raise ValueError('Unknown task id')
    return {'status': 'DESIGNED_NOT_EXECUTED', 'task': selected[0], 'recording_fields': ['clicks', 'elapsed_ms', 'errors', 'panels_opened', 'mouse_distance_px', 'undo_success', 'preview_feedback']}

def compare_editor_behavior(subjects: list[str]) -> dict:
    if not 2 <= len(subjects) <= 8: raise ValueError('Provide 2..8 labeled results with identical task/protocol')
    return {'status': 'PROTOCOL_REQUIRED', 'subjects': subjects, 'requirement': 'Compare only recordings of the identical task, fixture, viewport and metric definitions; no cross-product score is fabricated.'}

def search_editor_research(query: str) -> dict:
    items = json.loads((BASE / 'knowledge/sources.json').read_text(encoding='utf-8'))
    words = query.lower().split()
    return {'coverage': 'Curated official/public sources; not a general web search', 'matches': [x for x in items if any(w in json.dumps(x).lower() for w in words)]}

def analyze_editor_repository(repository: str) -> dict:
    allowed = {'opencut-app/OpenCut', 'opencut-app/opencut-classic', 'remotion-dev/remotion', 'vidstack/player'}
    if repository not in allowed: raise ValueError('Repository is not in the curated editor research set')
    return {'repository': repository, 'status': 'RESEARCH_TARGET', 'questions': ['license per artifact', 'state/command model', 'timeline geometry', 'media pipeline', 'plugin boundary', 'issues and failure modes'], 'no_code_import': True}

def record_editor_failure(title: str, severity: str, evidence: str, source: str) -> dict:
    if severity not in {'BLOCKER', 'HIGH', 'MEDIUM', 'LOW'} or not all((title.strip(), evidence.strip(), source.strip())): raise ValueError('title, evidence, source and valid severity required')
    path = BASE / 'failures'
    path.mkdir(exist_ok=True)
    key = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:60]
    target = path / f'{key}-{len(list(path.glob("*.json"))) + 1}.json'
    target.write_text(json.dumps({'title': title, 'severity': severity, 'evidence': evidence, 'source': source}, ensure_ascii=False, indent=2), encoding='utf-8')
    return {'path': target.relative_to(ROOT).as_posix(), 'status': 'RECORDED'}

def recall_editor_failure(query: str) -> dict:
    records = []
    for p in (BASE / 'failures').glob('*.json'):
        item = json.loads(p.read_text(encoding='utf-8'))
        if query.lower() in json.dumps(item).lower(): records.append(item)
    return {'matches': records}

def create_editor_experiment(problem: str, hypothesis: str, fixture: str, metrics: list[str]) -> dict:
    if not all((problem.strip(), hypothesis.strip(), fixture.strip(), metrics)): raise ValueError('problem, hypothesis, fixture and metrics required')
    return {'status': 'DESIGNED_NOT_EXECUTED', 'problem': problem, 'hypothesis': hypothesis, 'fixture': fixture, 'metrics': metrics, 'production_changes': False}

def _ux_gate(name: str, target: str = '') -> dict:
    return {'tool': name, 'target': target or 'UNSPECIFIED', 'status': 'REQUIRES_ISOLATED_BROWSER_RUN',
            'read_only_default': True, 'protocol': 'docs/design-research/UX_QA_PROTOCOL.md',
            'warning': 'No interaction, screenshot, accessibility or performance result is fabricated from source inspection.'}

def audit_user_flow(flow: str) -> dict: return _ux_gate('audit_user_flow', flow)
def measure_task_friction(task: str) -> dict: return _ux_gate('measure_task_friction', task)
def run_user_journey(journey: str) -> dict: return _ux_gate('run_user_journey', journey)
def capture_ui_state(route: str) -> dict: return _ux_gate('capture_ui_state', route)
def capture_state_matrix(component: str) -> dict: return _ux_gate('capture_state_matrix', component)
def measure_click_count(task: str) -> dict: return _ux_gate('measure_click_count', task)
def measure_task_completion_time(task: str) -> dict: return _ux_gate('measure_task_completion_time', task)
def detect_dead_end(flow: str) -> dict: return _ux_gate('detect_dead_end', flow)
def detect_missing_feedback(action: str) -> dict: return _ux_gate('detect_missing_feedback', action)
def detect_layout_overflow(route: str) -> dict: return _ux_gate('detect_layout_overflow', route)
def audit_keyboard_navigation(route: str) -> dict: return _ux_gate('audit_keyboard_navigation', route)
def audit_focus_flow(route: str) -> dict: return _ux_gate('audit_focus_flow', route)
def audit_touch_targets(route: str) -> dict: return _ux_gate('audit_touch_targets', route)
def audit_responsive_layout(route: str) -> dict: return _ux_gate('audit_responsive_layout', route)
def capture_visual_baseline(route: str) -> dict: return _ux_gate('capture_visual_baseline', route)
def compare_visual_regression(baseline: str, candidate: str) -> dict:
    return _ux_gate('compare_visual_regression', f'{baseline} -> {candidate}')
def profile_interaction_latency(route: str) -> dict: return _ux_gate('profile_interaction_latency', route)
def profile_timeline_fps(route: str) -> dict: return _ux_gate('profile_timeline_fps', route)
def profile_canvas_fps(route: str) -> dict: return _ux_gate('profile_canvas_fps', route)
def record_ux_failure(title: str, severity: str, evidence: str, source: str) -> dict:
    return record_editor_failure(title, severity, evidence, source)
def recall_similar_ux_failure(query: str) -> dict: return recall_editor_failure(query)
def record_verified_pattern(pattern: str, evidence: str, sources: list[str]) -> dict:
    if not pattern.strip() or not evidence.strip() or not sources: raise ValueError('pattern, evidence and sources required')
    return {'status': 'RECORDED_FOR_REVIEW', 'pattern': pattern, 'evidence': evidence, 'sources': sources,
            'path': 'docs/design-research/patterns/'}

DESCRIPTIONS = {
 'inspect_editor':'Map known editor source surfaces without executing the application.', 'trace_editor_state':'Return the current static state and timing graph.', 'inspect_timeline':'Inspect current timeline source.', 'inspect_canvas':'Inspect visual/template canvas source.', 'inspect_player':'Inspect editor player source.', 'inspect_render_pipeline':'Inspect route, worker and queue sources.', 'inspect_media_pipeline':'Inspect current media-oriented sources.', 'inspect_audio_pipeline':'Inspect current audio sources.', 'audit_editor_ux':'Return static UX findings; browser task measurement remains separate.', 'profile_editor_performance':'Return a measurement protocol, never inferred metrics.', 'run_editor_task_test':'Return a standardized task definition without executing it.', 'compare_editor_behavior':'Validate comparison protocol requirements.', 'search_editor_research':'Search the local curated editor-source index.', 'analyze_editor_repository':'Register a curated public repository for structured review.', 'record_editor_failure':'Persist an editor failure report.', 'recall_editor_failure':'Search persisted editor failure reports.', 'create_editor_experiment':'Design an isolated editor experiment; does not modify production.'}
DESCRIPTIONS.update({name: 'Return the read-only UX QA protocol gate; requires an isolated browser run for evidence.' for name in ['audit_user_flow','measure_task_friction','run_user_journey','capture_ui_state','capture_state_matrix','measure_click_count','measure_task_completion_time','detect_dead_end','detect_missing_feedback','detect_layout_overflow','audit_keyboard_navigation','audit_focus_flow','audit_touch_targets','audit_responsive_layout','capture_visual_baseline','compare_visual_regression','profile_interaction_latency','profile_timeline_fps','profile_canvas_fps']})
DESCRIPTIONS.update({'record_ux_failure':'Persist an evidence-backed UX failure record.', 'recall_similar_ux_failure':'Recall persisted UX failure records.', 'record_verified_pattern':'Record a public or measured UX pattern for later review.'})
for name, description in DESCRIPTIONS.items():
    fn = globals()[name]; fn.__doc__ = description; TOOLS[name] = fn; mcp.tool()(fn)

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--list', action='store_true'); args = parser.parse_args()
    if args.list: print(json.dumps({k: str(inspect.signature(v)) for k, v in TOOLS.items()}, indent=2))
    else: mcp.run(transport='stdio')

if __name__ == '__main__': main()
