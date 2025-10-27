/**
 * Track relay statistics - which relays are returning which events
 */

interface RelayEventStats {
  url: string;
  eventCount: number;
  lastEventAt: number;
}

class RelayStatsTracker {
  private stats = new Map<string, RelayEventStats>();

  /**
   * Record that an event was received from a relay
   */
  recordEvent(relayUrl: string, _eventId: string) {
    const existing = this.stats.get(relayUrl);

    if (existing) {
      existing.eventCount++;
      existing.lastEventAt = Date.now();
    } else {
      this.stats.set(relayUrl, {
        url: relayUrl,
        eventCount: 1,
        lastEventAt: Date.now(),
      });
    }
  }

  /**
   * Get statistics for a specific relay
   */
  getRelayStats(relayUrl: string): RelayEventStats | undefined {
    return this.stats.get(relayUrl);
  }

  /**
   * Get all relay statistics
   */
  getAllStats(): RelayEventStats[] {
    return Array.from(this.stats.values()).sort((a, b) => b.eventCount - a.eventCount);
  }

  /**
   * Get total event count across all relays
   */
  getTotalEventCount(): number {
    return Array.from(this.stats.values()).reduce((sum, stat) => sum + stat.eventCount, 0);
  }

  /**
   * Reset all statistics
   */
  reset() {
    this.stats.clear();
  }
}

// Singleton instance
export const relayStatsTracker = new RelayStatsTracker();
