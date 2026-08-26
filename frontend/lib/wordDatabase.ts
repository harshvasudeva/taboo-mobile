// Word Database Types - NO ACTUAL WORD DATA IS EXPOSED TO CLIENT
// All word selection and scoring happens on the server only
// This file only contains type definitions for client-side code

export interface Word {
  word: string;
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
}

// Point ranges by difficulty (for display/UI purposes only)
export const POINT_RANGES = {
  easy: { min: 5, max: 12 },
  medium: { min: 13, max: 25 },
  hard: { min: 26, max: 50 }
};

// Distribution patterns are only used server-side now
// This is kept for type reference only
export interface RoundDistribution {
  easy: number;
  medium: number;
  hard: number;
}
