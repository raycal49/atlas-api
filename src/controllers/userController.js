export const createUserController = (userServices) => ({
  getPlans: async (req, res) => {
    const plans = await userServices.getPlans();

    return res.status(200).json({ plans });
  },

  getDashboardData: async (req, res) => {
    const dashboardData = await userServices.getUserData(req.tokenInfo.id);

    // null when unsubscribed -- a normal state for the dashboard, not an error
    return res.status(200).json({ dashboardData });
  },

  getUsagePage: async (req, res) => {
    // validateQuery parsed and defaulted the whole query; passing it through
    // untouched means a future filter reaches the service without edits here
    const log = await userServices.getUsageLogPage(req.tokenInfo.id, req.validatedQuery);

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
    // card_number is already just the last 4 digits (schema transform)
    const { plan_name, card_number } = req.body;

    const paymentId = await userServices.selectPlan(req.tokenInfo.id, plan_name, card_number);

    // 201 + the payment id: the receipt for the newly created payment
    return res.status(201).json({ paymentId });
  },
});
