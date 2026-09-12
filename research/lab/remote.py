"""Public, bounded research retrieval. No downloads of weights or execution of upstream code."""
from __future__ import annotations

import hashlib
import json
import re
import ssl
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote, urlencode, urlparse

import httpx
import truststore

from lab.core import ROOT, now

HOSTS = {'api.github.com', 'raw.githubusercontent.com', 'export.arxiv.org',
         'huggingface.co', 'vmake.ai', 'www.vmake.ai', 'help.runwayml.com',
         'helpx.adobe.com', 'www.media.io', 'www.hitpaw.com', 'arxiv.org'}
MAX_BYTES = 2_000_000


def fetch(url, *, ttl=86400):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username or parsed.port not in (None, 443):
        raise ValueError('Only allowlisted public HTTPS research sources are supported')
    cache = ROOT / 'research/cache'
    cache.mkdir(exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()
    path = cache / (key + '.json')
    if path.is_file() and time.time() - path.stat().st_mtime < ttl:
        result = json.loads(path.read_text(encoding='utf-8'))
        return {**result, 'cached': True}
    with httpx.Client(timeout=25, follow_redirects=False, trust_env=False,
                      verify=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT),
                      headers={'User-Agent': 'CleanerResearchLab/0.1 (public research)'}) as client:
        with client.stream('GET', url) as response:
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ValueError('Research response exceeds 2 MB')
                chunks.append(chunk)
            text = b''.join(chunks).decode('utf-8')
    result = {'url': url, 'retrieved_at': now(), 'sha256': hashlib.sha256(text.encode()).hexdigest(),
              'body': text, 'cached': False}
    # Concurrent requests can safely replace equivalent cache records.
    from uuid import uuid4
    temp = cache / (key + '-' + uuid4().hex + '.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    temp.replace(path)
    return result


def json_get(url):
    result = fetch(url)
    return json.loads(result['body']), {k: v for k, v in result.items() if k != 'body'}


def repo_name(repository):
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Use owner/repository')
    return repository


def search_github_projects(query, limit=10):
    if not query.strip() or not 1 <= limit <= 30:
        raise ValueError('query required; limit 1..30')
    data, source = json_get('https://api.github.com/search/repositories?' + urlencode({'q': query, 'per_page': limit, 'sort': 'updated'}))
    return {'source': source, 'total': data['total_count'], 'projects': [{
        k: item.get(k) for k in ('full_name', 'html_url', 'description', 'pushed_at', 'license', 'fork', 'stargazers_count')
    } for item in data['items']]}


def analyze_github_repository(repository, paths=None):
    repo = repo_name(repository)
    base = 'https://api.github.com/repos/' + repo
    metadata, source = json_get(base)
    commit, commit_source = json_get(base + '/commits/' + quote(metadata['default_branch'], safe=''))
    sha = commit['sha']
    tree, tree_source = json_get(base + '/git/trees/' + sha + '?recursive=1')
    blobs = [x['path'] for x in tree.get('tree', []) if x['type'] == 'blob']
    if paths is None:
        paths = [p for p in blobs if re.search(r'(^|/)(LICENSE[^/]*|inference[^/]*\.py|run_[^/]*\.py|requirements[^/]*)$', p)][:8]
    if len(paths) > 12 or any(p not in blobs for p in paths):
        raise ValueError('Choose at most 12 paths present in the tree')
    files = []
    for p in paths:
        raw = fetch('https://raw.githubusercontent.com/' + repo + '/' + sha + '/' + quote(p, safe='/'))
        files.append({'path': p, 'source': {k: v for k, v in raw.items() if k != 'body'},
                      'content': raw['body'][:24000], 'truncated': len(raw['body']) > 24000})
    community = {}
    for kind in ('issues', 'pulls', 'releases', 'forks'):
        try:
            data, src = json_get(base + '/' + kind + '?per_page=5')
            community[kind] = {'source': src, 'items': [{k: item.get(k) for k in
                ('number', 'title', 'html_url', 'state', 'full_name', 'tag_name', 'body')}
                for item in data], 'coverage': 'First page only; investigate topic-specific issues separately'}
        except (httpx.HTTPError, ValueError) as exc:
            community[kind] = {'error': type(exc).__name__, 'status': 'UNAVAILABLE'}
    return {'repository': repo, 'revision': sha, 'source': source, 'commit_source': commit_source,
            'tree_source': tree_source, 'files_in_tree': blobs, 'tree_truncated': tree.get('truncated'),
            'files': files, 'community': community,
            'analysis_status': 'SOURCE_EVIDENCE_READY_FOR_SKILL_REVIEW',
            'questions': ['architecture and relevant functions', 'inputs/preprocessing/core/temporal/output',
                          'engineering decisions', 'local adapter differences', 'license of every artifact']}


def search_papers(query, limit=8):
    if not query.strip() or not 1 <= limit <= 20:
        raise ValueError('query required; limit 1..20')
    src = fetch('https://export.arxiv.org/api/query?' + urlencode({'search_query': query, 'max_results': limit, 'sortBy': 'submittedDate', 'sortOrder': 'descending'}))
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    root = ET.fromstring(src['body'])
    papers = []
    for e in root.findall('a:entry', ns):
        papers.append({k: ' '.join((e.findtext('a:' + k, '', ns)).split()) for k in ('id', 'title', 'summary', 'published', 'updated')})
        papers[-1]['authors'] = [a.findtext('a:name', '', ns) for a in e.findall('a:author', ns)]
    return {'source': {k: v for k, v in src.items() if k != 'body'}, 'papers': papers,
            'coverage': 'arXiv API; other venues require official proceedings retrieval'}


def analyze_paper(arxiv_id):
    if not re.fullmatch(r'\d{4}\.\d{4,5}(v\d+)?', arxiv_id):
        raise ValueError('Modern arXiv identifier required')
    result = search_papers('id:' + arxiv_id, 1)
    try:
        full = fetch('https://arxiv.org/html/' + arxiv_id)
        result['full_text'] = full['body'][:60000]
        result['full_text_source'] = {k: v for k, v in full.items() if k != 'body'}
        result['truncated'] = len(full['body']) > 60000
    except (httpx.HTTPError, ValueError):
        result['full_text'] = None
    result['review_required'] = ['problem', 'method', 'architecture', 'training', 'dataset', 'inference',
                                 'results', 'limitations', 'license', 'implementation', 'Cleaner relevance']
    result['analysis_status'] = 'EVIDENCE_EXTRACTION_NOT_AUTOMATIC_PAPER_COMPREHENSION'
    return result


def search_models(query, limit=10):
    if not query.strip() or not 1 <= limit <= 30:
        raise ValueError('query required; limit 1..30')
    data, source = json_get('https://huggingface.co/api/models?' + urlencode({'search': query, 'limit': limit, 'full': 'true'}))
    return {'source': source, 'models': [{k: item.get(k) for k in ('id', 'sha', 'pipeline_tag', 'tags', 'library_name', 'cardData', 'gated')} for item in data],
            'measurement_fields': {'vram': None, 'speed': None, 'quality': None},
            'coverage': 'Hugging Face metadata; ModelScope and benchmark requirements need separate review'}


def search_commercial_research(query):
    # Search an explicitly maintained index; never imply a general search engine.
    sources = json.loads((ROOT / 'research/commercial/sources.json').read_text(encoding='utf-8'))
    matches = [s for s in sources if any(w in (s['title'] + ' ' + s['company']).lower() for w in query.lower().split())]
    return {'coverage': 'Curated public-source index; fetch_public_source retrieves selected pages',
            'matches': matches, 'architecture': 'UNKNOWN; product marketing does not establish internal models'}


def inspect_license(repository):
    repo = repo_name(repository)
    base = 'https://api.github.com/repos/' + repo
    data, source = json_get(base + '/license')
    import base64
    content = base64.b64decode(data.get('content', '')).decode('utf-8')
    return {'repository': repo, 'source': source, 'code_license': data.get('license'),
            'license_blob_sha': data.get('sha'), 'license_text': content[:20000],
            'commercial_use': 'REVIEW_REQUIRED', 'redistribution': 'REVIEW_REQUIRED',
            'modification': 'REVIEW_REQUIRED', 'model_license': 'UNKNOWN', 'weight_license': 'UNKNOWN',
            'dataset_license': 'UNKNOWN', 'dependency_license': 'REVIEW_REQUIRED',
            'risks': ['Repository SPDX does not cover every model, weight, dataset or dependency.']}
