-- Cada notHuman con su versión vigente, para listar sin traer todo el historial.
-- security_invoker: la vista respeta el RLS de las tablas (desde afuera no se ve nada).
create view public.nothumans_current with (security_invoker = true) as
select
  n.id,
  n.name,
  n.owner,
  n.created_by,
  n.created_at,
  n.updated_at,
  v.version,
  v.business,
  v.profile,
  v.examples,
  v.stats
from public.nothumans n
join public.nothuman_versions v on v.nothuman_id = n.id and v.version = n.current_version;
