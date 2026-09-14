"""AUD-00 technical controls, not human speech or perceptual evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.io import wavfile


def mix_at_ratio(dialogue, music, ratio_db, mask):
    if dialogue.shape != music.shape or dialogue.ndim != 2:
        raise ValueError('Matching samples x channels required')
    if mask.shape != (len(dialogue),) or not mask.any():
        raise ValueError('Nonempty activity mask required')
    if not np.isfinite(dialogue).all() or not np.isfinite(music).all():
        raise ValueError('Nonfinite PCM')
    d = np.sqrt(np.mean(dialogue[mask] ** 2))
    m = np.sqrt(np.mean(music[mask] ** 2))
    if min(d, m) <= 1e-12 or not np.isfinite(ratio_db):
        raise ValueError('Nonzero sources and finite ratio required')
    music_gain = float(d / (m * 10 ** (ratio_db / 20)))
    raw = dialogue + music_gain * music
    common_gain = float(min(1, .8 / max(float(np.max(np.abs(raw))), 1e-12)))
    return common_gain * dialogue, common_gain * music_gain * music, music_gain, common_gain


def evaluate(estimate, truth):
    if estimate.shape != truth.shape or not np.isfinite(estimate).all():
        return {'valid': False, 'si_sdr_db': None, 'relative_error': None}
    energy = float(np.sum(truth ** 2))
    error = float(np.sum((estimate-truth)**2))
    if energy < 1e-20:
        return {'valid': True, 'si_sdr_db': None, 'relative_error': None, 'residual_rms': float(np.sqrt(np.mean(estimate**2)))}
    alpha = float(np.sum(estimate*truth)/energy)
    target = alpha*truth
    residual = estimate-target
    score = None if abs(alpha) < 1e-12 else float(10*np.log10(max(float(np.sum(target**2)),1e-20)/max(float(np.sum(residual**2)),1e-20)))
    return {'valid': True, 'si_sdr_db': score, 'relative_error': float(np.sqrt(error/energy))}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=False)
    rate=44100
    t=np.arange(rate*2)/rate
    mask=(t>.2)&(t<1.8)
    d=np.column_stack([.1*np.sin(2*np.pi*311*t), .08*np.sin(2*np.pi*431*t)])*mask[:,None]
    m=np.column_stack([.12*np.sin(2*np.pi*719*t), .1*np.sin(2*np.pi*997*t)])
    fixtures=[]
    for ratio in [-15,-10,-5,0,5,10]:
        voice,music,mg,cg=mix_at_ratio(d,m,ratio,mask)
        files={}
        for role,pcm in [('dialogue',voice),('music',music),('input',voice+music)]:
            path=args.output/f'ratio-{ratio}-{role}.wav'
            wavfile.write(path,rate,pcm.astype(np.float32))
            files[role]={'path':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        fixtures.append({'id':f'technical-{ratio}','ratio_db':ratio,'music_gain':mg,'common_gain':cg,'activity_samples':[int(np.flatnonzero(mask)[0]),int(np.flatnonzero(mask)[-1])+1],'files':files})
    report={'schema_version':1,'scope':'SYNTHETIC_ENGINEERING_ONLY','human_speech':False,'license':'Project-generated mathematical signals; no external media','sample_rate':rate,'channels':2,'sample_count':len(t),'split':'development-controls','fixtures':fixtures,'perceptual_holdout':[]}
    (args.output/'fixture-manifest.json').write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'fixtures':len(fixtures),'output':str(args.output),'scope':report['scope']}))

if __name__=='__main__':
    main()
