-- Signing a playback URL requires SELECT. The previous policy read auth.users,
-- which the signed-in role cannot do, so the check failed for the owner too.

DROP POLICY IF EXISTS "Users can read page audio they can open" ON storage.objects;
CREATE POLICY "Users can read page audio they can open"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'journal-audio'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.entries AS entry
      WHERE entry.properties #>> '{pageSong,path}' = name
        AND (
          entry.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.entry_shares AS share
            WHERE share.entry_id = entry.id
              AND share.shared_with_user_id = (SELECT auth.uid())
          )
        )
    )
  )
);
