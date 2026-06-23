import type {
  AgentProfile,
  AppState,
  BuildDossier,
  BuildJob,
  DeliveryArtifact,
  JobStage,
} from "@/lib/types";
import { demoCasperProof } from "@/lib/casper/proof";

export const agents: AgentProfile[] = [
  {
    id: "atlas",
    name: "Atlas",
    role: "Specification Agent",
    description: "Turns intent into testable contract requirements.",
    capabilities: ["Requirements", "State models", "Acceptance criteria"],
    availability: "Online",
    completedJobs: 42,
    quote: "$18 / specification",
  },
  {
    id: "forge",
    name: "Forge",
    role: "Build Agent",
    description: "Produces reviewable Odra-style contract artifacts.",
    capabilities: ["Rust", "Odra patterns", "Contract architecture"],
    availability: "Online",
    completedJobs: 31,
    quote: "$64 / implementation",
  },
  {
    id: "sentinel",
    name: "Sentinel",
    role: "Test Agent",
    description: "Exercises success paths, failures, and invariants.",
    capabilities: ["Contract tests", "Edge cases", "Coverage reports"],
    availability: "Online",
    completedJobs: 56,
    quote: "$28 / test report",
  },
  {
    id: "verity",
    name: "Verity",
    role: "Review Agent",
    description: "Independently validates evidence against criteria.",
    capabilities: ["Independent review", "Evidence mapping", "Risk findings"],
    availability: "Online",
    completedJobs: 38,
    quote: "$24 / review",
  },
];

export const criteria = [
  "Payer and recipient roles are defined",
  "Funds release only after milestone approval",
  "Refund path exists after timeout",
  "Contract tests cover success and failure cases",
  "Independent review confirms the criteria",
  "Final artifacts are hashed into a Build Dossier",
];

const stageTemplate: Omit<JobStage, "status">[] = [
  {
    id: "requested",
    name: "Requested",
    agentId: "uzoma",
    expectedOutput: "Structured build request",
    acceptanceCriteria: ["Scope captured", "Criteria recorded"],
  },
  {
    id: "planning",
    name: "Planning",
    agentId: "atlas",
    expectedOutput: "Contract specification",
    acceptanceCriteria: ["Roles defined", "Transitions documented"],
  },
  {
    id: "building",
    name: "Building",
    agentId: "forge",
    expectedOutput: "Odra-style Rust implementation",
    acceptanceCriteria: [
      "Approval gate enforced",
      "Timeout refund implemented",
    ],
  },
  {
    id: "testing",
    name: "Testing",
    agentId: "sentinel",
    expectedOutput: "Test and coverage report",
    acceptanceCriteria: ["Success paths pass", "Failure paths rejected"],
  },
  {
    id: "reviewing",
    name: "Reviewing",
    agentId: "verity",
    expectedOutput: "Independent review report",
    acceptanceCriteria: [
      "Every criterion evidenced",
      "Recommendation recorded",
    ],
  },
  {
    id: "accepted",
    name: "Accepted",
    agentId: "uzoma",
    expectedOutput: "Accepted delivery set",
    acceptanceCriteria: ["Review approved", "Artifacts complete"],
  },
  {
    id: "dossier",
    name: "Dossier Created",
    agentId: "uzoma",
    expectedOutput: "Verifiable Build Dossier",
    acceptanceCriteria: ["Hashes included", "Receipt IDs recorded"],
  },
];

export function createStages(completed = 1): JobStage[] {
  return stageTemplate.map((stage, i) => ({
    ...stage,
    status: i < completed ? "completed" : i === completed ? "active" : "queued",
    timestamp:
      i < completed
        ? new Date(Date.UTC(2026, 5, 20, 9, 14 + i * 7)).toISOString()
        : undefined,
  }));
}

