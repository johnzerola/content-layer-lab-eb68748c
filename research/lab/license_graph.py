"""Evidence-backed dependency graphs; intentionally not a legal decision engine."""
from __future__ import annotations

import json

from lab.core import ROOT


def build_license_dependency_graph(project: str = '') -> dict:
    """Read the curated graph and expose blockers without inferring permissions."""
    data = json.loads((ROOT / 'research/licenses/dependency-graph.json').read_text(encoding='utf-8'))
    projects = data['projects']
    if project:
        selected = [item for item in projects if item['id'].lower() == project.lower()]
        if not selected:
            raise ValueError('Unknown project in curated license graph')
        projects = selected
    return {
        'projects': projects,
        'method': data['method'],
        'commercial_decision': 'REVIEW_REQUIRED',
        'warning': 'A permissive repository license does not authorize every model, weight, dataset or transitive prior.'
    }
