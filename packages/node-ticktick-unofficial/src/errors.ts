export class TickTickError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export interface TickTickApiErrorDetails {
  url: string;
  method: string;
  status: number;
  responseBody: unknown;
}

export class TickTickApiError extends TickTickError {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly responseBody: unknown;

  constructor(message: string, details: TickTickApiErrorDetails, options?: ErrorOptions) {
    super(message, options);
    this.url = details.url;
    this.method = details.method;
    this.status = details.status;
    this.responseBody = details.responseBody;
  }
}

export class TickTickNotFoundError extends TickTickError {
  readonly resource: string;
  readonly id: string;

  constructor(resource: string, id: string, options?: ErrorOptions) {
    super(`${resource} ${id} was not found.`, options);
    this.resource = resource;
    this.id = id;
  }
}

export class TickTickRateLimitError extends TickTickApiError {}

export class TickTickAuthError extends TickTickError {}
