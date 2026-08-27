export class InvalidPlanError extends Error {
  constructor(planName, options) {
    super(`No active plan named '${planName}'`, options);
    this.name = "InvalidPlan";
    this.statusCode = 400;
    this.planName = planName;
  }
}

export class CardRequiredError extends Error {
  constructor(options) {
    super("Card number is required for paid plans", options);
    this.name = "CardRequired";
    this.statusCode = 400;
  }
}

export class AlreadyOnPlanError extends Error {
  constructor(options) {
    super("Already subscribed to this plan", options);
    this.name = "AlreadyOnPlan";
    this.statusCode = 409;
  }
}

export class AlreadyScheduledPlanError extends Error {
  constructor(options) {
    super("This plan is already scheduled", options);
    this.name = "AlreadyScheduledPlan";
    this.statusCode = 409;
  }
}

export class AlreadySubscribedError extends Error {
  constructor(options) {
    super("User already has an active subscription", options);
    this.name = "AlreadySubscribed";
    this.statusCode = 409;
  }
}

export class DuplicatePeriodPaymentError extends Error {
  constructor(options) {
    super("Subscription already billed for this period", options);
    this.name = "DuplicatePeriodPayment";
    this.statusCode = 409;
  }
}
