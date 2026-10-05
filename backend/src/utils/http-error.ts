import { Response } from 'express';

/** Error carrying an HTTP status, thrown inside transactions to abort with a 4xx */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const sendError = (res: Response, status: number, message: string) =>
  res.status(status).json({ error: { message, status } });
