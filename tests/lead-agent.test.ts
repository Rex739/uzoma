import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { LeadAgentDecisionCard } from "../components/job-detail";
import { Badge } from "../components/ui";
import { getOpenAIAvailability } from "../lib/agent/config";
import {
  classifyOpenAIError,
  LeadAgentProviderError,
  leadAgentErrorResponses,
} from "../lib/agent/errors";
import { generateDeterministicPlan } from "../lib/agent/fallback";
import { requestLeadAgentResponse } from "../lib/agent/responses";
import { createLeadAgentPostHandler } from "../lib/agent/route-handler";
import { createPlannedJob } from "../lib/jobs/create-planned-job";
import {
  LeadAgentPlanSchema,
  LeadAgentRequestSchema,
} from "../lib/agent/schema";

Object.assign(globalThis, { React });

const request = {
  title: "Collateral release registry",
  description:
    "Create a controlled release registry with explicit operator permissions and terminal states.",
  context:
    "The workflow supports a tokenized asset delivery where independent evidence review is required.",
};

test("accepts a complete strict Lead Agent plan", () => {
  const plan = generateDeterministicPlan(request);
  assert.equal(
    LeadAgentPlanSchema.parse(plan).specialist_assignments.length,
    4,
  );
  assert.equal(plan.acceptance_criteria.length, 6);
});

test("uses the canonical specialist sequence", () => {
  const plan = generateDeterministicPlan(request);
  assert.deepEqual(
    plan.specialist_assignments.map((assignment) => assignment.specialist),
    ["Axiom", "Forge", "Sentinel", "Verity"],
  );
});

test("rejects invalid model output", () => {
  const plan = generateDeterministicPlan(request);
  assert.throws(() =>
    LeadAgentPlanSchema.parse({
      ...plan,
      acceptance_criteria: plan.acceptance_criteria.slice(0, 3),
    }),
  );
  assert.throws(() => LeadAgentPlanSchema.parse({ ...plan, extra: true }));
});

test("validates assurance rationale and three to five requirements", () => {
  const plan = generateDeterministicPlan(request);
  assert.throws(() =>
    LeadAgentPlanSchema.parse({ ...plan, risk_rationale: " " }),
  );
  assert.throws(() =>
    LeadAgentPlanSchema.parse({
      ...plan,
      risk_controls: plan.risk_controls.slice(0, 2),
    }),
  );
  assert.throws(() =>
    LeadAgentPlanSchema.parse({
      ...plan,
      risk_controls: [...plan.risk_controls, "A sixth control"],
    }),
  );
});

test("reports a missing API key without returning secret material", () => {
  assert.deepEqual(getOpenAIAvailability({}), {
    configured: false,
    model: undefined,
    apiKeyPresent: false,
    modelPresent: false,
    reason: "missing_api_key",
  });
});

test("requires OPENAI_MODEL instead of choosing a hardcoded default", () => {
  assert.deepEqual(getOpenAIAvailability({ OPENAI_API_KEY: "mock-key" }), {
    configured: false,
    model: undefined,
    apiKeyPresent: true,
    modelPresent: false,
    reason: "missing_model",
  });
});

test("passes the environment-configured model to the mocked Responses API", async () => {
  const configuration = getOpenAIAvailability({
    OPENAI_API_KEY: "mock-key",
    OPENAI_MODEL: "gpt-5-mini",
  });
  let requestedModel: string | undefined;
  const plan = generateDeterministicPlan(request);

  const response = await requestLeadAgentResponse(
    async (parameters) => {
      requestedModel = parameters.model;
      return { output_parsed: plan };
    },
    configuration.model!,
    request,
  );

  assert.equal(configuration.configured, true);
  assert.equal(requestedModel, "gpt-5-mini");
  assert.deepEqual(response.output_parsed, plan);
});

test("deterministic fallback is stable and explicitly non-live", () => {
  const first = generateDeterministicPlan(request);
  const second = generateDeterministicPlan(request);
  assert.deepEqual(first, second);
  assert.match(first.casper_anchor_policy, /not automatically anchored/i);
});

test("validates request length and rejects unknown input", () => {
  assert.equal(LeadAgentRequestSchema.safeParse(request).success, true);
  assert.equal(
    LeadAgentRequestSchema.safeParse({ ...request, description: "too short" })
      .success,
    false,
  );
  assert.equal(
    LeadAgentRequestSchema.safeParse({ ...request, secret: "not accepted" })
      .success,
    false,
  );
});

test("maps sanitized provider metadata to useful error categories", () => {
  assert.equal(
    classifyOpenAIError({ status: 401, code: "invalid_api_key" }),
    "OPENAI_INVALID_API_KEY",
  );
  assert.equal(
    classifyOpenAIError({ status: 429, code: "insufficient_quota" }),
    "OPENAI_INSUFFICIENT_QUOTA",
  );
  assert.equal(
    classifyOpenAIError({ status: 404, code: "model_not_found" }),
    "OPENAI_MODEL_NOT_AVAILABLE",
  );
  assert.equal(
    classifyOpenAIError({ status: 400, code: "model_not_supported" }),
    "OPENAI_MODEL_NOT_SUPPORTED",
  );
  assert.equal(
    classifyOpenAIError({ status: 429, code: "rate_limit_exceeded" }),
    "OPENAI_RATE_LIMITED",
  );
  assert.equal(
    classifyOpenAIError({ type: "schema_validation_failed" }),
    "OPENAI_STRUCTURED_OUTPUT_INVALID",
  );
  assert.equal(
    classifyOpenAIError({ status: 503 }),
    "OPENAI_PROVIDER_UNAVAILABLE",
  );
  assert.equal(
    classifyOpenAIError({ status: 400, code: "unclassified_error" }),
    "OPENAI_UNKNOWN_PROVIDER_ERROR",
  );
  assert.match(
    leadAgentErrorResponses.OPENAI_STRUCTURED_OUTPUT_INVALID.message,
    /required delivery-plan format/i,
  );
});

