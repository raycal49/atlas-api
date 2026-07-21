export const createUserController = (userServices) => ({
  getPlans: async (req, res) => {
    const plans = await userServices.getPlans();

    return res.status(200).json({ plans });
  },

  getMySubscription: async (req, res) => {
    const subscription = await userServices.getCurrentSubscription(req.tokenInfo.id);

    // null when unsubscribed -- a normal state for the dashboard, not an error
    return res.status(200).json({ subscription });
  },

  selectPlan: async (req, res) => {
    // card_number is already just the last 4 digits (schema transform)
    const { plan_name, card_number } = req.body;

    const paymentId = await userServices.selectPlan(req.tokenInfo.id, plan_name, card_number);

    // 201 + the payment id: the receipt for the newly created payment
    return res.status(201).json({ paymentId });
  },
});
