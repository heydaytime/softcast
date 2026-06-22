"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSoftcast } from "@/lib/use-softcast";
import { isBackendUnavailableMessage } from "@/lib/backend";
import { BackendUnavailableModal } from "@/lib/BackendUnavailableModal";
import { SecondaryLink, SoftcastHeader } from "@/lib/ui";

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;
  const { screens, status } = useSoftcast({ sessionId });
  const backendError = isBackendUnavailableMessage(status) ? status : "";

  return (
    <main className="flex min-h-dvh flex-col bg-sc-bg text-sc-text">
      <SoftcastHeader action={<SecondaryLink href="/">Enter code</SecondaryLink>} />
      <section className="flex flex-1 items-start justify-center px-5 py-16 sm:items-center sm:py-10">
        <div className="w-full max-w-[680px] rounded-sc-dialog border border-sc-border bg-sc-panel p-6 shadow-2xl sm:p-8">
          <p className="text-[13px] font-medium text-sc-muted">Root session</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <h1 className="text-[40px] font-semibold leading-none text-sc-text">Choose a screen</h1>
            <span className="hidden rounded-full border border-sc-border bg-sc-card px-3 py-1 text-[12px] font-medium text-sc-muted sm:inline">{screens.length} available</span>
          </div>

          <div className="mt-8 overflow-hidden rounded-sc-panel border border-sc-border bg-black/35">
            {screens.map((screen) => (
              <Link key={screen.screenId} href={`/screen/${sessionId}/${screen.screenId}`} className="flex h-14 items-center justify-between border-b border-sc-border px-4 text-[15px] text-sc-muted transition last:border-b-0 hover:bg-sc-card hover:text-sc-text">
                <span>{screen.name}</span>
                <span className="text-[13px] text-sc-faint">Open</span>
              </Link>
            ))}
            {!screens.length ? <p className="p-5 text-[14px] text-sc-muted">No screens have been created yet.</p> : null}
          </div>
        </div>
      </section>
      {backendError ? <BackendUnavailableModal message={backendError} /> : null}
    </main>
  );
}
