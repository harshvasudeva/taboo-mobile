/**
 * Shared package root — platform-independent Taboo game logic + protocol.
 *
 * Consumed by:
 *  - mobile/ (Expo) via Metro watchFolders + tsconfig path alias "@shared/*"
 *  - cloudflare/signaling (Worker) via relative imports (types only)
 *  - tests via vitest
 *
 * Rules:
 *  - No React / React Native / Node built-ins / DOM APIs allowed here.
 *  - No secrets. Nothing here should need environment variables.
 */
export * from "./types/player";
export * from "./types/room";
export * from "./types/game";
export * from "./game/scoring";
export * from "./game/rounds";
export * from "./game/validation";
export * from "./game/hostEngine";
export * from "./game/clientView";
export * from "./networking/events";
export * from "./networking/protocol";
export * from "./networking/transport";
export * from "./words/wordSource";
