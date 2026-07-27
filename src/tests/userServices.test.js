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
        findPlanApiLimits: vi.fn(),
        countUsageByProduct: vi.fn(),
        findPaymentHistory: vi.fn(),
        findPlanById: vi.fn(),
        findUsageLog: vi.fn(),
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

    describe('we summarise the whole period for the dashboard tiles', async () => {
        const arrangeTwoApis = (userRepo, counts) => {
            userRepo.findActiveSubscription.mockResolvedValue({
                subscription_id: '417e-9664', plan_id: '06188b55-8cf3', started_at: '2026-06-15',
            });
            userRepo.findCurrentPeriod.mockResolvedValue({
                period_start: '2026-07-15', next_bill_due: '2026-08-15',
            });
            userRepo.findPlanApiLimits.mockResolvedValue([
                { api_product_id: 'api-1', api_name: 'Geocoding', monthly_limit: 5000 },
                { api_product_id: 'api-2', api_name: 'Static Maps', monthly_limit: 10000 },
            ]);
            userRepo.countUsageByProduct.mockResolvedValue(counts);
        }

        it('total calls adds up every api, and api count matches the plan', async () => {
            const { service, userRepo } = setup();
            arrangeTwoApis(userRepo, [
                { api_product_id: 'api-1', calls_used: 4100 },
                { api_product_id: 'api-2', calls_used: 320 },
            ]);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.total_calls).toBe(4420);
            expect(result.api_count).toBe(2);
        })

        // an api the plan grants but that was never called still counts toward
        // api_count, and contributes 0 rather than undefined to the total
        it('an untouched api counts toward the api count without breaking the total', async () => {
            const { service, userRepo } = setup();
            arrangeTwoApis(userRepo, [{ api_product_id: 'api-1', calls_used: 4100 }]);

            const result = await service.getUsageSummary('79c7d0bd4b6a');

            expect(result.total_calls).toBe(4100);
            expect(result.api_count).toBe(2);
        })

        describe('and how many days are left until the next bill', async () => {
            beforeEach(() => { vi.useFakeTimers(); })
            afterEach(() => { vi.useRealTimers(); })

            it('counts the whole days between today and the billing date', async () => {
                // pin the clock: computing an expected value from the real date
                // would just re-implement the code under test
                vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));

                const { service, userRepo } = setup();
                arrangeTwoApis(userRepo, []);

                const result = await service.getUsageSummary('79c7d0bd4b6a');

                expect(result.days_until_next_bill).toBe(19);
            })

            // late in the day locally is still the same calendar day in UTC --
            // the count must not tip early
            it('is unaffected by the time of day', async () => {
                vi.setSystemTime(new Date('2026-07-27T23:59:00Z'));

                const { service, userRepo } = setup();
                arrangeTwoApis(userRepo, []);

                const result = await service.getUsageSummary('79c7d0bd4b6a');

                expect(result.days_until_next_bill).toBe(19);
            })

            it('is zero on the day the bill is due', async () => {
                vi.setSystemTime(new Date('2026-08-15T09:00:00Z'));

                const { service, userRepo } = setup();
                arrangeTwoApis(userRepo, []);

                const result = await service.getUsageSummary('79c7d0bd4b6a');

                expect(result.days_until_next_bill).toBe(0);
            })

            it('is null when there is no billing date to count toward', async () => {
                const { service, userRepo } = setup();
                arrangeTwoApis(userRepo, []);
                userRepo.findCurrentPeriod.mockResolvedValue(undefined);

                const result = await service.getUsageSummary('79c7d0bd4b6a');

                expect(result.days_until_next_bill).toBe(null);
                expect(result.next_bill_due).toBe(null);
            })
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

    describe('we page through the call log', async () => {
        // ids descend, the way the repository returns them
        const callsFrom = (highestId, count) =>
            Array.from({ length: count }, (_, i) => ({
                api_usage_id: String(highestId - i),
                used_at: '2026-07-20T10:00:00.000Z',
                api_name: 'Geocoding',
            }));

        it('asks for one row more than the caller wants, so it can tell if another page exists', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLog.mockResolvedValue(callsFrom(500, 3));

            await service.getUsageLog('79c7d0bd4b6a', undefined, 50);

            expect(userRepo.findUsageLog).toHaveBeenCalledWith('79c7d0bd4b6a', null, 51);
        })

        // the extra row is a probe, not content -- it must not reach the client
        it('trims the probe row and hands back a cursor when a page is full', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLog.mockResolvedValue(callsFrom(500, 4));

            const result = await service.getUsageLog('79c7d0bd4b6a', undefined, 3);

            expect(result.calls).toHaveLength(3);
            expect(result.calls.at(-1).api_usage_id).toBe('498');
            // paging resumes below the last row actually shown, so 497 -- the probe
            // -- is the first row of the next page rather than being skipped
            expect(result.next_before).toBe('498');
        })

        it('reports no cursor once the last page comes back short', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLog.mockResolvedValue(callsFrom(500, 2));

            const result = await service.getUsageLog('79c7d0bd4b6a', undefined, 3);

            expect(result.calls).toHaveLength(2);
            expect(result.next_before).toBe(null);
        })

        it('has no cursor and no calls when the log is empty', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLog.mockResolvedValue([]);

            const result = await service.getUsageLog('79c7d0bd4b6a', undefined, 50);

            expect(result.calls).toStrictEqual([]);
            expect(result.next_before).toBe(null);
        })

        it('passes a cursor straight through to the repository', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLog.mockResolvedValue([]);

            await service.getUsageLog('79c7d0bd4b6a', '498', 50);

            expect(userRepo.findUsageLog).toHaveBeenCalledWith('79c7d0bd4b6a', '498', 51);
        })

        // api_usage_id is an int8 and can outgrow Number.MAX_SAFE_INTEGER, so the
        // cursor has to survive as a string rather than becoming a JS number
        it('keeps the cursor a string', async () => {
            const { service, userRepo } = setup();
            userRepo.findUsageLog.mockResolvedValue([
                { api_usage_id: '9007199254740993', used_at: '2026-07-20T10:00:00.000Z', api_name: 'Geocoding' },
                { api_usage_id: '9007199254740992', used_at: '2026-07-20T10:00:00.000Z', api_name: 'Geocoding' },
            ]);

            const result = await service.getUsageLog('79c7d0bd4b6a', undefined, 1);

            expect(result.next_before).toBe('9007199254740993');
            expect(typeof result.next_before).toBe('string');
        })
    })
});