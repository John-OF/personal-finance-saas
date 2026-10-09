import type {
  CommissionBulkPayoutResponse,
  CommissionEntriesResponse,
  CommissionEntry,
  CommissionEntryInput,
  CommissionEntryUpdate,
  CommissionImportInput,
  CommissionImportResponse,
  CommissionPayout,
  CommissionPlan,
  CommissionPlanInput,
  CommissionPlansResponse,
  CommissionPlanUpdate,
  CommissionRateInput,
  CommissionWeeksResponse,
} from '@pf/shared'
import { api } from '../../lib/api'

/** Typed calls to /api/v1/commission (apps/api/src/modules/commission/routes.ts). */
export const commissionApi = {
  plans: () => api<CommissionPlansResponse>('/commission/plans'),
  createPlan: (input: CommissionPlanInput) =>
    api<CommissionPlan>('/commission/plans', { method: 'POST', body: input }),
  updatePlan: (planId: string, update: CommissionPlanUpdate) =>
    api<CommissionPlan>(`/commission/plans/${planId}`, { method: 'PATCH', body: update }),
  setRate: (planId: string, input: CommissionRateInput) =>
    api<CommissionPlan>(`/commission/plans/${planId}/rates`, { method: 'PUT', body: input }),
  deleteRate: (planId: string, effectiveFrom: string) =>
    api<CommissionPlan>(`/commission/plans/${planId}/rates/${effectiveFrom}`, {
      method: 'DELETE',
    }),

  weeks: (planId: string) => api<CommissionWeeksResponse>(`/commission/plans/${planId}/weeks`),
  /** One week (or any range of up to 62 days), or every entry without a range. */
  entries: (planId: string, range?: { from: string; to: string }) =>
    api<CommissionEntriesResponse>(
      `/commission/plans/${planId}/entries${range ? `?${new URLSearchParams(range).toString()}` : ''}`,
    ),
  addEntry: (planId: string, input: CommissionEntryInput) =>
    api<CommissionEntry>(`/commission/plans/${planId}/entries`, { method: 'POST', body: input }),
  updateEntry: (entryId: string, update: CommissionEntryUpdate) =>
    api<CommissionEntry>(`/commission/entries/${entryId}`, { method: 'PATCH', body: update }),
  deleteEntry: (entryId: string) =>
    api<undefined>(`/commission/entries/${entryId}`, { method: 'DELETE' }),
  restoreEntry: (entryId: string) =>
    api<CommissionEntry>(`/commission/entries/${entryId}/restore`, { method: 'POST' }),
  importEntries: (planId: string, input: CommissionImportInput) =>
    api<CommissionImportResponse>(`/commission/plans/${planId}/entries/import`, {
      method: 'POST',
      body: input,
    }),

  confirmPayout: (planId: string, payday: string, paidCents: number) =>
    api<CommissionPayout>(`/commission/plans/${planId}/payouts/${payday}`, {
      method: 'PUT',
      body: { paidCents },
    }),
  undoPayout: (planId: string, payday: string) =>
    api<undefined>(`/commission/plans/${planId}/payouts/${payday}`, { method: 'DELETE' }),
  confirmPayoutsThrough: (planId: string, through: string) =>
    api<CommissionBulkPayoutResponse>(`/commission/plans/${planId}/payouts/bulk`, {
      method: 'POST',
      body: { through },
    }),
}
