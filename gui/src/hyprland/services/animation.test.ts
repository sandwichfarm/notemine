import { describe, it, expect } from 'vitest';
import { AnimationService } from './animation';

describe('AnimationService - Hyprland-style Animation System', () => {
  describe('Bezier Curve Management', () => {
    describe('when retrieving bezier curves', () => {
      it('should return correct bezier values for known curves', () => {
        // Given known curve names
        const curves = [
          { name: 'linear', expected: 'cubic-bezier(0, 0, 1, 1)' },
          { name: 'easeIn', expected: 'cubic-bezier(0.42, 0, 1, 1)' },
          { name: 'easeOut', expected: 'cubic-bezier(0, 0, 0.58, 1)' },
          { name: 'default', expected: 'cubic-bezier(0.05, 0.9, 0.1, 1.05)' },
          { name: 'bounce', expected: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' }
        ];

        // When requesting each curve
        curves.forEach(({ name, expected }) => {
          const value = AnimationService.getBezierValue(name);
          
          // Then the correct bezier values should be returned
          expect(value).toBe(expected);
        });
      });

      it('should return full curve object with metadata', () => {
        // When requesting a bezier curve
        const curve = AnimationService.getBezierCurve('smooth');

        // Then it should include name, value, and points
        expect(curve).toHaveProperty('name', 'Smooth');
        expect(curve).toHaveProperty('value', 'cubic-bezier(0.25, 0.1, 0.25, 1)');
        expect(curve).toHaveProperty('points');
        expect(curve.points).toEqual([0.25, 0.1, 0.25, 1]);
      });

      it('should fallback to default for unknown curves', () => {
        // When requesting an unknown curve
        const value = AnimationService.getBezierValue('unknown-curve');
        const curve = AnimationService.getBezierCurve('non-existent');

        // Then it should return the default curve
        expect(value).toBe('cubic-bezier(0.05, 0.9, 0.1, 1.05)');
        expect(curve.name).toBe('Hyprland Default');
      });
    });

    describe('when listing available curves', () => {
      it('should return all curve names', () => {
        // When getting curve names
        const names = AnimationService.getCurveNames();

        // Then all predefined curves should be listed
        expect(names).toContain('linear');
        expect(names).toContain('easeIn');
        expect(names).toContain('easeOut');
        expect(names).toContain('easeInOut');
        expect(names).toContain('default');
        expect(names).toContain('smooth');
        expect(names).toContain('bounce');
        expect(names).toContain('fast');
        expect(names).toContain('slow');
        expect(names.length).toBe(9);
      });

      it('should return names in consistent order', () => {
        // When getting curve names multiple times
        const names1 = AnimationService.getCurveNames();
        const names2 = AnimationService.getCurveNames();

        // Then the order should be consistent
        expect(names1).toEqual(names2);
      });
    });

    describe('when creating custom bezier curves', () => {
      it('should generate valid CSS bezier string', () => {
        // Given custom bezier points
        const points: [number, number, number, number] = [0.1, 0.2, 0.3, 0.4];

        // When creating a custom curve
        const result = AnimationService.createCustomBezier(points);

        // Then valid CSS bezier string should be generated
        expect(result).toBe('cubic-bezier(0.1, 0.2, 0.3, 0.4)');
      });

      it('should handle edge case values', () => {
        // Given edge case bezier points
        const testCases: Array<[number, number, number, number]> = [
          [0, 0, 0, 0],
          [1, 1, 1, 1],
          [-0.5, 0, 1.5, 1],
          [0.5, -0.5, 0.5, 1.5]
        ];

        testCases.forEach(points => {
          // When creating curves with edge values
          const result = AnimationService.createCustomBezier(points);

          // Then it should still generate valid strings
          expect(result).toMatch(/^cubic-bezier\([\d\.\-]+,\s*[\d\.\-]+,\s*[\d\.\-]+,\s*[\d\.\-]+\)$/);
        });
      });

      it('should preserve precision of input values', () => {
        // Given precise bezier points
        const points: [number, number, number, number] = [0.123456, 0.234567, 0.345678, 0.456789];

        // When creating a custom curve
        const result = AnimationService.createCustomBezier(points);

        // Then precision should be preserved
        expect(result).toBe('cubic-bezier(0.123456, 0.234567, 0.345678, 0.456789)');
      });
    });

    describe('Hyprland Compatibility', () => {
      it('should provide Hyprland-compatible default curve', () => {
        // Given Hyprland's default animation curve
        const hyprlandDefault = AnimationService.getBezierCurve('default');

        // Then it should match Hyprland's default values
        expect(hyprlandDefault.points).toEqual([0.05, 0.9, 0.1, 1.05]);
        expect(hyprlandDefault.name).toContain('Hyprland');
      });

      it('should include overshoot curves for bounce effects', () => {
        // Given bounce curve
        const bounce = AnimationService.getBezierCurve('bounce');

        // Then it should have overshoot values (negative or > 1)
        const [x1, y1, x2, y2] = bounce.points;
        const hasOvershoot = y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1;
        expect(hasOvershoot).toBe(true);
      });

      it('should provide performance-optimized curves', () => {
        // Given performance curves
        const fast = AnimationService.getBezierCurve('fast');
        const smooth = AnimationService.getBezierCurve('smooth');

        // Then they should have appropriate characteristics
        // Fast curve should reach target quickly (low x2 value)
        expect(fast.points[2]).toBeLessThan(0.3);
        
        // Smooth curve should have balanced control points
        const [x1, y1, x2, y2] = smooth.points;
        expect(Math.abs(x1 - x2)).toBeLessThan(0.5);
      });
    });

    describe('Animation Curve Categories', () => {
      it('should provide standard easing curves', () => {
        // Standard easing functions should be available
        const standardEasings = ['linear', 'easeIn', 'easeOut', 'easeInOut'];
        
        standardEasings.forEach(name => {
          const curve = AnimationService.getBezierCurve(name);
          expect(curve).toBeDefined();
          expect(curve.name).toBeTruthy();
        });
      });

      it('should provide stylized effect curves', () => {
        // Stylized curves for special effects
        const effectCurves = ['bounce', 'smooth', 'default'];
        
        effectCurves.forEach(name => {
          const curve = AnimationService.getBezierCurve(name);
          expect(curve).toBeDefined();
          expect(curve.value).toMatch(/^cubic-bezier/);
        });
      });

      it('should provide speed-based curves', () => {
        // Speed variants
        const speedCurves = ['fast', 'slow'];
        
        speedCurves.forEach(name => {
          const curve = AnimationService.getBezierCurve(name);
          expect(curve).toBeDefined();
        });
      });
    });
});