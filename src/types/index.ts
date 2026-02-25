export interface Portal {
  id: string;
  name: string;
  baseUrl: string;
  deepLinkUrl: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DailyStatus {
  checkedPortalIds: string[];
  lastUpdatedAt: number;
  timezone: string;
}

export interface AuditEvent {
  id?: string;
  timestamp: number;
  type: AuditEventType;
  portalId?: string;
  portalName?: string;
  meta?: Record<string, unknown>;
}

export type AuditEventType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'SETTINGS_UNLOCK'
  | 'PORTAL_TAP'
  | 'PORTAL_CONFIRMED'
  | 'PORTAL_ADD'
  | 'PORTAL_EDIT'
  | 'PORTAL_DELETE'
  | 'PORTAL_REORDER'
  | 'RESET_TODAY';

export interface UserProfile {
  email: string;
  createdAt: number;
  parentPinHash: string;
  parentPinSalt: string;
  auditEnabled: boolean;
}

export const DEFAULT_PORTALS: Omit<Portal, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Bromcom VLE',
    baseUrl: 'https://www.bromcomvle.com',
    deepLinkUrl: '',
    icon: '\uD83D\uDCDA',
    sortOrder: 0,
    enabled: true,
  },
  {
    name: 'Sparx Maths',
    baseUrl: 'https://sparxmaths.com/',
    deepLinkUrl: '',
    icon: '\u2795',
    sortOrder: 1,
    enabled: true,
  },
  {
    name: 'Sparx Science',
    baseUrl: 'https://sparxscience.com/',
    deepLinkUrl: '',
    icon: '\uD83E\uDDEA',
    sortOrder: 2,
    enabled: true,
  },
  {
    name: 'Educake',
    baseUrl: 'https://www.educake.co.uk',
    deepLinkUrl: '',
    icon: '\uD83C\uDF93',
    sortOrder: 3,
    enabled: true,
  },
  {
    name: 'Seneca',
    baseUrl: 'https://senecalearning.com/en-GB/',
    deepLinkUrl: '',
    icon: '\uD83E\uDDE0',
    sortOrder: 4,
    enabled: true,
  },
];
