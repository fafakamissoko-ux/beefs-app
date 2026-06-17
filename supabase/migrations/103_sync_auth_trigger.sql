-- Archive versionnement : trigger auth déjà déployé en prod (clsztcvmhvccvjxdwapt).
-- Ne pas ré-appliquer via CLI si identique — fichier de synchronisation repo ↔ prod.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base_username text;
    v_final_username text;
    v_display_name text;
BEGIN
    v_final_username := 'temp_' || substr(NEW.id::text, 1, 8);
    v_display_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        'Nouveau Citoyen'
    );
    INSERT INTO public.users (
        id, email, username, display_name, avatar_url, needs_arena_username
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.email, 'no-email-' || NEW.id),
        v_final_username, v_display_name,
        NEW.raw_user_meta_data->>'avatar_url',
        true
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
