import {
  ApiError,
  buildUrl,
  getFriendlyHttpErrorMessage,
  normalizeFetchError,
  parseResponseBody,
  requestJson,
  uploadMultipart,
} from "./client.js";

const encodePathSegment = (value) => encodeURIComponent(String(value ?? ""));

export { ApiError };

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

export const listProjects = () => requestJson("/projects");

export const getProject = (projectId) =>
  requestJson(`/projects/${encodePathSegment(projectId)}`);

export const createProjectRecord = (payload) =>
  requestJson("/projects", {
    method: "POST",
    body: payload,
  });

export const updateProjectRecord = (projectId, payload) =>
  requestJson(`/projects/${encodePathSegment(projectId)}`, {
    method: "PATCH",
    body: payload,
  });

export const sendChatMessage = (payload) =>
  requestJson("/chat/messages", {
    method: "POST",
    body: payload,
  });

export const getChatActionStatus = ({ projectId, actionId }) =>
  requestJson(
    `/chat/actions/${encodePathSegment(actionId)}?project_id=${encodePathSegment(
      projectId,
    )}`,
  );

export const uploadDocument = ({ projectId, documentType, file }) => {
  const formData = new FormData();
  formData.append("project_id", projectId);
  formData.append("document_type", documentType);
  formData.append("file", file);

  return uploadMultipart("/upload", formData);
};

export const listDocuments = (projectId) =>
  requestJson(`/projects/${encodePathSegment(projectId)}/documents`);

export const listProjectFiles = async (projectId) => {
  try {
    return await requestJson(`/projects/${encodePathSegment(projectId)}/files`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      const [uploadedFiles, generatedFiles] = await Promise.all([
        listDocuments(projectId),
        listArtifacts(projectId),
      ]);
      return {
        uploaded_files: uploadedFiles,
        generated_files: generatedFiles,
      };
    }
    throw error;
  }
};

export const listProjectTodos = (
  projectId,
  { status = "", sourceType = "", dateFrom = "", dateTo = "" } = {},
) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (sourceType) params.set("source_type", sourceType);
  if (dateFrom) params.set("from", dateFrom);
  if (dateTo) params.set("to", dateTo);
  const query = params.toString();
  return requestJson(
    `/projects/${encodePathSegment(projectId)}/todos${query ? `?${query}` : ""}`,
  );
};

export const updateProjectTodo = ({ projectId, todoId, payload }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/todos/${encodePathSegment(todoId)}`,
    {
      method: "PATCH",
      body: payload,
    },
  );

export const deleteProjectTodo = ({ projectId, todoId }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/todos/${encodePathSegment(todoId)}`,
    { method: "DELETE" },
  );

export const previewProjectTodoImport = ({
  projectId,
  documentId,
  documentType,
}) =>
  requestJson(`/projects/${encodePathSegment(projectId)}/todos/import/preview`, {
    method: "POST",
    body: {
      document_id: documentId,
      document_type: documentType,
    },
  });

export const commitProjectTodoImport = ({
  projectId,
  items,
  duplicateDecisions = [],
}) =>
  requestJson(`/projects/${encodePathSegment(projectId)}/todos/import/commit`, {
    method: "POST",
    body: {
      items,
      duplicate_decisions: duplicateDecisions,
    },
  });

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

export const updateArtifactFileName = ({ projectId, artifactId, fileName }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/artifacts/${encodePathSegment(
      artifactId,
    )}`,
    {
      method: "PATCH",
      body: { file_name: fileName },
    },
  );

export const updateProjectFileName = ({ projectId, fileId, fileName }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/files/${encodePathSegment(fileId)}`,
    {
      method: "PATCH",
      body: { file_name: fileName },
    },
  );

export const deleteArtifactFile = ({ projectId, artifactId }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/artifacts/${encodePathSegment(
      artifactId,
    )}`,
    { method: "DELETE" },
  );

export const downloadArtifactFile = async ({
  projectId,
  artifactId,
  fileName = "요구사항명세서.xlsx",
}) => {
  let response;
  try {
    response = await fetch(
      buildUrl(
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

// TODO: Replace the fallback document-list path once backend file management APIs
// are implemented for uploaded file delete/download operations.
export const deleteProjectFile = ({ projectId, fileId }) =>
  requestJson(
    `/projects/${encodePathSegment(projectId)}/files/${encodePathSegment(fileId)}`,
    { method: "DELETE" },
  );

export const downloadProjectFile = async ({
  projectId,
  fileId,
  fileName = "uploaded-file",
}) => {
  let response;
  try {
    response = await fetch(
      buildUrl(
        `/projects/${encodePathSegment(projectId)}/files/${encodePathSegment(
          fileId,
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
        fallbackMessage: "파일 다운로드 중 오류가 발생했습니다.",
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
