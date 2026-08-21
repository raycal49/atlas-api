export class InvalidCredentialError extends Error {
  constructor(options) {
    super("Invalid username and/or password", options);
    this.name = "InvalidCredential";
    this.statusCode = 401;
  }
}

export class ExistingAccountError extends Error {
  constructor(options) {
    super("Account with this username already exists", options);
    this.name = "UsernameTaken";
    this.statusCode = 409;
  }
}

export class ValidationError extends Error {
  constructor(fields, options) {
    super("A field or fields contain invalid input", options);
    this.name = "ValidationError";
  }
}

export class ExpiredTokenError extends Error {
  constructor(options) {
    super("Session expired, please log in again", options);
    this.name = "ExpiredToken";
    this.statusCode = 401;
  }
}

export class InvalidTokenError extends Error {
  constructor(options) {
    super("Invalid authentication token", options);
    this.name = "InvalidToken";
    this.statusCode = 401;
  }
}

export class MissingTokenError extends Error {
  constructor(options) {
    super("Not logged in", options);
    this.name = "MissingToken";
    this.statusCode = 401;
  }
}