const code = `#[odra::module]\npub struct MilestoneEscrow {\n    payer: Var<Address>,\n    recipient: Var<Address>,\n    deadline: Var<u64>,\n    approved: Var<bool>,\n}\n\n#[odra::module]\nimpl MilestoneEscrow {\n    pub fn approve_milestone(&mut self) {\n        self.assert_payer();\n        self.approved.set(true);\n    }\n\n    pub fn release(&mut self) {\n        if !self.approved.get_or_default() {\n            self.env().revert(Error::NotApproved);\n        }\n        // Transfer held funds to the recipient.\n    }\n\n    pub fn refund_after_timeout(&mut self) {\n        if self.env().get_block_time() <= self.deadline.get().unwrap() {\n            self.env().revert(Error::DeadlineActive);\n        }\n        // Return held funds to the payer.\n    }\n}`;

const artifactBase = {
  planning: {
    type: "specification",
    name: "Milestone Escrow · Contract Requirements v1.0",
    summary:
      "Implementation-ready product and contract requirements with explicit roles, transitions, invariants, and acceptance gates.",
    content:
      "OBJECTIVE\nCreate a time-limited escrow that releases funds only after explicit payer approval and exposes a safe timeout refund path.\n\nROLES\nPayer — initializes and funds the escrow; approves the milestone.\nRecipient — receives funds after approval; cannot self-approve.\n\nSTATE MODEL\nCreated → Funded → Approved → Released\nFunded → TimedOut → Refunded\n\nINVARIANTS\nFunds cannot be released before payer approval.\nRefunds cannot execute before the deadline.\nTerminal states cannot be executed twice.",
    metadata: {
      version: "1.0",
      requirements: [
        "Initialize immutable payer, recipient, and timeout values",
        "Gate release behind payer milestone approval",
        "Permit payer refund only after the timeout",
        "Prevent duplicate release or refund execution",
      ],
      roles: [
        "Payer · funds, approves, and may claim timeout refund",
        "Recipient · receives approved milestone funds",
      ],
      transitions: [
        "Created → Funded → Approved → Released",
        "Funded → TimedOut → Refunded",
      ],
      invariants: [
        "Release requires payer approval",
        "Refund requires elapsed deadline",
        "Released and Refunded are terminal",
      ],
    },
  },
  building: {
    type: "implementation",
    name: "milestone_escrow.rs",
    summary:
      "Milestone escrow implementation preview. The Build Dossier Registry—not this escrow artifact—is deployed and anchors this accepted delivery on Casper Testnet.",
    content: code,
  },
  testing: {
    type: "test-report",
    name: "Contract test report",
    summary:
      "8 tests passed · 94% coverage · 1 invalid action correctly rejected",
    content:
      "PASS initializes_roles\nPASS payer_can_approve\nPASS release_after_approval\nPASS reject_release_before_approval\nPASS refund_after_timeout\nPASS reject_early_refund\nPASS reject_non_payer_approval\nPASS prevent_double_release\n\nREJECTED EDGE CASE\nRecipient attempted release before payer approval — correctly rejected.",
    metadata: {
      coverage: 94,
      tests: 8,
      testNames: [
        "initializes_roles",
        "payer_can_approve",
        "release_after_approval",
        "reject_release_before_approval",
        "refund_after_timeout",
        "reject_early_refund",
        "reject_non_payer_approval",
        "prevent_double_release",
      ],
      rejected:
        "Recipient attempted release before payer approval — correctly rejected.",
    },
  },
  reviewing: {
    type: "review-report",
    name: "Independent review",
    summary:
      "Approved — implementation and test evidence satisfy the delivery criteria.",
    content:
      "APPROVED Roles are explicit\nAPPROVED Release is approval-gated\nAPPROVED Timeout refund exists\nAPPROVED Success and failure paths covered\nAPPROVED No critical findings\n\nFINAL RECOMMENDATION: APPROVED",
    metadata: {
      checklist: [
        "Payer and recipient roles are explicit",
        "Release is gated by payer approval",
        "Timeout refund path is implemented",
        "Success and failure paths are tested",
        "Artifact set is complete and hashable",
      ],
      findings: "0 critical · 0 high · 1 informational",
      recommendation: "APPROVED",
    },
  },
} as const;

