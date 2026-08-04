import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../repositories/userRepos.js';
import { makePlan } from './fixtures.js';
import { testSql } from './testDb.js';

const userRepository = createUserRepository(testSql);

describe('findActivePlanByName', () => {
  it('returns the id and price of an active plan', async () => {
    const plan = await makePlan({
      plan_name: 'launch',
      price_per_month: '14.99',
    });

    const found = await userRepository.findActivePlanByName('launch');

    // these two values are the whole point of the lookup: selectPlan passes
    // them straight into subscribeToPlan and changePlan. A drifting column
    // list would insert a null price and only fail later, on amount_paid
    expect(found.plan_id).toBe(plan.plan_id);
    expect(found.price_per_month).toBe('14.99');
  });

  it('does not return a plan that has been retired', async () => {
    await makePlan({ plan_name: 'retired', is_active: false });

    const found = await userRepository.findActivePlanByName('retired');

    // the AND is_active = true conjunct is the only real branch here. Drop it
    // and retired plans become purchasable again -- a query that still returns
    // a row, so nothing anywhere would error
    expect(found).toBeUndefined();
  });

  it('returns undefined for a name no plan carries', async () => {
    // a decoy, so the query is looking at a populated table. Against an empty
    // one this test would pass even if the WHERE clause matched nothing at all
    await makePlan({ plan_name: 'launch' });

    const found = await userRepository.findActivePlanByName('no-such-plan');

    // selectPlan branches on this to raise InvalidPlanError. rows[0] on an
    // empty result is undefined rather than null
    expect(found).toBeUndefined();
  });
});
