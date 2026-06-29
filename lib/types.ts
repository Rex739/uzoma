import type { AgentMode, LeadAgentPlan } from "@/lib/agent/schema";

export type StageStatus = "queued" | "active" | "completed" | "blocked";
export type AgentId = "axiom" | "forge" | "sentinel" | "verity" | "uzoma";

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
  deliveryContext?: string;
  agentMode: AgentMode;
  leadAgentPlan?: LeadAgentPlan;
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
export interface BrowserCasperAnchorProof {
  schema: "uzoma.browser-casper-anchor.v1";
  status: "confirmed";
  network: "Casper Testnet";
  chainName: "casper-test";
  packageHash: string;
  contractHash?: string;
  anchorTransactionHash: string;
  csprLiveUrl: string;
  block?: {
    hash?: string;
    height?: number;
    stateRootHash?: string;
  };
  event?: {
    dictionary: "__events";
    index: number;
    dictionaryKey?: string;
    name: "DossierAnchored";
  };
  onChainRecord: {
    id: number;
    creator?: string;
    jobId: string;
    dossierHash: string;
    artifactRootHash: string;
    artifactCount: number;
    accepted: true;
    recordedAt?: number;
    recordedAtIso?: string;
  };
  verifiedAt: string;
  browserLocal: true;
}
export interface BuildDossier {
  id: string;
  jobId: string;
  createdAt: string;
  dossierHash: string;
  dossierHashVersion?: "uzoma-dossier-canonical-v1" | "legacy-static-v1";
  artifactRootHash?: string;
  artifactRootHashVersion?:
    | "uzoma-artifact-manifest-root-v1"
    | "legacy-static-v1";
  finalApproval: "Approved";
  localWorkflowStatus: "accepted";
  casperAnchorStatus: "not-anchored" | "submitted" | "unverified" | "confirmed";
  casperAnchorProof?: BrowserCasperAnchorProof;
  artifacts: DeliveryArtifact[];
  timeline: ActivityEvent[];
  receipts: PaymentReceipt[];
}
export interface AppState {
  jobs: BuildJob[];
  dossiers: BuildDossier[];
  events: ActivityEvent[];
}
