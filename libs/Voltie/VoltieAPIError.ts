import { ErrorCode } from './VoltieAPITypes';

export default class VoltieAPIError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number,
    public errorCode?: ErrorCode,
  ) {
    super(message);
    this.name = 'VoltieAPIError';
    Object.setPrototypeOf(this, VoltieAPIError.prototype);
  }
}
