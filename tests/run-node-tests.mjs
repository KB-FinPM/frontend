import assertModule from "assert";

import {
  API_BASE_URL,
  ApiError,
  FRIENDLY_API_ERROR_MESSAGES,
  getFriendlyHttpErrorMessage,
  normalizeFetchError,
  parseResponseBody,
} from "../src/api/client.js";
import {
  downloadArtifactFile,
  getProject,
} from "../src/api/finpmApi.js";
import { createAssistantMessageFromResponse } from "../src/services/chatService.js";
import {
  getDefaultCommands,
  getCommandRecommendations,
  normalizeCommandText,
  saveCommandUsage,
} from "../src/services/commandRecommendationService.js";
import { createProject } from "../src/services/projectService.js";
import {
  getGenerationProgressPayload,
  getGenerationStageStepIndex,
  normalizeGenerationProgressPayload,
  normalizeSubProgress,
} from "../src/services/generationProgressService.js";
import { ARTIFACT_TYPES, DOCUMENT_TYPES } from "../src/types/api.js";


const tests = [];
const assert = assertModule.strict ?? assertModule;

const test = (name, fn) => {
  tests.push({ name, fn });
};

const fakeResponse = ({ jsonBody, textBody = "", contentType = "" }) => ({
  headers: {
    get: (name) =>
      String(name).toLowerCase() === "content-type" ? contentType : "",
  },
  json: async () => {
    if (jsonBody instanceof Error) {
      throw jsonBody;
    }
    return jsonBody;
  },
  text: async () => textBody,
});

const jsonResponse = (body) =>
  fakeResponse({ jsonBody: body, contentType: "application/json" });

const installBrowserStubs = () => {
  const storage = new Map();
  globalThis.window = {
    setTimeout: (callback) => {
      callback();
      return 0;
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    },
  };
  globalThis.document = {
    body: {
      appendChild: () => {},
    },
    createElement: () => ({
      style: {},
      click: () => {},
      remove: () => {},
    }),
  };
  globalThis.URL = {
    createObjectURL: () => "blob:pm-agent-test",
    revokeObjectURL: () => {},
  };
  return storage;
};


test("API_BASE_URL falls back to the local backend", () => {
  assert.equal(API_BASE_URL, "http://localhost:8000/api");
});

test("project API requests use the backend /api prefix", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) =>
          String(name).toLowerCase() === "content-type"
            ? "application/json"
            : "",
      },
      json: async () => ({
        project_id: "PRJ 001",
        project_name: "API prefix check",
      }),
      text: async () => "",
    };
  };

  const project = await getProject("PRJ 001");

  assert.equal(
    requestedUrl,
    "http://localhost:8000/api/projects/PRJ%20001",
  );
  assert.equal(project.project_id, "PRJ 001");
});

test("createProject follows the id from the create response", async () => {
  installBrowserStubs();
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      method: options.method ?? "GET",
      body: options.body,
    });

    if (requests.length === 1) {
      return {
        ok: false,
        status: 404,
        headers: {
          get: (name) =>
            String(name).toLowerCase() === "content-type"
              ? "application/json"
              : "",
        },
        json: async () => ({ message: "project not found" }),
        text: async () => "",
      };
    }

    if (requests.length === 2) {
      return {
        ok: true,
        status: 201,
        headers: {
          get: (name) =>
            String(name).toLowerCase() === "content-type"
              ? "application/json"
              : "",
        },
        json: async () => ({ id: "created-id", name: "pmpm" }),
        text: async () => "",
      };
    }

    if (requests.length === 3) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name) =>
            String(name).toLowerCase() === "content-type"
              ? "application/json"
              : "",
        },
        json: async () => ({ id: "created-id", name: "pmpm" }),
        text: async () => "",
      };
    }

    throw new Error(`unexpected request ${requests.length}: ${url}`);
  };

  const project = await createProject("draft-id", "pmpm");

  assert.equal(project.projectId, "created-id");
  assert.equal(project.projectName, "pmpm");
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "http://localhost:8000/api/projects/draft-id",
      "http://localhost:8000/api/projects",
      "http://localhost:8000/api/projects/created-id",
    ],
  );
  assert.equal(requests[1].method, "POST");
  assert.equal(JSON.parse(requests[1].body).project_id, "draft-id");
});

