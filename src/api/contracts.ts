export type Direction = 'income' | 'expense' | 'transfer' | 'adjustment';
export type AccountKind = 'asset' | 'liability';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  householdId: string;
}

export interface WechatLoginRequest {
  code: string;
  inviteCode?: string;
  householdName?: string;
}

export interface WechatLoginResponse extends TokenPair {
  isNewUser: boolean;
}

export interface BreakdownRow {
  label: string;
  direction: Direction;
  amountMinor: number;
}

export interface DashboardSummary {
  netWorthMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  categoryBreakdown: BreakdownRow[];
  accountBreakdown: BreakdownRow[];
  pendingDraftCount?: number;
  duplicateCount?: number;
  recurringDueCount?: number;
  recentTransactions?: TransactionSummary[];
}

export interface AccountSummary {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalanceMinor: number;
}

export interface CategorySummary {
  id: string;
  name: string;
  direction: 'income' | 'expense';
}

export interface TransactionSummary {
  id: string;
  accountId: string;
  direction: Direction;
  amountMinor: number;
  occurredAt: string;
  merchant?: string;
  note?: string;
  version: number;
}

export interface DraftSummary {
  id: string;
  direction: Direction;
  amountMinor: number;
  status: 'pending' | 'confirmed' | 'rejected';
  occurredAt?: string;
  merchant?: string;
  note?: string;
  rawPayload?: Record<string, unknown>;
}

export interface DuplicateCandidate {
  incomingId: string;
  existingId: string;
  score: number;
  reasons: string[];
}

export interface ImportedRow {
  date: string;
  amountMinor: number;
  direction: Direction;
  merchant?: string;
  sourceFingerprint: string;
}

export interface StageResult {
  batchId: string;
  draftCount: number;
  reused: boolean;
  draftId?: string;
}

export interface DocumentDraft {
  amountMinor: number;
  direction: Direction;
  occurredAt?: string;
  merchant?: string;
  note?: string;
  categoryHint?: string;
  accountHint?: string;
  fieldConfidence?: Record<string, number>;
  confidence?: number;
}

export interface RecurringSummary {
  id: string;
  name: string;
  direction: Direction;
  amountMinor: number;
  accountId: string;
  dayOfMonth: number;
  nextDueAt: string;
  active: boolean;
}

export interface HouseholdMember {
  membershipId: string;
  userId: string;
  username: string;
  role: 'owner' | 'member';
  createdAt: string;
}

export interface HouseholdInvite {
  code: string;
  expiresAt: string;
}

export interface ReportSummary extends DashboardSummary {
  from: string;
  to: string;
}

export interface AiCitation {
  transactionId: string;
  occurredAt: string;
  amountMinor: number;
  merchant?: string;
}

export interface AiAnswer {
  answer: string;
  scope: { from: string; to: string };
  citations: AiCitation[];
}
