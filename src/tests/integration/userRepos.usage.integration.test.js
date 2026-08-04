import {
  describe,
  expect,
  it,
} from 'vitest';

import { createUserRepository } from '../../repositories/userRepos.js';
import {
  DEFAULT_USED_AT,
  makeApiProduct,
  makePlan,
  makePlanLimit,
  makeUsage,
  makeUser,
} from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

// every test here needs somebody to have made calls and something for them to
// have called. Local to this file because it is specific to its shape.
const makeCaller = async () => {
  const user = await makeUser();
  const apiProduct = await makeApiProduct();

  return {
    userId: user.user_id,
    apiProductId: apiProduct.api_product_id,
    apiName: apiProduct.api_name,
  };
};

// the timestamp is the subject of most of these tests, so it is the only thing
// worth spelling out at the call site. Defaulting it explicitly rather than
// leaving it to makeUsage means two calls without an argument land on the same
// instant on purpose, which is what the paging test needs.
const callAt = (caller, usedAt = DEFAULT_USED_AT) =>
  makeUsage({
    user_id: caller.userId,
    api_product_id: caller.apiProductId,
    used_at: usedAt,
  });

describe('findUsageLogPage', () => {
  it('returns only the calling user\'s calls, named by api product', async () => {
    const caller = await makeCaller();
    const stranger = await makeCaller();

    await callAt(caller);
    await callAt(stranger);

    // an empty filter object is the no-filter case: it proves the three
    // conditional fragments collapse to nothing valid rather than a syntax error
    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      10,
      0,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].api_name).toBe(caller.apiName);

    // toBe is Object.is, so this also pins total as a number rather than the
    // string a bare count() would produce -- the COUNT(*)::int cast is why
    expect(total).toBe(1);
  });

  it('filters to a single api product', async () => {
    const caller = await makeCaller();
    const otherProduct = await makeApiProduct();

    await callAt(caller);
    await makeUsage({
      user_id: caller.userId,
      api_product_id: otherProduct.api_product_id,
    });

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { api: caller.apiProductId },
      10,
      0,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].api_name).toBe(caller.apiName);
    expect(total).toBe(1);
  });

  it('includes a call at the first instant of the from day', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-15T00:00:00Z');

    // used_at >= from::date, so the boundary instant itself is in
    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { from: '2026-03-15' },
      10,
      0,
    );

    expect(calls).toHaveLength(1);
    expect(total).toBe(1);
  });

  it('excludes a call one second before the from day', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-14T23:59:59Z');

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { from: '2026-03-15' },
      10,
      0,
    );

    expect(calls).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('includes a call late on the to day', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-15T23:59:59Z');

    // used_at < to::date + 1, so to covers its whole day rather than stopping
    // at midnight the way a naive <= would
    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { to: '2026-03-15' },
      10,
      0,
    );

    expect(calls).toHaveLength(1);
    expect(total).toBe(1);
  });

  it('excludes a call at the first instant after the to day', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-16T00:00:00Z');

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { to: '2026-03-15' },
      10,
      0,
    );

    expect(calls).toHaveLength(0);
    expect(total).toBe(0);
  });

  it('returns only the calls inside a from and to window', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-09T12:00:00Z');
    const inside = await callAt(caller, '2026-03-15T12:00:00Z');
    await callAt(caller, '2026-03-21T12:00:00Z');

    // both fragments are appended to the same filter, so this fails if one
    // clobbers the other rather than composing
    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { from: '2026-03-10', to: '2026-03-20' },
      10,
      0,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].api_usage_id).toBe(inside.api_usage_id);
    expect(total).toBe(1);
  });

  it('counts every match while returning one page of them', async () => {
    const caller = await makeCaller();
    const otherProduct = await makeApiProduct();

    await callAt(caller, '2026-03-11T12:00:00Z');
    await callAt(caller, '2026-03-12T12:00:00Z');
    await callAt(caller, '2026-03-13T12:00:00Z');
    await callAt(caller, '2026-03-14T12:00:00Z');
    await callAt(caller, '2026-03-15T12:00:00Z');

    await makeUsage({
      user_id: caller.userId,
      api_product_id: otherProduct.api_product_id,
    });

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { api: caller.apiProductId },
      2,
      0,
    );

    // total has to respect the filter but ignore the limit. That is the whole
    // reason the filter fragment is built once and embedded in both queries --
    // it is what makes "page 1 of 3" correct rather than "page 1 of 1"
    expect(calls).toHaveLength(2);
    expect(total).toBe(5);
  });

  it('pages without repeating or dropping calls made at the same instant', async () => {
    const caller = await makeCaller();

    // four calls on exactly the same timestamp, which is what bulk inserts
    // produce in practice and what hand-picked test data never does
    await callAt(caller);
    await callAt(caller);
    await callAt(caller);
    await callAt(caller);

    const firstPage = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      2,
      0,
    );
    const secondPage = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      2,
      2,
    );

    const ids = [...firstPage.calls, ...secondPage.calls]
      .map((call) => call.api_usage_id);

    // the api_usage_id tiebreaker in the ORDER BY is what makes this hold.
    // Without it PostgreSQL may order the tied rows differently per query, and
    // a row can land on both pages or on neither
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('returns no calls past the end while still reporting the total', async () => {
    const caller = await makeCaller();

    await callAt(caller);
    await callAt(caller);

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      10,
      10,
    );

    // the page is empty but there is still a call log -- the difference between
    // "nothing on this page" and "no usage at all"
    expect(calls).toHaveLength(0);
    expect(total).toBe(2);
  });

  it('orders calls newest first', async () => {
    const caller = await makeCaller();

    const oldest = await callAt(caller, '2026-03-13T12:00:00Z');
    const middle = await callAt(caller, '2026-03-14T12:00:00Z');
    const newest = await callAt(caller, '2026-03-15T12:00:00Z');

    const { calls } = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      10,
      0,
    );

    expect(calls.map((call) => call.api_usage_id)).toEqual([
      newest.api_usage_id,
      middle.api_usage_id,
      oldest.api_usage_id,
    ]);
  });
});