test("API route returns a live plan through an injected mock only", async () => {
  const plan = generateDeterministicPlan(request);
  const post = createLeadAgentPostHandler(async () => plan);
  const response = await post(
    new NextRequest("http://localhost/api/lead-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { agentMode: "live", plan });
});

test("API route rejects invalid input without invoking its mock provider", async () => {
  let called = false;
  const post = createLeadAgentPostHandler(async () => {
    called = true;
    return generateDeterministicPlan(request);
  });
  const response = await post(
    new NextRequest("http://localhost/api/lead-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, description: "short" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

const mockedProviderFailures = [
  {
    name: "model unavailable",
    metadata: { status: 404, code: "model_not_found" },
    category: "OPENAI_MODEL_NOT_AVAILABLE" as const,
  },
  {
    name: "unsupported model",
    metadata: { status: 400, code: "model_not_supported" },
    category: "OPENAI_MODEL_NOT_SUPPORTED" as const,
  },
  {
    name: "quota failure",
    metadata: { status: 429, code: "insufficient_quota" },
    category: "OPENAI_INSUFFICIENT_QUOTA" as const,
  },
  {
    name: "malformed structured output",
    metadata: { type: "schema_validation_failed" },
    category: "OPENAI_STRUCTURED_OUTPUT_INVALID" as const,
  },
  {
    name: "generic provider outage",
    metadata: { status: 503 },
    category: "OPENAI_PROVIDER_UNAVAILABLE" as const,
  },
];

for (const failureCase of mockedProviderFailures) {
  test(`API route safely maps mocked ${failureCase.name}`, async () => {
    const category = classifyOpenAIError(failureCase.metadata);
    const post = createLeadAgentPostHandler(async () => {
      throw new LeadAgentProviderError(category, {
        model: "gpt-5-mini",
        apiKeyPresent: true,
        modelEnvironmentPresent: true,
        ...failureCase.metadata,
      });
    });
    const response = await post(
      new NextRequest("http://localhost/api/lead-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
    );
    const body = await response.json();

    assert.equal(category, failureCase.category);
    assert.equal(body.error.code, failureCase.category);
    assert.equal(
      body.error.message,
      leadAgentErrorResponses[failureCase.category].message,
    );
    assert.equal(body.fallbackAvailable, true);
    assert.equal(JSON.stringify(body).includes("gpt-5-mini"), false);
  });
}

const renewableRequest = {
  title: "Renewable Energy Maintenance Escrow",
  description:
    "Release maintenance funds only after evidence review, with deadline refunds and authorization controls.",
  context:
    "Payer, vendor, reviewer, and operator coordinate real-world renewable energy maintenance delivery.",
};

test("renders live assurance separately from requester priority", () => {
  const plan = generateDeterministicPlan(renewableRequest);
  const job = createPlannedJob(
    {
      title: renewableRequest.title,
      request: renewableRequest.description,
      deliveryContext: renewableRequest.context,
      contractType: "Escrow",
      priority: "High",
      agentMode: "live",
      leadAgentPlan: plan,
    },
    "renewable-maintenance",
    "2026-06-24T10:00:00.000Z",
  );
  const markup = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Badge, null, `${job.priority} priority`),
      React.createElement(LeadAgentDecisionCard, { job }),
    ),
  );

  assert.match(markup, /High priority/i);
  assert.match(markup, /Live agent decision/i);
  assert.match(markup, /Live agent plan/i);
  assert.doesNotMatch(markup, /OpenAI planned/i);
  assert.match(markup, /Assurance level/i);
  assert.match(markup, />High</);
  assert.match(markup, /Assurance rationale/i);
  assert.match(markup, /Assurance requirements/i);
  assert.doesNotMatch(markup, /Risk level/i);
});

test("renders deterministic assurance without implying OpenAI authorship", () => {
  const plan = generateDeterministicPlan(renewableRequest);
  const job = createPlannedJob(
    {
      title: renewableRequest.title,
      request: renewableRequest.description,
      deliveryContext: renewableRequest.context,
      contractType: "Escrow",
      priority: "Standard",
      agentMode: "deterministic_demo",
      leadAgentPlan: plan,
    },
    "renewable-fallback",
    "2026-06-24T10:00:00.000Z",
  );
  const markup = renderToStaticMarkup(
    React.createElement(LeadAgentDecisionCard, { job }),
  );

  assert.match(markup, /Deterministic demo plan/i);
  assert.match(markup, /Local orchestration/i);
  assert.match(markup, /Assurance level/i);
  assert.doesNotMatch(markup, /Live agent plan/i);
});

test("saving a Lead Agent plan preserves requester priority", () => {
  const generated = generateDeterministicPlan(request);
  const job = createPlannedJob(
    {
      title: request.title,
      request: request.description,
      deliveryContext: request.context,
      contractType: "Registry",
      priority: "Critical",
      agentMode: "live",
      leadAgentPlan: { ...generated, risk_level: "low" },
    },
    "priority-preserved",
    "2026-06-24T10:00:00.000Z",
  );

  assert.equal(job.priority, "Critical");
  assert.equal(job.leadAgentPlan?.risk_level, "low");
});

test("primary product UI contains no model names", () => {
  const appFiles = [path.join(process.cwd(), "app", "page.tsx")];
  const componentFiles = fs
    .readdirSync(path.join(process.cwd(), "components"))
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => path.join(process.cwd(), "components", file));
  const source = [...appFiles, ...componentFiles]
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(source, /gpt-[a-z0-9._-]+/i);
});
