import type { AgentMode, LeadAgentPlan } from "@/lib/agent/schema";
import { createStages } from "@/lib/mock-data";
import type { BuildJob } from "@/lib/types";

export type PlannedJobInput = {
  title: string;
  request: string;
  contractType: string;
  priority: BuildJob["priority"];
  deliveryContext: string;
  agentMode: AgentMode;
  leadAgentPlan: LeadAgentPlan;
};

export function createPlannedJob(
  input: PlannedJobInput,
  id: string,
  createdAt: string,
): BuildJob {
  const assignmentBySpecialist = new Map(
    input.leadAgentPlan.specialist_assignments.map((assignment) => [
      assignment.specialist,
      assignment,
    ]),
  );
  const stages = createStages(1).map((stage) => {
    const specialist =
      stage.agentId === "atlas"
        ? "Atlas"
        : stage.agentId === "forge"
          ? "Forge"
          : stage.agentId === "sentinel"
            ? "Sentinel"
            : stage.agentId === "verity"
              ? "Verity"
              : undefined;
    const assignment = specialist
      ? assignmentBySpecialist.get(specialist)
      : undefined;
    if (!assignment) return stage;
    return {
      ...stage,
      expectedOutput: assignment.expected_output,
      acceptanceCriteria:
        specialist === "Verity"
          ? input.leadAgentPlan.review_requirements.slice(0, 3)
          : input.leadAgentPlan.acceptance_criteria.slice(0, 3),
    };
  });

  return {
    id,
    title: input.title,
    request: input.request,
    contractType: input.contractType,
    priority: input.priority,
    status: "Planning",
    createdAt,
    deliveryContext: input.deliveryContext,
    agentMode: input.agentMode,
    leadAgentPlan: input.leadAgentPlan,
    criteria: input.leadAgentPlan.acceptance_criteria.map((text, index) => ({
      id: `${id}-criterion-${index}`,
      text,
      met: false,
    })),
    stages,
  };
}
