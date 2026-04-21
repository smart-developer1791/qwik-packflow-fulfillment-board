export type LaneKey = "fragile" | "cold-chain" | "bulk" | "letterbox";
export type ServiceKey = "same-day" | "next-morning" | "economy";
export type HandlingKey =
  | "inspect"
  | "gift-wrap"
  | "carbon-light"
  | "signature";
export type TicketStatus = "draft" | "syncing" | "staged" | "failed";

export interface FulfillmentForm {
  email: string;
  recipient: string;
  lane: LaneKey;
  service: ServiceKey;
  handling: HandlingKey;
  parcelCount: number;
  note: string;
}

export interface FulfillmentTicket {
  id: string;
  email: string;
  recipient: string;
  lane: LaneKey;
  service: ServiceKey;
  handling: HandlingKey;
  parcelCount: number;
  note: string;
  status: TicketStatus;
  score: number;
  attempts: number;
  dockCode: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentLog {
  id: string;
  label: string;
  detail: string;
  status: TicketStatus;
  createdAt: string;
}

export const PACKFLOW_DRAFT_KEY = "packflow-fulfillment-draft-v1";
export const PACKFLOW_TICKETS_KEY = "packflow-fulfillment-tickets-v1";

export const DEFAULT_FORM: FulfillmentForm = {
  email: "",
  recipient: "",
  lane: "fragile",
  service: "same-day",
  handling: "inspect",
  parcelCount: 3,
  note: "",
};

export const LANES: Array<{
  key: LaneKey;
  label: string;
  bay: string;
  cue: string;
  tint: string;
}> = [
  {
    key: "fragile",
    label: "Fragile aisle",
    bay: "A1",
    cue: "Glass, gear, prototypes",
    tint: "orange",
  },
  {
    key: "cold-chain",
    label: "Cold chain",
    bay: "C4",
    cue: "Insulated handoff",
    tint: "blue",
  },
  {
    key: "bulk",
    label: "Bulk shelf",
    bay: "B7",
    cue: "Heavy multipacks",
    tint: "green",
  },
  {
    key: "letterbox",
    label: "Letterbox",
    bay: "L2",
    cue: "Small fast packs",
    tint: "yellow",
  },
];

export const SERVICES: Array<{
  key: ServiceKey;
  label: string;
  eta: string;
  weight: number;
}> = [
  { key: "same-day", label: "Same day", eta: "Today before 7pm", weight: 34 },
  {
    key: "next-morning",
    label: "Next morning",
    eta: "Tomorrow before 10am",
    weight: 28,
  },
  { key: "economy", label: "Economy", eta: "2-4 day ground", weight: 20 },
];

export const HANDLING_OPTIONS: Array<{
  key: HandlingKey;
  label: string;
  detail: string;
  score: number;
}> = [
  {
    key: "inspect",
    label: "Photo inspect",
    detail: "Visual proof before sealing",
    score: 18,
  },
  {
    key: "gift-wrap",
    label: "Gift wrap",
    detail: "Soft insert and label",
    score: 14,
  },
  {
    key: "carbon-light",
    label: "Carbon light",
    detail: "Compact route packaging",
    score: 16,
  },
  {
    key: "signature",
    label: "Signature",
    detail: "Require signed receipt",
    score: 12,
  },
];

export const FLOOR_STATS = [
  { label: "Static shell", value: "ready" },
  { label: "Queue mode", value: "optimistic" },
  { label: "Recovery", value: "local" },
] as const;

export function getLane(key: LaneKey) {
  return LANES.find((lane) => lane.key === key) ?? LANES[0];
}

export function getService(key: ServiceKey) {
  return SERVICES.find((service) => service.key === key) ?? SERVICES[0];
}

export function getHandling(key: HandlingKey) {
  return (
    HANDLING_OPTIONS.find((handling) => handling.key === key) ??
    HANDLING_OPTIONS[0]
  );
}

export function getFulfillmentScore(form: FulfillmentForm): number {
  const service = getService(form.service).weight;
  const handling = getHandling(form.handling).score;
  const parcels = Math.min(22, form.parcelCount * 4);
  const recipient = form.recipient.trim().length > 2 ? 10 : 2;
  const note = form.note.trim().length > 12 ? 11 : 4;

  return Math.min(99, service + handling + parcels + recipient + note);
}

export function validateFulfillment(form: FulfillmentForm): string | null {
  if (!form.email.trim()) {
    return "Email is required so the pack ticket has an owner.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return "Use a valid owner email address.";
  }

  if (form.recipient.trim().length < 3) {
    return "Add a recipient or destination name.";
  }

  if (form.parcelCount < 1 || form.parcelCount > 12) {
    return "Parcel count must stay between 1 and 12.";
  }

  if (form.note.trim().length < 5) {
    return "Add a short packing note before queueing.";
  }

  return null;
}

export function makeTicket(
  form: FulfillmentForm,
  existingCount: number,
): FulfillmentTicket {
  const now = new Date().toISOString();
  const lane = getLane(form.lane);
  const service = getService(form.service);
  const handling = getHandling(form.handling);
  const score = getFulfillmentScore(form);
  const dockCode = `${lane.bay}-${String(42 + existingCount).padStart(3, "0")}`;

  return {
    id: `pack-${Date.now().toString(36)}`,
    email: form.email.trim(),
    recipient: form.recipient.trim(),
    lane: form.lane,
    service: form.service,
    handling: form.handling,
    parcelCount: form.parcelCount,
    note: form.note.trim(),
    status: "syncing",
    score,
    attempts: 1,
    dockCode,
    summary: `${form.parcelCount} pack${form.parcelCount === 1 ? "" : "s"} to ${form.recipient.trim()} via ${service.label.toLowerCase()} with ${handling.label.toLowerCase()}.`,
    createdAt: now,
    updatedAt: now,
  };
}

export function makeLog(
  label: string,
  detail: string,
  status: TicketStatus,
): FulfillmentLog {
  return {
    id: `pack-log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    detail,
    status,
    createdAt: new Date().toISOString(),
  };
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export async function simulateCarrierSync(shouldFail: boolean) {
  await new Promise((resolve) => setTimeout(resolve, 920));

  if (shouldFail) {
    throw new Error(
      "Mock carrier rejected the pickup ping. The optimistic pack stays queued.",
    );
  }

  return {
    stagedAt: new Date().toISOString(),
  };
}

export function saveDraft(form: FulfillmentForm) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PACKFLOW_DRAFT_KEY, JSON.stringify(form));
}

export function loadDraft(): FulfillmentForm | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(PACKFLOW_DRAFT_KEY);

  if (!value) {
    return null;
  }

  try {
    return { ...DEFAULT_FORM, ...JSON.parse(value) } as FulfillmentForm;
  } catch {
    return null;
  }
}

export function saveTickets(tickets: FulfillmentTicket[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PACKFLOW_TICKETS_KEY, JSON.stringify(tickets));
}

export function loadTickets(): FulfillmentTicket[] {
  if (typeof window === "undefined") {
    return [];
  }

  const value = window.localStorage.getItem(PACKFLOW_TICKETS_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as FulfillmentTicket[]) : [];
  } catch {
    return [];
  }
}
