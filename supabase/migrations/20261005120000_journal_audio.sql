-- Private audio chosen for a page. The object path is stored on
-- entries.properties.pageSong. Signed URLs are created at playback time.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journal-audio',
  'journal-audio',
  false,
  20971520,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/wave', 'audio/ogg', 'audio/mp4', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own page audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'journal-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read page audio they can open"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'journal-audio'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      WHERE e.properties #>> '{pageSong,path}' = storage.objects.name
        AND (
          e.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.entry_shares es
            WHERE es.entry_id = e.id
              AND (
                es.shared_with_user_id = auth.uid()
                OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
              )
          )
        )
    )
  )
);

CREATE POLICY "Users can delete their own page audio"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'journal-audio'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
