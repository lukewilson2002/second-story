export type DomainErrorCode =
  | "not_found"
  | "listing_not_active"
  | "not_on_marketplace"
  | "not_enough_listing_quantity"
  | "not_enough_stock"
  | "invalid";

/**
 * A rule of the business was broken, for example selling more units than a listing has.
 * `message` is written for the person using the app, so a Server Action can show it as is.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
