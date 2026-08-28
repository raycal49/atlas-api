import { vi } from 'vitest';
import { createUserService } from '../../services/userService.js';

export const USER_ID = '79c7d0bd4b6a';

export const setup = () => {
  const userRepo = {
    findAllActivePlans: vi.fn(),
    findActivePlanByName: vi.fn(),
    findActiveSubscription: vi.fn(),
    subscribeToPlan: vi.fn(),
    changePlan: vi.fn(),
    schedulePlanChange: vi.fn(),
    findCurrentPeriod: vi.fn(),
    findPaymentHistory: vi.fn(),
    findPlanById: vi.fn(),
    findUsageLogPage: vi.fn(),
    findAllApiProducts: vi.fn(),
  };

  return { service: createUserService(userRepo), userRepo };
};
