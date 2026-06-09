export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const buildUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text ? { message: text } : null;
};

const getErrorMessage = (data, response) => {
  if (data?.message) return data.message;
  if (typeof data?.detail === "string") return data.detail;
  return `API request failed (${response.status} ${response.statusText})`;
};

const request = async (path, options = {}) => {
  const response = await fetch(buildUrl(path), options);
  const data = await parseResponseBody(response);

  if (!response.ok || data?.success === false) {
    throw new ApiError(getErrorMessage(data, response), {
      status: response.status,
      data,
    });
  }

  return data;
};

export const requestJson = (
  path,
  { method = "GET", body, headers = {}, signal } = {},
) =>
  request(path, {
    method,
    headers:
      body === undefined
        ? headers
        : {
            "Content-Type": "application/json",
            ...headers,
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

export const uploadMultipart = (
  path,
  formData,
  { method = "POST", headers = {}, signal } = {},
) =>
  request(path, {
    method,
    headers,
    body: formData,
    signal,
  });
