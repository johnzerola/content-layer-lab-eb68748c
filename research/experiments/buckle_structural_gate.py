"""Independent structural decision gate; missing evidence cannot pass."""
import json
from pathlib import Path
import cv2,numpy as np

ROOT=Path('G:/dowloand/teste/root-cause-isolation-20260911')
REQUIRED=('contour_continuity','belt_connection','geometry_under_motion','no_duplicate_edges','temporal_structure')

def decide(checks):
 if any(checks.get(k)=='FAIL' for k in REQUIRED):return 'REJECT_STRUCTURE'
 if all(checks.get(k)=='PASS' for k in REQUIRED):return 'PASS_STRUCTURE'
 return 'RETEST_STRUCTURE_EVIDENCE'

def main():
 rows=json.loads((ROOT/'buckle-structural-gate.json').read_text())
 for r in rows:
  im=cv2.imread(str(ROOT/'B'/f"{r['frame']:06d}-BUCKLE.png"))
  gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY);edge=cv2.Canny(gray,40,80)
  contours,_=cv2.findContours(edge,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
  r['edge_descriptors']={'canny_edge_pixels':int((edge>0).sum()),
     'contours_length_at_least_8':sum(cv2.arcLength(c,False)>=8 for c in contours),
     'note':'Patch descriptors, not semantic buckle contours or geometry ground truth'}
  r['checks']={k:None for k in REQUIRED};r['exterior_fidelity_cannot_override']=True
  r['structural_verdict']=decide(r['checks'])
 assert decide({})=='RETEST_STRUCTURE_EVIDENCE'
 assert decide({k:'PASS' for k in REQUIRED})=='PASS_STRUCTURE'
 assert decide({**{k:'PASS' for k in REQUIRED},'belt_connection':'FAIL'})=='REJECT_STRUCTURE'
 (ROOT/'buckle-structural-gate.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
 (ROOT/'structural-gate-controls.json').write_text(json.dumps({'missing_evidence':'RETEST_STRUCTURE_EVIDENCE','one_failure':'REJECT_STRUCTURE','all_checks_pass':'PASS_STRUCTURE','actual_buckle':'RETEST_STRUCTURE_EVIDENCE'},indent=2))

if __name__=='__main__':main()
