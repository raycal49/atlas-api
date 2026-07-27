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

  getMyUsage: async (req, res) => {
    const usage = await userServices.getUsageSummary(req.tokenInfo.id);

    // null when unsubscribed, same as getMySubscription -- the dashboard shows
    // the "pick a plan" prompt instead of a usage breakdown
    return res.status(200).json({ usage });
  },

  getMyUsageLog: async (req, res) => {
    // validateQuery parsed and defaulted these; req.query itself is untouched
    const { before, limit } = req.validatedQuery;

    const log = await userServices.getUsageLog(req.tokenInfo.id, before, limit);

    return res.status(200).json({ log });
  },

  getMyPayments: async (req, res) => {
    const history = await userServices.getPaymentHistory(req.tokenInfo.id);

    return res.status(200).json({ history });
  },

  selectPlan: async (req, res) => {
    // card_number is already just the last 4 digits (schema transform)
    const { plan_name, card_number } = req.body;

    const paymentId = await userServices.selectPlan(req.tokenInfo.id, plan_name, card_number);

    // 201 + the payment id: the receipt for the newly created payment
    return res.status(201).json({ paymentId });
  },
});
