"""One-frame conversion forensics; no appearance correction or model execution."""
import json
import subprocess
import cv2
import numpy as np
from phase55_audit import OUT,P3,PATHS,metrics,feature


def decode(path,index,filter):
    command=['ffmpeg','-v','error','-threads','1','-i',str(path),'-vf',f'select=eq(n\\,{index}),'+filter,
             '-frames:v','1','-pix_fmt','bgr24','-f','rawvideo','pipe:1']
    return np.frombuffer(subprocess.check_output(command),np.uint8).reshape(1920,1080,3)


def main():
    filters={'709_default':'scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=bgr24',
             '709_accurate':'scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=bgr24',
             '601_default':'scale=in_color_matrix=bt601:in_range=tv:out_range=pc,format=bgr24'}
    source=decode(PATHS['SOURCE'],120,filters['709_default'])
    valid=np.zeros((1920,1080),np.uint8);valid[546:1654,31:1049]=1
    m=cv2.imread(str(P3/'phase2/masks/000120.png'),0)
    valid[cv2.dilate(m,np.ones((13,13),np.uint8))>0]=0
    use=valid[540:1660,25:1055]>0
    crop=lambda f:f[540:1660,25:1055]
    records={}
    for name in ['SOURCE','CONTROL_LAB','B2_DELIVERY','V3']:
        records[name]={}
        for filter_name,vf in filters.items():
            f=decode(PATHS[name],120,vf)
            result=metrics(crop(source),crop(f),use)
            records[name][filter_name]={k:result[k] for k in ['mae','luma_bias','max_abs','ssim_luma','gradient_ratio']}
    # RGB master -> lossless YUV420 -> RGB isolates conversion from quantization of codec.
    output=OUT/'single-frame-yuv-conversion-lossless.mp4'
    vf='scale=out_color_matrix=bt709:in_range=pc:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p'
    subprocess.run(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s','1080x1920','-r','30','-i','pipe:0',
                    '-vf',vf,'-frames:v','1','-c:v','libx264','-crf','0','-preset','ultrafast',str(output)],input=source.tobytes(),check=True)
    records['CONVERSION_ONLY']={}
    for name,vf in filters.items():
        f=decode(output,0,vf);r=metrics(crop(source),crop(f),use)
        records['CONVERSION_ONLY'][name]={k:r[k] for k in ['mae','luma_bias','max_abs','ssim_luma','gradient_ratio']}
    cap=cv2.VideoCapture(str(PATHS['SOURCE']));cap.set(cv2.CAP_PROP_POS_FRAMES,120);ok,ocv=cap.read();cap.release();assert ok
    records['OPENCV_SOURCE']={name:dict(mae=float(np.abs(ocv.astype(float)-decode(PATHS['SOURCE'],120,vf)).mean())) for name,vf in filters.items()}
    vmake=decode(PATHS['VMAKE_REFERENCE'],117,filters['709_default'])
    regions={'face':(480,760,735,1010),'hair':(395,690,535,845),'background':(50,950,210,1190),'clean_sweater':(360,1515,800,1570)}
    visual={}
    for name,box in regions.items():
        x0,y0,x1,y1=box;sel=np.ones((y1-y0,x1-x0),bool)
        a,*_=feature(source[y0:y1,x0:x1],sel);b,*_=feature(vmake[y0:y1,x0:x1],sel)
        visual[name]={'bbox':box,'source_descriptors':a,'vmake_descriptors':b,
                      'note':'Descriptive perceptual comparison only, no ground-truth fidelity claim; approximate -3 alignment and no geometric registration.'}
    (OUT/'color-conversion-forensics.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
    (OUT/'vmake-descriptors-reference-only.json').write_text(json.dumps(visual,indent=2),encoding='utf-8')
    print(json.dumps(records,indent=2),flush=True)


if __name__=='__main__':main()
