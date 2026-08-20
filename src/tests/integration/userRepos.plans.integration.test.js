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

  // Two ways to miss, one assertion each. The retired case is the only real
  // branch in the query: drop the `AND is_active = true` conjunct and retired
  // plans become purchasable again, still returning a row, so nothing anywhere
  // would error. The unknown-name case seeds a decoy so the query is looking at
  // a populated table -- against an empty one it would pass even if the WHERE
  // clause matched nothing at all. selectPlan branches on this to raise
  // InvalidPlanError; rows[0] on an empty result is undefined, not null.
  it('returns undefined for a retired plan and for a name no plan carries', async () => {
    await makePlan({ plan_name: 'retired', is_active: false });
    await makePlan({ plan_name: 'launch' });

    expect(await userRepository.findActivePlanByName('retired')).toBeUndefined();
    expect(await userRepository.findActivePlanByName('no-such-plan')).toBeUndefined();
  });
});
