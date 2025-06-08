import type { NostrEvent } from './nostr';

export interface FilterCondition {
  id: string;
  field: 'content' | 'author' | 'kind' | 'pow' | 'tag' | 'created_at';
  operator: 'contains' | 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'includes' | 'excludes';
  value: string | number | string[];
  enabled: boolean;
}

export interface FilterGroup {
  id: string;
  name: string;
  conditions: FilterCondition[];
  logic: 'AND' | 'OR';
}

export interface FeedFilter {
  id: string;
  name: string;
  groups: FilterGroup[];
  groupLogic: 'AND' | 'OR';
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filter: FeedFilter;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface FilterState {
  activeFilter: FeedFilter | null;
  presets: FilterPreset[];
  customFilters: FeedFilter[];
}

export const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'high-pow',
    name: 'High PoW Notes',
    description: 'Show only notes with high proof-of-work',
    filter: {
      id: 'high-pow-filter',
      name: 'High PoW',
      groups: [
        {
          id: 'pow-group',
          name: 'PoW Requirements',
          conditions: [
            {
              id: 'pow-min',
              field: 'pow',
              operator: 'greater_than',
              value: 20,
              enabled: true
            }
          ],
          logic: 'AND'
        }
      ],
      groupLogic: 'AND',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'recent-24h',
    name: 'Last 24 Hours',
    description: 'Show only notes from the last 24 hours',
    filter: {
      id: 'recent-24h-filter',
      name: 'Recent',
      groups: [
        {
          id: 'time-group',
          name: 'Time Filter',
          conditions: [
            {
              id: 'time-24h',
              field: 'created_at',
              operator: 'greater_than',
              value: Date.now() / 1000 - 86400,
              enabled: true
            }
          ],
          logic: 'AND'
        }
      ],
      groupLogic: 'AND',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'no-replies',
    name: 'Root Posts Only',
    description: 'Hide replies and show only root posts',
    filter: {
      id: 'no-replies-filter',
      name: 'No Replies',
      groups: [
        {
          id: 'reply-group',
          name: 'Reply Filter',
          conditions: [
            {
              id: 'no-e-tag',
              field: 'tag',
              operator: 'excludes',
              value: ['e'],
              enabled: true
            }
          ],
          logic: 'AND'
        }
      ],
      groupLogic: 'AND',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export function createEmptyFilter(): FeedFilter {
  return {
    id: crypto.randomUUID(),
    name: 'New Filter',
    groups: [
      {
        id: crypto.randomUUID(),
        name: 'Group 1',
        conditions: [],
        logic: 'AND'
      }
    ],
    groupLogic: 'AND',
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function createEmptyCondition(): FilterCondition {
  return {
    id: crypto.randomUUID(),
    field: 'content',
    operator: 'contains',
    value: '',
    enabled: true
  };
}

export function evaluateFilter(event: NostrEvent & { pow?: number }, filter: FeedFilter): boolean {
  if (!filter.enabled) return true;

  const groupResults = filter.groups.map(group => {
    const conditionResults = group.conditions
      .filter(condition => condition.enabled)
      .map(condition => evaluateCondition(event, condition));

    if (group.logic === 'AND') {
      return conditionResults.every(result => result);
    } else {
      return conditionResults.some(result => result);
    }
  });

  if (filter.groupLogic === 'AND') {
    return groupResults.every(result => result);
  } else {
    return groupResults.some(result => result);
  }
}

function evaluateCondition(event: NostrEvent & { pow?: number }, condition: FilterCondition): boolean {
  const fieldValue = getFieldValue(event, condition.field);
  
  switch (condition.operator) {
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(condition.value).toLowerCase());
    
    case 'equals':
      return fieldValue === condition.value;
    
    case 'not_equals':
      return fieldValue !== condition.value;
    
    case 'greater_than':
      return Number(fieldValue) > Number(condition.value);
    
    case 'less_than':
      return Number(fieldValue) < Number(condition.value);
    
    case 'includes':
      if (Array.isArray(condition.value)) {
        return condition.value.some(val => 
          Array.isArray(fieldValue) ? fieldValue.includes(val) : fieldValue === val
        );
      }
      return false;
    
    case 'excludes':
      if (Array.isArray(condition.value)) {
        return !condition.value.some(val => 
          Array.isArray(fieldValue) ? fieldValue.includes(val) : fieldValue === val
        );
      }
      return true;
    
    default:
      return true;
  }
}

function getFieldValue(event: NostrEvent & { pow?: number }, field: FilterCondition['field']): any {
  switch (field) {
    case 'content':
      return event.content;
    
    case 'author':
      return event.pubkey;
    
    case 'kind':
      return event.kind;
    
    case 'pow':
      return event.pow || 0;
    
    case 'created_at':
      return event.created_at;
    
    case 'tag':
      return event.tags.map(tag => tag[0]);
    
    default:
      return undefined;
  }
}