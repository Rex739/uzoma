import { z } from "zod";

const conciseText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

export const LeadAgentRequestSchema = z
  .object({
    title: conciseText("Title", 120).min(3),
    description: conciseText("Description", 3_000).min(20),
    context: conciseText("Delivery context", 2_000).min(3),
  })
  .strict();

const SpecialistAssignmentSchema = z
  .object({
    specialist: z.enum(["Axiom", "Forge", "Sentinel", "Verity"]),
    objective: conciseText("Assignment objective", 300),
    expected_output: conciseText("Expected output", 200),
  })
  .strict();

export const LeadAgentPlanSchema = z
  .object({
    summary: conciseText("Summary", 500),
    risk_level: z.enum(["low", "medium", "high"]),
    risk_rationale: conciseText("Assurance rationale", 500),
    risk_controls: z
      .array(conciseText("Assurance requirement", 240))
      .min(3)
      .max(5),
    defi_relevance: conciseText("DeFi relevance", 400),
    rwa_relevance: conciseText("RWA relevance", 400),
    acceptance_criteria: z
      .array(conciseText("Acceptance criterion", 240))
      .min(4)
      .max(6),
    specialist_assignments: z
      .array(SpecialistAssignmentSchema)
      .length(4)
      .superRefine((assignments, context) => {
        const specialists = new Set(
          assignments.map((assignment) => assignment.specialist),
        );
        if (specialists.size !== 4) {
          context.addIssue({
            code: "custom",
            message: "Each specialist must be assigned exactly once",
          });
        }
      }),
    decision_rationale: conciseText("Decision rationale", 600),
    review_requirements: z
      .array(conciseText("Review requirement", 240))
      .min(2)
      .max(6),
    casper_anchor_policy: conciseText("Casper anchor policy", 400),
  })
  .strict();

export const LiveLeadAgentResponseSchema = z
  .object({
    agentMode: z.literal("live"),
    plan: LeadAgentPlanSchema,
  })
  .strict();

export type LeadAgentRequest = z.infer<typeof LeadAgentRequestSchema>;
export type LeadAgentPlan = z.infer<typeof LeadAgentPlanSchema>;
export type AgentMode = "live" | "deterministic_demo";
