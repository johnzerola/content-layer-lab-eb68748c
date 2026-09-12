import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def test_editor_inspection_is_static_and_complete():
    result = server.inspect_editor()
    assert len(result['components']) == 10
    assert all(item['status'] == 'STATIC_SOURCE_EVIDENCE' for item in result['components'])


def test_research_gates_do_not_claim_measurement():
    assert server.audit_editor_ux()['status'] == 'STATIC_AUDIT_NOT_INTERACTION_MEASUREMENT'
    assert server.profile_editor_performance()['status'] == 'MEASUREMENT_PLAN_ONLY'
    assert server.run_editor_task_test('import-trim')['status'] == 'DESIGNED_NOT_EXECUTED'
