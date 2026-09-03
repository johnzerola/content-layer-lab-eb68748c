CREATE POLICY "own editor sources read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'editor-sources' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "own editor sources insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'editor-sources' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "own editor sources update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'editor-sources' AND (storage.foldername(name))[1] = (auth.uid())::text);
CREATE POLICY "own editor sources delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'editor-sources' AND (storage.foldername(name))[1] = (auth.uid())::text);