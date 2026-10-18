import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

/**
 * Inter-service HTTP client with standard retry + timeout policy.
 * Timeout: 8s; Retries: 2 (on network errors and 5xx responses).
 */
@Injectable()
export class InterServiceHttpClient {
  private readonly logger = new Logger(InterServiceHttpClient.name);
  private readonly axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 8000,
    });

    axiosRetry(this.axiosInstance, {
      retries: 2,
      retryCondition: (error) => {
        return (
          axiosRetry.isNetworkError(error) ||
          axiosRetry.isRetryableError(error)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        this.logger.warn(
          `Retrying request to ${requestConfig.url} (attempt ${retryCount}). Error: ${error.message}`,
        );
      },
    });
  }

  get axios(): AxiosInstance {
    return this.axiosInstance;
  }

  async get<T>(url: string, config = {}): Promise<T> {
    const res = await this.axiosInstance.get<T>(url, config);
    return res.data;
  }

  async post<T>(url: string, data?: unknown, config = {}): Promise<T> {
    const res = await this.axiosInstance.post<T>(url, data, config);
    return res.data;
  }

  async put<T>(url: string, data?: unknown, config = {}): Promise<T> {
    const res = await this.axiosInstance.put<T>(url, data, config);
    return res.data;
  }

  async delete<T>(url: string, config = {}): Promise<T> {
    const res = await this.axiosInstance.delete<T>(url, config);
    return res.data;
  }
}
