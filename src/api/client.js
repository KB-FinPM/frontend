const viteEnv = import.meta.env ?? {};

export const API_BASE_URL =
  viteEnv.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export const FRIENDLY_API_ERROR_MESSAGES = Object.freeze({
  NETWORK:
    "서버와 연결하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.",
  TIMEOUT: "요청 처리 시간이 길어지고 있습니다. 잠시 후 다시 시도해주세요.",
  SERVER: "서버 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
  AUTH: "요청 권한이 없습니다. 권한을 확인한 뒤 다시 시도해주세요.",
  DEFAULT: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
});

const buildUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const parseResponseBody = async (response) => {
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

const getBackendMessage = (data) => {
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (typeof data?.detail === "string" && data.detail.trim()) {
    return data.detail;
  }
  return "";
};

export const getFriendlyHttpErrorMessage = (
  data,
  response,
  { fallbackMessage = FRIENDLY_API_ERROR_MESSAGES.DEFAULT } = {},
) => {
  if (response?.status === 408 || response?.status === 504) {
    return FRIENDLY_API_ERROR_MESSAGES.TIMEOUT;
  }
  if (response?.status >= 500) {
    return FRIENDLY_API_ERROR_MESSAGES.SERVER;
  }
  if (response?.status === 401 || response?.status === 403) {
    return FRIENDLY_API_ERROR_MESSAGES.AUTH;
  }

  return getBackendMessage(data) || fallbackMessage;
};

const getErrorText = (error) =>
  String(error?.message ?? error ?? "").toLowerCase();

const isTimeoutError = (error) => {
  const text = getErrorText(error);
  return (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("err_connection_timed_out")
  );
};

const isNetworkError = (error) => {
  const text = getErrorText(error);
  return (
    error instanceof TypeError ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network error") ||
    text.includes("load failed") ||
    text.includes("err_connection")
  );
};

export const normalizeFetchError = (error) => {
  if (error instanceof ApiError) return error;

  if (isTimeoutError(error)) {
    return new ApiError(FRIENDLY_API_ERROR_MESSAGES.TIMEOUT, {
      data: { originalMessage: String(error?.message ?? error ?? "") },
    });
  }

  if (isNetworkError(error)) {
    return new ApiError(FRIENDLY_API_ERROR_MESSAGES.NETWORK, {
      data: { originalMessage: String(error?.message ?? error ?? "") },
    });
  }

  return new ApiError(FRIENDLY_API_ERROR_MESSAGES.NETWORK, {
    data: { originalMessage: String(error?.message ?? error ?? "") },
  });
};

const request = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(buildUrl(path), options);
  } catch (error) {
    throw normalizeFetchError(error);
  }

  const data = await parseResponseBody(response);

  if (!response.ok || data?.success === false) {
    throw new ApiError(getFriendlyHttpErrorMessage(data, response), {
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
