# Current editor architecture

Evidence is static working-tree inspection, not a deployed/runtime trace. `VideoStudio` owns a local `PreEdit` document with start/end, crop, keys and transitions through `useEditorHistory`; it drives an HTML video preview and `EditorTimeline`. Captions arrive through separate props/callbacks. Template editing has a distinct canvas/layer surface. The professional project route and render worker form a second composition/render path. Backend audio separation is a separate job surface.

The principal risk is disagreement between source time, project/output time, captions, layers, save revision and render revision. See [state graph](state-graph.json).
