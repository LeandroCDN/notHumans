-- Para listar el historial de versiones sin traer todos los ejemplos de cada una.
alter table public.nothuman_versions
  add column example_count int generated always as (jsonb_array_length(examples)) stored;
