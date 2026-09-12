"""Repair explicit709 delivery VUI tags only; assert native YUV pixels unchanged."""
import json
import shutil
import subprocess
import time
from phase5_prepare import OUT
from phase23_color import digest


def metadata(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
                      '-show_entries','stream=color_range,color_space,color_transfer,color_primaries',
                      '-of','json',str(path)]))['streams'][0]


def pixel_hash(path):
    return subprocess.check_output(['ffmpeg','-v','error','-threads','1','-i',str(path),
                                   '-map','0:v:0','-pix_fmt','yuv420p','-c:v','rawvideo',
                                   '-f','hash','-hash','sha256','-'],text=True).strip()


def main():
    start=time.perf_counter()
    paths=[OUT/'candidates'/name/'delivery-crf14.mp4' for name in ['A20','A40']]
    paths+=sorted((OUT/'comparison').glob('*.mp4'))
    records=[]
    for path in paths:
        before=metadata(path)
        assert before.get('color_space')=='bt709' and before.get('color_range')=='tv'
        if before.get('color_transfer')=='bt709' and before.get('color_primaries')=='bt709':
            continue
        backup=OUT/'metadata-before'/path.relative_to(OUT)
        backup.parent.mkdir(parents=True,exist_ok=True)
        assert not backup.exists(), 'Refuse overwrite of original metadata evidence'
        shutil.copy2(path,backup)
        temp=path.with_name(path.stem+'-tagged-tmp.mp4')
        assert path.resolve().is_relative_to(OUT.resolve()) and temp.resolve().is_relative_to(OUT.resolve())
        cmd=['ffmpeg','-v','error','-y','-i',str(path),'-map','0','-c','copy','-bsf:v',
             'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0',
             '-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart+write_colr',str(temp)]
        subprocess.run(cmd,check=True)
        before_pixels,after_pixels=pixel_hash(path),pixel_hash(temp)
        assert before_pixels==after_pixels, 'Metadata repair must not change image samples'
        after=metadata(temp)
        assert after.get('color_transfer')=='bt709' and after.get('color_primaries')=='bt709'
        temp.replace(path)
        records.append(dict(file=str(path.relative_to(OUT)),before=before,after=after,
                            before_file_sha256=digest(backup),after_file_sha256=digest(path),
                            decoded_yuv_sha256=after_pixels,pixels_unchanged=True))
    if records:
        (OUT/'metadata-repair.json').write_text(json.dumps({'records':records,'seconds':time.perf_counter()-start},indent=2),encoding='utf-8')
    print(json.dumps({'repaired':len(records),'seconds':time.perf_counter()-start}),flush=True)


if __name__=='__main__':
    main()
