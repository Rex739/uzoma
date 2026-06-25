import {
  LeadAgentPlanSchema,
  type LeadAgentPlan,
  type LeadAgentRequest,
} from "@/lib/agent/schema";

export function generateDeterministicPlan(
  input: LeadAgentRequest,
): LeadAgentPlan {
  const renewableMaintenanceEscrow = /renewable|maintenance escrow/i.test(
    `${input.title} ${input.description} ${input.context}`,
  );
  const plan: LeadAgentPlan = {
    summary: `Deliver ${input.title} through a bounded specification, implementation, testing, and independent acceptance workflow.`,
    risk_level: "high",
    risk_rationale: renewableMaintenanceEscrow
      ? "High assurance required: this workflow controls conditional fund release across multiple parties and includes deadline refunds, authorization rules, independent review, and real-world maintenance evidence."
      : "High assurance is appropriate because contract delivery can govern value movement and requires explicit authority, failure-path validation, and independent evidence review before acceptance.",
    risk_controls: renewableMaintenanceEscrow
      ? [
          "Explicit payer, vendor, reviewer, and operator roles",
          "Evidence required before milestone release",
          "Independent review before payment approval",
          "Deadline-based refund path",
          "Duplicate release and unauthorized-action protection",
        ]
      : [
          "Explicit participant roles and authority boundaries",
          "Evidence required before state or value transitions",
          "Independent review before final acceptance",
          "Failure-path and deadline validation",
          "Duplicate execution and unauthorized-action protection",
        ],
    defi_relevance:
      "The delivery may govern digital-asset permissions or value movement, so authority, state transitions, and failure behavior must be explicit.",
    rwa_relevance:
      "The evidence trail can support milestone-based real-world delivery where approvals and accepted outputs must remain attributable.",
    acceptance_criteria: [
      "Participants, authorities, and prohibited actions are specified.",
      "State transitions and terminal conditions are deterministic.",
      "Implementation behavior matches the approved specification.",
      "Success, failure, and adversarial edge cases are tested.",
      "Independent review maps every accepted artifact to the criteria.",
      "Only an accepted dossier may be proposed for a separate Casper anchor action.",
    ],
    specialist_assignments: [
      {
        specialist: "Axiom",
        objective: `Convert the brief and delivery context into an auditable specification for ${input.title}.`,
        expected_output: "Requirements and acceptance specification",
      },
      {
        specialist: "Forge",
        objective:
          "Produce a reviewable contract implementation artifact against the approved specification.",
        expected_output: "Odra-style Rust implementation artifact",
      },
      {
        specialist: "Sentinel",
        objective:
          "Validate intended paths, rejected actions, invariants, and boundary conditions.",
        expected_output: "Test and coverage report",
      },
      {
        specialist: "Verity",
        objective:
          "Independently compare the specification, implementation, and test evidence before acceptance.",
        expected_output: "Independent acceptance review",
      },
    ],
    decision_rationale:
      "High-stakes contract delivery benefits from separating requirements, implementation, adversarial validation, and final evidence review so no builder approves their own output.",
    review_requirements: [
      "Trace every acceptance criterion to concrete artifact evidence.",
      "Reject delivery if authority checks, terminal states, or failure paths are incomplete.",
      "Record a final approval decision and unresolved findings.",
    ],
    casper_anchor_policy:
      "Planning does not sign or submit a transaction. After local acceptance and dossier creation, anchoring remains a separate explicit operator action; future jobs are not automatically anchored.",
  };

  return LeadAgentPlanSchema.parse(plan);
}
