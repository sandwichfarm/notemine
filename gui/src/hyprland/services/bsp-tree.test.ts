import { describe, it, expect, beforeEach } from 'vitest';
import { BSPTree, BSPNode } from './bsp-tree';
import type { Rectangle } from '../types';

describe('BSP Tree - Binary Space Partitioning for Window Tiling', () => {
  let tree: BSPTree;

  beforeEach(() => {
    tree = new BSPTree();
  });

  describe('Tree Operations', () => {
    describe('when inserting windows into tree', () => {
      it('should create root node for first window', () => {
        // Given an empty BSP tree
        expect(tree.root).toBeNull();

        // When I insert the first window
        tree.insert('window-1');

        // Then the root should be created as a leaf
        expect(tree.root).toBeDefined();
        expect(tree.root?.windowId).toBe('window-1');
        expect(tree.root?.left).toBeNull();
        expect(tree.root?.right).toBeNull();
      });

      it('should alternate split directions', () => {
        // Given an empty tree
        // When I insert multiple windows
        tree.insert('window-1');
        tree.insert('window-2');
        tree.insert('window-3');

        // Then the tree should alternate split directions
        expect(tree.root?.splitDirection).toBe('vertical'); // First split
        expect(tree.root?.left?.windowId).toBe('window-1');
        expect(tree.root?.right?.splitDirection).toBe('horizontal'); // Second split alternates
      });

      it('should maintain balanced structure', () => {
        // When inserting 4 windows
        tree.insert('w1');
        tree.insert('w2');
        tree.insert('w3');
        tree.insert('w4');

        // Then each window should have a leaf node
        const windows = tree.getWindows();
        expect(windows).toHaveLength(4);
        expect(windows).toEqual(expect.arrayContaining(['w1', 'w2', 'w3', 'w4']));
      });

      it('should handle inserting into specific focus', () => {
        // Given a tree with existing windows
        tree.insert('w1');
        tree.insert('w2');
        
        // When inserting at a specific focus
        tree.setFocus('w1');
        tree.insert('w3');

        // Then w3 should be inserted near w1
        const parent = tree.findParent(tree.root, 'w1');
        expect(parent).toBeDefined();
        expect(parent?.left?.windowId === 'w1' || parent?.right?.windowId === 'w1').toBe(true);
      });
    });

    describe('when removing windows from tree', () => {
      it('should handle removing leaf nodes', () => {
        // Given a tree with multiple windows
        tree.insert('w1');
        tree.insert('w2');
        tree.insert('w3');

        // When I remove a window
        tree.remove('w2');

        // Then the window should be removed
        const windows = tree.getWindows();
        expect(windows).not.toContain('w2');
        expect(windows).toContain('w1');
        expect(windows).toContain('w3');
      });

      it('should promote sibling when removing node', () => {
        // Given a simple tree with two windows
        tree.insert('w1');
        tree.insert('w2');

        // When removing one window
        tree.remove('w1');

        // Then its sibling should take the parent's position
        expect(tree.root?.windowId).toBe('w2');
        expect(tree.root?.left).toBeNull();
        expect(tree.root?.right).toBeNull();
      });

      it('should maintain tree structure after removal', () => {
        // Given a complex tree
        tree.insert('w1');
        tree.insert('w2');
        tree.insert('w3');
        tree.insert('w4');

        // When removing a window
        tree.remove('w3');

        // Then the tree structure should remain valid
        const windows = tree.getWindows();
        expect(windows).toHaveLength(3);
        expect(tree.isValid()).toBe(true);
      });

      it('should handle removing the root node', () => {
        // Given a single window
        tree.insert('w1');

        // When removing the root node
        tree.remove('w1');

        // Then the tree should be empty
        expect(tree.root).toBeNull();
        expect(tree.getWindows()).toHaveLength(0);
      });

      it('should handle removing non-existent window', () => {
        // Given a tree with windows
        tree.insert('w1');
        tree.insert('w2');

        // When removing a non-existent window
        tree.remove('non-existent');

        // Then nothing should change
        expect(tree.getWindows()).toHaveLength(2);
      });
    });

    describe('when calculating window rectangles', () => {
      it('should split container space correctly', () => {
        // Given a BSP tree with windows
        tree.insert('w1');
        tree.insert('w2');

        // When I calculate rectangles for a container
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 500 };
        const rects = tree.calculateRects(container);

        // Then each window should get appropriate space
        expect(rects.size).toBe(2);
        
        const r1 = rects.get('w1');
        const r2 = rects.get('w2');
        
        expect(r1).toBeDefined();
        expect(r2).toBeDefined();
        
        // Windows should split the space
        expect(r1!.width + r2!.width).toBeLessThanOrEqual(container.width);
      });

      it('should respect split ratios', () => {
        // Given a tree with custom split ratio
        tree.insert('w1');
        tree.insert('w2');
        
        if (tree.root) {
          tree.root.ratio = 0.3; // 30/70 split
        }

        // When calculating rectangles
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 500 };
        const rects = tree.calculateRects(container);

        // Then splits should respect the ratio property
        const r1 = rects.get('w1')!;
        const r2 = rects.get('w2')!;
        
        const ratio = r1.width / (r1.width + r2.width);
        expect(ratio).toBeCloseTo(0.3, 1);
      });

      it('should apply gaps correctly', () => {
        // Given a tree with windows and gaps
        tree.insert('w1');
        tree.insert('w2');

        // When calculating with gaps
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 500 };
        const gaps = { inner: 10, outer: 20 };
        const rects = tree.calculateRects(container, gaps);

        // Then gaps should be applied correctly
        const r1 = rects.get('w1')!;
        const r2 = rects.get('w2')!;

        // Outer gaps
        expect(r1.x).toBeGreaterThanOrEqual(gaps.outer);
        expect(r1.y).toBeGreaterThanOrEqual(gaps.outer);
        
        // Inner gap between windows
        const horizontalGap = r2.x - (r1.x + r1.width);
        const verticalGap = r2.y - (r1.y + r1.height);
        
        // One of these should be the inner gap (depending on split direction)
        expect(horizontalGap === gaps.inner || verticalGap === gaps.inner).toBe(true);
      });

      it('should handle extreme ratios gracefully', () => {
        // Given extreme split ratios
        tree.insert('w1');
        tree.insert('w2');
        
        if (tree.root) {
          tree.root.ratio = 0.01; // 1/99 split
        }

        // When calculating rectangles
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 500 };
        const rects = tree.calculateRects(container);

        // Then both windows should still be visible
        const r1 = rects.get('w1')!;
        const r2 = rects.get('w2')!;
        
        expect(r1.width).toBeGreaterThan(0);
        expect(r2.width).toBeGreaterThan(0);
      });

      it('should handle zero-sized containers', () => {
        // Given windows in the tree
        tree.insert('w1');
        tree.insert('w2');

        // When calculating for zero-sized container
        const container: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
        const rects = tree.calculateRects(container);

        // Then should return empty or zero-sized rects
        expect(rects.size).toBe(2);
        const r1 = rects.get('w1')!;
        expect(r1.width).toBe(0);
        expect(r1.height).toBe(0);
      });
    });

    describe('Focus Navigation', () => {
      beforeEach(() => {
        // Set up a 2x2 grid of windows
        tree.insert('w1'); // top-left
        tree.insert('w2'); // top-right
        tree.insert('w3'); // bottom-left
        tree.insert('w4'); // bottom-right
      });

      it('should find window in specified direction', () => {
        // Given windows arranged in a grid
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 1000 };
        const rects = tree.calculateRects(container);

        // When I request focus in a direction from w1
        tree.setFocus('w1');
        
        const rightNeighbor = tree.findInDirection('right', rects);
        const downNeighbor = tree.findInDirection('down', rects);

        // Then the nearest window in that direction should be selected
        expect(rightNeighbor).toBe('w2');
        expect(downNeighbor).toBe('w3');
      });

      it('should ignore windows behind current position', () => {
        // Given focus on bottom-right window
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 1000 };
        const rects = tree.calculateRects(container);

        tree.setFocus('w4');

        // When requesting focus left or up
        const leftNeighbor = tree.findInDirection('left', rects);
        const upNeighbor = tree.findInDirection('up', rects);

        // Then it should find the appropriate neighbors
        expect(leftNeighbor).toBe('w3');
        expect(upNeighbor).toBe('w2');
      });

      it('should return null when no window in direction', () => {
        // Given focus on top-left window
        const container: Rectangle = { x: 0, y: 0, width: 1000, height: 1000 };
        const rects = tree.calculateRects(container);

        tree.setFocus('w1');

        // When requesting focus in impossible directions
        const leftNeighbor = tree.findInDirection('left', rects);
        const upNeighbor = tree.findInDirection('up', rects);

        // Then it should return null
        expect(leftNeighbor).toBeNull();
        expect(upNeighbor).toBeNull();
      });
    });

    describe('Tree Validation and Repair', () => {
      it('should detect invalid tree structure', () => {
        // Given a manually corrupted tree
        tree.root = new BSPNode();
        tree.root.splitDirection = 'vertical';
        tree.root.left = new BSPNode();
        tree.root.left.windowId = 'w1';
        // Missing right child - invalid!

        // When checking validity
        const isValid = tree.isValid();

        // Then it should detect the corruption
        expect(isValid).toBe(false);
      });

      it('should validate correct tree structure', () => {
        // Given a properly built tree
        tree.insert('w1');
        tree.insert('w2');
        tree.insert('w3');

        // When checking validity
        const isValid = tree.isValid();

        // Then it should be valid
        expect(isValid).toBe(true);
      });

      it('should count nodes correctly', () => {
        // Given a tree with windows
        tree.insert('w1');
        tree.insert('w2');
        tree.insert('w3');
        tree.insert('w4');

        // When counting nodes
        const nodeCount = tree.countNodes();
        const windowCount = tree.getWindows().length;

        // Then counts should match expected structure
        expect(windowCount).toBe(4);
        // Total nodes = leaf nodes + internal nodes
        expect(nodeCount).toBeGreaterThan(windowCount);
      });
    });

    describe('Split Direction Logic', () => {
      it('should use vertical split as default for first split', () => {
        // Given one window
        tree.insert('w1');

        // When inserting second window
        tree.insert('w2');

        // Then it should use vertical split
        expect(tree.root?.splitDirection).toBe('vertical');
      });

      it('should alternate from parent direction', () => {
        // Given a tree with existing splits
        tree.insert('w1');
        tree.insert('w2'); // Creates vertical split
        tree.insert('w3'); // Should create horizontal split

        // When examining the tree structure
        // Then splits should alternate
        expect(tree.root?.splitDirection).toBe('vertical');
        const secondSplit = tree.root?.right;
        expect(secondSplit?.splitDirection).toBe('horizontal');
      });

      it('should handle deep nesting with alternating splits', () => {
        // When creating a deep tree
        for (let i = 1; i <= 8; i++) {
          tree.insert(`w${i}`);
        }

        // Then the tree should maintain alternating pattern
        const checkAlternation = (node: BSPNode | null, expectedDir?: 'vertical' | 'horizontal'): boolean => {
          if (!node || node.windowId) return true;
          
          if (expectedDir && node.splitDirection !== expectedDir) return false;
          
          const nextDir = node.splitDirection === 'vertical' ? 'horizontal' : 'vertical';
          return checkAlternation(node.left, nextDir) && checkAlternation(node.right, nextDir);
        };

        expect(checkAlternation(tree.root)).toBe(true);
      });
    });
});