// getPeriodApiCalls reaches products through a plan's limits rather than
// through usage, so every test below needs a plan with something metered on it
const makeMeteredPlan = async (apiProductIds, monthlyLimit = 1000) => {
  const plan = await makePlan();

  for (const apiProductId of apiProductIds) {
    await makePlanLimit({
      plan_id: plan.plan_id,
      api_product_id: apiProductId,
      monthly_limit: monthlyLimit,
    });
  }

  return plan;
};

// the period the tests below meter against. DEFAULT_USED_AT sits inside it, so
// a call seeded without an explicit timestamp counts.
const PERIOD_START = '2026-03-01';

describe('getPeriodApiCalls', () => {
  it('returns a row for a metered product the user has never called', async () => {
    const caller = await makeCaller();
    const untouched = await makeApiProduct();
    const plan = await makeMeteredPlan([
      caller.apiProductId,
      untouched.api_product_id,
    ]);

    await callAt(caller);

    const rows = await userRepository.getPeriodApiCalls(
      caller.userId,
      PERIOD_START,
      plan.plan_id,
    );

    // the correlated subquery is what makes this hold. A JOIN onto api_usage
    // with a GROUP BY would drop the product that has no matching rows, and the
    // dashboard would show nothing at all instead of "0 of 1000"
    expect(rows).toHaveLength(2);

    const untouchedRow = rows.find(
      (row) => row.api_product_id === untouched.api_product_id,
    );

    expect(untouchedRow.calls_used).toBe(0);
  });

  it('counts a call made at the first instant of the period', async () => {
    const caller = await makeCaller();
    const plan = await makeMeteredPlan([caller.apiProductId]);

    await callAt(caller, '2026-03-01T00:00:00Z');

    // used_at >= periodStart::date, so the opening instant is inside
    const [row] = await userRepository.getPeriodApiCalls(
      caller.userId,
      PERIOD_START,
      plan.plan_id,
    );

    expect(row.calls_used).toBe(1);
  });

  it('does not count a call made one month after the period opened', async () => {
    const caller = await makeCaller();
    const plan = await makeMeteredPlan([caller.apiProductId]);

    await callAt(caller, '2026-04-01T00:00:00Z');

    // used_at < periodStart::date + interval '1 month', so the instant the next
    // period opens belongs to that period and not this one
    const [row] = await userRepository.getPeriodApiCalls(
      caller.userId,
      PERIOD_START,
      plan.plan_id,
    );

    expect(row.calls_used).toBe(0);
  });

  it('reports the limit and the count as numbers', async () => {
    const caller = await makeCaller();
    const plan = await makeMeteredPlan([caller.apiProductId], 2500);

    await callAt(caller);
    await callAt(caller);

    const [row] = await userRepository.getPeriodApiCalls(
      caller.userId,
      PERIOD_START,
      plan.plan_id,
    );

    // toBe is Object.is, so these fail against strings. monthly_limit is a
    // bigint and count() returns bigint; without the ::int casts both would
    // arrive as strings and the dashboard's arithmetic would concatenate
    // instead of adding
    expect(row.calls_used).toBe(2);
    expect(row.monthly_limit).toBe(2500);
  });
});
