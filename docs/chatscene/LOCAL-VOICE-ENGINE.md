# ChatScene local voices

## Choice and scope

The existing voice provider call, audio cache, final-duration measurement and conversation timeline are reused. Piper/Faber remains the lightweight synthetic PT-BR source. Chatterbox Multilingual is the reference-based engine. No private CapCut API or ElevenLabs voice assets are used.

Official repositories reviewed:

| Candidate | Source | Assessment |
| --- | --- | --- |
| Chatterbox | https://github.com/resemble-ai/chatterbox | Selected: MIT runtime and weights, Portuguese, reference-based synthesis, 500M multilingual backbone. Pinned stable Python release 0.1.6; inference retains PerTh watermarking. |
| Qwen3-TTS 0.6B Base | https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base | Apache-2.0, Portuguese, reference-based synthesis. Candidate for a later measured comparison; not installed alongside the selected engine. |
| VoxCPM2 | https://github.com/OpenBMB/VoxCPM | Apache-2.0, multilingual. Larger 2B backbone is less attractive for this machine's 6 GB GPU; no performance claim without benchmark. |
| Chatterbox dedicated PT-BR V3 | https://huggingface.co/ResembleAI/Chatterbox-Multilingual-pt-br | MIT, promising specialized model. Requires a different loader/checkpoint set from the pinned 0.1.6 release; not mixed into this runtime. |

This is an engineering choice for the available hardware, not a claim of matching ElevenLabs quality or reproducing Adam's identity.

## Installation

Windows: `powershell -File scripts/install-chatscene-voice.ps1 -InstallRoot G:\VaiViral\chatscene-voice -Device cuda`

The isolated environment, model weights and references live on G:. The ignored `backend/data/chatscene-voices/runtime.json` points to them. Model downloads are pinned to the resolved official revision and checked against upstream SHA-256 hashes. No runtime installer modifies Cleaner dependencies.

CPU server: Python 3.10 or 3.11 is supported. Run `scripts/install-chatscene-voice-cpu.sh /opt/chatscene-voice`; it creates the isolated environment, installs the CPU PyTorch build, downloads the pinned weights and auxiliary tokenizer data, and verifies the runtime import. Configure `pythonPath`, `modelPath`, `storagePath` and `device: "cpu"` in the runtime JSON. Set `CHATSCENE_VOICE_CONFIG` to an alternative absolute config path if needed.

The app must run as a persistent **Node server with subprocess access**, Python, FFmpeg and persistent private storage. An edge-only deployment cannot spawn the model. CPU compatibility does not establish acceptable latency on a particular VPS: measure before offering interactive previews there. No remote host was accessed or deployed by this change.

## Hostear + GPU local

Hostear `104.234.186.50` now has a CPU fallback installed in
`/opt/chatscene-voice`, isolated from `/opt/cleaner-cpu`. No inference port was
opened. The model loaded successfully and generated a 2.94 s synthetic test in
49.4 s. The existing Cleaner container remained healthy; 28 GB remained free
after installation. The Windows workstation keeps the primary CUDA runtime on
G: and generated a 3.42 s synthetic test on the RTX 2060 in 59.4 s after its
slow first load from the G: volume.

The RTX worker is connected to Hostear through an authenticated reverse SSH
tunnel. Both ends bind only to `127.0.0.1:18096`; port 18096 is not reachable on
the public VPS address. The relay requires a random bearer token, accepts only
bounded text/reference payloads and serializes GPU work. Hostear keeps the
root-readable configuration in `/opt/chatscene-voice/gpu-relay.env`. The local
token remains in `G:\VaiViral\chatscene-voice\relay-token` and is not committed.

