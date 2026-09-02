export type PortalAccessOption = {
  accessId: string;
  organizationId: string;
  organizationName: string;
  tenantId: string;
  tenantName: string;
  preferredLanguage: "fr" | "en";
  lastLoginAt: string | null;
  leaseCount: number;
};

export type PortalDue = {
  dueId: string;
  kind: "periodic" | "initial_prorata" | "deposit";
  reference: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  rentXaf: number;
  chargesXaf: number;
  depositXaf: number;
  totalXaf: number;
  creditAppliedXaf: number;
  paymentsReceivedXaf: number;
  remainingXaf: number;
  status: string;
};

export type PortalLease = {
  id: string;
  status: "active" | "ended";
  startDate: string;
  endDate: string | null;
  endedOn: string | null;
  baseRentXaf: number;
  recurringChargesXaf: number;
  periodicTotalXaf: number;
  securityDepositXaf: number;
  billingFrequency: string;
  dueDay: number;
  propertyName: string;
  propertyLocality: string;
  unitLabel: string;
  unitType: string;
  nextDue: null | {
    id: string;
    kind: string;
    dueDate: string;
    periodStart: string;
    periodEnd: string;
    totalXaf: number;
    creditAppliedXaf: number;
    paymentsReceivedXaf: number;
    remainingXaf: number;
    status: string;
  };
};

export type PortalHome = {
  accessId: string;
  organizationId: string;
  organizationName: string;
  currencyCode: string;
  tenantId: string;
  tenantName: string;
  email: string | null;
  phone: string | null;
  preferredLanguage: "fr" | "en";
  availableCreditXaf: number;
  amountDueXaf: number;
  leases: PortalLease[];
};

export type PortalPayment = {
  paymentId: string;
  reference: string;
  amountXaf: number;
  paymentDate: string;
  method: string;
  status: "confirmed" | "reversed";
  externalReference: string | null;
  allocations: Array<{
    dueId: string;
    amountXaf: number;
    rentXaf: number;
    chargesXaf: number;
    depositXaf: number;
  }>;
};

export type PortalDocument = {
  documentId: string;
  documentType: "due_notice" | "payment_receipt" | "rent_receipt";
  reference: string;
  status: "prepared" | "ready" | "invalidated";
  issuedOn: string;
  periodStart: string | null;
  periodEnd: string | null;
  viewed: boolean;
};

export type PortalNotification = {
  notificationId: string;
  notificationType: "due_notice_ready" | "payment_receipt_ready" | "rent_receipt_ready" | "payment_overdue" | "contract_ready" | "contract_completed";
  titleCode: string;
  payload: Record<string, unknown>;
  documentId: string | null;
  tenantId: string;
  leaseId: string;
  dueId: string | null;
  paymentId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function portalNotificationHref(notification: Pick<PortalNotification, "documentId" | "dueId" | "leaseId" | "notificationType" | "payload">) {
  if (notification.notificationType === "contract_ready" || notification.notificationType === "contract_completed") {
    const contractId = typeof notification.payload.contractId === "string" ? notification.payload.contractId : "";
    return contractId ? `/portal/contrats?contract=${contractId}` : `/portal/contrats?lease=${notification.leaseId}`;
  }
  if (notification.documentId) return `/portal/recus?lease=${notification.leaseId}`;
  if (notification.dueId) return `/portal/loyers?lease=${notification.leaseId}`;
  return `/portal/loyers?lease=${notification.leaseId}`;
}

export type PortalAccessStatus = {
  accessId: string;
  status: "invited" | "active" | "revoked";
  invitedEmail: string;
  invitedAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastLoginAt: string | null;
  invitationId: string | null;
  invitationStatus: "pending" | "accepted" | "revoked" | "expired" | null;
  invitationExpiresAt: string | null;
  leaseIds: string[];
};
