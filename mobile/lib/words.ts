/**
 * Host-authoritative game word source for the mobile app.
 * The FULL deck stays bundled on-device and is instantiated by the HOST only.
 * It is never transmitted — guests only ever receive the active card
 * (see docs/serverless-webrtc.md §security).
 */
import rawDatabase from '../assets/wordDatabase.json';
import { loadWordDatabase } from '@shared/words/wordSource';
import type { RawWordDatabase, WordDeck } from '@shared/words/wordSource';

let deckSingleton: WordDeck | null = null;

export function getHostDeck(): WordDeck {
  deckSingleton ??= loadWordDatabase(rawDatabase as RawWordDatabase);
  return deckSingleton;
}