test("parseResponseBody returns JSON bodies", async () => {
  const body = await parseResponseBody(jsonResponse({ success: true }));
  assert.deepEqual(body, { success: true });
});

test("parseResponseBody reports invalid JSON responses", async () => {
  await assert.rejects(
    () =>
      parseResponseBody(
        fakeResponse({
          jsonBody: new SyntaxError("invalid JSON"),
          contentType: "application/json",
        }),
      ),
    (error) =>
      error instanceof ApiError &&
      error.message === FRIENDLY_API_ERROR_MESSAGES.PARSE,
  );
});

test("parseResponseBody wraps non-empty text bodies", async () => {
  const body = await parseResponseBody(fakeResponse({ textBody: "plain error" }));
  assert.deepEqual(body, { message: "plain error" });
});

test("getFriendlyHttpErrorMessage maps server and auth failures", () => {
  assert.equal(
    getFriendlyHttpErrorMessage({}, { status: 500 }),
    FRIENDLY_API_ERROR_MESSAGES.SERVER,
  );
  assert.equal(
    getFriendlyHttpErrorMessage({}, { status: 403 }),
    FRIENDLY_API_ERROR_MESSAGES.AUTH,
  );
});

test("getFriendlyHttpErrorMessage preserves specific backend messages", () => {
  assert.equal(
    getFriendlyHttpErrorMessage(
      { message: "source document not found" },
      { status: 404 },
    ),
    "source document not found",
  );
});

test("getFriendlyHttpErrorMessage hides document parser internals", () => {
  const message = getFriendlyHttpErrorMessage(
    {
      error_code: "DOCUMENT_INPUT_NORMALIZATION_FAILED",
      message: "문서를 읽는 중 오류가 발생했습니다. (NotImplementedError)",
      detail: { errors: ["NotImplementedError"] },
    },
    { status: 422 },
  );

  assert(message.includes("문서를 읽지 못했습니다"));
  assert(!message.includes("NotImplementedError"));
});

test("normalizeFetchError preserves ApiError instances", () => {
  const error = new ApiError("already normalized", { status: 422 });
  assert.equal(normalizeFetchError(error), error);
});

test("normalizeFetchError maps network and timeout errors", () => {
  const network = normalizeFetchError(new TypeError("Failed to fetch"));
  assert(network instanceof ApiError);
  assert.equal(network.message, FRIENDLY_API_ERROR_MESSAGES.NETWORK);

  const timeout = normalizeFetchError(new Error("request timed out"));
  assert(timeout instanceof ApiError);
  assert.equal(timeout.message, FRIENDLY_API_ERROR_MESSAGES.TIMEOUT);
});

test("normalizeFetchError preserves non-network error messages", () => {
  const error = normalizeFetchError(
    new Error("Cannot read properties of undefined"),
  );

  assert(error instanceof ApiError);
  assert.equal(error.message, "Cannot read properties of undefined");
});

test("frontend document constants match backend DocumentType values", () => {
  assert.deepEqual(
    Object.values(DOCUMENT_TYPES).sort(),
    [
      "CONSTRUCTION_REQUIREMENT_DEFINITION",
      "MEETING_NOTES",
      "REQUIREMENT_SPEC",
      "SCREEN_DESIGN",
      "UNKNOWN",
      "WBS",
    ].sort(),
  );
  assert.equal(DOCUMENT_TYPES.SCREEN_DESIGN, "SCREEN_DESIGN");
  assert.equal(DOCUMENT_TYPES.UNITTEST_SPEC, undefined);
});

test("frontend artifact constants match backend ArtifactType values", () => {
  assert.deepEqual(
    Object.values(ARTIFACT_TYPES).sort(),
    [
      "ACTION_ITEMS",
      "REQUIREMENT_SPEC",
      "SCREEN_DESIGN",
      "UNITTEST_SPEC",
      "WBS",
    ].sort(),
  );
});

