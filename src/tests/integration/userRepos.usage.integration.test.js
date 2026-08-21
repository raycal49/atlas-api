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

const makeCaller = async () => {
  const user = await makeUser();
  const apiProduct = await makeApiProduct();

  return {
    userId: user.user_id,
    apiProductId: apiProduct.api_product_id,
    apiName: apiProduct.api_name,
  };
};

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

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      10,
      0,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].api_name).toBe(caller.apiName);
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

  it('includes the calls sitting on both edges of the window', async () => {
    const caller = await makeCaller();

    const openingInstant = await callAt(caller, '2026-03-10T00:00:00Z');
    const lastMoment = await callAt(caller, '2026-03-20T23:59:59Z');

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { from: '2026-03-10', to: '2026-03-20' },
      10,
      0,
    );

    expect(calls.map((call) => call.api_usage_id).sort()).toEqual(
      [openingInstant.api_usage_id, lastMoment.api_usage_id].sort(),
    );
    expect(total).toBe(2);
  });

  it('excludes the calls sitting just outside the window', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-09T23:59:59Z');
    await callAt(caller, '2026-03-21T00:00:00Z');

    const { calls, total } = await userRepository.findUsageLogPage(
      caller.userId,
      { from: '2026-03-10', to: '2026-03-20' },
      10,
      0,
    );

    expect(calls).toHaveLength(0);
    expect(total).toBe(0);
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

    expect(calls).toHaveLength(2);
    expect(total).toBe(5);
  });

  it('pages without repeating or dropping calls made at the same instant', async () => {
    const caller = await makeCaller();

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

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
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

    const [row] = await userRepository.getPeriodApiCalls(
      caller.userId,
      PERIOD_START,
      plan.plan_id,
    );

    expect(row.calls_used).toBe(0);
  });

});
