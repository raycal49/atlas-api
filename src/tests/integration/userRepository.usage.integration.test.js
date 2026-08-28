import { describe, expect, it } from 'vitest';

import { createUserRepository, PAGE_SIZE } from '../../repositories/userRepository.js';
import {
  makeApiProduct,
  makePlan,
  makePlanLimit,
  makeUsage,
  makeUser,
  secondsApart,
} from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

const PERIOD_START = '2026-03-01';

const MARCH_10_THROUGH_20 = {
  from: '2026-03-10T00:00:00.000Z',
  to: '2026-03-21T00:00:00.000Z',
};

const MOMENT_BEFORE_OPENING = '2026-03-09T23:59:59Z';

const CLOSING_INSTANT = '2026-03-21T00:00:00Z';

const FIRST_INSTANT_OF_PERIOD = `${PERIOD_START}T00:00:00Z`;

const cursorFrom = (row) => ({
  at: row.used_at.toISOString(),
  id: row.api_usage_id,
});

describe('findUsageLogPage', () => {
  it('includes the calls sitting on both edges of the window', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    const openingInstant = await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
      used_at: '2026-03-10T00:00:00Z',
    });

    const lastMoment = await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
      used_at: '2026-03-20T23:59:59Z',
    });

    const calls = await userRepository.findUsageLogPage(
      user.user_id,
      MARCH_10_THROUGH_20,
      null,
    );

    expect(calls).toMatchObject([
      { api_usage_id: lastMoment.api_usage_id },
      { api_usage_id: openingInstant.api_usage_id },
    ]);
  });

  it('excludes the calls sitting just outside the window', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
      used_at: MOMENT_BEFORE_OPENING,
    });

    await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
      used_at: CLOSING_INSTANT,
    });

    const calls = await userRepository.findUsageLogPage(
      user.user_id,
      MARCH_10_THROUGH_20,
      null,
    );

    expect(calls).toHaveLength(0);
  });

  it('over-fetches exactly one row past the page to prove the log continues', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    for (let i = 0; i < PAGE_SIZE + 1; i += 1) {
      await makeUsage({
        user_id: user.user_id,
        api_product_id: apiProduct.api_product_id,
        used_at: secondsApart(i),
      });
    }

    const firstBatch = await userRepository.findUsageLogPage(
      user.user_id,
      { api_product_id: apiProduct.api_product_id },
      null,
    );

    const firstPage = firstBatch.slice(0, PAGE_SIZE);
    
    const secondBatch = await userRepository.findUsageLogPage(
      user.user_id,
      { api_product_id: apiProduct.api_product_id },
      cursorFrom(firstPage.at(-1)),
    );

    const secondPage = secondBatch.slice(0, PAGE_SIZE);

    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].api_usage_id).toBe(firstBatch.at(-1).api_usage_id);
  });

  it('breaks ties on identical timestamps by id', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();

    const oldest = await makeUsage({ user_id: user.user_id, api_product_id: apiProduct.api_product_id });
    const middle = await makeUsage({ user_id: user.user_id, api_product_id: apiProduct.api_product_id });
    const newest = await makeUsage({ user_id: user.user_id, api_product_id: apiProduct.api_product_id });

    const calls = await userRepository.findUsageLogPage(user.user_id, {}, null);

    expect(calls).toMatchObject([
      { api_usage_id: newest.api_usage_id },
      { api_usage_id: middle.api_usage_id },
      { api_usage_id: oldest.api_usage_id },
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

describe('findPlanLimitsWithUsage', () => {
  it('returns a calls for all api products user can access', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();
    const untouched = await makeApiProduct();

    const plan = await makeMeteredPlan([
      apiProduct.api_product_id,
      untouched.api_product_id,
    ]);

    await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
    });

    const calls = await userRepository.findPlanLimitsWithUsage(
      user.user_id,
      PERIOD_START,
      plan.plan_id,
    );

    expect(calls).toHaveLength(2);
  });

  it('counts a call made at the first instant of the period', async () => {
    const user = await makeUser();
    const apiProduct = await makeApiProduct();
    const plan = await makeMeteredPlan([apiProduct.api_product_id]);

    await makeUsage({
      user_id: user.user_id,
      api_product_id: apiProduct.api_product_id,
      used_at: FIRST_INSTANT_OF_PERIOD,
    });

    const [row] = await userRepository.findPlanLimitsWithUsage(
      user.user_id,
      PERIOD_START,
      plan.plan_id,
    );

    expect(row.calls_used).toBe(1);
  });
});
