import { DossierView } from "@/components/dossier-view";
export default async function DossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DossierView id={id} />;
}
