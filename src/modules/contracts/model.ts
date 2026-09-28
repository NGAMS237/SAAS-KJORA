import { UUID_PATTERN } from "../properties/model.ts";

export const CONTRACT_STATUSES = ["draft", "ready", "owner_signed", "sent", "tenant_signed", "completed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type ContractLanguage = "fr" | "en";
export type ContractSignatureMethod = "drawn" | "stylized_name";

export type ContractSection = {
  key: string;
  title: string;
  condition: "always" | "deposit_positive" | "charges_positive" | "initial_payment_positive" | "end_date_present" | "payment_terms_present";
  body: string;
};

export type ContractTemplateSummary = {
  id: string;
  name: string;
  language: ContractLanguage;
  version: number;
  isSystem: boolean;
  isDefault: boolean;
  // CONTRATS-UX-PILOTE-01 — `list_contract_templates` renvoie déjà les
  // sections (voir la migration Lot 6F) ; jusqu'ici cette donnée était
  // reçue puis jetée par templateFromRow(). L'exposer permet un aperçu
  // avec les VRAIES données de la Location directement sur l'écran de
  // génération, sans requête supplémentaire.
  sections: ContractSection[];
};

export type ContractTemplateVersion = ContractTemplateSummary & {
  familyKey: string;
  status: "active" | "inactive";
  sourceTemplateId: string | null;
  sections: ContractSection[];
  createdAt: string;
};

export type ContractStampSettings = {
  enabled: boolean;
  name: string;
  // CONTRATS-UX-PILOTE-01 — civilité/prénom/nom facultatifs de la personne
  // représentée sur le cachet visuel, séparés de `name` (qui reste le champ
  // affiché tel quel sur le cachet et dans le PDF si les champs séparés ne
  // sont pas renseignés).
  civility: "M." | "Mme" | null;
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address: string;
  position: "signature_block" | "footer";
};

export type LeaseContract = {
  id: string;
  organizationId: string;
  leaseId: string;
  tenantId: string;
  templateId: string;
  templateVersion: number;
  language: ContractLanguage;
  reference: string;
  status: ContractStatus;
  templateSnapshot: Record<string, unknown>;
  dataSnapshot: Record<string, unknown>;
  contentSnapshot: ContractSection[];
  contentSha256: string | null;
  stampSnapshot: Record<string, unknown>;
  finalStoragePath: string | null;
  finalSha256: string | null;
  createdAt: string;
  sentAt: string | null;
  completedAt: string | null;
  signatures: ContractSignatureEvidence[];
};

export type ContractSignatureEvidence = {
  party: "owner" | "tenant";
  signerUserId: string;
  method: ContractSignatureMethod;
  consentCode: string;
  consentText: string;
  contentSha256: string;
  signedAt: string;
  signatureData: Record<string, unknown>;
};

const ALLOWED_TOKENS = new Set([
  "organization.name", "organization.currency", "lessor.displayName", "lessor.phone", "lessor.address",
  "tenant.name", "tenant.email", "tenant.phone", "property.name", "property.locality", "unit.label",
  "lease.start_date", "lease.end_date_sentence", "lease.base_rent", "lease.charges", "lease.deposit",
  "lease.frequency", "lease.due_day", "lease.initial_payment", "lease.payment_terms",
]);

function get(record: Record<string, unknown>, path: string) {
  const value = path.split(".").reduce<unknown>((current, key) =>
    current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, record);
  return value == null || value === "" ? "—" : String(value);
}

export function validateControlledSections(value: unknown): value is ContractSection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return false;
  return value.every((section) => {
    if (!section || typeof section !== "object") return false;
    const item = section as Record<string, unknown>;
    if (typeof item.key !== "string" || !/^[a-z0-9_-]{2,80}$/.test(item.key)) return false;
    if (typeof item.title !== "string" || item.title.length < 1 || item.title.length > 160) return false;
    if (typeof item.body !== "string" || item.body.length < 1 || item.body.length > 4000) return false;
    const condition = item.condition;
    if (!["always", "deposit_positive", "charges_positive", "initial_payment_positive", "end_date_present", "payment_terms_present"].includes(String(condition))) return false;
    return [...item.body.matchAll(/{{\s*([^}]+?)\s*}}/g)].every((match) => ALLOWED_TOKENS.has(match[1]));
  });
}

export function renderContractSections(sections: ContractSection[], snapshot: Record<string, unknown>) {
  return sections.map((section) => ({
    ...section,
    body: section.body.replace(/{{\s*([^}]+?)\s*}}/g, (_match, token: string) => get(snapshot, token)),
  }));
}

export function filterContractSections(sections: ContractSection[], lease: { deposit: number; charges: number; initialPayment?: number; endDate?: string | null; paymentTerms?: string | null }) {
  return sections.filter((section) => section.condition === "always"
    || (section.condition === "deposit_positive" && lease.deposit > 0)
    || (section.condition === "charges_positive" && lease.charges > 0)
    || (section.condition === "initial_payment_positive" && (lease.initialPayment ?? 0) > 0)
    || (section.condition === "end_date_present" && Boolean(lease.endDate))
    || (section.condition === "payment_terms_present" && Boolean(lease.paymentTerms?.trim())));
}

export function canonicalContractContent(sections: ContractSection[]) {
  return JSON.stringify(sections.map(({ key, title, body }) => ({ key, title, body })));
}

export function parseContractId(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function parseSignatureRequest(input: Record<string, unknown>) {
  const method = input.method === "drawn" ? "drawn" : input.method === "stylized_name" ? "stylized_name" : null;
  const consent = input.consent === true;
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const strokes = Array.isArray(input.strokes) ? input.strokes : [];
  if (!method || !consent) return { ok: false as const, error: "consent_required" };
  if (method === "stylized_name" && (displayName.length < 2 || displayName.length > 120)) return { ok: false as const, error: "invalid_signature" };
  if (method === "drawn" && (strokes.length < 2 || strokes.length > 1000)) return { ok: false as const, error: "invalid_signature" };
  return { ok: true as const, value: { method, signature: method === "drawn" ? { strokes } : { displayName } } };
}

export function canTransitionContract(from: ContractStatus, to: ContractStatus) {
  const transitions: Record<ContractStatus, readonly ContractStatus[]> = {
    draft: ["ready", "cancelled"], ready: ["owner_signed", "cancelled"], owner_signed: ["sent", "cancelled"],
    sent: ["tenant_signed", "cancelled"], tenant_signed: ["completed", "cancelled"], completed: [], cancelled: [],
  };
  return transitions[from].includes(to);
}

export function contractFromRow(row: Record<string, unknown>): LeaseContract {
  return {
    id: String(row.id), organizationId: String(row.organization_id), leaseId: String(row.lease_id), tenantId: String(row.tenant_id),
    templateId: String(row.template_id), templateVersion: Number(row.template_version), language: row.language === "en" ? "en" : "fr",
    reference: String(row.reference), status: row.status as ContractStatus,
    templateSnapshot: (row.template_snapshot ?? {}) as Record<string, unknown>, dataSnapshot: (row.data_snapshot ?? {}) as Record<string, unknown>,
    contentSnapshot: (row.content_snapshot ?? []) as ContractSection[], contentSha256: typeof row.content_sha256 === "string" ? row.content_sha256 : null,
    stampSnapshot: (row.stamp_snapshot ?? {}) as Record<string, unknown>, finalStoragePath: typeof row.final_storage_path === "string" ? row.final_storage_path : null,
    finalSha256: typeof row.final_sha256 === "string" ? row.final_sha256 : null, createdAt: String(row.created_at),
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null, completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    signatures: [],
  };
}
