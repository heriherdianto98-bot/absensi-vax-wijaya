-- Follow-up hardening for Ranking Award production backend.
-- Direct browser table access remains denied. Employee browser access is only through
-- token-validating SECURITY DEFINER self RPCs. Service worker/server uses service_role.

create policy karyawan_push_subscription_v1_no_direct_anon
on public.karyawan_push_subscription_v1
for all
to anon,authenticated
using (false)
with check (false);

create policy karyawan_ranking_award_v1_no_direct_anon
on public.karyawan_ranking_award_v1
for all
to anon,authenticated
using (false)
with check (false);

revoke all on table public.karyawan_push_subscription_v1 from anon,authenticated;
revoke all on sequence public.karyawan_push_subscription_v1_id_seq from anon,authenticated;
revoke all on table public.karyawan_ranking_award_v1 from anon,authenticated;
revoke all on sequence public.karyawan_ranking_award_v1_id_seq from anon,authenticated;

grant select,insert,update,delete on table public.karyawan_push_subscription_v1 to service_role;
grant usage,select on sequence public.karyawan_push_subscription_v1_id_seq to service_role;
grant select,insert,update,delete on table public.karyawan_ranking_award_v1 to service_role;
grant usage,select on sequence public.karyawan_ranking_award_v1_id_seq to service_role;

create index if not exists karyawan_ranking_award_v1_cabang_idx
  on public.karyawan_ranking_award_v1(cabang_id);
