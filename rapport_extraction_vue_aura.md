```sql
CREATE VIEW public.aura_notifications
WITH (security_invoker = true) AS
SELECT
  ('spark-' || s.id::text)::text AS id,
  s.receiver_id AS user_id,
  s.created_at,
  COALESCE(gu.display_name, gu.username, 'Quelqu''un'::text)::text AS giver_name,
  gu.username::text AS giver_username,
  s.source_kind::text AS aura_kind,
  s.giver_id AS giver_id
FROM public.aura_sparks s
INNER JOIN public.users gu ON gu.id = s.giver_id;
```
