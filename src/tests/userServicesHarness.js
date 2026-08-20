import { vi } from 'vitest';

import { createUserServices } from '../services/userServices.js';

// The user id is arbitrary -- nothing under test parses it -- but every
// assertion that checks what reached the repository needs to name the same
// value the call was made with, so it lives here rather than in each file.
export const USER_ID = '79c7d0bd4b6a';

// Every method createUserServices reaches for, stubbed. The whole surface is
// listed even where a given test uses one of them: a service that starts
// calling a new repository method should fail on the assertion that matters,
// not on `undefined is not a function`.
export const setup = () => {
  const userRepo = {
    findAllActivePlans: vi.fn(),
    findActivePlanByName: vi.fn(),
    findActiveSubscription: vi.fn(),
    subscribeToPlan: vi.fn(),
    changePlan: vi.fn(),
    findCurrentPeriod: vi.fn(),
    findPaymentHistory: vi.fn(),
    findPlanById: vi.fn(),
    findUsageLogPage: vi.fn(),
    findAllApiProducts: vi.fn(),
  };

  return { service: createUserServices(userRepo), userRepo };
};