`scripts/monitor-chatscene-gpu-relay.ps1` runs in the Windows user session and
checks the relay/tunnel every 30 seconds. The scheduled task
`VaiViral ChatScene GPU Relay` starts that supervisor at login. If the internet
connection or SSH process drops, it recreates the tunnel. The model loads only
when the first synthesis arrives and unloads after 120 idle seconds, so the
relay does not reserve RTX memory all day. The workstation must be powered on
and logged in for CUDA inference; while it is unavailable, the application
automatically uses the CPU installation on Hostear.

The web service on Hostear loads `gpu-relay.env` and calls
`http://127.0.0.1:18096`. Do not bind the relay or reverse forward to `0.0.0.0`.
The verified lazy-load tunnel smoke test produced 4.90 s of WAV audio; inference
took 28.7 s after the cold model load, with 3,288 MB peak allocated VRAM. Health
changed from `modelLoaded:false` to `true` and back to `false` after the idle
timeout. An unauthenticated request returned 404, and a connection to public
`104.234.186.50:18096` was refused.

## Contract

After import validation, set `ready: true` in the runtime JSON. The UI keeps uploads disabled until that flag and the required assets are present. `scripts/install-chatscene-voice-cpu.sh` prepares the CPU environment; it does not change the live web service or open an inference port.

- A character has one profile. A reference is `{ id, name, durationSec }`; raw media and filesystem paths never go into the project.
- Uploads require the existing verified Supabase session and an explicit authorization declaration. Samples are capped at 12 MB / 3–30 seconds, decoded by FFmpeg with only the pipe protocol, converted to mono 24 kHz PCM, and checked for silence.
- Reference files are under a SHA-256 account directory with random UUID names. Other accounts cannot resolve them. The folder must not be publicly served. On Windows/exFAT deploy under a single trusted OS user; use an access-controlled persistent filesystem for multiuser production hosting.
- Deletion removes the reference; previously generated project audio is retained. Backup and retention policies for a production host must include this private directory.
- A private Python subprocess uses stdio, not a public HTTP endpoint. It serializes requests, retains one model, clears voice conditioning after each request and releases the process after 120 idle seconds. The queue is capped at eight requests; loading and synthesis have timeouts.
- Each synthesis supplies its own reference. No fallback to a different voice if reference synthesis fails. Errors are visible to the user.
- Cache identity includes the reference identifier. Replacing a reference invalidates generated voice durations. The existing decoder measures the final transformed audio before feeding the timeline.
- Natural, Viral 1.30x, Young, Child-like, Deep, Mature and normal-speed high-pitch presets are preconfigured over Faber. Perceptual age labels remain stylistic/experimental.
- A character reference generates new text. The separate ready-audio upload replaces a single message.

## Verification

`npm test -- src/lib/chatscene/__tests__/voice-reference.test.ts` checks default casting, per-character state, cache invalidation and reference validation.

Set `CHATSCENE_TEST_CLONE=1` and run `voice-clone.integration.test.ts` for a real synthetic-reference round trip, account isolation, final MP3 analysis and reference deletion. Artifacts go to `output/chatscene-voice-cloning`. This test never uses private recordings.

Runtime logs record device, inference time, output duration and peak allocated VRAM, without prompt text, reference paths or credentials. Audio quality and similarity require listening to the actual output; a successful WAV/MP3 check alone does not establish them.

Real clone verification passed on 2026-09-17 using only a Piper-generated synthetic reference. The final transformed MP3 is 3.912 s, mono 24 kHz, -2.5 dB peak and -18.5 dB mean volume. Account isolation, reference deletion and final-duration analysis passed in the integration test. Artifacts are in `output/chatscene-voice-cloning`.

Earlier checks completed during implementation: 243 ChatScene tests passed; production build and scoped ESLint passed. TypeScript reports three existing errors outside ChatScene (`TemplateEditor`, `captions-timing.test`, `tiktok-resolver.test`). Isolated voice-panel screenshots captured at 1440, 1366 and 390 px. At 390 px document width equals viewport width. The isolated browser had no authenticated account, so the final authenticated click-through remains a separate manual check. No preview renderer or timeline visuals were changed.
