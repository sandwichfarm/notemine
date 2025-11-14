/**
 * Phase 2: Global Visibility Observer Service
 *
 * Provides a single IntersectionObserver for the entire application to eliminate
 * observer explosion (creating multiple observers per note).
 *
 * Features:
 * - Dwell time: Elements must be visible for N ms before triggering callback
 * - Root margin: Pre-heat elements before they enter viewport
 * - Cancelable: Can unregister elements that scroll away
 */

type VisibilityCallback = (element: Element) => void;

interface RegistrationConfig {
  element: Element;
  onVisible: VisibilityCallback;
  onLeave?: VisibilityCallback; // Optional callback when element leaves viewport
  dwellMs?: number; // Override default dwell time for this element
}

interface Registration extends RegistrationConfig {
  dwellTimer: number | null; // Timer ID for dwell timeout
}

class VisibilityObserverService {
  private observer: IntersectionObserver | null = null;
  private registrations = new Map<Element, Registration>();
  private defaultDwellMs: number;
  private rootMarginPx: number;
  private debugMode = false;

  constructor(dwellMs: number = 300, rootMarginPx: number = 300) {
    this.defaultDwellMs = dwellMs;
    this.rootMarginPx = rootMarginPx;
  }

  /**
   * Initialize or reconfigure the observer
   */
  public configure(dwellMs: number, rootMarginPx: number, debugMode: boolean = false): void {
    // Sanitize inputs to avoid DOMException (must be valid pixels or percent)
    const safeDwell = Number.isFinite(dwellMs as number) && (dwellMs as number) >= 0 ? (dwellMs as number) : 300;
    const safeRootMargin = Number.isFinite(rootMarginPx as number) ? (rootMarginPx as number) : 300;

    this.defaultDwellMs = safeDwell;
    this.rootMarginPx = safeRootMargin;
    this.debugMode = debugMode;

    // Recreate observer with new config
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.createObserver();

    // Re-observe all registered elements
    if (this.observer) {
      this.registrations.forEach((_, element) => {
        this.observer!.observe(element);
      });
    }
  }

  /**
   * Create the IntersectionObserver instance
   */
  private createObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      console.warn('[VisibilityObserver] IntersectionObserver not supported');
      return;
    }

    // Final guard against invalid rootMargin
    const rootMarginValue = Number.isFinite(this.rootMarginPx) ? `${this.rootMarginPx}px` : '300px';

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const registration = this.registrations.get(entry.target);
          if (!registration) return;

          if (entry.isIntersecting) {
            // Element entered viewport - start dwell timer
            if (registration.dwellTimer === null) {
              const dwellMs = registration.dwellMs ?? this.defaultDwellMs;

              if (this.debugMode) {
                console.log(`[VisibilityObserver] Element entering, starting ${dwellMs}ms dwell timer`);
              }

              registration.dwellTimer = window.setTimeout(() => {
                // Dwell time elapsed - trigger callback
                if (this.debugMode) {
                  console.log('[VisibilityObserver] Dwell complete, triggering callback');
                }
                registration.onVisible(entry.target);
                registration.dwellTimer = null;
              }, dwellMs);
            }
          } else {
            // Element left viewport - cancel dwell timer and trigger onLeave
            if (registration.dwellTimer !== null) {
              if (this.debugMode) {
                console.log('[VisibilityObserver] Element left viewport, canceling dwell timer');
              }
              window.clearTimeout(registration.dwellTimer);
              registration.dwellTimer = null;
            }

            // Trigger onLeave callback if provided
            if (registration.onLeave) {
              if (this.debugMode) {
                console.log('[VisibilityObserver] Element left viewport, triggering onLeave callback');
              }
              registration.onLeave(entry.target);
            }
          }
        });
      },
      {
        rootMargin: rootMarginValue,
        threshold: 0,
      }
    );
  }

  /**
   * Register an element for visibility tracking
   */
  public register(config: RegistrationConfig): void {
    // Don't register twice
    if (this.registrations.has(config.element)) {
      if (this.debugMode) {
        console.warn('[VisibilityObserver] Element already registered, skipping');
      }
      return;
    }

    // Ensure observer exists
    if (!this.observer) {
      this.createObserver();
    }

    if (!this.observer) {
      console.error('[VisibilityObserver] Failed to create observer');
      return;
    }

    // Store registration
    const registration: Registration = {
      ...config,
      dwellTimer: null,
    };
    this.registrations.set(config.element, registration);

    // Start observing
    this.observer.observe(config.element);

    if (this.debugMode) {
      console.log(`[VisibilityObserver] Registered element (total: ${this.registrations.size})`);
    }
  }

  /**
   * Unregister an element (cancel tracking and cleanup)
   */
  public unregister(element: Element): void {
    const registration = this.registrations.get(element);
    if (!registration) return;

    // Cancel dwell timer if active
    if (registration.dwellTimer !== null) {
      window.clearTimeout(registration.dwellTimer);
      registration.dwellTimer = null;
    }

    // Stop observing
    if (this.observer) {
      this.observer.unobserve(element);
    }

    // Remove from map
    this.registrations.delete(element);

    if (this.debugMode) {
      console.log(`[VisibilityObserver] Unregistered element (remaining: ${this.registrations.size})`);
    }
  }

  /**
   * Cleanup all registrations and disconnect observer
   */
  public destroy(): void {
    // Cancel all dwell timers
    this.registrations.forEach((registration) => {
      if (registration.dwellTimer !== null) {
        window.clearTimeout(registration.dwellTimer);
      }
    });

    // Clear registrations
    this.registrations.clear();

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.debugMode) {
      console.log('[VisibilityObserver] Destroyed');
    }
  }

  /**
   * Get stats for debugging
   */
  public getStats(): { registrationCount: number; activeTimers: number } {
    let activeTimers = 0;
    this.registrations.forEach((reg) => {
      if (reg.dwellTimer !== null) activeTimers++;
    });

    return {
      registrationCount: this.registrations.size,
      activeTimers,
    };
  }
}

// Global singleton instance
let globalObserver: VisibilityObserverService | null = null;

/**
 * Get or create the global visibility observer
 */
export function getVisibilityObserver(): VisibilityObserverService {
  if (!globalObserver) {
    globalObserver = new VisibilityObserverService();
  }
  return globalObserver;
}

/**
 * Configure the global visibility observer
 */
export function configureVisibilityObserver(
  dwellMs: number,
  rootMarginPx: number,
  debugMode: boolean = false
): void {
  getVisibilityObserver().configure(dwellMs, rootMarginPx, debugMode);
}

/**
 * Destroy the global observer (for cleanup/testing)
 */
export function destroyVisibilityObserver(): void {
  if (globalObserver) {
    globalObserver.destroy();
    globalObserver = null;
  }
}
