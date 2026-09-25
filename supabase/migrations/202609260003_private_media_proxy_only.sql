-- All invitation media is served through /api/media, which checks current
-- invitation access on every request and responds with private, no-store.
-- Direct Storage downloads can be cached beyond a later role revocation.
begin;

drop policy if exists tamuara_member_media_read on storage.objects;

commit;
