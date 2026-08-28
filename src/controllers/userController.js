export const createUserController = (userServices) => ({
  getPlans: async (req, res) => {
    const plans = await userServices.getPlans();

    return res.status(200).json({ plans });
  },

  getDashboard: async (req, res) => {
    const dashboard = await userServices.getDashboard(req.auth.id);

    return res.status(200).json({ dashboard });
  },

  getUsageLog: async (req, res) => {
    const { cursor_at, cursor_id, ...filters } = req.validatedQuery;
    const cursor = cursor_at ? { at: cursor_at, id: cursor_id } : null;
    const log = await userServices.getUsageLogPage(req.auth.id, {
      ...filters,
      cursor,
    });

    return res.status(200).json({ log });
  },

  getApiProducts: async (req, res) => {
    const apis = await userServices.getApiProducts();

    return res.status(200).json({ apis });
  },

  getPaymentHistory: async (req, res) => {
    const history = await userServices.getPaymentHistory(req.auth.id);

    return res.status(200).json({ history });
  },

  selectPlan: async (req, res) => {
    const { plan_name, card_number } = req.body;

    const subscription = await userServices.selectPlan(
      req.auth.id,
      plan_name,
      card_number,
    );

    if (!subscription.charged) return res.status(200).json({ subscription });

    return res.status(201).json({ subscription });
  },
});
