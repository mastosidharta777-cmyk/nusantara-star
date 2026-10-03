#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${TEST_DATABASE_URL:-}"

if [[ -z "$database_url" ]]; then
  echo "TEST_DATABASE_URL is required for the isolated PostgreSQL 17 concurrency test" >&2
  exit 1
fi
# URI query options may override the apparent host; never accept them here.
if [[ "$database_url" == *'?'* || "$database_url" == *'#'* ]]; then
  echo "Refusing concurrency test: connection URI options are not allowed" >&2
  exit 1
fi
case "$database_url" in
  postgresql://*@127.0.0.1:*/*|postgres://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@localhost:*/*) ;;
  *)
    echo "Refusing concurrency test: TEST_DATABASE_URL must point to localhost" >&2
    exit 1
    ;;
esac
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for the PostgreSQL 17 concurrency test" >&2
  exit 1
fi

# Feed SQL through stdin: psql variable interpolation is not supported by -c.
# Quiet mode suppresses SET/BEGIN tags so scalar assertions see only row values.
psql_cmd=(psql -X --quiet --no-psqlrc --set ON_ERROR_STOP=1 "$database_url")
scalar() {
  "${psql_cmd[@]}" --tuples-only --no-align --file - <<< "$1" \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

server_version_num="$(scalar "show server_version_num")"
if (( server_version_num < 170000 || server_version_num >= 180000 )); then
  echo "Expected PostgreSQL 17, received server_version_num=$server_version_num" >&2
  exit 1
fi
if [[ "$(scalar "select current_database()")" != "nusantara_star_test" ]]; then
  echo "Refusing concurrency test outside the dedicated nusantara_star_test database" >&2
  exit 1
fi

# The client URI above is restricted to localhost and this session is further
# pinned to PostgreSQL 17 plus the dedicated nusantara_star_test database.
# Do not require inet_server_addr() to be loopback here: GitHub Actions exposes
# its localhost-published PostgreSQL service through a Docker bridge, so the
# server correctly reports a private container address (for example 172.x).

for sql_file in \
  test/fixtures/booking-schema.sql \
  supabase-manager-duty-window-v1.sql \
  supabase-booking-schedule-hold-foundation-v1.sql \
  supabase-payment-request-cutoff-v1.sql \
  supabase-booking-reservation-security-v1.sql \
  test/fixtures/postgres17-concurrency.sql
do
  "${psql_cmd[@]}" --file "$repo_root/$sql_file" >/dev/null
done

tmp_dir="$(mktemp -d)"
cleanup() {
  if [[ -n "${tmp_dir:-}" && -d "$tmp_dir" ]]; then rm -r -- "$tmp_dir"; fi
}
trap cleanup EXIT

base_at="$(scalar "select date_trunc('second',clock_timestamp() + interval '3 days')::text")"
hold_cutoff="$(scalar "select (clock_timestamp() + interval '30 minutes')::text")"
travel='Manager confirmed arrival, travel time and turnaround are feasible.'
nearby='Manager calendar checked: no other obligations near this duty block.'
reviewer='pg17-ci-reviewer'

seed() {
  local talent_id="$1" start_hours="$2" end_hours="$3"
  "${psql_cmd[@]}" --tuples-only --no-align --field-separator '|' \
    --set talent_id="$talent_id" --set base_at="$base_at" \
    --set start_hours="$start_hours" --set end_hours="$end_hours" \
    --file - <<< "select * from public.ns_test_seed_booking_chain_v1(
      :'talent_id'::uuid, :'base_at'::timestamptz, :'start_hours'::integer, :'end_hours'::integer);"
}

create_booking() {
  local brief_id="$1" deal_id="$2" cutoff="$3" output="$4" marker="${5:-}"
  local tx_start="" tx_end=""
  if [[ -n "$marker" ]]; then
    tx_start="begin;"
    tx_end="select pg_advisory_xact_lock($marker); select pg_sleep(8); commit;"
  fi
  "${psql_cmd[@]}" --tuples-only --no-align \
    --set brief_id="$brief_id" --set deal_id="$deal_id" --set cutoff="$cutoff" \
    --set travel="$travel" --set nearby="$nearby" --set reviewer="$reviewer" \
    --file - <<< "$tx_start set statement_timeout='20s'; select public.ns_create_booking_with_hold_v1(
      :'brief_id'::uuid, :'deal_id'::uuid, :'cutoff'::timestamptz,
      :'travel', :'nearby', :'reviewer'); $tx_end" >"$output" 2>"$output.err"
}

# Poll only to synchronize local database sessions. A missing barrier is a test
# failure, never a timing-based assumption that concurrency happened.
wait_for_sql() {
  local query="$1" description="$2"
  for _ in {1..60}; do
    if [[ "$(scalar "$query")" == "t" ]]; then return 0; fi
    sleep 0.05
  done
  echo "Concurrency barrier not reached: $description" >&2
  return 1
}

