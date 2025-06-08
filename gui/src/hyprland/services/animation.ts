/**
 * Animation service for Hyprland-style animations
 */

export interface BezierCurve {
  name: string;
  value: string;
  points: [number, number, number, number];
}

export class AnimationService {
  // Hyprland-compatible bezier curves
  static readonly bezierCurves: Record<string, BezierCurve> = {
    linear: {
      name: 'Linear',
      value: 'cubic-bezier(0, 0, 1, 1)',
      points: [0, 0, 1, 1]
    },
    easeIn: {
      name: 'Ease In',
      value: 'cubic-bezier(0.42, 0, 1, 1)',
      points: [0.42, 0, 1, 1]
    },
    easeOut: {
      name: 'Ease Out',
      value: 'cubic-bezier(0, 0, 0.58, 1)',
      points: [0, 0, 0.58, 1]
    },
    easeInOut: {
      name: 'Ease In-Out',
      value: 'cubic-bezier(0.42, 0, 0.58, 1)',
      points: [0.42, 0, 0.58, 1]
    },
    default: {
      name: 'Hyprland Default',
      value: 'cubic-bezier(0.05, 0.9, 0.1, 1.05)',
      points: [0.05, 0.9, 0.1, 1.05]
    },
    smooth: {
      name: 'Smooth',
      value: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      points: [0.25, 0.1, 0.25, 1]
    },
    bounce: {
      name: 'Bounce',
      value: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      points: [0.68, -0.55, 0.265, 1.55]
    },
    fast: {
      name: 'Fast',
      value: 'cubic-bezier(0, 0, 0.2, 1)',
      points: [0, 0, 0.2, 1]
    },
    slow: {
      name: 'Slow',
      value: 'cubic-bezier(0.4, 0, 0.6, 1)',
      points: [0.4, 0, 0.6, 1]
    }
  };

  /**
   * Get bezier curve by name
   */
  static getBezierCurve(name: string): BezierCurve {
    return this.bezierCurves[name] || this.bezierCurves.default;
  }

  /**
   * Get bezier value for CSS
   */
  static getBezierValue(name: string): string {
    return this.getBezierCurve(name).value;
  }

  /**
   * Get all available curve names
   */
  static getCurveNames(): string[] {
    return Object.keys(this.bezierCurves);
  }

  /**
   * Create custom bezier curve
   */
  static createCustomBezier(points: [number, number, number, number]): string {
    return `cubic-bezier(${points.join(', ')})`;
  }
}