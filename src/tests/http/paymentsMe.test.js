import { describe, expect, it } from 'vitest';
import request from 'supertest';

import {
  buildApp,
  givenSubscribedUser,
  tokenCookie,
  NEXT_BILL_DUE,
} from './testApp.js';

const OTHER_USER_ID = '7c2d3e44-1a8b-4f91-a6d2-9e8f7c6b5a40';

const STARTER_PAYMENT = {
  payment_id: 1,
  amount_paid: '9.99',
  plan_name: 'starter',
};

describe('GET /payments/me', () => {
  it('returns 401 without a token', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get('/payments/me')
      .expect(401);
  });

  it('uses the user id from the token', async () => {
    const { app, userRepository } = buildApp();

    await request(app)
      .get('/payments/me')
      .set(
        'Cookie',
        await tokenCookie({ id: OTHER_USER_ID }),
      )
      .expect(200);

    expect(
      userRepository.findPaymentHistory,
    ).toHaveBeenCalledWith(OTHER_USER_ID);

    expect(
      userRepository.findActiveSubscription,
    ).toHaveBeenCalledWith(OTHER_USER_ID);
  });

  it('returns no upcoming charge without a subscription', async () => {
    const { app, userRepository } = buildApp();

    userRepository.findPaymentHistory.mockResolvedValue([
      STARTER_PAYMENT,
    ]);

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body.history).toEqual({
      payments: [STARTER_PAYMENT],
      upcoming: null,
    });
  });

  it('prices the upcoming charge from the current plan', async () => {
    const { app, userRepository } = buildApp();

    userRepository.findPaymentHistory.mockResolvedValue([
      STARTER_PAYMENT,
    ]);

    givenSubscribedUser(userRepository, {
      planName: 'launch',
      pricePerMonth: '19.99',
    });

    const response = await request(app)
      .get('/payments/me')
      .set('Cookie', await tokenCookie())
      .expect(200);

    expect(response.body.history).toEqual({
      payments: [STARTER_PAYMENT],
      upcoming: {
        due_on: NEXT_BILL_DUE.toISOString(),
        amount: '19.99',
        plan_name: 'launch',
      },
    });
  });
});
