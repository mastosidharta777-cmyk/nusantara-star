import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

// PGlite executes real PostgreSQL constraints, PL/pgSQL, roles and rollback.
// Its single connection does NOT replace the multi-session cutover race test.
let db;
const file = (path) => readFile(new URL(path, import.meta.url), 'utf8');
before(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(await file('./fixtures/booking-schema.sql')).catch(e => { throw new Error(`Fixture: ${e.message} at ${e.position}`); });
  await db.exec(await file('../supabase-manager-duty-window-v1.sql'));
  await db.exec(await file('../supabase-booking-schedule-hold-foundation-v1.sql'));
  await db.exec(await file('../supabase-payment-request-cutoff-v1.sql'));
  await db.exec(await file('../supabase-booking-reservation-security-v1.sql'));
  await db.exec(await file('../supabase-late-transfer-reconciliation-v1.sql'));
});
after(async () => { if (db) await db.close(); });

const travel = 'Manager confirmed arrival, travel time and turnaround are feasible.';
const nearby = 'Manager calendar checked: no other obligations near this duty block.';
const reviewer = 'fixture-admin';
const schedule = [{ milestone_type: 'full_payment', sequence_no: 1, calculation_type: 'fixed_amount',
  amount: 1000000, due_basis: 'booking_date', due_offset_days: 0 }];

async function seed({ talentId = randomUUID(), startHours = 72, endHours = 76, buyerSchedule = schedule } = {}) {
  const briefId = randomUUID(), dealId = randomUUID(), offerId = randomUUID(), itemId = randomUUID(), proposalId = randomUUID();
  // Fixed base per test process permits exact adjacent interval boundaries.
  const start = new Date(BASE + startHours * 3600000).toISOString();
  const end = new Date(BASE + endHours * 3600000).toISOString();
  const cutoff = new Date(BASE + 24 * 3600000).toISOString();
  const offerExpiry = new Date(BASE + 48 * 3600000).toISOString();
  const eventDate = start.slice(0, 10);
  await db.query("insert into talents(id,name,category) values($1,'FIXTURE TALENT','singer') on conflict do nothing", [talentId]);
  await db.query("insert into briefs(id,event_date,status,event_type,city,venue) values($1,$2,'buyer_selected','corporate','Jakarta','Fixture Hall')", [briefId, eventDate]);
  await db.query("insert into buyer_selections(brief_id,talent_id) values($1,$2)", [briefId, talentId]);
  await db.query(`insert into talent_offers(id,availability_request_id,brief_id,talent_id,status,availability_status,event_fee,
    quote_valid_until,show_start_local,show_end_local,show_timezone,duty_start_at,duty_end_at,duty_location)
    values($1,$2,$3,$4,'confirmed','confirmed',800000,$5,'18:00','19:00','Asia/Jakarta',$6,$7,'Fixture Hall')`,
    [offerId, randomUUID(), briefId, talentId, offerExpiry, start, end]);
  await db.query(`insert into proposal_items(id,proposal_id,brief_id,talent_id,talent_offer_id,buyer_price,availability_status,
    offer_valid_until,talent_name_snapshot,talent_category_snapshot,show_start_local,show_end_local,show_timezone,
    duty_start_at,duty_end_at,duty_location)
    values($1,$2,$3,$4,$5,1000000,'confirmed',$6,'FIXTURE TALENT','singer','18:00','19:00','Asia/Jakarta',$7,$8,'Fixture Hall')`,
    [itemId, proposalId, briefId, talentId, offerId, offerExpiry, start, end]);
  await db.query(`insert into deals(id,brief_id,proposal_id,proposal_item_id,talent_offer_id,talent_id,status,buyer_price,talent_payable,
    buyer_payment_schedule,talent_payment_schedule,funding_gap_status,cancellation_terms)
    values($1,$2,$3,$4,$5,$6,'locked',1000000,800000,$7,$8,'safe','Fixture cancellation terms')`,
    [dealId, briefId, proposalId, itemId, offerId, talentId, JSON.stringify(buyerSchedule), JSON.stringify(schedule)]);
  return { briefId, dealId, offerId, itemId, talentId, cutoff };
}
const BASE = Date.now();
async function create(s, changes = {}) {
  const { rows } = await db.query('select ns_create_booking_with_hold_v1($1,$2,$3,$4,$5,$6) as result',
    [s.briefId, changes.dealId ?? s.dealId, changes.cutoff ?? s.cutoff,
      changes.travel ?? travel, nearby, reviewer]);
  return rows[0].result;
}
async function counts(s) {
  return (await db.query(`select
    (select count(*)::int from bookings where brief_id=$1) as bookings,
    (select count(*)::int from payment_milestones m join bookings b on b.id=m.booking_id where b.brief_id=$1) as milestones,
    (select count(*)::int from booking_schedule_reservations where deal_id=$2) as holds,
    (select count(*)::int from booking_schedule_feasibility_reviews where deal_id=$2) as reviews,
    (select count(*)::int from ns_booking_transition_authorizations) as authorizations`, [s.briefId,s.dealId])).rows[0];
}
const empty = { bookings: 0, milestones: 0, holds: 0, reviews: 0, authorizations: 0 };

