"""Real Hostear upload via actual editor components in an isolated browser.

Start Vite with backend/tests/browser/vite.audio.config.ts. Auth minting is
substituted by a short-lived test ticket; no production authentication bypass.
Secrets are read only from process environment, never written into artifacts.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import time
import uuid

import requests
from playwright.sync_api import sync_playwright
from app.security import create_job_token

parser = argparse.ArgumentParser()
parser.add_argument('input', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
base = 'https://cleaner-104-234-186-50.nip.io'
caps = requests.get(base + '/v1/audio/capabilities', timeout=15).json()
assert caps['ready'] and caps['device'] == 'cpu'
secret = os.environ['CLEANER_WORKER_SECRET']
job = str(uuid.uuid4())
job_url = base + '/v1/audio/jobs/' + job
ticket = {'base': job_url, 'maxDuration': 180}
for scope in ('upload', 'control', 'result'):
    ticket[scope + 'Token'] = create_job_token(secret, job, scope, 900)
assert requests.get(job_url, timeout=15).status_code == 401
started = time.monotonic()
completed = False
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        context = browser.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
        context.add_init_script('window.audioSmokeTicket=' + json.dumps(ticket))
        context.add_init_script('''window.audioSmokePlayers=[];
          const AudioOriginal=window.Audio;
          window.Audio=function(...args){const audio=new AudioOriginal(...args);window.audioSmokePlayers.push(audio);return audio;};
          window.Audio.prototype=AudioOriginal.prototype;''')
        page = context.new_page()
        page.goto('http://127.0.0.1:4180/backend/tests/browser/audio.html')
        page.get_by_label('Vídeo de teste').set_input_files(str(args.input))
        page.get_by_role('button', name='Separar com Demucs', exact=True).click()
        page.wait_for_function('''() => document.body.innerText.includes('Ouvir somente a voz separada') ||
          [...document.querySelectorAll('[role="alert"]')].some(e => e.textContent.trim())''', timeout=180000)
        errors = page.get_by_role('alert').all_inner_texts()
        if any(errors):
            page.screenshot(path=str(args.output / 'falha-audio.png'), full_page=True)
            raise RuntimeError(' / '.join(errors))
        elapsed = round(time.monotonic() - started, 2)
        page.get_by_role('button', name='Ouvir somente a voz separada').click()
        state = page.evaluate('window.audioSmokeState')
        assert state['originalMuted']
        assert len(state['tracks']) == 2
        assert [c['muted'] for c in state['tracks']] == [False, True]
        for clip in state['tracks']:
            assert clip['stemRole'] in ('voice', 'music') and clip['url'].startswith('data:audio/')
            (args.output / (clip['stemRole'] + '.mp3')).write_bytes(base64.b64decode(clip['url'].split(',', 1)[1]))
        page.locator('video').evaluate('(v) => v.play()')
        page.wait_for_timeout(1500)
        assert page.locator('video').evaluate('(v) => v.muted && v.currentTime > 0')
        assert page.evaluate('''() => window.audioSmokePlayers.some(a =>
          a.src === window.audioSmokeState.tracks[0].url && !a.paused && a.currentTime > 0)''')
        assert page.evaluate('''() => !window.audioSmokePlayers.some(a =>
          a.src === window.audioSmokeState.tracks[1].url && !a.paused)''')
        assert page.get_by_role('alert').inner_text() == ''
        page.locator('video').evaluate('(v) => { v.pause(); v.currentTime = 2; }')
        page.get_by_role('button', name='Exportar teste', exact=True).click()
        page.get_by_role('link', name='Baixar exportação', exact=True).wait_for(timeout=120000)
        with page.expect_download() as download:
            page.get_by_role('link', name='Baixar exportação', exact=True).click()
        download.value.save_as(args.output / 'voz-exportada-editor.mp4')
        page.screenshot(path=str(args.output / 'editor-audio.png'), full_page=True)
        # Persist only safe evidence. No headers, tickets, session or secret.
        report = {'job': job, 'elapsed_to_stems_seconds': elapsed, 'engine': caps['engine'],
                  'device': 'cpu', 'tracks': len(state['tracks']), 'voice_only': True,
                  'exported': True, 'auth_minting': 'isolated test ticket, not login flow'}
        (args.output / 'resultado.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report), flush=True)
        browser.close()
        completed = True
finally:
    if not completed:
        requests.post(job_url + '/cancel', headers={'x-job-token': ticket['controlToken']}, timeout=15)
