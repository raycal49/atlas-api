import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUserServices } from '../services/userServices';
import { InvalidPlanError, AlreadyOnPlanError } from '../errors/userErrors';

const setup = () => {
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
    }

    const service = createUserServices(userRepo);

    return { service, userRepo}
}

describe('User Service', async () => {
    describe('User selects a plan to subscribe to', async () => {
        it('user has no subscription, selects an invalid plan, and InvalidPlanError thrown', async () => {
            const {service, userRepo} = setup();
            
            userRepo.findActivePlanByName.mockResolvedValue(undefined);

            await expect(service.selectPlan('06188b55-8cf3', 'SuperSaver', '4211')).rejects.toThrow(InvalidPlanError);
        })

        it('user has no subscription, selects a valid plan, and subscribes to that plan', async () => {
            // Arrange
            const { service, userRepo} =  setup();

            userRepo.findActivePlanByName.mockResolvedValue({plan_id:'06188b55-8cf3', price_per_month:14.99});
            userRepo.findActiveSubscription.mockResolvedValue(undefined);
            userRepo.subscribeToPlan.mockResolvedValue({subscription_id:'417e-9664', started_at:'2012-02-12'});

            const result = await service.selectPlan('79c7d0bd4b6a', 'SuperSaver', 4311);

            expect(userRepo.subscribeToPlan).toHaveBeenCalledWith('79c7d0bd4b6a', '06188b55-8cf3', 14.99, 4311);
            expect(userRepo.changePlan).not.toHaveBeenCalled();
        })

        it('user has a subscription, selects a plan they are already on, and AlreadyOnPlanError thrown ', async () => {
            const {service, userRepo} = setup();

            userRepo.findActivePlanByName.mockResolvedValue({plan_id: '06188b55-8cf3', price_per_month: 14.99});
            userRepo.findActiveSubscription.mockResolvedValue({subscriptionId: '417e-9664', plan_id: '06188b55-8cf3', started_at:'2012-02-12'});

            await expect(service.selectPlan('79c7d0bd4b6a', 'SuperSaver', '4211')).rejects.toThrow(AlreadyOnPlanError);
        })

        it('user has a subscription, selects a plan they do not have, and changes their plan to the new one', async () => {
            const {service, userRepo} = setup();

            userRepo.findActivePlanByName.mockResolvedValue({plan_id: '12627n25-1ce9', price_per_month: 14.99});
            userRepo.findActiveSubscription.mockResolvedValue({subscriptionId: '417e-9664', plan_id: '06188b55-8cf3', started_at:'2012-02-12'});
            userRepo.changePlan.mockResolvedValue({subscription_id:'200z-5142' , started_at: '2012-02-12'})

            const result = await service.selectPlan('79c7d0bd4b6a', 'SuperSaver', '4211');

            await expect(result).toStrictEqual({subscription_id:'200z-5142' , started_at: '2012-02-12'});
        })
    })

    describe('we search for the users current subscription', async () => {
        it('we search for the current user subscription, find it, and return it', async () => {
            const { service, userRepo } = setup();
            userRepo.findActiveSubscription.mockResolvedValue({subscription_id:'417e-9664', plan_id:'06188b55-8cf3', started_at:'2012-02-12'});

            const result = await service.getCurrentSubscription('79c7d0bd4b6a');

            expect(result).toStrictEqual({subscription_id:'417e-9664', plan_id:'06188b55-8cf3', started_at:'2012-02-12'});
        })

        it('we search for the current user subscription, do not find it, and instead return null', async () => {
            const { service, userRepo } = setup();
            userRepo.findActiveSubscription.mockResolvedValue(undefined);

            const result = await service.getCurrentSubscription('79c7d0bd4b6a');

            expect(result).toBe(null);
        })
    })

        describe('we retrieve the active plans', async () => {
        it('we retrieve the active plans and if active plans found, return them', async () => {
            const { service, userRepo } = setup();
            userRepo.findAllActivePlans.mockResolvedValue({plan_id:'plan ids', plan_name:'plan names', price_per_month: 'prices per month', description:'descriptions'});

            const result = await service.getPlans();

            expect(result).toStrictEqual({plan_id:'plan ids', plan_name:'plan names', price_per_month: 'prices per month', description:'descriptions'});
        })

    })


    describe('we gather the billing history', async () => {
        const PAYMENTS = [
            { payment_id: 'pay-2', amount_paid: '49.00', paid_at: '2026-07-15T00:00:00.000Z',
              period_start: '2026-07-15', card_last4: 4242, plan_name: 'Developer' },
            { payment_id: 'pay-1', amount_paid: '0.00', paid_at: '2026-06-15T00:00:00.000Z',
              period_start: '2026-06-15', card_last4: null, plan_name: 'Free' },
        ];

        it('returns every payment the repository found', async () => {
            const { service, userRepo } = setup();
            userRepo.findPaymentHistory.mockResolvedValue(PAYMENTS);
            userRepo.findActiveSubscription.mockResolvedValue(undefined);

            const result = await service.getPaymentHistory('79c7d0bd4b6a');

            expect(result.payments).toStrictEqual(PAYMENTS);
        })

        it('has nothing upcoming when the user has no active subscription', async () => {
            const { service, userRepo } = setup();
            userRepo.findPaymentHistory.mockResolvedValue(PAYMENTS);
            userRepo.findActiveSubscription.mockResolvedValue(undefined);

            const result = await service.getPaymentHistory('79c7d0bd4b6a');

            expect(result.upcoming).toBe(null);
            expect(userRepo.findPlanById).not.toHaveBeenCalled();
        })

        // the next charge is priced from the plan they are on now. quoting the
        // last payment instead would show the old price for a whole cycle after
        // an upgrade
        it('prices the next charge from the current plan, not the last payment', async () => {
            const { service, userRepo } = setup();
            userRepo.findPaymentHistory.mockResolvedValue(PAYMENTS);
            userRepo.findActiveSubscription.mockResolvedValue({
                subscription_id: '417e-9664', plan_id: 'plan-business', started_at: '2026-06-15',
            });
            userRepo.findCurrentPeriod.mockResolvedValue({
                period_start: '2026-07-15', next_bill_due: '2026-08-15',
            });
            userRepo.findPlanById.mockResolvedValue({
                plan_id: 'plan-business', plan_name: 'Business', price_per_month: '199.00',
            });

            const result = await service.getPaymentHistory('79c7d0bd4b6a');

            expect(result.upcoming).toStrictEqual({
                due_on: '2026-08-15', amount: '199.00', plan_name: 'Business',
            });
        })

        it('has nothing upcoming when the subscription has no billing period yet', async () => {
            const { service, userRepo } = setup();
            userRepo.findPaymentHistory.mockResolvedValue([]);
            userRepo.findActiveSubscription.mockResolvedValue({
                subscription_id: '417e-9664', plan_id: 'plan-free', started_at: '2026-06-15',
            });
            userRepo.findCurrentPeriod.mockResolvedValue(undefined);
            userRepo.findPlanById.mockResolvedValue({
                plan_id: 'plan-free', plan_name: 'Free', price_per_month: '0.00',
            });

            const result = await service.getPaymentHistory('79c7d0bd4b6a');

            expect(result.upcoming).toBe(null);
            expect(result.payments).toStrictEqual([]);
        })
    })

    describe('we fetch a numbered page of the call log', async () => {
        const CALLS = [
            { api_usage_id: '500', used_at: '2026-07-20T10:00:00.000Z', api_name: 'Geocoding' },
            { api_usage_id: '499', used_at: '2026-07-19T09:00:00.000Z', api_name: 'Directions' },
        ];

        it('turns the page number into the right offset for the repository', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: CALLS, total: 60 });

            await service.getUsageLogPage('79c7d0bd4b6a', { page: 3, limit: 25 });

            // page 3 of 25-row pages starts after the first 50 rows
            expect(userRepo.findUsageLogPage).toHaveBeenCalledWith(
                '79c7d0bd4b6a', { api: undefined, from: undefined, to: undefined }, 25, 50);
        })

        it('passes the filters through to the repository untouched', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: [], total: 0 });

            await service.getUsageLogPage('79c7d0bd4b6a',
                { page: 1, limit: 25, api: 3, from: '2026-07-01', to: '2026-07-30' });

            expect(userRepo.findUsageLogPage).toHaveBeenCalledWith(
                '79c7d0bd4b6a', { api: 3, from: '2026-07-01', to: '2026-07-30' }, 25, 0);
        })

        // 101 rows at 25 per page is 4 full pages and one leftover row, so 5 pages
        it('rounds the page count up so a partial last page still counts', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: CALLS, total: 101 });

            const result = await service.getUsageLogPage('79c7d0bd4b6a', { page: 1, limit: 25 });

            expect(result.total).toBe(101);
            expect(result.page_count).toBe(5);
            expect(result.capped).toBe(false);
        })

        // 17,870 rows would be 715 pages -- the pager stops at 50, but the real
        // total still goes out so the count next to the pager stays honest
        it('caps the page count at fifty and says the log was truncated', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: CALLS, total: 17870 });

            const result = await service.getUsageLogPage('79c7d0bd4b6a', { page: 1, limit: 25 });

            expect(result.page_count).toBe(50);
            expect(result.total).toBe(17870);
            expect(result.capped).toBe(true);
        })

        // the cap is enforced, not cosmetic: rows past it never leave the server
        it('serves no rows for a page past the cap', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: CALLS, total: 17870 });

            const result = await service.getUsageLogPage('79c7d0bd4b6a', { page: 60, limit: 25 });

            expect(result.calls).toStrictEqual([]);
            expect(result.page_count).toBe(50);
            expect(result.total).toBe(17870);
        })

        // an empty log must not report zero pages -- the page still shows "Page 1 of 1"
        it('reports one page even when the log is empty', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: [], total: 0 });

            const result = await service.getUsageLogPage('79c7d0bd4b6a', { page: 1, limit: 25 });

            expect(result.calls).toStrictEqual([]);
            expect(result.page_count).toBe(1);
        })

        it('hands the rows back exactly as the repository returned them', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLogPage.mockResolvedValue({ calls: CALLS, total: 2 });

            const result = await service.getUsageLogPage('79c7d0bd4b6a', { page: 1, limit: 25 });

            expect(result.calls).toStrictEqual(CALLS);
            expect(result.page).toBe(1);
        })
    })

});