// Fixture-only time travel; never used against a remote database. Keep the
// production immutability trigger enabled for every action being tested.
async function ageHold(bookingId) {
  await db.exec('alter table booking_schedule_reservations disable trigger trg_protect_booking_schedule_reservation_v1');
  try {
    await db.query(`update booking_schedule_reservations set held_at=now()-interval '2 hours',
      hold_expires_at=now()-interval '1 hour' where booking_id=$1`, [bookingId]);
  } finally {
    await db.exec('alter table booking_schedule_reservations enable trigger trg_protect_booking_schedule_reservation_v1');
  }
}

test('untouched expiry is idempotent, preserves snapshots and permits a replacement hold', async () => {
  const s = await seed();
  const b = await create(s);
  assert.equal((await db.query('select ns_expire_untouched_holds_v1($1) as n', [s.talentId])).rows[0].n, 0);
  await ageHold(b.bookingId);
  const replacement = await seed({ talentId: s.talentId });
  await create(replacement); // Acquisition performs serialized cleanup itself.
  const old = (await db.query(`select status,release_reason,released_at from booking_schedule_reservations
    where id=$1`, [b.reservationId])).rows[0];
  assert.equal(old.status, 'expired');
  assert.equal(old.release_reason, 'automatic_untouched_hold_expiry_v1');
  assert.ok(old.released_at);
  assert.equal((await db.query('select ns_expire_untouched_holds_v1($1) as n', [s.talentId])).rows[0].n, 0);
  await assert.rejects(db.query('select ns_accept_buyer_terms_v1($1)', [b.bookingId]), /exact live held reservation/);
  await assert.rejects(create(s), /explicit recovery|stale|active reservation/i);
  assert.deepEqual(await counts(s), { bookings: 1, milestones: 2, holds: 1, reviews: 1, authorizations: 0 });
});

test('expiry retains acceptance, every payment history, manual approval and recovery evidence', async () => {
  for (const evidence of ['acceptance','failed_request','late_transfer','manual_po','recovery']) {
    const s = await seed();
    const b = await create(s);
    if (evidence === 'acceptance') await db.query('select ns_accept_buyer_terms_v1($1)', [b.bookingId]);
    if (evidence === 'failed_request') {
      // Legacy/other payment rows must also protect the slot, regardless of status.
      await db.query(`insert into payments(booking_id,payment_type,amount,status,request_issued_at,
        booking_schedule_reservation_id,request_expires_at)
        values($1,'other',1,'failed',now(),$2,now()+interval '1 hour')`, [b.bookingId,b.reservationId]);
    }
    if (evidence === 'late_transfer') {
      await db.query(`insert into payments(booking_id,payment_type,amount,status,paid_at,evidence_key)
        values($1,'other',1,'cancelled',now(),'fixture-transfer')`, [b.bookingId]);
    }
    if (evidence === 'manual_po') {
      // Historical approval is independently protective even if booking flags drift.
      await db.query(`insert into booking_manual_security_approvals(booking_id,deal_id,
        booking_schedule_reservation_id,security_type,reference,approved_amount,evidence_snapshot,
        approved_by,valid_until) values($1,$2,$3,'approved_po_credit','FIXTURE',1000000,
        '{"note":"Fixture verified manual PO evidence"}',$4,now()+interval '1 hour')`,
        [b.bookingId,s.dealId,b.reservationId,reviewer]);
    }
    if (evidence === 'recovery') await db.query(`insert into recovery_cases(original_booking_id,status)
      values($1,'matching')`, [b.bookingId]);
    await ageHold(b.bookingId);
    assert.equal((await db.query('select ns_expire_untouched_holds_v1($1) as n', [s.talentId])).rows[0].n, 0, evidence);
    assert.equal((await db.query('select status from booking_schedule_reservations where id=$1',
      [b.reservationId])).rows[0].status, 'held', evidence);
    const overlap = await seed({ talentId: s.talentId });
    await assert.rejects(create(overlap), /overlapping active duty reservation/, evidence);
    assert.deepEqual(await counts(overlap), empty);
  }
});

