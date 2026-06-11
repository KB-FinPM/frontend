import {
  API_BASE_URL,
  ApiError,
  getFriendlyHttpErrorMessage,
  normalizeFetchError,
  parseResponseBody,
  requestJson,
  uploadMultipart,
} from "./client.js";

const encodePathSegment = (value) => encodeURIComponent(String(value ?? ""));

const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

const fileNameFromContentDisposition = (header, fallbackFileName) => {
  if (!header) return fallbackFileName;

  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallbackFileName;
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const healthCheck = () => requestJson("/health");

export const sendChatMessage = (payload) =>
  requestJson("/chat/messages", {
    method: "POST",
    body: payload,
  });

export const uploadDocument = ({ projectId, documentType, file }) => {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("document_type", documentType);
  formData.append("file", file);

  return uploadMultipart("/upload", formData);
};

export const listDocuments = (projectId) =>
  requestJson(`/projects/${encodePathSegment(projectId)}/documents`);

export const getDocument = ({ projectId, documentId }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/documents/${encodePathSegment(
      documentId,
    )}`,
  );

export const listArtifacts = (projectId) =>
  requestJson(`/projects/${encodePathSegment(projectId)}/artifacts`);

export const getArtifact = ({ projectId, artifactId }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/artifacts/${encodePathSegment(
      artifactId,
    )}`,
  );

export const downloadArtifactFile = async ({
  projectId,
  artifactId,
  fileName = "요구사항명세서.xlsx",
}) => {
  let response;
  try {
    response = await fetch(
      buildApiUrl(
        `/projects/${encodePathSegment(projectId)}/artifacts/${encodePathSegment(
          artifactId,
        )}/download`,
      ),
    );
  } catch (error) {
    throw normalizeFetchError(error);
  }

  if (!response.ok) {
    const data = await parseResponseBody(response);
    throw new ApiError(
      getFriendlyHttpErrorMessage(data, response, {
        fallbackMessage: "파일을 다운로드하지 못했습니다.",
      }),
      {
        status: response.status,
        data,
      },
    );
  }

  let blob;
  try {
    blob = await response.blob();
  } catch (error) {
    throw normalizeFetchError(error);
  }
  const resolvedFileName = fileNameFromContentDisposition(
    response.headers.get("content-disposition"),
    fileName,
  );
  downloadBlob(blob, resolvedFileName);
  return { fileName: resolvedFileName };
};