run_pair() {
  local brief_a="$1" deal_a="$2" brief_b="$3" deal_b="$4" cutoff="$5" prefix="$6"
  local status_a status_b marker=19482916
  # Keep A's successful creation uncommitted. Only launch B after observing the
  # marker taken AFTER that RPC, and prove B is waiting on A before A commits.
  PGAPPNAME="ns-race-$prefix-a" create_booking "$brief_a" "$deal_a" "$cutoff" "$tmp_dir/$prefix-a" "$marker" &
  local pid_a=$!
  wait_for_sql "select not pg_try_advisory_lock($marker)" "$prefix first transaction" || {
    cat "$tmp_dir/$prefix-a.err" >&2; wait "$pid_a" || true; return 1;
  }
  PGAPPNAME="ns-race-$prefix-b" create_booking "$brief_b" "$deal_b" "$cutoff" "$tmp_dir/$prefix-b" &
  local pid_b=$!
  wait_for_sql "select exists(select 1 from pg_stat_activity a, pg_stat_activity b
    where a.application_name='ns-race-$prefix-a' and b.application_name='ns-race-$prefix-b'
      and a.pid=any(pg_blocking_pids(b.pid)) and b.wait_event_type='Lock')" "$prefix second transaction blocked on first" || {
    cat "$tmp_dir/$prefix-a.err" "$tmp_dir/$prefix-b.err" >&2
    wait "$pid_a" || true; wait "$pid_b" || true; return 1;
  }
  if wait "$pid_a"; then status_a=0; else status_a=$?; fi
  if wait "$pid_b"; then status_b=0; else status_b=$?; fi
  printf '%s|%s\n' "$status_a" "$status_b"
}

deadlocks_before="$(scalar "select deadlocks from pg_stat_database where datname=current_database()")"

# Two genuinely separate sessions race for overlapping intervals. Exactly one
# complete booking survives; the losing RPC must roll back all child rows.
overlap_talent="$(scalar "select gen_random_uuid()")"
IFS='|' read -r overlap_brief_a overlap_deal_a <<<"$(seed "$overlap_talent" 12 16)"
IFS='|' read -r overlap_brief_b overlap_deal_b <<<"$(seed "$overlap_talent" 15 19)"
IFS='|' read -r overlap_status_a overlap_status_b <<<"$(run_pair \
  "$overlap_brief_a" "$overlap_deal_a" "$overlap_brief_b" "$overlap_deal_b" \
  "$hold_cutoff" overlap)"
if (( (overlap_status_a == 0) + (overlap_status_b == 0) != 1 )); then
  echo "Expected one overlapping booking success and one failure; got $overlap_status_a:$overlap_status_b" >&2
  cat "$tmp_dir"/overlap-*.err >&2
  exit 1
fi
if ! grep -qi "overlapping active duty reservation" "$tmp_dir"/overlap-*.err; then
  echo "Losing overlap did not fail at the database exclusion gate" >&2
  cat "$tmp_dir"/overlap-*.err >&2
  exit 1
fi
overlap_counts="$(scalar "select concat_ws(',',
  count(distinct b.id),count(distinct m.id),count(distinct r.id),count(distinct f.id),
  (select count(*) from public.ns_booking_transition_authorizations))
  from public.bookings b
  left join public.payment_milestones m on m.booking_id=b.id
  left join public.booking_schedule_reservations r on r.booking_id=b.id
  left join public.booking_schedule_feasibility_reviews f on f.id=r.feasibility_review_id
  where b.brief_id in ('$overlap_brief_a'::uuid,'$overlap_brief_b'::uuid)")"
if [[ "$overlap_counts" != "1,2,1,1,0" ]]; then
  echo "Overlapping loser left partial rows: $overlap_counts" >&2
  exit 1
fi
if (( overlap_status_a == 0 )); then
  retry_brief="$overlap_brief_a"
  retry_deal="$overlap_deal_a"
else
  retry_brief="$overlap_brief_b"
  retry_deal="$overlap_deal_b"
fi
create_booking "$retry_brief" "$retry_deal" "$hold_cutoff" "$tmp_dir/overlap-retry"
if ! grep -q '"existing": true' "$tmp_dir/overlap-retry"; then
  echo "Exact retry did not reuse the winning booking and reservation" >&2
  cat "$tmp_dir/overlap-retry" "$tmp_dir/overlap-retry.err" >&2
  exit 1
fi

# Half-open [start,end) semantics must allow exact adjacency under concurrency.
adjacent_talent="$(scalar "select gen_random_uuid()")"
IFS='|' read -r adjacent_brief_a adjacent_deal_a <<<"$(seed "$adjacent_talent" 20 24)"
IFS='|' read -r adjacent_brief_b adjacent_deal_b <<<"$(seed "$adjacent_talent" 24 28)"
IFS='|' read -r adjacent_status_a adjacent_status_b <<<"$(run_pair \
  "$adjacent_brief_a" "$adjacent_deal_a" "$adjacent_brief_b" "$adjacent_deal_b" \
  "$hold_cutoff" adjacent)"
if [[ "$adjacent_status_a:$adjacent_status_b" != "0:0" ]]; then
  echo "Adjacent booking race failed: $adjacent_status_a:$adjacent_status_b" >&2
  cat "$tmp_dir"/adjacent-*.err >&2
  exit 1