test('expiry rejects forged session settings and restricts RPC and private authorization', async () => {
  const s = await seed();
  const b = await create(s);
  await ageHold(b.bookingId);
  await db.exec("set ns.reservation_transition='rpc'");
  try {
    await assert.rejects(db.query(`update booking_schedule_reservations set status='expired',
      released_at=now(),release_reason='forged expiry' where id=$1`, [b.reservationId]), /serialized hold cleanup/);
  } finally { await db.exec('reset ns.reservation_transition'); }
  await db.exec('set role anon');
  try {
    await assert.rejects(db.query('select ns_expire_untouched_holds_v1($1)', [s.talentId]), /permission denied/);
  } finally { await db.exec('reset role'); }
  await db.exec('set role service_role');
  try {
    await assert.rejects(db.query(`insert into ns_booking_transition_authorizations(transaction_id,booking_id,action)
      values(txid_current(),$1,'expire_hold')`, [b.bookingId]), /permission denied/);
    assert.equal((await db.query('select ns_expire_untouched_holds_v1($1) as n', [s.talentId])).rows[0].n, 1);
  } finally { await db.exec('reset role'); }
});

test('failed acquisition rolls back cleanup and its transaction authorization', async () => {
  const s = await seed();
  const b = await create(s);
  await ageHold(b.bookingId);
  const replacement = await seed({ talentId: s.talentId });
  await db.exec(`create function fixture_fail_after_cleanup() returns trigger language plpgsql as $$
    begin raise exception 'injected failure after cleanup'; end; $$;
    create trigger fixture_fail_after_cleanup after insert on booking_schedule_reservations
    for each row execute function fixture_fail_after_cleanup();`);
  try {
    await assert.rejects(create(replacement), /injected failure after cleanup/);
    assert.deepEqual(await counts(replacement), empty);
    assert.equal((await db.query('select status from booking_schedule_reservations where id=$1',
      [b.reservationId])).rows[0].status, 'held');
  } finally {
    await db.exec('drop trigger fixture_fail_after_cleanup on booking_schedule_reservations; drop function fixture_fail_after_cleanup();');
  }
});

test('one call creates terms, both schedules and hold; exact retry reuses them', async () => {
  const s = await seed();
  await db.query('update proposal_items set price_breakdown=$1 where id=$2',
    [JSON.stringify({ talent_fee: 1000000 }), s.itemId]);
  const first = await create(s);
  assert.equal(first.existing, false);
  assert.deepEqual(await counts(s), { bookings: 1, milestones: 2, holds: 1, reviews: 1, authorizations: 0 });
  const retry = await create(s);
  assert.equal(retry.bookingId, first.bookingId);
  assert.equal(retry.reservationId, first.reservationId);
  assert.equal(retry.existing, true);
  await assert.rejects(create(s, { travel: 'Changed review must not silently replace evidence.' }), /Retry evidence differs/);
  const b = (await db.query('select buyer_terms_snapshot from bookings where id=$1', [first.bookingId])).rows[0];
  assert.equal(b.buyer_terms_snapshot.pricing.buyer_price, 1000000);
  assert.equal(b.buyer_terms_snapshot.pricing.breakdown_mode, 'detailed');
  assert.equal(b.buyer_terms_snapshot.pricing.breakdown.talent_fee, 1000000);
  assert.deepEqual(b.buyer_terms_snapshot.payment_schedule, schedule);
  assert.equal(b.buyer_terms_snapshot.event.talent_name, 'FIXTURE TALENT');
  await db.query('select ns_accept_buyer_terms_v1($1)', [first.bookingId]);
  assert.equal((await create(s)).existing, true);
  await db.query('select ns_record_manual_booking_security_v1($1,$2,$3,$4,$5,$6)',
    [first.bookingId, 'approved_po_credit', 'FIXTURE-PO-1', 1000000, 'Fixture signed credit approval verified.', reviewer]);
  await db.query('select ns_secure_booking_v1($1)', [first.bookingId]);
  const secured = (await db.query(`select b.status as booking, r.status as reservation, br.status as brief
    from bookings b join booking_schedule_reservations r on r.booking_id=b.id
    join briefs br on br.id=b.brief_id where b.id=$1`, [first.bookingId])).rows[0];
  assert.deepEqual(secured, { booking: 'secured', reservation: 'secured', brief: 'booked' });
  assert.equal((await create(s)).reservationId, first.reservationId);
});

