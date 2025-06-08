/**
 * Binary Space Partitioning (BSP) Tree implementation for Hyprland-style tiling
 */

export type SplitDirection = 'horizontal' | 'vertical';

export interface BSPNode {
  id: string;
  type: 'leaf' | 'branch';
  // For branches
  split?: SplitDirection;
  ratio?: number; // Split ratio (0-1)
  left?: BSPNode;
  right?: BSPNode;
  // For leaves
  windowId?: string;
  // Common
  parent?: BSPNode;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class BSPTree {
  private root: BSPNode | null = null;
  private nodeMap: Map<string, BSPNode> = new Map();
  private windowToNode: Map<string, BSPNode> = new Map();
  
  constructor() {}
  
  /**
   * Insert a window into the tree
   * Uses Hyprland's algorithm: alternate split direction, prefer splitting larger windows
   */
  insert(windowId: string, targetNodeId?: string): BSPNode {
    const newLeaf: BSPNode = {
      id: `node-${Date.now()}-${Math.random()}`,
      type: 'leaf',
      windowId
    };
    
    if (!this.root) {
      this.root = newLeaf;
      this.nodeMap.set(newLeaf.id, newLeaf);
      this.windowToNode.set(windowId, newLeaf);
      return newLeaf;
    }
    
    // Find target node (default to focused or largest window)
    let targetNode: BSPNode;
    if (targetNodeId) {
      targetNode = this.nodeMap.get(targetNodeId)!;
    } else {
      targetNode = this.findBestSplitTarget();
    }
    
    // Create branch node
    const branch: BSPNode = {
      id: `branch-${Date.now()}-${Math.random()}`,
      type: 'branch',
      split: this.determineSplitDirection(targetNode),
      ratio: 0.5,
      parent: targetNode.parent
    };
    
    // Update parent's reference
    if (targetNode.parent) {
      if (targetNode.parent.left === targetNode) {
        targetNode.parent.left = branch;
      } else {
        targetNode.parent.right = branch;
      }
    } else {
      this.root = branch;
    }
    
    // Set up new structure
    branch.left = targetNode;
    branch.right = newLeaf;
    targetNode.parent = branch;
    newLeaf.parent = branch;
    
    // Update maps
    this.nodeMap.set(branch.id, branch);
    this.nodeMap.set(newLeaf.id, newLeaf);
    this.windowToNode.set(windowId, newLeaf);
    
    return newLeaf;
  }
  
  /**
   * Remove a window from the tree
   * Promotes sibling to parent's position
   */
  remove(windowId: string): void {
    const node = this.windowToNode.get(windowId);
    if (!node || !node.parent) return;
    
    const parent = node.parent;
    const sibling = parent.left === node ? parent.right : parent.left;
    
    if (!sibling) return;
    
    // Replace parent with sibling
    if (parent.parent) {
      if (parent.parent.left === parent) {
        parent.parent.left = sibling;
      } else {
        parent.parent.right = sibling;
      }
      sibling.parent = parent.parent;
    } else {
      this.root = sibling;
      sibling.parent = undefined;
    }
    
    // Clean up maps
    this.nodeMap.delete(node.id);
    this.nodeMap.delete(parent.id);
    this.windowToNode.delete(windowId);
  }
  
  /**
   * Calculate window rectangles based on tree structure
   */
  calculateRects(containerRect: Rectangle): Map<string, Rectangle> {
    const rects = new Map<string, Rectangle>();
    
    if (!this.root) return rects;
    
    this.calculateNodeRect(this.root, containerRect, rects);
    
    return rects;
  }
  
  private calculateNodeRect(
    node: BSPNode, 
    rect: Rectangle, 
    rects: Map<string, Rectangle>
  ): void {
    if (node.type === 'leaf' && node.windowId) {
      rects.set(node.windowId, { ...rect });
      return;
    }
    
    if (node.type === 'branch' && node.left && node.right) {
      const ratio = node.ratio || 0.5;
      
      if (node.split === 'horizontal') {
        // Split horizontally (top/bottom)
        const topHeight = Math.floor(rect.height * ratio);
        
        this.calculateNodeRect(node.left, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: topHeight
        }, rects);
        
        this.calculateNodeRect(node.right, {
          x: rect.x,
          y: rect.y + topHeight,
          width: rect.width,
          height: rect.height - topHeight
        }, rects);
      } else {
        // Split vertically (left/right)
        const leftWidth = Math.floor(rect.width * ratio);
        
        this.calculateNodeRect(node.left, {
          x: rect.x,
          y: rect.y,
          width: leftWidth,
          height: rect.height
        }, rects);
        
        this.calculateNodeRect(node.right, {
          x: rect.x + leftWidth,
          y: rect.y,
          width: rect.width - leftWidth,
          height: rect.height
        }, rects);
      }
    }
  }
  
