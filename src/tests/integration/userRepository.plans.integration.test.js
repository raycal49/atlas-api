import { describe, expect, it } from 'vitest';
import { createUserRepository } from '../../repositories/userRepository.js';
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

    expect(found.plan_id).toBe(plan.plan_id);
    expect(found.price_per_month).toBe('14.99');
  });

  it('returns undefined for a retired plan and for a name no plan carries', async () => {
    await makePlan({ plan_name: 'retired', is_active: false });
    await makePlan({ plan_name: 'launch' });

    expect(
      await userRepository.findActivePlanByName('retired'),
    ).toBeUndefined();
    expect(
      await userRepository.findActivePlanByName('no-such-plan'),
    ).toBeUndefined();
  });
});