test('overlap rolls back the losing booking, milestones and review; adjacency succeeds', async () => {
  const a = await seed();
  await create(a);
  const overlap = await seed({ talentId: a.talentId, startHours: 75, endHours: 79 });
  await assert.rejects(create(overlap), /overlapping active duty reservation/);
  assert.deepEqual(await counts(overlap), empty);
  const adjacent = await seed({ talentId: a.talentId, startHours: 76, endHours: 80 });
  assert.equal((await create(adjacent)).existing, false);
});

test('invalid milestone rolls back booking before a hold can be exposed', async () => {
  const s = await seed({ buyerSchedule: [{ ...schedule[0], calculation_type: 'invalid' }] });
  await assert.rejects(create(s), /payment_milestones_calculation_type_check/);
  assert.deepEqual(await counts(s), empty);
});

test('failure after reservation insertion rolls back every write including authorization', async () => {
  const s = await seed();
  await db.exec(`create function fixture_fail_hold() returns trigger language plpgsql as $$
    begin raise exception 'injected hold failure'; end; $$;
    create trigger fixture_fail_hold after insert on booking_schedule_reservations
    for each row execute function fixture_fail_hold();`);
  try {
    await assert.rejects(create(s), /injected hold failure/);
    assert.deepEqual(await counts(s), empty);
  } finally {
    await db.exec('drop trigger fixture_fail_hold on booking_schedule_reservations; drop function fixture_fail_hold();');
  }
});

test('service role cannot forge booking, rewrite terms or create an authorization token', async () => {
  const s = await seed();
  await db.exec('set role service_role');
  try {
    await assert.rejects(db.query(`insert into bookings(brief_id,talent_id,event_date)
      values($1,$2,current_date)`, [s.briefId,s.talentId]), /atomic booking-and-hold RPC/);
    await assert.rejects(db.query(`insert into ns_booking_transition_authorizations values(txid_current(),$1,'create_booking',now())`,
      [randomUUID()]), /permission denied/);
    const created = await create(s);
    await assert.rejects(db.query("update bookings set buyer_terms_snapshot='{}'::jsonb where id=$1", [created.bookingId]), /Issued buyer terms are immutable/);
    await assert.rejects(db.query('delete from payment_milestones where booking_id=$1', [created.bookingId]), /snapshots cannot be deleted/);
  } finally { await db.exec('reset role'); }
  await db.exec('set role anon');
  try { await assert.rejects(create(s), /permission denied for function/); }
  finally { await db.exec('reset role'); }
});

test('stale deal, changed show, expired cutoff and missing duty all fail without residual booking', async () => {
  const s = await seed();
  await assert.rejects(create(s, { dealId: randomUUID() }), /locked deal is required/);
  await assert.rejects(create(s, { cutoff: '2000-01-01T00:00:00Z' }), /Hold cutoff has elapsed/);
  await db.query("update talent_offers set show_start_local='17:00' where id=$1", [s.offerId]);
  await assert.rejects(create(s), /frozen performance snapshot must match/);
  await db.query("update talent_offers set show_start_local='18:00',duty_start_at=null,duty_end_at=null,duty_location=null where id=$1", [s.offerId]);
  await assert.rejects(create(s), /Proposal duty snapshot is missing/);
  assert.deepEqual(await counts(s), empty);
});

