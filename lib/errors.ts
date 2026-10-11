/** An error that maps directly to an HTTP status. Safe to show `message` to the user. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export const forbidden = (message = "You do not have access to this resource") =>
  new HttpError(403, "forbidden", message);

export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
