CREATE POLICY "assets_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assets_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assets_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assets_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);