test('buyer cannot accept terms after hold expiry, including through the database RPC', async () => {
  const s = await seed();
  const cutoff = new Date(Date.now() + 500).toISOString();
  const b = await create(s, { cutoff });
  await new Promise(resolve => setTimeout(resolve, 550));
  await assert.rejects(db.query('select ns_accept_buyer_terms_v1($1)', [b.bookingId]), /exact live held reservation/);
  const status = (await db.query('select buyer_terms_accepted_at from bookings where id=$1', [b.bookingId])).rows[0];
  assert.equal(status.buyer_terms_accepted_at, null);
});

test('final cancellation atomically revokes requests, releases duty and closes direct SQL bypasses', async () => {
  const s = await seed();
  const b = await create(s);
  await db.query('select ns_accept_buyer_terms_v1($1)', [b.bookingId]);
  const request = (await db.query(`select (ns_create_buyer_payment_request_v1(
    $1,$2::jsonb)).id as id`, [b.bookingId, JSON.stringify({
    method: 'bank_transfer', provider_name: 'Fixture Bank', destination: '000111222',
  })])).rows[0];
  await db.query('select ns_record_manual_booking_security_v1($1,$2,$3,$4,$5,$6)', [
    b.bookingId, 'approved_po_credit', 'FIXTURE-CANCEL-PO', 1000000,
    'Fixture PO credit was approved for cancellation coverage.', reviewer,
  ]);
  await db.query('select ns_secure_booking_v1($1)', [b.bookingId]);
  const caseId = randomUUID();
  await db.query(`insert into cancellation_cases(
    id,booking_id,status,buyer_refund_amount,talent_due_amount
  ) values($1,$2,'approved',0,0)`, [caseId, b.bookingId]);

  await assert.rejects(db.query("update bookings set status='cancelled' where id=$1", [b.bookingId]),
    /atomic cancellation finalization RPC/);
  await assert.rejects(db.query(`update booking_schedule_reservations
    set status='released',released_at=now(),release_reason='direct release'
    where booking_id=$1`, [b.bookingId]), /atomic lifecycle RPC/);
  await assert.rejects(db.query("update payments set status='cancelled' where id=$1", [request.id]),
    /authorized RPC/);
  await assert.rejects(db.query("update cancellation_cases set status='settled' where id=$1", [caseId]),
    /atomic finalization RPC/);

  await db.transaction(async tx => {
    await tx.query("insert into ns_payment_transition_authorizations values(txid_current(),$1,'record_evidence',now())",
      [request.id]);
    await tx.query(`update payments set paid_at=request_expires_at+interval '1 second',
      provider='Fixture Bank',provider_reference='late-fixture',evidence_key='fixture bank:late-fixture',
      receipt_timing='late',reconciliation_status='pending' where id=$1`, [request.id]);
    await tx.query("delete from ns_payment_transition_authorizations where payment_id=$1", [request.id]);
  });
  await assert.rejects(db.query('select ns_finalize_cancellation_v1($1,$2,$3)', [
    caseId, reviewer, 'Financial reconciliation complete; release original duty block.',
  ]), /Pending late-transfer reconciliation/);
  await db.transaction(async tx => {
    await tx.query("insert into ns_payment_transition_authorizations values(txid_current(),$1,'accept_late',now())",
      [request.id]);
    await tx.query(`update payments set reconciliation_status='rejected',
      reconciliation_note='Verified late transfer was rejected and refund handling completed.',
      reconciled_at=now(),reconciled_by=$2 where id=$1`, [request.id, reviewer]);
    await tx.query("delete from ns_payment_transition_authorizations where payment_id=$1", [request.id]);
  });

  const recoveryId = randomUUID();
  await db.query("insert into recovery_cases(id,original_booking_id,status) values($1,$2,'matching')",
    [recoveryId, b.bookingId]);
  await assert.rejects(db.query('select ns_finalize_cancellation_v1($1,$2,$3)', [
    caseId, reviewer, 'Financial reconciliation complete; release original duty block.',
  ]), /replacement recovery is active/);
  let unchanged = (await db.query(`select b.status as booking,r.status as reservation,p.status as payment,c.status as cancellation
    from bookings b join booking_schedule_reservations r on r.booking_id=b.id
    join payments p on p.booking_id=b.id join cancellation_cases c on c.booking_id=b.id
    where b.id=$1`, [b.bookingId])).rows[0];
  assert.deepEqual(unchanged, {
    booking: 'secured', reservation: 'secured', payment: 'pending', cancellation: 'approved',
  });

  await db.query("update recovery_cases set status='closed_no_replacement' where id=$1", [recoveryId]);
  await db.query('select ns_finalize_cancellation_v1($1,$2,$3)', [
    caseId, reviewer, 'Financial reconciliation complete; release original duty block.',
  ]);
  const final = (await db.query(`select b.status as booking,br.status as brief,r.status as reservation,
      p.status as payment,c.status as cancellation,c.reservation_released_by,
      c.reservation_release_note,r.release_reason
    from bookings b join briefs br on br.id=b.brief_id
    join booking_schedule_reservations r on r.booking_id=b.id
    join payments p on p.booking_id=b.id join cancellation_cases c on c.booking_id=b.id
    where b.id=$1`, [b.bookingId])).rows[0];
  assert.equal(final.booking, 'cancelled');
  assert.equal(final.brief, 'cancelled');
  assert.equal(final.reservation, 'released');
  assert.equal(final.payment, 'cancelled');
  assert.equal(final.cancellation, 'settled');
  assert.equal(final.reservation_released_by, reviewer);
  assert.match(final.reservation_release_note, /Financial reconciliation complete/);
  assert.match(final.release_reason, /financially_reconciled_cancellation/);
  assert.equal((await db.query(`select count(*)::int as count from payment_milestones
    where booking_id=$1 and status<>'cancelled'`, [b.bookingId])).rows[0].count, 0);
  assert.equal((await db.query('select count(*)::int as count from ns_booking_transition_authorizations')).rows[0].count, 0);
  assert.equal((await db.query('select count(*)::int as count from ns_payment_transition_authorizations')).rows[0].count, 0);
  await db.query('select ns_finalize_cancellation_v1($1,$2,$3)', [
    caseId, reviewer, 'Financial reconciliation complete; release original duty block.',
  ]);
  await assert.rejects(db.query('select ns_finalize_cancellation_v1($1,$2,$3)', [
    caseId, reviewer, 'Different release decision must not replace the audit record.',
  ]), /retry audit differs/);
});