  /**
   * Resize a split by adjusting the ratio
   */
  resizeSplit(nodeId: string, delta: number): void {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.type !== 'branch') return;
    
    const newRatio = Math.max(0.1, Math.min(0.9, (node.ratio || 0.5) + delta));
    node.ratio = newRatio;
  }
  
  /**
   * Find window node by ID
   */
  findWindow(windowId: string): BSPNode | null {
    return this.windowToNode.get(windowId) || null;
  }
  
  /**
   * Get all window IDs in order (left-to-right, top-to-bottom)
   */
  getWindowOrder(): string[] {
    const windows: string[] = [];
    
    const traverse = (node: BSPNode | null) => {
      if (!node) return;
      
      if (node.type === 'leaf' && node.windowId) {
        windows.push(node.windowId);
      } else if (node.type === 'branch') {
        traverse(node.left);
        traverse(node.right);
      }
    };
    
    traverse(this.root);
    return windows;
  }
  
  /**
   * Swap two windows in the tree
   */
  swapWindows(windowId1: string, windowId2: string): void {
    const node1 = this.windowToNode.get(windowId1);
    const node2 = this.windowToNode.get(windowId2);
    
    if (!node1 || !node2) return;
    
    // Swap window IDs
    const temp = node1.windowId;
    node1.windowId = node2.windowId;
    node2.windowId = temp;
    
    // Update window-to-node mapping
    if (node1.windowId) this.windowToNode.set(node1.windowId, node1);
    if (node2.windowId) this.windowToNode.set(node2.windowId, node2);
  }
  
  /**
   * Get the root node of the tree
   */
  getRoot(): BSPNode | undefined {
    return this.root;
  }

  /**
   * Clear the tree (remove all nodes)
   */
  clear(): void {
    this.root = null;
    this.nodeMap.clear();
    this.windowToNode.clear();
  }

  /**
   * Focus navigation in a direction
   */
  getFocusInDirection(
    fromWindowId: string, 
    direction: 'left' | 'right' | 'up' | 'down',
    windowRects: Map<string, Rectangle>
  ): string | null {
    const fromRect = windowRects.get(fromWindowId);
    if (!fromRect) return null;
    
    let bestWindow: string | null = null;
    let bestDistance = Infinity;
    
    for (const [windowId, rect] of windowRects) {
      if (windowId === fromWindowId) continue;
      
      const distance = this.getDirectionalDistance(fromRect, rect, direction);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestWindow = windowId;
      }
    }
    
    return bestWindow;
  }
  
  private getDirectionalDistance(
    from: Rectangle, 
    to: Rectangle, 
    direction: 'left' | 'right' | 'up' | 'down'
  ): number {
    const fromCenterX = from.x + from.width / 2;
    const fromCenterY = from.y + from.height / 2;
    const toCenterX = to.x + to.width / 2;
    const toCenterY = to.y + to.height / 2;
    
    switch (direction) {
      case 'left':
        if (toCenterX >= fromCenterX) return Infinity;
        return fromCenterX - toCenterX + Math.abs(toCenterY - fromCenterY) * 0.5;
      case 'right':
        if (toCenterX <= fromCenterX) return Infinity;
        return toCenterX - fromCenterX + Math.abs(toCenterY - fromCenterY) * 0.5;
      case 'up':
        if (toCenterY >= fromCenterY) return Infinity;
        return fromCenterY - toCenterY + Math.abs(toCenterX - fromCenterX) * 0.5;
      case 'down':
        if (toCenterY <= fromCenterY) return Infinity;
        return toCenterY - fromCenterY + Math.abs(toCenterX - fromCenterX) * 0.5;
    }
  }
  
  private determineSplitDirection(node: BSPNode): SplitDirection {
    // Walk up to find parent split direction
    let parent = node.parent;
    while (parent) {
      if (parent.split) {
        // Alternate direction
        return parent.split === 'horizontal' ? 'vertical' : 'horizontal';
      }
      parent = parent.parent;
    }
    
    // Default to vertical for first split
    return 'vertical';
  }
  
  private findBestSplitTarget(): BSPNode {
    // For now, find first leaf node
    // TODO: Implement Hyprland's algorithm to prefer larger windows
    const findLeaf = (node: BSPNode): BSPNode => {
      if (node.type === 'leaf') return node;
      if (node.left) return findLeaf(node.left);
      if (node.right) return findLeaf(node.right);
      return node;
    };
    
    return this.root ? findLeaf(this.root) : this.root!;
  }
}