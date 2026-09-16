"""Minimal local-only entry point for the GPU audio worker.

It deliberately omits video restoration, OCR and render routes so the isolated
CUDA runtime needs only the audio service dependencies.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from .audio_separation import AudioSeparation
from .config import get_settings

SETTINGS = get_settings()
SETTINGS.storage_dir.mkdir(parents=True, exist_ok=True)
AUDIO = AudioSeparation(SETTINGS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    AUDIO.recover()
    AUDIO.cleanup()
    try:
        yield
    finally:
        for event in list(AUDIO.active.values()):
            event.set()
        await asyncio.to_thread(AUDIO.cleanup)


app = FastAPI(title="VaiViral local audio GPU worker", docs_url=None, redoc_url=None,
              openapi_url=None, lifespan=lifespan)
app.include_router(AUDIO.router)
if SETTINGS.allowed_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(SETTINGS.allowed_hosts))
if SETTINGS.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=list(SETTINGS.cors_origins),
                       allow_methods=["GET", "POST", "OPTIONS"],
                       allow_headers=["content-type", "x-job-token"], max_age=600)
