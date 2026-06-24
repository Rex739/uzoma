import { generateLiveLeadAgentPlan } from "@/lib/agent/openai";
import { createLeadAgentPostHandler } from "@/lib/agent/route-handler";

export const runtime = "nodejs";

export const POST = createLeadAgentPostHandler(generateLiveLeadAgentPlan);
