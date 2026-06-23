import demoProofFixture from "@/lib/casper/demo-proof.json";

export type CasperAnchorStatus = "not-anchored" | "confirmed";

export interface CasperProofRecord {
  schema: "uzoma.casper-proof.v1";
  verifiedAt: string;
  network: "Casper Testnet";
  chainName: "casper-test";
  registry: "BuildDossierRegistry";
  status: "confirmed";
  packageHash: string;
  contractHash: string;
  installTransactionHash: string;
  anchorTransactionHash: string;
  block: {
    hash: string;
    height: number;
    stateRootHash: string;
  };
  event: {
    dictionary: "__events";
    index: number;
    dictionaryKey: string;
    name: "DossierAnchored";
  };
  onChainRecord: {
    id: number;
    creator: string;
    jobId: string;
    dossierHash: string;
    artifactRootHash: string;
    artifactCount: number;
    accepted: true;
    recordedAt: number;
    recordedAtIso: string;
  };
}

export const demoCasperProof = demoProofFixture as CasperProofRecord;

export function getCasperProofForJob(jobId: string) {
  return jobId === demoCasperProof.onChainRecord.jobId
    ? demoCasperProof
    : undefined;
}