test("createAssistantMessageFromResponse preserves root download files", () => {
  const message = createAssistantMessageFromResponse({
    conversation_id: "CONV-001",
    message_id: "MSG-001",
    message: "download ready",
    state: "COMPLETED",
    download_files: [
      {
        artifact_id: "ART-REQ-001",
        file_name: "요구사항_명세서.xlsx",
        mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  assert.deepEqual(message.metadata.downloadFiles, [
    {
      artifact_id: "ART-REQ-001",
      file_name: "요구사항_명세서.xlsx",
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  ]);
});

test("createAssistantMessageFromResponse falls back to result download files", () => {
  const message = createAssistantMessageFromResponse({
    conversation_id: "CONV-001",
    message_id: "MSG-001",
    message: "download ready",
    state: "COMPLETED",
    result: {
      download_files: [{ artifact_id: "ART-WBS-001", file_name: "WBS.xlsx" }],
    },
  });

  assert.deepEqual(message.metadata.downloadFiles, [
    { artifact_id: "ART-WBS-001", file_name: "WBS.xlsx" },
  ]);
});

test("createAssistantMessageFromResponse preserves stable download schema", () => {
  const message = createAssistantMessageFromResponse({
    conversation_id: "CONV-001",
    message_id: "MSG-001",
    message: "download ready",
    state: "COMPLETED",
    download_files: [
      {
        artifact_id: "ART-REQ-001",
        artifact_type: "REQUIREMENT_SPEC",
        file_name: "요구사항_명세서.xlsx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content_type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_url: "/api/projects/PRJ-001/artifacts/ART-REQ-001/download",
      },
    ],
  });

  assert.deepEqual(message.metadata.downloadFiles, [
    {
      artifact_id: "ART-REQ-001",
      artifact_type: "REQUIREMENT_SPEC",
      file_name: "요구사항_명세서.xlsx",
      mime_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      download_url: "/api/projects/PRJ-001/artifacts/ART-REQ-001/download",
    },
  ]);
});

test("createAssistantMessageFromResponse preserves correction notices", () => {
  const message = createAssistantMessageFromResponse({
    conversation_id: "CONV-001",
    message_id: "MSG-001",
    message: "어떤 산출물을 만들까요?",
    state: "WAITING_REQUIRED_INFO",
    corrections: [{ source: "화면 설개서", target: "화면설계서" }],
  });

  assert.deepEqual(message.metadata.corrections, [
    { source: "화면 설개서", target: "화면설계서" },
  ]);
});

test("downloadArtifactFile decodes Korean content-disposition filenames", async () => {
  installBrowserStubs();
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      headers: {
        get: (name) =>
          String(name).toLowerCase() === "content-disposition"
            ? "attachment; filename*=UTF-8''%EC%9A%94%EA%B5%AC%EC%82%AC%ED%95%AD.xlsx"
            : "",
      },
      blob: async () => ({ bytes: "artifact" }),
    };
  };

  const result = await downloadArtifactFile({
    projectId: "PRJ 001",
    artifactId: "ART/REQ 001",
    fileName: "fallback.xlsx",
  });

  assert.equal(
    requestedUrl,
    "http://localhost:8000/api/projects/PRJ%20001/artifacts/ART%2FREQ%20001/download",
  );
  assert.equal(result.fileName, "요구사항.xlsx");
});

test("downloadArtifactFile reports recoverable API errors", async () => {
  installBrowserStubs();
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === "content-type" ? "application/json" : "",
    },
    json: async () => ({ message: "artifact not found" }),
    text: async () => "",
  });

  await assert.rejects(
    () =>
      downloadArtifactFile({
        projectId: "PRJ-001",
        artifactId: "ART-404",
      }),
    (error) =>
      error instanceof ApiError &&
      error.status === 404 &&
      error.message === "artifact not found",
  );
});

test("command recommendation usage ignores empty commands", async () => {
  installBrowserStubs();
  const result = await saveCommandUsage("PRJ-001", "   ");
  assert.equal(result, null);
});

test("command recommendations are deduped and capped", async () => {
  installBrowserStubs();
  await saveCommandUsage("PRJ-001", "WBS 만들기");
  await saveCommandUsage("PRJ-001", "WBS 만들기");

  const recommendations = await getCommandRecommendations("PRJ-001", "CONV-001", {
    commandText: "wbs",
  });
  const normalizedCommands = recommendations.map((recommendation) =>
    normalizeCommandText(recommendation.commandText),
  );

  assert(recommendations.length <= 4);
  assert.equal(new Set(normalizedCommands).size, normalizedCommands.length);
});

