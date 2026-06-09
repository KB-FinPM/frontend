const MAX_RECOMMENDATIONS = 7;

export const COMMAND_RECOMMENDATION_TYPES = {
  DEFAULT: "DEFAULT",
};

const DEFAULT_COMMANDS = [
  "요구사항 명세서 생성해줘",
  "구축요건정의서를 기준으로 요구사항 정리해줘",
  "회의록에서 할 일 뽑아줘",
  "WBS 기준으로 이번 주 일정 알려줘",
  "프로그램 목록 만들어줘",
];

const wait = (delay = 40) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });

export const normalizeCommandText = (commandText = "") =>
  String(commandText).replace(/\s+/g, " ").trim().toLowerCase();

const createRecommendation = (commandText) => ({
  commandText,
  type: COMMAND_RECOMMENDATION_TYPES.DEFAULT,
  reason: "기본 PM 업무 명령어",
});

export const getDefaultCommands = async () => {
  await wait();
  return DEFAULT_COMMANDS.slice(0, MAX_RECOMMENDATIONS).map(createRecommendation);
};

export const getCommandRecommendations = async () => getDefaultCommands();

export const saveCommandUsage = async () => null;
