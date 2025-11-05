/**
 * Report Service (NIP-56)
 * Handles building and publishing kind 1984 report events
 */

import type { NostrEvent } from 'nostr-tools';

/**
 * Standard report types per NIP-56
 */
export type ReportType =
  | 'nudity'         // Depictions of nudity, porn, etc.
  | 'malware'        // Virus, malware, spyware, etc.
  | 'profanity'      // Profanity, hateful speech, etc.
  | 'illegal'        // Potentially illegal content
  | 'spam'           // Spam
  | 'impersonation'  // Fake profile (profiles only)
  | 'other';         // Other reasons

/**
 * Input for creating a report event
 */
export interface ReportInput {
  /** Event ID for reporting notes (mutually exclusive with pubkey) */
  eventId?: string;
  /** Pubkey for reporting profiles (mutually exclusive with eventId) */
  pubkey?: string;
  /** Report type (reason) */
  reason: ReportType;
  /** Optional kind of the target event (for filtering) */
  targetKind?: number;
  /** Optional free-form comment explaining the report */
  comment?: string;
}

/**
 * Build a kind 1984 report event (unsigned)
 *
 * @param input - Report input parameters
 * @param reporterPubkey - Public key of the user making the report
 * @returns Unsigned event ready for mining
 *
 * @throws Error if neither eventId nor pubkey is provided
 * @throws Error if both eventId and pubkey are provided
 */
export function buildReportEvent(
  input: ReportInput,
  reporterPubkey: string
): Omit<NostrEvent, 'id' | 'sig'> {
  const { eventId, pubkey, reason, targetKind, comment } = input;

  // Validation: must have exactly one of eventId or pubkey
  if (!eventId && !pubkey) {
    throw new Error('Report must target either an event (eventId) or a profile (pubkey)');
  }
  if (eventId && pubkey && targetKind !== undefined) {
    // It's okay to have both if we're reporting a note AND tagging its author
    // But only one gets the report type tag
  }

  const tags: string[][] = [];

  // Add e tag for note reports
  if (eventId) {
    tags.push(['e', eventId, reason]);

    // Add p tag for the note's author if provided
    if (pubkey) {
      tags.push(['p', pubkey]);
    }
  }
  // Add p tag for profile reports (without eventId)
  else if (pubkey) {
    tags.push(['p', pubkey, reason]);
  }

  // Add optional k tag for target kind
  if (targetKind !== undefined) {
    tags.push(['k', targetKind.toString()]);
  }

  // Build event
  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    kind: 1984,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: comment || '', // Free-form reason text (optional)
    pubkey: reporterPubkey,
  };

  return event;
}

/**
 * Get user-friendly label for report type
 */
export function getReportTypeLabel(type: ReportType): string {
  const labels: Record<ReportType, string> = {
    nudity: 'Nudity / NSFW',
    malware: 'Malware / Malicious',
    profanity: 'Hateful Speech',
    illegal: 'Illegal Content',
    spam: 'Spam',
    impersonation: 'Impersonation',
    other: 'Other',
  };
  return labels[type];
}

/**
 * Get description for report type
 */
export function getReportTypeDescription(type: ReportType): string {
  const descriptions: Record<ReportType, string> = {
    nudity: 'Adult content, pornography, or explicit imagery',
    malware: 'Viruses, malware, or malicious software',
    profanity: 'Hate speech, harassment, or abusive language',
    illegal: 'Content that may be illegal in some jurisdiction',
    spam: 'Unwanted or repetitive content',
    impersonation: 'Fake profile pretending to be someone else',
    other: 'Other reasons not listed above',
  };
  return descriptions[type];
}

/**
 * Get all report types as options for UI
 */
export function getAllReportTypes(): Array<{
  value: ReportType;
  label: string;
  description: string;
}> {
  const types: ReportType[] = [
    'spam',
    'impersonation',
    'nudity',
    'profanity',
    'illegal',
    'malware',
    'other',
  ];

  return types.map((type) => ({
    value: type,
    label: getReportTypeLabel(type),
    description: getReportTypeDescription(type),
  }));
}
