// apps/web/src/hooks/useAssets.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmAssetUpload,
  createContract,
  createInvoice,
  createPayment,
  deleteContract,
  deleteInvoice,
  deletePayment,
  getContract,
  getInvoice,
  getPayment,
  listContracts,
  listInvoices,
  listPayments,
  requestAssetPresignedUpload,
  updateContract,
  updateInvoice,
  updatePayment,
  type AssetListFilters,
  type ContractPayload,
  type InvoicePayload,
  type PaymentPayload,
  type PresignedUploadRequest,
  type UpdateContractPayload,
  type UpdateInvoicePayload,
  type UpdatePaymentPayload,
} from '@/lib/assets'

function useInvalidateAssetQueries() {
  const queryClient = useQueryClient()
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['contracts'] }),
    queryClient.invalidateQueries({ queryKey: ['invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['payments'] }),
    queryClient.invalidateQueries({ queryKey: ['customers'] }),
    queryClient.invalidateQueries({ queryKey: ['customer-detail'] }),
  ])
}

export function useContracts(filters: AssetListFilters = {}) {
  return useQuery({ queryKey: ['contracts', filters], queryFn: () => listContracts(filters), enabled: filters.enabled ?? true })
}

export function useContract(id: string | undefined) {
  return useQuery({ queryKey: ['contracts', id], queryFn: () => getContract(id as string), enabled: Boolean(id) })
}

export function useCreateContract() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: (payload: ContractPayload) => createContract(payload), onSuccess: invalidate })
}

export function useUpdateContract() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: UpdateContractPayload }) => updateContract(id, payload), onSuccess: invalidate })
}

export function useDeleteContract() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: deleteContract, onSuccess: invalidate })
}

export function useInvoices(filters: AssetListFilters = {}) {
  return useQuery({ queryKey: ['invoices', filters], queryFn: () => listInvoices(filters), enabled: filters.enabled ?? true })
}

export function useInvoice(id: string | undefined) {
  return useQuery({ queryKey: ['invoices', id], queryFn: () => getInvoice(id as string), enabled: Boolean(id) })
}

export function useCreateInvoice() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: (payload: InvoicePayload) => createInvoice(payload), onSuccess: invalidate })
}

export function useUpdateInvoice() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: UpdateInvoicePayload }) => updateInvoice(id, payload), onSuccess: invalidate })
}

export function useDeleteInvoice() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: deleteInvoice, onSuccess: invalidate })
}

export function usePayments(filters: AssetListFilters = {}) {
  return useQuery({ queryKey: ['payments', filters], queryFn: () => listPayments(filters), enabled: filters.enabled ?? true })
}

export function usePayment(id: string | undefined) {
  return useQuery({ queryKey: ['payments', id], queryFn: () => getPayment(id as string), enabled: Boolean(id) })
}

export function useCreatePayment() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: (payload: PaymentPayload) => createPayment(payload), onSuccess: invalidate })
}

export function useUpdatePayment() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: ({ id, payload }: { id: string; payload: UpdatePaymentPayload }) => updatePayment(id, payload), onSuccess: invalidate })
}

export function useDeletePayment() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: deletePayment, onSuccess: invalidate })
}

export function useRequestAssetPresignedUpload() {
  return useMutation({ mutationFn: (payload: PresignedUploadRequest) => requestAssetPresignedUpload(payload) })
}

export function useConfirmAssetUpload() {
  const invalidate = useInvalidateAssetQueries()
  return useMutation({ mutationFn: confirmAssetUpload, onSuccess: invalidate })
}
