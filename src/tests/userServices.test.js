import { describe, it, expect, vi} from 'vitest';
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
        findPlanApiLimits: vi.fn(),
        countUsageByProduct: vi.fn(),
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

    describe('we build the usage summary for the dashboard', async () => {
        // gives every test the same subscribed user on a plan with two APIs
        const arrangeSubscribedUser = (userRepo) => {
            userRepo.findActiveSubscription.mockResolvedValue({
                subscription_id: '417e-9664', plan_id: '06188b55-8cf3', started_at: '2026-06-15',
            });
            userRepo.findCurrentPeriod.mockResolvedValue({
                period_start: '2026-07-15', next_bill_due: '2026-08-15',
            });
            userRepo.findPlanApiLimits.mockResolvedValue([
                { api_product_id: 'api-1', api_name: 'Lookup', monthly_limit: 100 },
                { api_product_id: 'api-2', api_name: 'Verify', monthly_limit: 50 },
            ]);
        }

        it('user has no subscription, so no usage summary is returned', async () => {
            const { service, userRepo } = setup();
            userRepo.findActiveSubscription.mockResolvedValue(undefined);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result).toBe(null);
            expect(userRepo.countUsageByProduct).not.toHaveBeenCalled();
        })

        it('an api with usage this period reports its used and remaining calls', async () => {
            const { service, userRepo } = setup();
            arrangeSubscribedUser(userRepo);
            userRepo.countUsageByProduct.mockResolvedValue([
                { api_product_id: 'api-1', calls_used: 30 },
                { api_product_id: 'api-2', calls_used: 50 },
            ]);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.next_bill_due).toBe('2026-08-15');
            expect(result.apis).toStrictEqual([
                {
                    api_product_id: 'api-1', api_name: 'Lookup', monthly_limit: 100,
                    calls_used: 30, calls_remaining: 70, percent_used: 30, state: 'ok',
                },
                {
                    api_product_id: 'api-2', api_name: 'Verify', monthly_limit: 50,
                    calls_used: 50, calls_remaining: 0, percent_used: 100, state: 'critical',
                },
            ]);
        })

        // countUsageByProduct leaves untouched apis out of its result entirely,
        // so the service is what has to put them back at 0
        it('an api the plan grants but the user never called still appears, at zero', async () => {
            const { service, userRepo } = setup();
            arrangeSubscribedUser(userRepo);
            userRepo.countUsageByProduct.mockResolvedValue([
                { api_product_id: 'api-1', calls_used: 30 },
            ]);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis).toHaveLength(2);
            expect(result.apis[1]).toStrictEqual({
                api_product_id: 'api-2', api_name: 'Verify', monthly_limit: 50,
                calls_used: 0, calls_remaining: 50, percent_used: 0, state: 'ok',
            });
        })

        it('usage is counted from the current period start, not the subscription start', async () => {
            const { service, userRepo } = setup();
            arrangeSubscribedUser(userRepo);
            userRepo.countUsageByProduct.mockResolvedValue([]);

            await service.getUsageSummary('79c7d0bd4b6a');

            expect(userRepo.countUsageByProduct).toHaveBeenCalledWith('79c7d0bd4b6a', '2026-07-15');
        })

        it('an api used past its limit reports zero remaining rather than a negative', async () => {
            const { service, userRepo } = setup();
            arrangeSubscribedUser(userRepo);
            userRepo.countUsageByProduct.mockResolvedValue([
                { api_product_id: 'api-1', calls_used: 130 },
            ]);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].calls_remaining).toBe(0);
        })
    })

    describe('we work out how close each api is to its limit', async () => {
        // one api with a limit of 100, so calls_used reads directly as a percentage
        const arrangeSingleApi = (userRepo, callsUsed, monthlyLimit = 100) => {
            userRepo.findActiveSubscription.mockResolvedValue({
                subscription_id: '417e-9664', plan_id: '06188b55-8cf3', started_at: '2026-06-15',
            });
            userRepo.findCurrentPeriod.mockResolvedValue({
                period_start: '2026-07-15', next_bill_due: '2026-08-15',
            });
            userRepo.findPlanApiLimits.mockResolvedValue([
                { api_product_id: 'api-1', api_name: 'Geocoding', monthly_limit: monthlyLimit },
            ]);
            userRepo.countUsageByProduct.mockResolvedValue(
                callsUsed === 0 ? [] : [{ api_product_id: 'api-1', calls_used: callsUsed }]);
        }

        it('an unused api is ok at zero percent', async () => {
            const { service, userRepo } = setup();
            arrangeSingleApi(userRepo, 0);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].percent_used).toBe(0);
            expect(result.apis[0].state).toBe('ok');
        })

        it('an api just below the warning threshold is still ok', async () => {
            const { service, userRepo } = setup();
            arrangeSingleApi(userRepo, 79);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].state).toBe('ok');
        })

        // the boundary itself counts as a warning, not the value above it
        it('an api exactly at the warning threshold warns', async () => {
            const { service, userRepo } = setup();
            arrangeSingleApi(userRepo, 80);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].percent_used).toBe(80);
            expect(result.apis[0].state).toBe('warning');
        })

        it('an api at exactly its limit is critical', async () => {
            const { service, userRepo } = setup();
            arrangeSingleApi(userRepo, 100);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].percent_used).toBe(100);
            expect(result.apis[0].state).toBe('critical');
        })

        // a bar can't be drawn past its track, so overage clamps rather than
        // reporting 130%
        it('an api used past its limit clamps to one hundred percent', async () => {
            const { service, userRepo } = setup();
            arrangeSingleApi(userRepo, 130);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].percent_used).toBe(100);
            expect(result.apis[0].state).toBe('critical');
        })

        // dividing by a zero limit would give Infinity and break the bar width
        it('an api with a zero limit reports zero percent rather than infinity', async () => {
            const { service, userRepo } = setup();
            arrangeSingleApi(userRepo, 5, 0);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.apis[0].percent_used).toBe(0);
            expect(result.apis[0].state).toBe('ok');
        })
    })
});