export function artifactFor(
  stageId: string,
  jobId: string,
  at: string,
): DeliveryArtifact | undefined {
  const source = artifactBase[stageId as keyof typeof artifactBase];
  if (!source) return undefined;
  const agentId =
    stageId === "planning"
      ? "atlas"
      : stageId === "building"
        ? "forge"
        : stageId === "testing"
          ? "sentinel"
          : "verity";
  return {
    ...source,
    id: `${jobId}-${stageId}-artifact`,
    hash: `sha256:${(jobId + stageId).padEnd(64, "9a7c3e").slice(0, 64)}`,
    createdAt: at,
    agentId,
  } as DeliveryArtifact;
}

const seedStageTimes: Record<string, string> = {
  requested: "2026-06-20T09:14:00.000Z",
  planning: "2026-06-20T09:28:00.000Z",
  building: "2026-06-20T09:46:00.000Z",
  testing: "2026-06-20T10:02:00.000Z",
  reviewing: "2026-06-20T10:15:00.000Z",
  accepted: "2026-06-20T10:21:00.000Z",
  dossier: "2026-06-20T10:21:00.000Z",
};

export const defaultJob: BuildJob = {
  id: "demo-escrow",
  title: "Milestone Escrow Contract",
  request:
    "Build a time-limited milestone escrow contract with payer and recipient roles, milestone approval, refund conditions, test coverage, and an independent review.",
  contractType: "Escrow",
  priority: "High",
  status: "Accepted",
  createdAt: seedStageTimes.requested,
  dossierId: "demo-escrow",
  criteria: criteria.map((text, i) => ({
    id: `criterion-${i + 1}`,
    text,
    met: true,
  })),
  stages: createStages(7).map((stage) => ({
    ...stage,
    timestamp: seedStageTimes[stage.id],
    artifact: artifactFor(stage.id, "demo-escrow", seedStageTimes[stage.id]),
  })),
};

const seedEvents = [
  {
    id: "evt-seed-created",
    jobId: defaultJob.id,
    type: "job.created",
    title: "Build request created",
    description: "Milestone Escrow Contract entered the delivery workflow.",
    timestamp: seedStageTimes.requested,
  },
  ...defaultJob.stages.flatMap((stage) =>
    stage.artifact
      ? [
          {
            id: `evt-seed-${stage.id}`,
            jobId: defaultJob.id,
            type: "artifact.submitted",
            title: `${stage.artifact.name} submitted`,
            description: stage.artifact.summary,
            timestamp: stage.timestamp!,
            agentId: stage.agentId,
          },
        ]
      : [],
  ),
  {
    id: "evt-seed-dossier",
    jobId: defaultJob.id,
    type: "dossier.generated",
    title: "Build Dossier anchored on Casper Testnet",
    description:
      "Milestone Escrow Contract accepted and anchored in the Casper Testnet Build Dossier Registry.",
    timestamp: demoCasperProof.onChainRecord.recordedAtIso,
    agentId: "uzoma" as const,
  },
];

const defaultDossier: BuildDossier = {
  id: "demo-escrow",
  jobId: defaultJob.id,
  createdAt: seedStageTimes.dossier,
  dossierHash: `sha256:${"uzoma-dossier-demo-escrow".padEnd(64, "4fd18b").slice(0, 64)}`,
  finalApproval: "Approved",
  localWorkflowStatus: "accepted",
  casperAnchorStatus: "confirmed",
  artifacts: defaultJob.stages.flatMap((stage) =>
    stage.artifact ? [stage.artifact] : [],
  ),
  timeline: [...seedEvents].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  ),
  receipts: defaultJob.stages.flatMap((stage, index) =>
    stage.artifact
      ? [
          {
            id: `x402-demo-escrow-${String(index).padStart(3, "0")}`,
            stageId: stage.artifact.id,
            status: "mock" as const,
            amount:
              stage.agentId === "atlas"
                ? "$18.00"
                : stage.agentId === "forge"
                  ? "$64.00"
                  : stage.agentId === "sentinel"
                    ? "$28.00"
                    : "$24.00",
            note: "Mock delivery receipt — no payment executed",
          },
        ]
      : [],
  ),
};

export function seedState(): AppState {
  return {
    jobs: [structuredClone(defaultJob)],
    dossiers: [structuredClone(defaultDossier)],
    events: structuredClone(seedEvents).sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    ),
  };
}