test("default command recommendations use real Korean PM commands", async () => {
  installBrowserStubs();
  const recommendations = await getDefaultCommands();
  const commandTexts = recommendations.map(
    (recommendation) => recommendation.commandText,
  );

  assert(commandTexts.includes("요구사항 명세서 생성해줘"));
  assert(commandTexts.includes("회의록에서 할일 뽑아줘"));
  assert(commandTexts.every((commandText) => !commandText.includes("?")));
});

test("generation progress separates overall and sub progress", () => {
  const normalized = normalizeGenerationProgressPayload(
    {
      progress: 45,
      stage: "CORE_AGENT_EXTRACTION",
      stage_label: "Core Agent 요구사항 추출 중",
      current: 15,
      total: 16,
      sub_progress: {
        type: "CHUNK_PROCESSING",
        label: "원본 문서 chunk 처리",
        current: 137,
        total: 236,
        unit: "chunks",
        message: "원본 문서 chunk 처리 중 137/236 chunks",
      },
      batch_progress: {
        label: "LLM batch 처리",
        current: 15,
        total: 30,
        unit: "batches",
      },
    },
    5,
  );

  assert.equal(normalized.progress, 45);
  assert.equal(normalized.displayText, "Core Agent 요구사항 추출 중");
  assert.equal(normalized.subProgressItems.length, 2);
  assert.equal(normalized.subProgressItems[0].progress, 58);
  assert.equal(normalized.subProgressItems[0].hasProgressBar, true);
  assert.equal(normalized.subProgressItems[1].message, "LLM batch 처리 15/30 batches");
  assert.equal(normalized.largeDocumentHint, true);
});

test("generation progress uses legacy current total only without sub progress", () => {
  const normalized = normalizeGenerationProgressPayload(
    {
      current: 8,
      total: 16,
      progress_text: "8/16",
    },
    5,
  );

  assert.equal(normalized.progress, 50);
  assert.equal(normalized.displayText, "8/16");
  assert.deepEqual(normalized.subProgressItems, []);
});

test("generation progress payload falls back to pending action result json", () => {
  const progress = {
    stage: "VALIDATION_AGENT_CHECK",
    stage_label: "Validation Agent 검증 중",
    progress: 70,
  };

  assert.deepEqual(
    getGenerationProgressPayload({
      result: { generation_progress: null },
      pending_action: {
        result_json: {
          generation_progress: progress,
        },
      },
    }),
    progress,
  );
});

test("generation stage step index prefers status stage over progress value", () => {
  assert.equal(
    getGenerationStageStepIndex({
      result: {
        generation_progress: {
          stage: "VALIDATION_AGENT_CHECK",
          progress: 70,
        },
      },
    }),
    3,
  );
  assert.equal(
    getGenerationStageStepIndex({
      result: {
        generation_progress: {
          stage: "OUTPUT_AGENT_EXPORT",
          progress: 70,
        },
      },
    }),
    4,
  );
});

test("generation progress does not treat sub current total as overall progress", () => {
  const normalized = normalizeGenerationProgressPayload(
    {
      current: 14,
      total: 16,
      sub_progress: {
        label: "원본 문서 chunk 처리",
        current: 137,
        total: 236,
        unit: "chunks",
      },
    },
    5,
  );

  assert.equal(normalized.progress, 5);
  assert.equal(normalized.subProgressItems[0].progress, 58);
});

test("sub progress without total falls back to loading text", () => {
  const normalized = normalizeSubProgress({
    type: "INDEXING",
    label: "임베딩/인덱싱 처리",
    message: "임베딩/인덱싱 처리 중",
    current: 180,
    total: 0,
    unit: "chunks",
  });

  assert.equal(normalized.progress, null);
  assert.equal(normalized.hasProgressBar, false);
  assert.equal(normalized.message, "임베딩/인덱싱 처리 중");
  assert.equal(normalized.largeDocumentHint, true);
});


let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
}