test('pre-security abandonment revokes buyer links and releases only a zero-money hold', async () => {
  const s = await seed();
  const b = await create(s);
  await db.query('select ns_accept_buyer_terms_v1($1)', [b.bookingId]);
  const request = (await db.query(`select (ns_create_buyer_payment_request_v1(
    $1,$2::jsonb)).id as id`, [b.bookingId, JSON.stringify({
    method: 'bank_transfer', provider_name: 'Fixture Bank', destination: '000111222',
  })])).rows[0];
  const reason = 'Buyer withdrew before any funds or manual security were received.';
  await db.query('select ns_abandon_pending_booking_v1($1,$2,$3)', [b.bookingId, reviewer, reason]);
  const first = (await db.query('select * from booking_pre_security_abandonments where booking_id=$1',
    [b.bookingId])).rows[0];
  assert.equal(first.buyer_terms_were_accepted, true);
  assert.deepEqual(first.revoked_payment_request_ids, [request.id]);
  const final = (await db.query(`select b.status as booking,br.status as brief,r.status as reservation,
      p.status as payment,a.abandoned_by,a.reason,r.release_reason
    from bookings b join briefs br on br.id=b.brief_id
    join booking_schedule_reservations r on r.booking_id=b.id
    join payments p on p.booking_id=b.id
    join booking_pre_security_abandonments a on a.booking_id=b.id
    where b.id=$1`, [b.bookingId])).rows[0];
  assert.equal(final.booking, 'cancelled');
  assert.equal(final.brief, 'cancelled');
  assert.equal(final.reservation, 'released');
  assert.equal(final.payment, 'cancelled');
  assert.equal(final.abandoned_by, reviewer);
  assert.match(final.release_reason, /pre_security_abandonment/);
  assert.equal((await db.query(`select count(*)::int as count from payment_milestones
    where booking_id=$1 and status<>'cancelled'`, [b.bookingId])).rows[0].count, 0);
  await db.query('select ns_abandon_pending_booking_v1($1,$2,$3)', [b.bookingId, reviewer, reason]);
  const retry = (await db.query('select * from booking_pre_security_abandonments where booking_id=$1',
    [b.bookingId])).rows[0];
  assert.equal(retry.id, first.id);
  await assert.rejects(db.query('select ns_abandon_pending_booking_v1($1,$2,$3)', [
    b.bookingId, reviewer, 'Changed abandonment reason must not replace the audit record.',
  ]), /retry audit differs/);

  const withEvidence = await seed({ startHours: 90, endHours: 94 });
  const pending = await create(withEvidence);
  await db.query('select ns_accept_buyer_terms_v1($1)', [pending.bookingId]);
  const late = (await db.query(`select (ns_create_buyer_payment_request_v1(
    $1,$2::jsonb)).id as id`, [pending.bookingId, JSON.stringify({
    method: 'bank_transfer', provider_name: 'Fixture Bank', destination: '000111222',
  })])).rows[0];
  await db.transaction(async tx => {
    await tx.query("insert into ns_payment_transition_authorizations values(txid_current(),$1,'record_evidence',now())", [late.id]);
    await tx.query(`update payments set paid_at=request_expires_at+interval '1 second',
      provider='Fixture Bank',provider_reference='late-abandon',evidence_key='fixture bank:late-abandon',
      receipt_timing='late',reconciliation_status='pending' where id=$1`, [late.id]);
    await tx.query('delete from ns_payment_transition_authorizations where payment_id=$1', [late.id]);
  });
  await assert.rejects(db.query('select ns_abandon_pending_booking_v1($1,$2,$3)', [
    pending.bookingId, reviewer, reason,
  ]), /Payment evidence requires reconciliation/);
  const unchanged = (await db.query(`select b.status as booking,r.status as reservation,p.status as payment
    from bookings b join booking_schedule_reservations r on r.booking_id=b.id
    join payments p on p.booking_id=b.id where b.id=$1`, [pending.bookingId])).rows[0];
  assert.deepEqual(unchanged, { booking: 'pending_security', reservation: 'held', payment: 'pending' });
});


