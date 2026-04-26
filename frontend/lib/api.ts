// lib/api.ts — Central fetch wrapper for all API calls

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface APIResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const config: RequestInit = {
      ...options,
      credentials: "include", // Always send cookies
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);

      // Handle auth errors
      if (response.status === 401) {
        const isAdmin = endpoint.startsWith("/api/admin");
        if (typeof window !== "undefined") {
          if (isAdmin) {
            // Prevent infinite reload loop: don't redirect if we are hitting auth endpoints or already on /admin
            if (!endpoint.includes("/auth/") && window.location.pathname !== "/admin") {
              window.location.href = "/admin";
            }
          } else if (
            !endpoint.includes("/auth/") &&
            !endpoint.includes("/settings/public")
          ) {
            // Don't redirect for auth endpoints or public endpoints
          }
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.error || data.message || "Request failed",
          response.status,
          data
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError("Network error — please check your connection", 0);
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, value);
        }
      });
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
    return this.request<T>(url, { method: "GET" });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export const api = new ApiClient(API_URL);
export default api;
