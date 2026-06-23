export type StageStatus = "queued" | "active" | "completed" | "blocked";
export type AgentId = "atlas" | "forge" | "sentinel" | "verity" | "uzoma";

export interface AcceptanceCriterion {
  id: string;
  text: string;
  met: boolean;
}
export interface AgentProfile {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  availability: string;
  completedJobs: number;
  quote: string;
}
export interface DeliveryArtifact {
  id: string;
  type: "specification" | "implementation" | "test-report" | "review-report";
  name: string;
  summary: string;
  content: string;
  hash: string;
  createdAt: string;
  agentId: AgentId;
  metadata?: Record<string, string | number | string[]>;
}
export interface JobStage {
  id: string;
  name: string;
  status: StageStatus;
  agentId: AgentId;
  expectedOutput: string;
  acceptanceCriteria: string[];
  artifact?: DeliveryArtifact;
  timestamp?: string;
}
export interface BuildJob {
  id: string;
  title: string;
  request: string;
  contractType: string;
  priority: "Standard" | "High" | "Critical";
  status: string;
  createdAt: string;
  criteria: AcceptanceCriterion[];
  stages: JobStage[];
  dossierId?: string;
}
export interface PaymentReceipt {
  id: string;
  stageId: string;
  status: "mock";
  amount: string;
  note: string;
}
export interface ActivityEvent {
  id: string;
  jobId: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  agentId?: AgentId;
}
export interface BuildDossier {
  id: string;
  jobId: string;
  createdAt: string;
  dossierHash: string;
  finalApproval: "Approved";
  localWorkflowStatus: "accepted";
  casperAnchorStatus: "not-anchored" | "confirmed";
  artifacts: DeliveryArtifact[];
  timeline: ActivityEvent[];
  receipts: PaymentReceipt[];
}
export interface AppState {
  jobs: BuildJob[];
  dossiers: BuildDossier[];
  events: ActivityEvent[];
}