async function agePaymentRequest(paymentId) {
  await db.exec('alter table payments disable trigger trg_protect_payment_request_snapshot_v1');
  await db.exec('alter table payments disable trigger trg_guard_buyer_payment_cutoff_v1');
  try {
    await db.query("update payments set request_issued_at=now()-interval '2 minutes', request_expires_at=now()-interval '1 minute' where id=$1", [paymentId]);
  } finally {
    await db.exec('alter table payments enable trigger trg_guard_buyer_payment_cutoff_v1');
    await db.exec('alter table payments enable trigger trg_protect_payment_request_snapshot_v1');
  }
}

async function seedSecuredWithBalance() {
  const buyerSchedule = [
    { milestone_type: 'booking_fee', sequence_no: 1, calculation_type: 'fixed_amount', amount: 200000, due_basis: 'booking_date', due_offset_days: 0 },
    { milestone_type: 'balance', sequence_no: 2, calculation_type: 'remaining_balance', due_basis: 'invoice_date', due_offset_days: 1 },
  ];
  const s = await seed({ buyerSchedule });
  const b = await create(s);
  await db.query('select ns_accept_buyer_terms_v1($1)', [b.bookingId]);
  await db.query("update payment_milestones set status='paid' where booking_id=$1 and party='buyer' and sequence_no=1", [b.bookingId]);
  await db.query('select ns_record_manual_booking_security_v1($1,$2,$3,$4,$5,$6)',
    [b.bookingId, 'approved_po_credit', 'FIXTURE-POST-SECURITY', 1000000,
      'Fixture verified post-security payment approval.', reviewer]);
  await db.query('select ns_secure_booking_v1($1)', [b.bookingId]);
  await db.query('select ns_create_buyer_payment_request_v1($1,$2::jsonb)',
    [b.bookingId, JSON.stringify({ method:'bank_transfer',provider_name:'Fixture Bank',destination:'123456' })]);
  const request = (await db.query(`select p.id,p.amount,p.status,p.request_expires_at
    from payments p join payment_milestones m on m.id=p.payment_milestone_id
    where p.booking_id=$1 and m.party='buyer' and m.sequence_no=2
    order by p.created_at desc limit 1`, [b.bookingId])).rows[0];
  if (!request) throw new Error('Post-security balance request was not persisted');
  return { s, b, request };
}

