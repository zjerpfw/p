// apps/web/src/lib/assets.ts
import { apiFetch } from '@/lib/api'

export type ContractStatus = 'Draft' | 'Active' | 'Expired' | 'Terminated' | 'Void'
export type InvoiceStatus = 'Draft' | 'Issued' | 'Voided'
export type PaymentStatus = 'Pending' | 'Received' | 'Reversed'
export type AttachmentAssetType = 'Contract' | 'Invoice' | 'PaymentProof'
export type AttachmentUploadStatus = 'Pending' | 'Uploaded' | 'Failed' | 'Deleted'

export interface ContractDto {
  id: string
  customer_id: string
  customer_name: string
  deal_id: string
  contract_number: string
  title: string
  status: ContractStatus
  total_amount_cents: number
  received_amount_cents: number
  outstanding_amount_cents: number
  signed_at: string | null
  effective_start_date: string | null
  effective_end_date: string | null
  payment_due_at: string | null
  created_at: string
  updated_at: string
}

export interface InvoiceDto {
  id: string
  customer_id: string
  customer_name: string
  deal_id: string
  contract_id: string
  contract_number: string
  invoice_number: string | null
  title: string
  content: string
  status: InvoiceStatus
  amount_cents: number
  tax_amount_cents: number
  issued_at: string | null
  created_at: string
  updated_at: string
}

