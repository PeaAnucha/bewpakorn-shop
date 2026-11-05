-- Allow the dedicated history permission to read recent stock history.
begin;

drop policy if exists stock_history_recent_read on public.stock_history;
create policy stock_history_recent_read on public.stock_history
  for select to authenticated
  using (created_at >= now() - interval '3 days'
    and (public.has_perm('products', 'view')
      or public.has_perm('stockcount', 'view')
      or public.has_perm('history', 'view')));

commit;
