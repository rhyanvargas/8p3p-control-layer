import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LearnerDetailView } from '@/app/(dashboard)/learners/[ref]/_components/learner-detail-view';
import { getServerOrgId } from '@/lib/org-id';

type LearnerDetailPageProps = {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ version?: string }>;
};

export default async function LearnerDetailPage({
  params,
  searchParams,
}: LearnerDetailPageProps) {
  const [{ ref }, sp] = await Promise.all([params, searchParams]);
  const learnerRef = decodeURIComponent(ref);
  const orgId = getServerOrgId();

  const versionRaw = sp.version;
  const version =
    versionRaw != null && versionRaw !== '' && !Number.isNaN(Number(versionRaw))
      ? Number(versionRaw)
      : undefined;

  if (!orgId) {
    return (
      <Alert>
        <AlertTitle>Organization not configured</AlertTitle>
        <AlertDescription>
          Set <code className="font-mono text-xs">CONTROL_LAYER_ORG_ID</code> in{' '}
          <code className="font-mono text-xs">.env.local</code> to load learner detail.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <LearnerDetailView
      orgId={orgId}
      learnerRef={learnerRef}
      version={version}
    />
  );
}