fi
adjacent_count="$(scalar "select count(*) from public.booking_schedule_reservations
  where talent_id='$adjacent_talent'::uuid and status='held'")"
if [[ "$adjacent_count" != "2" ]]; then
  echo "Expected two adjacent held reservations; got $adjacent_count" >&2
  exit 1
fi

# Two requests for the SAME booking must serialize and return one identity.
idempotent_talent="$(scalar "select gen_random_uuid()")"
IFS='|' read -r idempotent_brief idempotent_deal <<<"$(seed "$idempotent_talent" 28 32)"
IFS='|' read -r idempotent_status_a idempotent_status_b <<<"$(run_pair \
  "$idempotent_brief" "$idempotent_deal" "$idempotent_brief" "$idempotent_deal" \
  "$hold_cutoff" idempotent)"
if [[ "$idempotent_status_a:$idempotent_status_b" != "0:0" ]] \
  || ! grep -q '"existing": true' "$tmp_dir/idempotent-b"; then
  echo "Concurrent exact retry did not return the original booking" >&2
  cat "$tmp_dir"/idempotent-*.err >&2
  exit 1
fi
idempotent_counts="$(scalar "select concat_ws(',',count(distinct b.id),count(distinct m.id),
  count(distinct r.id),count(distinct f.id)) from public.bookings b
  left join public.payment_milestones m on m.booking_id=b.id
  left join public.booking_schedule_reservations r on r.booking_id=b.id
  left join public.booking_schedule_feasibility_reviews f on f.id=r.feasibility_review_id
  where b.brief_id='$idempotent_brief'::uuid")"
if [[ "$idempotent_counts" != "1,2,1,1" ]]; then
  echo "Concurrent retry duplicated booking children: $idempotent_counts" >&2
  exit 1
fi

# Acceptance starts while the hold is live and keeps the booking row locked
# past the cutoff. Cleanup must skip the busy row, avoiding a reverse
# talent->booking wait, then acceptance commits without losing the hold.
accept_talent="$(scalar "select gen_random_uuid()")"
IFS='|' read -r accept_brief accept_deal <<<"$(seed "$accept_talent" 32 36)"
accept_cutoff="$(scalar "select (clock_timestamp() + interval '6 seconds')::text")"
create_booking "$accept_brief" "$accept_deal" "$accept_cutoff" "$tmp_dir/accept-create"
accept_booking="$(scalar "select id from public.bookings where brief_id='$accept_brief'::uuid")"
marker_key=19482917
"${psql_cmd[@]}" --set booking_id="$accept_booking" --set marker_key="$marker_key" \
  --file - <<< "begin;
    set local statement_timeout='20s';
    select public.ns_accept_buyer_terms_v1(:'booking_id'::uuid);
    select pg_advisory_xact_lock(:'marker_key'::integer);
    select pg_sleep(10);
    commit;" >"$tmp_dir/accept-race" 2>"$tmp_dir/accept-race.err" &
accept_pid=$!

if ! wait_for_sql "select not pg_try_advisory_lock($marker_key)" "buyer acceptance holds booking lock"; then
  echo "Acceptance session did not reach the concurrency barrier" >&2
  cat "$tmp_dir/accept-race.err" >&2
  exit 1
fi
seconds_to_expiry="$("${psql_cmd[@]}" --tuples-only --no-align --set cutoff="$accept_cutoff" \
  --file - <<< "select greatest(0,extract(epoch from :'cutoff'::timestamptz-clock_timestamp())+0.25)")"
sleep "$seconds_to_expiry"
expired_count="$(scalar "set statement_timeout='5s'; select public.ns_expire_untouched_holds_v1('$accept_talent'::uuid)")"
if [[ "$expired_count" != "0" ]]; then
  echo "Cleanup released a hold while buyer acceptance owned the booking lock" >&2
  exit 1
fi
if ! wait "$accept_pid"; then
  cat "$tmp_dir/accept-race.err" >&2
  exit 1
fi
accept_state="$(scalar "select concat_ws(',',b.buyer_terms_accepted_at is not null,r.status)
  from public.bookings b join public.booking_schedule_reservations r on r.booking_id=b.id
  where b.id='$accept_booking'::uuid")"
if [[ "$accept_state" != "t,held" ]]; then
  echo "Acceptance/expiry final state is unsafe: $accept_state" >&2
  exit 1
fi

if [[ "$(scalar "select public.ns_expire_untouched_holds_v1('$accept_talent'::uuid)")" != "0" ]]; then
  echo "Cleanup released accepted evidence after the competing transaction committed" >&2
  exit 1
fi

deadlocks_after="$(scalar "select deadlocks from pg_stat_database where datname=current_database()")"
if [[ "$deadlocks_after" != "$deadlocks_before" ]]; then
  echo "Concurrency suite observed a PostgreSQL deadlock" >&2
  exit 1
fi

echo "PostgreSQL 17 multi-session booking/expiry concurrency passed"
