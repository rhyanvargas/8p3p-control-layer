import { UploadWizard } from '@/app/(dashboard)/signals/upload/_components/upload-wizard';
import { PageHeader } from '@/components/layout/page-header';

export default function SignalUploadPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Upload signals"
        description="Import JSON, CSV, or Excel files. Validate before committing to the ingestion pipeline."
      />
      <UploadWizard />
    </div>
  );
}
