import sys
from pathlib import Path
import numpy as np
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from audio_benchmark_controls import mix_at_ratio,evaluate

@pytest.fixture
def sources():
    t=np.arange(8000)/8000
    return np.sin(2*np.pi*200*t)[:,None],np.sin(2*np.pi*700*t)[:,None]

@pytest.mark.parametrize('ratio',[-15,-10,-5,0,5,10])
def test_ratio_is_in_input(sources,ratio):
    d,m=sources
    v,b,_,_=mix_at_ratio(d,m,ratio,np.ones(len(d),bool))
    actual=20*np.log10(np.sqrt(np.mean(v*v))/np.sqrt(np.mean(b*b)))
    assert actual==pytest.approx(ratio,abs=1e-10)
    assert np.max(np.abs(v+b))<=.800000001

@pytest.mark.parametrize('failure',['mix','swap','zero','leak','gain','delay','drift'])
def test_negative_controls(sources,failure):
    d,m=sources
    bad={'mix':d+m,'swap':m,'zero':d*0,'leak':d+.1*m,'gain':2*d,'delay':np.roll(d,13,axis=0),'drift':np.interp(np.arange(len(d))*1.001,np.arange(len(d)),d[:,0])[:,None]}[failure]
    assert evaluate(bad,d)['relative_error']>.01
    assert evaluate(d,d)['relative_error']==0

def test_silence_undefined_sisdr(sources):
    d,m=sources
    assert evaluate(d*0,d*0)['si_sdr_db'] is None
    assert evaluate(m,d*0)['residual_rms']>0

def test_invalid_pcm(sources):
    d,m=sources
    assert not evaluate(d[:-1],d)['valid']
    assert not evaluate(d*np.nan,d)['valid']
    with pytest.raises(ValueError):mix_at_ratio(d,m,0,np.zeros(len(d),bool))


def test_stereo_antiphase_is_preserved():
    time=np.arange(8000)/8000
    dialogue=np.column_stack([np.sin(2*np.pi*200*time),-np.sin(2*np.pi*200*time)])
    music=np.column_stack([np.sin(2*np.pi*700*time),-np.sin(2*np.pi*700*time)])
    voice,background,_,_=mix_at_ratio(dialogue,music,-10,np.ones(len(time),bool))
    assert np.max(np.abs(voice[:,0]+voice[:,1]))<1e-12
    assert np.max(np.abs(background[:,0]+background[:,1]))<1e-12
    assert np.sqrt(np.mean(voice*voice))>0
