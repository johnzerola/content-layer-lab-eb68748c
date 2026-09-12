"""Verify archived deliverables independently of the generation process."""
import json
import subprocess
from phase5_prepare import OUT
from phase23_color import digest, SOURCE


def probe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames',
                      '-show_streams','-of','json',str(path)]))['streams']


def main():
    checks={}
    expected='08e73ade1fa0048f33a5701502f6825428ee392c4e8748ddab6cffb1093779b5'
    assert digest(OUT/'baseline/B2-finish-OFF-rgb-lossless.mp4')==expected
    source_audio=next(s for s in probe(SOURCE) if s['codec_type']=='audio')
    for name in ['A20','A40']:
        for filename in ['master.mp4','delivery-crf14.mp4']:
            path=OUT/'candidates'/name/filename
            streams=probe(path)
            v=next(s for s in streams if s['codec_type']=='video')
            assert (v['width'],v['height'],int(v['nb_read_frames']),v['avg_frame_rate'])==(1080,1920,147,'30/1')
            if filename.startswith('delivery'):
                assert (v['color_range'],v['color_space'],v['color_primaries'])==('tv','bt709','bt709')
                audio=next(s for s in streams if s['codec_type']=='audio')
                assert all(audio[k]==source_audio[k] for k in ['codec_name','sample_rate','channels'])
            checks[f'{name}/{filename}']={'sha256':digest(path),'frames':int(v['nb_read_frames']),'fps':v['avg_frame_rate'],'width':v['width'],'height':v['height'],'pix_fmt':v['pix_fmt']}
    for path in (OUT/'comparison').glob('*.mp4'):
        v=next(s for s in probe(path) if s['codec_type']=='video')
        assert int(v['nb_read_frames'])==88 and v['avg_frame_rate']=='30/1'
        checks[path.name]={'frames':88,'fps':v['avg_frame_rate'],'width':v['width'],'height':v['height']}
    checks['baseline_sha256']=expected
    checks['status']='PASS'
    (OUT/'artifact-validation.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
    print(json.dumps({'status':'PASS','video_files':len(checks)-2}))


if __name__=='__main__':
    main()
