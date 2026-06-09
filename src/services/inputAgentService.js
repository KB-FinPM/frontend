export const normalizeInputText = (commandText = "") =>
  String(commandText).replace(/\s+/g, " ").trim();
