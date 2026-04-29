import axios, { AxiosInstance, AxiosError } from 'axios';
import http from 'http';
import VoltieAPIError from './VoltieAPIError';
import {
  ApiVersionResponse,
  StatusResponse,
  StartChargingParams,
  StartChargingResponse,
  StopChargingResponse,
  GetCDRResponse,
  ConfigResponse,
  ConfigRequest,
  ConfigUpdateResponse,
  PowerResponse,
  VoltieAPIConfig,
} from './VoltieAPITypes';

export default class VoltieAPI {
  private axiosInstance!: AxiosInstance;
  private httpAgent?: http.Agent;
  private abortControllers: Map<string, AbortController> = new Map();

  private ip?: string;
  private port: number = 5059;
  private timeout: number = 30000;

  constructor(config: VoltieAPIConfig) {
    this.ip = config.ip;
    this.port = config.port || 5059;
    this.timeout = config.timeout || 30000;

    this.httpAgent = new http.Agent({ keepAlive: false });

    const axiosConfig: any = {
      baseURL: `http://${this.ip}:${this.port}`,
      timeout: this.timeout,
      httpAgent: this.httpAgent,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (config.username && config.password) {
      axiosConfig.auth = {
        username: config.username,
        password: config.password,
      };
    }

    this.axiosInstance = axios.create(axiosConfig);
  }

  public destroy() {
    this.abortControllers.forEach((controller) => {
      controller.abort();
    });
    this.abortControllers.clear();

    if (this.httpAgent) this.httpAgent.destroy();
  }

  private getAbortSignal(endpoint: string): AbortSignal {
    const existingController = this.abortControllers.get(endpoint);
    if (existingController) {
      existingController.abort();
    }

    const newController = new AbortController();
    this.abortControllers.set(endpoint, newController);

    return newController.signal;
  }

  private cleanupAbortController(endpoint: string): void {
    this.abortControllers.delete(endpoint);
  }

  async getApiVersion(): Promise<ApiVersionResponse> {
    const endpoint = '/apiver';
    try {
      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.get<ApiVersionResponse>(endpoint, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async getStatus(): Promise<StatusResponse> {
    const endpoint = '/status';
    try {
      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.get<StatusResponse>(endpoint, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async startCharging(params?: StartChargingParams): Promise<StartChargingResponse> {
    const endpoint = '/start';
    try {
      const queryParams = new URLSearchParams();
      if (params?.id_tag) {
        queryParams.append('id_tag', params.id_tag);
      }
      if (params?.name) {
        queryParams.append('name', params.name);
      }

      const query = queryParams.toString();
      const signal = this.getAbortSignal(endpoint);

      const response = await this.axiosInstance.get<StartChargingResponse>(query ? `${endpoint}?${query}` : endpoint, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async stopCharging(): Promise<StopChargingResponse> {
    const endpoint = '/stop';
    try {
      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.get<StopChargingResponse>(endpoint, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async getConfiguration(): Promise<ConfigResponse> {
    const endpoint = '/config';
    try {
      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.get<ConfigResponse>(endpoint, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async updateConfiguration(config: ConfigRequest): Promise<ConfigUpdateResponse> {
    const endpoint = '/config';
    try {
      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.put<ConfigUpdateResponse>(endpoint, config, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async getCDR(cdrId: number): Promise<GetCDRResponse> {
    const endpoint = '/cdr';
    try {
      if (cdrId < 0) {
        throw new VoltieAPIError('INVALID_PARAM', 'CDR ID must be a positive number');
      }

      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.get<GetCDRResponse>(`${endpoint}?cdr_id=${cdrId}`, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  async getPowerDetails(): Promise<PowerResponse> {
    const endpoint = '/power';
    try {
      const signal = this.getAbortSignal(endpoint);
      const response = await this.axiosInstance.get<PowerResponse>(endpoint, { signal });
      this.cleanupAbortController(endpoint);
      return response.data;
    } catch (error) {
      this.cleanupAbortController(endpoint);
      throw this.handleError(error);
    }
  }

  private handleError(error: any): VoltieAPIError {
    if (error instanceof VoltieAPIError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ERR_CANCELED') {
        return new VoltieAPIError(
          'REQUEST_ABORTED',
          'Request was cancelled due to a new request being made to the same endpoint',
        );
      }

      if (axiosError.response?.data) {
        const data = axiosError.response.data as any;
        if (data.error_code !== undefined) {
          return new VoltieAPIError(
            'API_ERROR',
            data.message || axiosError.message,
            axiosError.response.status,
            data.error_code,
          );
        }
      }

      if (axiosError.response?.status === 401) {
        return new VoltieAPIError(
          'UNAUTHORIZED',
          'Unauthorized - Invalid credentials',
          401,
        );
      }

      if (axiosError.response?.status === 400) {
        return new VoltieAPIError(
          'BAD_REQUEST',
          'Bad request - Invalid parameters',
          400,
        );
      }

      if (axiosError.code === 'ECONNREFUSED') {
        return new VoltieAPIError(
          'CONNECTION_REFUSED',
          `Could not connect to ${this.ip}:${this.port}`,
        );
      }

      if (axiosError.code === 'ECONNABORTED') {
        return new VoltieAPIError(
          'TIMEOUT',
          `Request timeout after ${this.timeout}ms`,
        );
      }

      return new VoltieAPIError(
        'REQUEST_FAILED',
        axiosError.message,
        axiosError.response?.status,
      );
    }

    if (error instanceof Error) {
      return new VoltieAPIError('UNKNOWN_ERROR', error.message);
    }

    return new VoltieAPIError('UNKNOWN_ERROR', 'An unknown error occurred');
  }
}
