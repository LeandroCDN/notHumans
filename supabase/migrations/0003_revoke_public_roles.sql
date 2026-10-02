-- Segunda barrera además del RLS: los roles públicos de la API no tienen ningún permiso.
-- Solo el server (service_role, con la secret key) lee y escribe.
revoke all on public.nothumans, public.nothuman_versions, public.nothumans_current from anon, authenticated;
