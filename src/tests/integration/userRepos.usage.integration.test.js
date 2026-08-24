import {
  describe,
  expect,
  it,
} from 'vitest';

import { createUserRepository, USAGE_PAGE_SIZE } from '../../repositories/userRepos.js';
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

const OVER_A_PAGE = USAGE_PAGE_SIZE + 1;

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

const secondsApart = (index) =>
  new Date(Date.UTC(2026, 2, 15, 12, 0, index)).toISOString();

const cursorFrom = (row) => ({
  at: row.used_at.toISOString(),
  id: row.api_usage_id,
});

const MARCH_10_THROUGH_20 = {
  from: '2026-03-10T00:00:00.000Z',
  to: '2026-03-21T00:00:00.000Z',
};

const WALK_LIMIT = 20;

const walk = async (userId, filters) => {
  const pages = [];
  let cursor = null;

  do {
    const rows = await userRepository.findUsageLogPage(userId, filters, cursor);
    const page = rows.slice(0, USAGE_PAGE_SIZE);

    pages.push(page);
    cursor = rows.length > USAGE_PAGE_SIZE ? cursorFrom(page.at(-1)) : null;

    if (pages.length > WALK_LIMIT) throw new Error('cursor walk did not terminate');
  } while (cursor);

  return pages;
};

describe('findUsageLogPage', () => {
  it('returns only the calling user\'s calls, named by api product', async () => {
    const caller = await makeCaller();
    const stranger = await makeCaller();

    await callAt(caller);
    await callAt(stranger);

    const calls = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      null,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].api_name).toBe(caller.apiName);
  });

  it('filters to a single api product', async () => {
    const caller = await makeCaller();
    const otherProduct = await makeApiProduct();

    await callAt(caller);
    await makeUsage({
      user_id: caller.userId,
      api_product_id: otherProduct.api_product_id,
    });

    const calls = await userRepository.findUsageLogPage(
      caller.userId,
      { api: caller.apiProductId },
      null,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].api_name).toBe(caller.apiName);
  });

  it('includes the calls sitting on both edges of the window', async () => {
    const caller = await makeCaller();

    const openingInstant = await callAt(caller, '2026-03-10T00:00:00Z');
    const lastMoment = await callAt(caller, '2026-03-20T23:59:59Z');

    const calls = await userRepository.findUsageLogPage(
      caller.userId,
      MARCH_10_THROUGH_20,
      null,
    );

    expect(calls.map((call) => call.api_usage_id).sort()).toEqual(
      [openingInstant.api_usage_id, lastMoment.api_usage_id].sort(),
    );
  });

  it('excludes the calls sitting just outside the window', async () => {
    const caller = await makeCaller();

    await callAt(caller, '2026-03-09T23:59:59Z');
    await callAt(caller, '2026-03-21T00:00:00Z');

    const calls = await userRepository.findUsageLogPage(
      caller.userId,
      MARCH_10_THROUGH_20,
      null,
    );

    expect(calls).toHaveLength(0);
  });

  it('over-fetches exactly one row past the page to prove the log continues', async () => {
    const caller = await makeCaller();
    const otherProduct = await makeApiProduct();

    for (let i = 0; i < OVER_A_PAGE; i += 1) {
      await callAt(caller, secondsApart(i));
    }

    await makeUsage({
      user_id: caller.userId,
      api_product_id: otherProduct.api_product_id,
    });

    const first = await userRepository.findUsageLogPage(
      caller.userId,
      { api: caller.apiProductId },
      null,
    );

    expect(first).toHaveLength(OVER_A_PAGE);

    const page = first.slice(0, USAGE_PAGE_SIZE);

    const second = await userRepository.findUsageLogPage(
      caller.userId,
      { api: caller.apiProductId },
      cursorFrom(page.at(-1)),
    );

    expect(second).toHaveLength(1);
    expect(second[0].api_usage_id).toBe(first.at(-1).api_usage_id);
  });

  it('pages without repeating or dropping calls made at the same instant', async () => {
    const caller = await makeCaller();

    for (let i = 0; i < OVER_A_PAGE; i += 1) await callAt(caller);

    const pages = await walk(caller.userId, {});
    const ids = pages.flat().map((call) => call.api_usage_id);

    expect(pages).toHaveLength(2);
    expect(ids).toHaveLength(OVER_A_PAGE);
    expect(new Set(ids).size).toBe(OVER_A_PAGE);

    const descending = [...ids].sort((a, b) => (BigInt(a) < BigInt(b) ? 1 : -1));
    expect(ids).toEqual(descending);
  });

  it('keeps every filter applied while the cursor walks past the page boundary', async () => {
    const caller = await makeCaller();
    const otherProduct = await makeApiProduct();

    const inWindow = [];
    for (let i = 0; i < OVER_A_PAGE; i += 1) {
      inWindow.push(await callAt(caller, secondsApart(i)));
    }

    const justBefore = await callAt(caller, '2026-03-09T23:59:59Z');
    const justAfter = await callAt(caller, '2026-03-21T00:00:00Z');

    const wrongProduct = await makeUsage({
      user_id: caller.userId,
      api_product_id: otherProduct.api_product_id,
      used_at: secondsApart(0),
    });

    const filters = {
      api: caller.apiProductId,
      ...MARCH_10_THROUGH_20,
    };

    const pages = await walk(caller.userId, filters);
    const ids = pages.flat().map((call) => call.api_usage_id);

    expect(pages).toHaveLength(2);
    expect(ids).toHaveLength(OVER_A_PAGE);
    expect(new Set(ids).size).toBe(OVER_A_PAGE);

    for (const excluded of [justBefore, justAfter, wrongProduct]) {
      expect(ids).not.toContain(excluded.api_usage_id);
    }

    expect([...ids].sort()).toEqual(
      inWindow.map((row) => row.api_usage_id).sort(),
    );
  });

  it('resumes from a cursor whose row has since been deleted', async () => {
    const caller = await makeCaller();

    const rows = [];
    for (let i = 0; i < 5; i += 1) {
      rows.push(await callAt(caller, secondsApart(i)));
    }

    const newest = rows.at(-1);
    const cursor = cursorFrom(newest);

    await testSql`
      DELETE FROM api_usage WHERE api_usage_id = ${newest.api_usage_id}`;

    const remaining = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      cursor,
    );

    expect(remaining.map((call) => call.api_usage_id)).toEqual(
      rows.slice(0, -1).reverse().map((row) => row.api_usage_id),
    );
  });

  it('orders calls newest first', async () => {
    const caller = await makeCaller();

    const oldest = await callAt(caller, '2026-03-13T12:00:00Z');
    const middle = await callAt(caller, '2026-03-14T12:00:00Z');
    const newest = await callAt(caller, '2026-03-15T12:00:00Z');

    const calls = await userRepository.findUsageLogPage(
      caller.userId,
      {},
      null,
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
