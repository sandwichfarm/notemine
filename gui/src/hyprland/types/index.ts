/**
 * Hyprland types and interfaces
 */

export type WindowType = 'normal' | 'floating' | 'fullscreen' | 'pinned';

export interface HyprlandWindow {
  id: string;
  title: string;
  class: string;
  type: WindowType;
  focused: boolean;
  urgent: boolean;
  pinned: boolean;
  fullscreen: boolean;
  minimized: boolean;
  grouped?: string; // Group ID if part of a group
  rules?: WindowRule[];
  // Visual properties
  opacity: number;
  rounding: number;
  blur: boolean;
  shadow: boolean;
  shadowRange?: number;
  // Animation properties
  animationsEnabled?: boolean;
  windowDuration?: number;
  fadeDuration?: number;
  animationCurve?: string;
  // Animation state
  animating: boolean;
  animationTarget?: Partial<Rectangle>;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowRule {
  match: {
    class?: string | RegExp;
    title?: string | RegExp;
    type?: WindowType;
  };
  actions: {
    float?: boolean;
    pin?: boolean;
    opacity?: number;
    rounding?: number;
    workspace?: number;
    size?: [number, number];
    position?: [number, number];
  };
}

export interface Workspace {
  id: number;
  name: string;
  windows: string[]; // Window IDs
  focused: boolean;
  special: boolean;
}

export interface Monitor {
  id: string;
  name: string;
  width: number;
  height: number;
  scale: number;
  activeWorkspace: number;
}

export interface HyprlandConfig {
  general: {
    gaps_in: number;
    gaps_out: number;
    border_size: number;
    col_active_border: string;
    col_inactive_border: string;
    resize_on_border: boolean;
    layout: 'dwindle' | 'master';
  };
  decoration: {
    rounding: number;
    blur: boolean;
    blur_size: number;
    blur_passes: number;
    drop_shadow: boolean;
    shadow_range: number;
    shadow_render_power: number;
    col_shadow: string;
  };
  animations: {
    enabled: boolean;
    bezier: Record<string, [number, number, number, number]>;
    animation: Record<string, {
      enabled: boolean;
      duration: number;
      curve: string;
    }>;
  };
  input: {
    follow_mouse: 0 | 1 | 2;
    float_switch_override_focus: boolean;
    mouse_refocus: boolean;
  };
  binds: {
    [key: string]: string; // e.g., "SUPER,Q" -> "killactive"
  };
}

export interface AnimationState {
  windowId: string;
  property: 'position' | 'size' | 'opacity' | 'all';
  from: any;
  to: any;
  startTime: number;
  duration: number;
  curve: string;
  onComplete?: () => void;
}