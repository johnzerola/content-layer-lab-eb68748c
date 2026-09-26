# Original mathematical loops; no external footage, textures, fonts or music.
# Run from the repository root. Existing assets are never overwritten.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '../public/chatscene/backgrounds'
$loops = @(
  @{ Name='original-aurora'; Filter="geq=lum='60+28*sin(X/110+sin(Y/140+T*PI/4))':cb='160+26*sin(Y/190+T*PI/4)':cr='112+20*cos(X/180-T*PI/4)'" },
  @{ Name='original-waves'; Filter="geq=lum='95+34*sin(Y/75+2*sin(X/180+T*PI/4))':cb='150+25*cos(Y/150+T*PI/4)':cr='100+18*sin(X/140+T*PI/4)'" },
  @{ Name='original-sunset'; Filter="geq=lum='95+30*sin(Y/220+T*PI/4)*cos(X/300)':cb='106+28*cos(Y/300+T*PI/4)':cr='162+20*sin(X/180+T*PI/4)'" }
)
foreach ($loop in $loops) {
  $output = Join-Path $target ($loop.Name + '.mp4')
  if (Test-Path -LiteralPath $output) { throw "Already exists: $output" }
  & ffmpeg -hide_banner -loglevel error -n -f lavfi -i 'color=c=black:s=540x960:r=24:d=8' -vf $loop.Filter -an -c:v libx264 -preset fast -crf 24 -pix_fmt yuv420p -movflags +faststart $output
  if ($LASTEXITCODE -ne 0) { throw "Failed: $($loop.Name)" }
  $poster = Join-Path $target ($loop.Name + '.jpg')
  & ffmpeg -hide_banner -loglevel error -n -ss 1 -i $output -frames:v 1 -vf 'scale=270:-2' $poster
  if ($LASTEXITCODE -ne 0) { throw "Poster failed: $($loop.Name)" }
  & ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration,size -of json $output
}
