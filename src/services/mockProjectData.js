export const MOCK_PROJECTS = {
  "project-001": {
    projectId: "project-001",
    projectName: "PM Agent 개발",
    projectStartDate: "2026-06-01",
    projectEndDate: "2026-08-31",
    projectDescription:
      "SI 프로젝트 산출물 생성과 일정관리를 지원하는 PM Agent 개발 프로젝트입니다.",
    conversations: [
      {
        conversationId: "project-001-requirements",
        title: "요구사항 정의서 생성",
        createdAt: "2026-06-04 10:00",
        updatedAt: "2026-06-04 10:09",
        messages: [
          {
            id: "project-001-user-1",
            role: "user",
            content: "요구사항 정의서 만들어줘",
            createdAt: "2026-06-04 10:00",
          },
          {
            id: "project-001-assistant-1",
            role: "assistant",
            content: "구축요건정의서 또는 RFP 문서를 업로드해주세요.",
            createdAt: "2026-06-04 10:01",
          },
          {
            id: "project-001-user-2",
            role: "user",
            content: "업로드 후 WBS도 같이 준비해야 해",
            createdAt: "2026-06-04 10:08",
          },
          {
            id: "project-001-assistant-2",
            role: "assistant",
            content:
              "요구사항 문서가 준비되면 기능 단위로 작업을 나누고 WBS 초안까지 이어서 정리하겠습니다.",
            createdAt: "2026-06-04 10:09",
          },
        ],
      },
      {
        conversationId: "project-001-weekly-report",
        title: "주간보고서 작성 요청",
        createdAt: "2026-06-05 13:30",
        updatedAt: "2026-06-05 13:34",
        messages: [
          {
            id: "project-001-weekly-user-1",
            role: "user",
            content: "이번 주 진행 상황으로 주간보고서 초안 만들어줘",
            createdAt: "2026-06-05 13:30",
          },
          {
            id: "project-001-weekly-assistant-1",
            role: "assistant",
            content:
              "주요 완료 업무, 진행 중 업무, 이슈 및 다음 주 계획 순서로 정리하면 좋습니다. 이 흐름에 맞춰 초안을 준비해드릴게요.",
            createdAt: "2026-06-05 13:34",
          },
        ],
      },
    ],
  },
  "project-002": {
    projectId: "project-002",
    projectName: "모바일 뱅킹 고도화",
    projectStartDate: "2026-06-01",
    projectEndDate: "2026-08-31",
    projectDescription:
      "모바일 뱅킹 서비스의 화면 목록, 주간 일정, 지연 업무를 관리하는 프로젝트입니다.",
    conversations: [
      {
        conversationId: "project-002-schedule",
        title: "WBS 기반 일정 확인",
        createdAt: "2026-06-05 09:30",
        updatedAt: "2026-06-05 09:36",
        messages: [
          {
            id: "project-002-user-1",
            role: "user",
            content: "이번 주 지연 업무 알려줘",
            createdAt: "2026-06-05 09:30",
          },
          {
            id: "project-002-assistant-1",
            role: "assistant",
            content:
              "현재 기준으로 테스트 계획 검토와 화면 목록 정리가 지연 위험으로 보입니다.",
            createdAt: "2026-06-05 09:31",
          },
          {
            id: "project-002-user-2",
            role: "user",
            content: "다음 주 마일스톤도 확인해줘",
            createdAt: "2026-06-05 09:35",
          },
          {
            id: "project-002-assistant-2",
            role: "assistant",
            content:
              "다음 주에는 화면 설계서 리뷰 완료와 통합 테스트 준비가 주요 마일스톤입니다.",
            createdAt: "2026-06-05 09:36",
          },
        ],
      },
      {
        conversationId: "project-002-rfp",
        title: "RFP 분석",
        createdAt: "2026-06-06 15:10",
        updatedAt: "2026-06-06 15:12",
        messages: [
          {
            id: "project-002-rfp-user-1",
            role: "user",
            content: "RFP 기준으로 주요 산출물 목록 알려줘",
            createdAt: "2026-06-06 15:10",
          },
          {
            id: "project-002-rfp-assistant-1",
            role: "assistant",
            content:
              "요구사항 정의서, 화면 목록, 테스트 케이스, WBS, 주간보고서가 우선 산출물 후보입니다.",
            createdAt: "2026-06-06 15:12",
          },
        ],
      },
    ],
  },
};

export const createInitialConversationTitle = () => "새 채팅";
