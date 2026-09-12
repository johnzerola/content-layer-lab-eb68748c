# Architecture proposal for validation

Validate a single versioned project document whose commands modify timeline, canvas and captions atomically. A project clock maps output time to source media per clip; preview and final render consume the same mapping. UI invokes typed Editor API commands, never direct DOM automation.

Keep interactive preview and final render as separate execution concerns sharing the composition contract. Evaluate proxy, WebCodecs/Mediabunny and backend FFmpeg by operation and browser support. Every candidate needs a fixture task and license gate.
