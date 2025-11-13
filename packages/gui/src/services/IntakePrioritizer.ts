/**
 * Intake Prioritizer Service
 * Computes priority scores combining PoW strength and recency for intake ordering
 * Note: Priority affects processing/intake order only, NOT on-screen display order
 */

import type { FeedNote, PriorityConfig } from '../types/FeedTypes';
import { DEFAULT_PRIORITY_CONFIG } from '../types/FeedTypes';
import { getPowDifficultyFromId } from '../lib/pow';

/**
 * IntakePrioritizer class for computing and sorting notes by priority
 */
export class IntakePrioritizer {
  private config: PriorityConfig;

  constructor(config: Partial<PriorityConfig> = {}) {
    this.config = { ...DEFAULT_PRIORITY_CONFIG, ...config };
  }

  /**
   * Computes PoW strength using logarithmic scaling
   * This compresses the range and prevents extreme PoW from dominating
   * @param powBits - PoW difficulty in bits (0 if none)
   * @returns Normalized strength value (0+)
   */
  private powStrength(powBits: number): number {
    if (powBits <= 0) return 0;
    return Math.log2(1 + powBits);
  }

  /**
   * Computes recency decay using exponential decay
   * Recent notes get higher scores, with configurable half-life
   * @param ageMs - Age of note in milliseconds
   * @returns Decay value between 0 and 1
   */
  private recencyDecay(ageMs: number): number {
    if (ageMs < 0) return 1; // Future dates treated as fresh
    const { recencyHalfLifeMs } = this.config;
    return Math.exp(-ageMs / recencyHalfLifeMs);
  }

  /**
   * Computes priority score for a single note
   * @param note - Feed note to score
   * @param nowTimestamp - Current timestamp in seconds (for age calculation)
   * @returns Priority score (higher = process sooner)
   */
  public computePriority(note: FeedNote, nowTimestamp?: number): number {
    const now = nowTimestamp ?? Math.floor(Date.now() / 1000);
    const ageSeconds = now - note.created_at;
    const ageMs = ageSeconds * 1000;

    // Get PoW difficulty (fallback to computing from event ID if not cached)
    const powBits = note.powBits ?? getPowDifficultyFromId(note.id);

    // Compute components
    const powComponent = this.powStrength(powBits);
    const recencyComponent = this.recencyDecay(ageMs);

    // Weighted sum
    const { powCoefficient, freshnessCoefficient } = this.config;
    const priority =
      powCoefficient * powComponent +
      freshnessCoefficient * recencyComponent;

    return priority;
  }

  /**
   * Assigns priority scores to notes in-place
   * Modifies the `priority` field of each FeedNote
   * @param notes - Array of notes to prioritize
   * @param nowTimestamp - Optional current timestamp (defaults to now)
   */
  public assignPriorities(
    notes: FeedNote[],
    nowTimestamp?: number
  ): void {
    const now = nowTimestamp ?? Math.floor(Date.now() / 1000);

    for (const note of notes) {
      note.priority = this.computePriority(note, now);
    }
  }

  /**
   * Sorts notes by priority (highest first)
   * Returns a new sorted array, does not mutate input
   * @param notes - Array of notes to sort
   * @returns New array sorted by priority descending
   */
  public sortByPriority(notes: FeedNote[]): FeedNote[] {
    // Ensure all notes have priority scores
    const notesWithPriority = notes.map(note => {
      if (note.priority === undefined) {
        return {
          ...note,
          priority: this.computePriority(note)
        };
      }
      return note;
    });

    // Sort descending (highest priority first)
    return notesWithPriority.sort((a, b) => b.priority! - a.priority!);
  }

  /**
   * Prioritizes and sorts a batch of notes in one operation
   * Modifies priority field and returns sorted array
   * @param notes - Array of notes to prioritize
   * @param nowTimestamp - Optional current timestamp
   * @returns Sorted array (same objects as input, but reordered)
   */
  public prioritize(
    notes: FeedNote[],
    nowTimestamp?: number
  ): FeedNote[] {
    this.assignPriorities(notes, nowTimestamp);
    return notes.sort((a, b) => b.priority! - a.priority!);
  }

  /**
   * Updates the prioritization configuration
   * @param config - Partial config to merge with existing
   */
  public updateConfig(config: Partial<PriorityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets the current configuration
   * @returns Current priority configuration
   */
  public getConfig(): PriorityConfig {
    return { ...this.config };
  }

  /**
   * Computes expected priority for given PoW bits and age
   * Useful for debugging and understanding priority distribution
   * @param powBits - PoW difficulty
   * @param ageMs - Age in milliseconds
   * @returns Expected priority score
   */
  public estimatePriority(powBits: number, ageMs: number): number {
    const powComponent = this.powStrength(powBits);
    const recencyComponent = this.recencyDecay(ageMs);
    const { powCoefficient, freshnessCoefficient } = this.config;

    return powCoefficient * powComponent + freshnessCoefficient * recencyComponent;
  }

  /**
   * Applies per-author limiting to prevent flooding
   * Returns notes with balanced representation per author
   * @param notes - Input notes (assumed pre-sorted by priority)
   * @param maxPerAuthor - Maximum notes per author to keep
   * @returns Filtered notes maintaining priority order
   */
  public limitPerAuthor(
    notes: FeedNote[],
    maxPerAuthor: number = 2
  ): FeedNote[] {
    const authorCounts = new Map<string, number>();
    const filtered: FeedNote[] = [];

    for (const note of notes) {
      const count = authorCounts.get(note.author) ?? 0;
      if (count < maxPerAuthor) {
        filtered.push(note);
        authorCounts.set(note.author, count + 1);
      }
    }

    return filtered;
  }

  /**
   * Trims overfetched notes to desired count (Phase 1: Overfetch trimming)
   * Assumes notes are already sorted by priority
   * @param notes - Prioritized notes to trim
   * @param maxCount - Maximum number of notes to keep
   * @returns Top N notes by priority
   */
  public trim(notes: FeedNote[], maxCount: number): FeedNote[] {
    if (notes.length <= maxCount) {
      return notes;
    }
    return notes.slice(0, maxCount);
  }
}

/**
 * Singleton instance for convenience
 * Can be imported and used directly without instantiation
 */
export const defaultPrioritizer = new IntakePrioritizer();

/**
 * Convenience function: prioritize notes using default config
 * @param notes - Notes to prioritize
 * @returns Sorted notes by priority
 */
export function prioritizeNotes(notes: FeedNote[]): FeedNote[] {
  return defaultPrioritizer.prioritize(notes);
}