export interface PaymentDto {
  id: string
  customer_id: string
  customer_name: string
  deal_id: string
  contract_id: string
  contract_number: string
  invoice_id: string | null
  invoice_number: string | null
  payment_number: string
  amount_cents: number
  status: PaymentStatus
  paid_at: string | null
  note: string | null
  claimed_by: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface AttachmentAssetDto {
  id: string
  customer_id: string
  deal_id: string
  contract_id: string | null
  invoice_id: string | null
  payment_id: string | null
  asset_type: AttachmentAssetType
  upload_status: AttachmentUploadStatus
  bucket: string
  object_key: string
  original_filename: string
  mime_type: string
  size_bytes: number | null
  content_hash: string | null
  version: number
  uploaded_by: string
  uploaded_at: string | null
  created_at: string
  updated_at: string
}

export interface ContractPayload {
  customer_id: string
  deal_id: string
  contract_number: string
  title: string
  status?: ContractStatus
  total_amount_cents: number
  signed_at?: string | number | null
  effective_start_date?: string | number | null
  effective_end_date?: string | number | null
  payment_due_at?: string | number | null
}

export type UpdateContractPayload = Partial<Omit<ContractPayload, 'customer_id' | 'deal_id'>>

export interface InvoicePayload {
  contract_id: string
  invoice_number?: string | null
  title: string
  content: string
  status?: InvoiceStatus
  amount_cents: number
  tax_amount_cents?: number
  issued_at?: string | number | null
}

export type UpdateInvoicePayload = Partial<Omit<InvoicePayload, 'contract_id'>>

export interface PaymentPayload {
  contract_id: string
  invoice_id?: string | null
  payment_number: string
  amount_cents: number
  status?: PaymentStatus
  paid_at?: string | number | null
  note?: string | null
  claimed_by?: string
}

export type UpdatePaymentPayload = Partial<Omit<PaymentPayload, 'contract_id' | 'invoice_id'>>

export interface AssetListFilters {
  customer_id?: string
  contract_id?: string
  invoice_id?: string
  page?: number
  limit?: number
  enabled?: boolean
}

export interface PaginatedAssetResponse<T> {
  data: T[]
  total: number
  page: number
  total_pages: number
}

export interface PresignedUploadRequest {
  asset_type: AttachmentAssetType
  parent_id: string
  filename: string
  mime_type: string
  size_bytes: number
}

export interface PresignedUploadResponse {
  asset_id: string
  upload_url: string
  object_key: string
  expires_in: number
}

export interface ConfirmUploadResponse {
  asset_id: string
  upload_status: 'Uploaded'
  size_bytes?: number
  mime_type?: string
  already_confirmed?: boolean
}

interface ContractApiRecord {
  id: string; customerId: string; customerName: string; dealId: string; contractNumber: string; title: string
  status: ContractStatus; totalAmountCents: number; receivedAmountCents: number; outstandingAmountCents: number
  signedAt: string | null; effectiveStartDate: string | null; effectiveEndDate: string | null; paymentDueAt: string | null; createdAt: string; updatedAt: string
}

interface InvoiceApiRecord {
  id: string; customerId: string; customerName: string; dealId: string; contractId: string; contractNumber: string
  invoiceNumber: string | null; title: string; content: string; status: InvoiceStatus; amountCents: number; taxAmountCents: number
  issuedAt: string | null; createdAt: string; updatedAt: string
}

interface PaymentApiRecord {
  id: string; customerId: string; customerName: string; dealId: string; contractId: string; contractNumber: string
  invoiceId: string | null; invoiceNumber: string | null; paymentNumber: string; amountCents: number; status: PaymentStatus
  paidAt: string | null; note: string | null; claimedBy: string; createdBy: string; createdAt: string; updatedAt: string
}

function toContractDto(record: ContractApiRecord): ContractDto {
  return {
    id: record.id, customer_id: record.customerId, customer_name: record.customerName, deal_id: record.dealId,
    contract_number: record.contractNumber, title: record.title, status: record.status,
    total_amount_cents: record.totalAmountCents, received_amount_cents: record.receivedAmountCents,
    outstanding_amount_cents: record.outstandingAmountCents, signed_at: record.signedAt,
    effective_start_date: record.effectiveStartDate, effective_end_date: record.effectiveEndDate, payment_due_at: record.paymentDueAt,
    created_at: record.createdAt, updated_at: record.updatedAt,
  }
}

function toInvoiceDto(record: InvoiceApiRecord): InvoiceDto {
  return {
    id: record.id, customer_id: record.customerId, customer_name: record.customerName, deal_id: record.dealId,
    contract_id: record.contractId, contract_number: record.contractNumber, invoice_number: record.invoiceNumber,
    title: record.title, content: record.content, status: record.status, amount_cents: record.amountCents,
    tax_amount_cents: record.taxAmountCents, issued_at: record.issuedAt, created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

function toPaymentDto(record: PaymentApiRecord): PaymentDto {
  return {
    id: record.id, customer_id: record.customerId, customer_name: record.customerName, deal_id: record.dealId,
    contract_id: record.contractId, contract_number: record.contractNumber, invoice_id: record.invoiceId,
    invoice_number: record.invoiceNumber, payment_number: record.paymentNumber, amount_cents: record.amountCents,
    status: record.status, paid_at: record.paidAt, note: record.note, claimed_by: record.claimedBy,
    created_by: record.createdBy, created_at: record.createdAt, updated_at: record.updatedAt,
  }
}

function queryString(filters: AssetListFilters = {}) {
  const params = new URLSearchParams()
  if (filters.customer_id) params.set('customer_id', filters.customer_id)
  if (filters.contract_id) params.set('contract_id', filters.contract_id)
  if (filters.invoice_id) params.set('invoice_id', filters.invoice_id)
  params.set('page', String(filters.page ?? 1))
  params.set('limit', String(filters.limit ?? 20))
  return params.toString()
}

function toPaginatedResponse<TSource, TTarget>(
  response: { data: TSource[]; total: number; page: number; totalPages: number },
  mapper: (item: TSource) => TTarget,
): PaginatedAssetResponse<TTarget> {
  return { data: response.data.map(mapper), total: response.total, page: response.page, total_pages: response.totalPages }
}

export async function listContracts(filters?: AssetListFilters) {
  const response = await apiFetch<{ data: ContractApiRecord[]; total: number; page: number; totalPages: number }>(`/api/contracts?${queryString(filters)}`)
  return toPaginatedResponse(response, toContractDto)
}

export async function getContract(id: string) {
  const response = await apiFetch<{ contract: ContractApiRecord }>(`/api/contracts/${encodeURIComponent(id)}`)
  return toContractDto(response.contract)
}

export async function createContract(payload: ContractPayload) {
  const response = await apiFetch<{ contract: ContractApiRecord }>('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return toContractDto(response.contract)
}

export async function updateContract(id: string, payload: UpdateContractPayload) {
  const response = await apiFetch<{ contract: ContractApiRecord }>(`/api/contracts/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return toContractDto(response.contract)
}

export async function deleteContract(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(`/api/contracts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listInvoices(filters?: AssetListFilters) {
  const response = await apiFetch<{ data: InvoiceApiRecord[]; total: number; page: number; totalPages: number }>(`/api/invoices?${queryString(filters)}`)
  return toPaginatedResponse(response, toInvoiceDto)
}

export async function getInvoice(id: string) {
  const response = await apiFetch<{ invoice: InvoiceApiRecord }>(`/api/invoices/${encodeURIComponent(id)}`)
  return toInvoiceDto(response.invoice)
}

export async function createInvoice(payload: InvoicePayload) {
  const response = await apiFetch<{ invoice: InvoiceApiRecord }>('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return toInvoiceDto(response.invoice)
}

export async function updateInvoice(id: string, payload: UpdateInvoicePayload) {
  const response = await apiFetch<{ invoice: InvoiceApiRecord }>(`/api/invoices/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return toInvoiceDto(response.invoice)
}

export async function deleteInvoice(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(`/api/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function listPayments(filters?: AssetListFilters) {
  const response = await apiFetch<{ data: PaymentApiRecord[]; total: number; page: number; totalPages: number }>(`/api/payments?${queryString(filters)}`)
  return toPaginatedResponse(response, toPaymentDto)
}

export async function getPayment(id: string) {
  const response = await apiFetch<{ payment: PaymentApiRecord }>(`/api/payments/${encodeURIComponent(id)}`)
  return toPaymentDto(response.payment)
}

export async function createPayment(payload: PaymentPayload) {
  const response = await apiFetch<{ payment: PaymentApiRecord }>('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return toPaymentDto(response.payment)
}

export async function updatePayment(id: string, payload: UpdatePaymentPayload) {
  const response = await apiFetch<{ payment: PaymentApiRecord }>(`/api/payments/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  return toPaymentDto(response.payment)
}

export async function deletePayment(id: string) {
  return apiFetch<{ id: string; deleted: boolean }>(`/api/payments/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function requestAssetPresignedUpload(payload: PresignedUploadRequest): Promise<PresignedUploadResponse> {
  const params = new URLSearchParams({
    asset_type: payload.asset_type,
    parent_id: payload.parent_id,
    filename: payload.filename,
    mime_type: payload.mime_type,
    size_bytes: String(payload.size_bytes),
  })
  const response = await apiFetch<{ assetId: string; uploadUrl: string; objectKey: string; expiresIn: number }>(`/api/storage/presigned-url?${params.toString()}`)
  return { asset_id: response.assetId, upload_url: response.uploadUrl, object_key: response.objectKey, expires_in: response.expiresIn }
}

export async function confirmAssetUpload(assetId: string): Promise<ConfirmUploadResponse> {
  const response = await apiFetch<{ assetId: string; uploadStatus: 'Uploaded'; sizeBytes?: number; mimeType?: string; alreadyConfirmed?: boolean }>('/api/storage/confirm-upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset_id: assetId }),
  })
  return {
    asset_id: response.assetId,
    upload_status: response.uploadStatus,
    size_bytes: response.sizeBytes,
    mime_type: response.mimeType,
    already_confirmed: response.alreadyConfirmed,
  }
}
