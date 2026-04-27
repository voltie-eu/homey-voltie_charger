import axios, { AxiosInstance, AxiosError } from 'axios';
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

  private ip?: string;
  private port: number = 5059;
  private timeout: number = 30000;

  constructor(config: VoltieAPIConfig) {
    this.ip = config.ip;
    this.port = config.port || 5059;
    this.timeout = config.timeout || 30000;

    const axiosConfig: any = {
      baseURL: `http://${this.ip}:${this.port}`,
      timeout: this.timeout,
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
    // No persistent connections to clean up, but method is here for future use if needed
  }

  async getApiVersion(): Promise<ApiVersionResponse> {
    try {
      const response = await this.axiosInstance.get<ApiVersionResponse>('/apiver');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getStatus(): Promise<StatusResponse> {
    try {
      const response = await this.axiosInstance.get<StatusResponse>('/status');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async startCharging(params?: StartChargingParams): Promise<StartChargingResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.id_tag) {
        queryParams.append('id_tag', params.id_tag);
      }
      if (params?.name) {
        queryParams.append('name', params.name);
      }

      const query = queryParams.toString();
      const endpoint = query ? `/start?${query}` : '/start';

      const response = await this.axiosInstance.get<StartChargingResponse>(endpoint);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async stopCharging(): Promise<StopChargingResponse> {
    try {
      const response = await this.axiosInstance.get<StopChargingResponse>('/stop');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getConfiguration(): Promise<ConfigResponse> {
    try {
      const response = await this.axiosInstance.get<ConfigResponse>('/config');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateConfiguration(config: ConfigRequest): Promise<ConfigUpdateResponse> {
    try {
      const response = await this.axiosInstance.put<ConfigUpdateResponse>('/config', config);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getCDR(cdrId: number): Promise<GetCDRResponse> {
    try {
      if (cdrId < 0) {
        throw new VoltieAPIError('INVALID_PARAM', 'CDR ID must be a positive number');
      }

      const response = await this.axiosInstance.get<GetCDRResponse>(`/cdr?cdr_id=${cdrId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getPowerDetails(): Promise<PowerResponse> {
    try {
      const response = await this.axiosInstance.get<PowerResponse>('/power');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: any): VoltieAPIError {
    if (error instanceof VoltieAPIError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

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
