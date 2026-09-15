export interface ScrollPlanInput { frame:number; appearFrame:number; fps:number; currentContentHeight:number; previousContentHeight:number; typingHeight:number; viewportBottom:number; }
export function planScroll(input:ScrollPlanInput):number {
  const now=input.viewportBottom-(input.currentContentHeight+input.typingHeight);
  const duration=Math.max(1,Math.round(input.fps*.28));
  const p=Math.max(0,Math.min(1,(input.frame-input.appearFrame)/duration));
  if(p>=1)return now;
  const previous=input.viewportBottom-(input.previousContentHeight+input.typingHeight);
  const ease=1-Math.pow(1-p,3);
  return previous+(now-previous)*ease;
}
