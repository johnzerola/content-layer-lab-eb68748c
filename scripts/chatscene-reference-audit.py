"""Audit supplied forensic tables; does not claim to measure the reference video."""
import argparse
import hashlib
import json
import re
import statistics
from pathlib import Path


def audit(path):
    raw = Path(path).read_bytes()
    rows = []
    for line_no, line in enumerate(raw.decode('utf-8-sig').splitlines(), 1):
        cells = [cell.strip() for cell in line.split('|')[1:-1]]
        if len(cells) < 9 or not cells[0].isdigit():
            continue
        times = re.fullmatch(r'(\d+):(\d+\.\d+)\s*-\s*(\d+):(\d+\.\d+)', cells[1])
        if not times:
            continue
        a, b, c, d = map(float, times.groups())
        rows.append(dict(id=int(cells[0]), source_line=line_no,
                         start=60*a+b, end=60*c+d,
                         declared_words=int(cells[5]),
                         declared_chars=int(re.match(r'\d+', cells[4])[0]),
                         duration_ms=int(cells[6]), page_beat=cells[8]))
    gaps = [round(1000*(b['start']-a['end'])) for a, b in zip(rows, rows[1:])]
    pages = {}
    beats = {}
    for row in rows:
        page, beat = [part.strip() for part in row['page_beat'].split('/')]
        for key, group in [(page, pages), (beat, beats)]:
            item = group.setdefault(key, dict(start=row['start'], end=row['end'], messages=[]))
            item['end'] = row['end']
            item['messages'].append(row['id'])
    return dict(source_sha256=hashlib.sha256(raw).hexdigest(),
                measurement_kind='DERIVED_FROM_SUPPLIED_TABLE_NOT_VIDEO',
                row_count=len(rows), rows=rows, pages=pages, beats=beats,
                declared_words_sum=sum(r['declared_words'] for r in rows),
                declared_chars_sum=sum(r['declared_chars'] for r in rows),
                speech_duration_sum_seconds=round(sum(r['end']-r['start'] for r in rows), 4),
                mean_gap_ms=statistics.mean(gaps), median_gap_ms=statistics.median(gaps),
                min_gap_ms=min(gaps), max_gap_ms=max(gaps),
                duration_mismatch_ids=[r['id'] for r in rows if abs(1000*(r['end']-r['start'])-r['duration_ms']) > 1])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('forensic')
    parser.add_argument('output')
    args = parser.parse_args()
    result = audit(args.forensic)
    Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('rows', 'pages', 'beats')}))
