export const createUserController = (userServices) => ({
  getPlans: async (req, res) => {
    const plans = await userServices.getPlans();

    return res.status(200).json({ plans });
  },

  getDashboardData: async (req, res) => {
    const dashboardData = await userServices.getUserData(req.tokenInfo.id);

    return res.status(200).json({ dashboardData });
  },

  getUsagePage: async (req, res) => {
    const { cursor_at, cursor_id, ...filters } = req.validatedQuery;
    const cursor = cursor_at ? { at: cursor_at, id: cursor_id } : null;
    const log = await userServices.getUsageLogPage(req.tokenInfo.id, { ...filters, cursor });

    return res.status(200).json({ log });
  },

  getApiProducts: async (req, res) => {
    const apis = await userServices.getApiProducts();

    return res.status(200).json({ apis });
  },

  getMyPayments: async (req, res) => {
    const history = await userServices.getPaymentHistory(req.tokenInfo.id);

    return res.status(200).json({ history });
  },

  selectPlan: async (req, res) => {
    const { plan_name, card_number } = req.body;

    const result = await userServices.selectPlan(req.tokenInfo.id, plan_name, card_number);

    if (!result.charged)
      return res.status(200).json({ scheduled: result.plan_name });

    return res.status(201).json({ paymentId: result.paymentId });
  },
});
