-- =====================================================================
-- juseikr · Jusei INA GO — skema Supabase
-- Jalankan seluruh file ini di Supabase > SQL Editor > New query > Run.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------- Tabel ----------
create table if not exists public.kv (
  col        text not null,                       -- products | site | orders | invoices | payments | ideas
  id         text not null,
  owner      uuid references auth.users(id) on delete set null default auth.uid(),
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists kv_owner_idx on public.kv (col, owner);

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Fungsi ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.kv_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists kv_touch on public.kv;
create trigger kv_touch before update on public.kv
  for each row execute function public.kv_touch();

-- Invoice dibuat otomatis saat order masuk, dengan confirmed=false.
-- Customer baru bisa membacanya setelah admin menekan "Konfirmasi invoice".
create or replace function public.kv_make_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare tot numeric;
begin
  if new.col = 'orders' then
    select coalesce(sum(
             (case when i->>'q' ~ '^\d+(\.\d+)?$' then (i->>'q')::numeric else 1 end) *
             (case when i->>'p' ~ '^\d+(\.\d+)?$' then (i->>'p')::numeric else 0 end)), 0)
      into tot
      from jsonb_array_elements(coalesce(new.data->'items', '[]'::jsonb)) i;
    insert into public.kv (col, id, owner, data)
    values ('invoices', new.id, new.owner, jsonb_build_object(
      'no', 'INV-' || new.id,
      'order', new.id,
      'items', coalesce(new.data->'items', '[]'::jsonb),
      'total', tot,
      'ongkir', 0,
      'note', '',
      'confirmed', false,
      'at', (extract(epoch from now()) * 1000)::bigint))
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists kv_make_invoice on public.kv;
create trigger kv_make_invoice after insert on public.kv
  for each row execute function public.kv_make_invoice();

-- ---------- Row Level Security ----------
alter table public.kv     enable row level security;
alter table public.admins enable row level security;

grant select on public.kv to anon, authenticated;
grant insert, update, delete on public.kv to authenticated;
grant select on public.admins to authenticated;

drop policy if exists kv_read            on public.kv;
drop policy if exists kv_customer_insert on public.kv;
drop policy if exists kv_admin_all       on public.kv;
drop policy if exists admins_read        on public.admins;

-- Baca: katalog & isi website untuk semua; sisanya hanya pemilik dan admin.
-- Invoice hanya terlihat pemiliknya bila sudah dikonfirmasi admin.
create policy kv_read on public.kv for select using (
  col in ('products', 'site')
  or public.is_admin()
  or (owner = auth.uid()
      and col in ('orders', 'invoices', 'payments', 'ideas')
      and (col <> 'invoices' or coalesce((data->>'confirmed')::boolean, false)))
);

-- Customer hanya boleh MEMBUAT order, ide, dan bukti bayar miliknya sendiri.
create policy kv_customer_insert on public.kv for insert to authenticated with check (
  owner = auth.uid() and (
    col = 'ideas'
    or (col = 'orders'
        and data->>'status' = 'Pesanan Dibuat'
        and coalesce(data->>'resi', '') = ''
        and not coalesce(data->'tl', '{}'::jsonb) ?| array['1','2','3','4','5','6'])
    or (col = 'payments'
        and coalesce(data->>'verified', 'false') = 'false'
        and data->>'path' like auth.uid()::text || '/%'
        and exists (select 1 from public.kv o
                     where o.col = 'orders' and o.id = data->>'oid' and o.owner = auth.uid()))
  )
);

-- Admin: semua operasi (termasuk ubah & hapus).
create policy kv_admin_all on public.kv for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy admins_read on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values
  ('photos', 'photos', true),   -- foto tracking, produk, logo, QRIS (diunggah admin)
  ('bukti',  'bukti',  false)   -- bukti transfer (diunggah customer, privat)
on conflict (id) do nothing;

drop policy if exists "photos_read"         on storage.objects;
drop policy if exists "photos_admin_insert" on storage.objects;
drop policy if exists "photos_admin_update" on storage.objects;
drop policy if exists "photos_admin_delete" on storage.objects;
drop policy if exists "bukti_insert_own"    on storage.objects;
drop policy if exists "bukti_read_own"      on storage.objects;
drop policy if exists "bukti_admin_delete"  on storage.objects;

create policy "photos_read" on storage.objects for select
  using (bucket_id = 'photos');
create policy "photos_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());
create policy "photos_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_admin());
create policy "photos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- Bukti bayar disimpan di folder <user_id>/...
create policy "bukti_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'bukti' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bukti_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'bukti'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "bukti_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'bukti' and public.is_admin());

-- ---------- Data awal (opsional) ----------
insert into public.kv (col, id, owner, data) values
  ('products', 'p-demo-1', null, '{"n":"Album Mini (Random Ver.)","p":285000,"c":"Korea Selatan","d":"Pre-order, termasuk photocard random."}'),
  ('products', 'p-demo-2', null, '{"n":"Official Lightstick","p":890000,"c":"Korea Selatan","d":"Garansi keaslian, packing aman."}'),
  ('products', 'p-demo-3', null, '{"n":"Photobook Limited Edition","p":540000,"c":"Jepang","d":"Edisi Jepang, stok terbatas."}'),
  ('products', 'p-demo-4', null, '{"n":"Acrylic Stand Pop-up Store","p":195000,"c":"China","d":"Merch pop-up store."}')
on conflict do nothing;

-- =====================================================================
-- JADIKAN AKUN ANDA ADMIN (jalankan setelah mendaftar di website):
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'email-admin@contoh.com';
-- =====================================================================
