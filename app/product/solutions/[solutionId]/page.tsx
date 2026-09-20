import SolutionProgress from "./SolutionProgress";

export default async function SolutionPage({ params }: { params: Promise<{ solutionId: string }> }) {
  const { solutionId } = await params;
  return <SolutionProgress solutionId={solutionId} />;
}