test('post-security balance request can be issued and late acceptance never auto-secures a transition', async () => {
  const { b, request } = await seedSecuredWithBalance();
  assert.equal(Number(request.amount), 800000);
  await agePaymentRequest(request.id);
  const recorded = (await db.query('select ns_record_buyer_payment_v1($1,$2,$3,$4,now()) as r',
    [b.bookingId, request.id, 'Fixture Bank', 'LATE-ACCEPT-1'])).rows[0].r;
  assert.equal(recorded.status, 'pending_reconciliation');
  const accepted = (await db.query('select ns_accept_late_buyer_transfer_v1($1,$2,$3,$4) as r',
    [b.bookingId, request.id, reviewer, 'Verified late balance accepted by finance.'])).rows[0].r;
  assert.equal(accepted.reconciliationStatus, 'accepted');
  assert.equal(accepted.bookingSecured, false);
  assert.equal((await db.query('select status from bookings where id=$1',[b.bookingId])).rows[0].status, 'secured');
  const retry = (await db.query('select ns_accept_late_buyer_transfer_v1($1,$2,$3,$4) as r',
    [b.bookingId, request.id, reviewer, 'Verified late balance accepted by finance.'])).rows[0].r;
  assert.equal(retry.alreadyReconciled, true);
  await assert.rejects(db.query('select ns_accept_late_buyer_transfer_v1($1,$2,$3,$4)',
    [b.bookingId, request.id, reviewer, 'Different acceptance decision note must fail.']), /retry audit differs/);
});

test('late rejection requires full return evidence, is idempotent, and permits a fresh request', async () => {
  const { b, request } = await seedSecuredWithBalance();
  await agePaymentRequest(request.id);
  await db.query('select ns_record_buyer_payment_v1($1,$2,$3,$4,now())',
    [b.bookingId, request.id, 'Fixture Bank', 'LATE-REJECT-1']);
  const rejected = (await db.query('select ns_reject_late_buyer_transfer_v1($1,$2,$3,$4,$5,$6,now()) as r',
    [b.bookingId, request.id, reviewer, 'Late balance rejected and fully returned.', 'Fixture Bank', 'RETURN-1'])).rows[0].r;
  assert.equal(rejected.reconciliationStatus, 'rejected');
  assert.equal(rejected.bookingSecured, false);
  const payment = (await db.query('select status,reconciliation_status from payments where id=$1',[request.id])).rows[0];
  assert.deepEqual(payment, { status:'refunded', reconciliation_status:'rejected' });
  const returned = (await db.query('select amount,provider_reference from buyer_payment_returns where payment_id=$1',[request.id])).rows[0];
  assert.deepEqual(returned, { amount:800000, provider_reference:'RETURN-1' });
  const retry = (await db.query('select ns_reject_late_buyer_transfer_v1($1,$2,$3,$4,$5,$6,now()) as r',
    [b.bookingId, request.id, reviewer, 'Late balance rejected and fully returned.', 'Fixture Bank', 'RETURN-1'])).rows[0].r;
  assert.equal(retry.alreadyReconciled, true);
  await assert.rejects(db.query('select ns_reject_late_buyer_transfer_v1($1,$2,$3,$4,$5,$6,now())',
    [b.bookingId, request.id, reviewer, 'Late balance rejected and fully returned.', 'Fixture Bank', 'DIFFERENT']), /retry audit differs/);
  await db.query('select ns_create_buyer_payment_request_v1($1,$2::jsonb)',
    [b.bookingId, JSON.stringify({ method:'bank_transfer',provider_name:'Fixture Bank',destination:'123456' })]);
  const replacement = (await db.query(`select id,amount from payments
    where booking_id=$1 and payment_milestone_id=(
      select id from payment_milestones where booking_id=$1 and party='buyer' and sequence_no=2
    ) order by created_at desc limit 1`, [b.bookingId])).rows[0];
  assert.notEqual(replacement.id, request.id);
  assert.equal(Number(replacement.amount), 800000);
});
