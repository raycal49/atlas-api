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
});