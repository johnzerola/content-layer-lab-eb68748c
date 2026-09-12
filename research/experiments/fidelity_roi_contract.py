"""Shared laboratory-only SDR/CFR ROI transport. No engine-specific branching."""
from __future__ import annotations
import cv2
import numpy as np

DECODE_709 = ('scale=in_color_matrix=bt709:in_range=tv:out_range=pc:'
              'flags=accurate_rnd+full_chroma_int,format=bgr24')
ENCODE_709 = ('scale=out_color_matrix=bt709:in_range=pc:out_range=tv:'
              'flags=accurate_rnd+full_chroma_int,format=yuv420p')
COLOR_ARGS = ['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
              '-color_range','tv','-chroma_sample_location','left']

def planes(data, width, height):
    if width % 2 or height % 2: raise ValueError('Even 420 grid required')
    a=np.frombuffer(data,dtype=np.uint8)
    size=width*height
    if a.size != size*3//2: raise ValueError('Wrong YUV frame byte count')
    return [a[:size].reshape(height,width),a[size:size+size//4].reshape(height//2,width//2),
            a[size+size//4:].reshape(height//2,width//2)]

def pack(parts):
    return b''.join(np.ascontiguousarray(p).tobytes() for p in parts)

def insert_rgb(source, reconstructed, mask, xywh):
    x,y,w,h=xywh
    if reconstructed.shape != (h,w,3) or mask.shape != source.shape[:2]:
        raise ValueError('ROI/mask geometry mismatch')
    if x<0 or y<0 or x+w>source.shape[1] or y+h>source.shape[0]:
        raise ValueError('ROI outside source')
    outside=mask.copy(); outside[y:y+h,x:x+w]=False
    if outside.any(): raise ValueError('Approved mask extends outside available ROI')
    result=source.copy(); dst=result[y:y+h,x:x+w]; selected=mask[y:y+h,x:x+w]
    dst[selected]=reconstructed[selected]
    return result

def support_masks(mask, guard):
    if mask.ndim!=2 or mask.shape[0]%2 or mask.shape[1]%2:
        raise ValueError('Wrong full-frame mask grid')
    if guard<0: raise ValueError('Negative chroma guard')
    safe=cv2.erode(mask.astype(np.uint8),np.ones((guard*2+1,guard*2+1),np.uint8),
                   borderType=cv2.BORDER_CONSTANT,borderValue=0) if guard else mask.astype(np.uint8)
    # A chroma cell is writable only when all its 2x2 pixels are allowed.
    chroma=safe.reshape(mask.shape[0]//2,2,mask.shape[1]//2,2).min(axis=(1,3))>0
    return mask.astype(bool),chroma

def compose_yuv(source_bytes, roi_bytes, width, height, conversion_xywh, mask, guard):
    x,y,w,h=conversion_xywh
    if any(v%2 for v in (x,y,w,h)): raise ValueError('Chroma phase requires even ROI coordinates')
    if x<0 or y<0 or x+w>width or y+h>height: raise ValueError('Conversion crop outside source')
    src=planes(source_bytes,width,height); roi=planes(roi_bytes,w,h)
    yy,cc=support_masks(mask,guard)
    out=[p.copy() for p in src]
    for k,support in enumerate((yy,cc,cc)):
        scale=1 if k==0 else 2
        xs,ys,ws,hs=x//scale,y//scale,w//scale,h//scale
        check=support.copy(); check[ys:ys+hs,xs:xs+ws]=False
        if check.any(): raise ValueError('Support outside converted ROI')
        dest=out[k][ys:ys+hs,xs:xs+ws]; selected=support[ys:ys+hs,xs:xs+ws]
        dest[selected]=roi[k][selected]
        if not np.array_equal(out[k][~support],src[k][~support]):
            raise AssertionError('External source plane modified')
    return pack(out), (yy,cc)

def validate_frame_ids(actual, expected):
    if list(actual)!=list(expected): raise ValueError('Frame IDs reordered, missing or shifted')
