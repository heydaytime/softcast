"use client";

import { useState, type FormEvent } from "react";
import { isBackendUnavailableMessage, redeemCode } from "@/lib/backend";
import { BackendUnavailableModal } from "@/lib/BackendUnavailableModal";
import { FieldInput, HeaderAuthActions, PrimaryButton, SoftcastHeader } from "@/lib/ui";

export default function Home() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const backendError = isBackendUnavailableMessage(error) ? error : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const target = await redeemCode(code);
      const href = target.screenId ? `/screen/${target.sessionId}/${target.screenId}` : `/session/${target.sessionId}`;
      window.location.href = href;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not verify code");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-sc-bg text-sc-text">
      <SoftcastHeader action={<HeaderAuthActions showAdmin />} />
      <section className="flex min-h-0 flex-1 items-start justify-center px-5 py-14 sm:items-center sm:py-10">
        <div className="w-full max-w-[560px] rounded-sc-dialog border border-sc-border bg-sc-panel p-6 shadow-2xl sm:p-8">
          <p className="text-[13px] font-medium text-sc-muted">Display pairing</p>
          <h1 className="mt-3 text-[42px] font-semibold leading-none text-sc-text sm:text-[52px]">Enter code</h1>
          <p className="mt-4 text-[15px] leading-6 text-sc-muted">Use the verification code generated from the admin console to connect this display to a session or screen.</p>

          <form onSubmit={submit} className="mt-8 w-full space-y-3">
            <label className="sr-only" htmlFor="code">Verification code</label>
            <FieldInput
              id="code"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="000000"
              className="h-16 text-center text-[32px] font-semibold tracking-[0.18em]"
            />
            <PrimaryButton className="h-12 w-full text-[15px]">Continue</PrimaryButton>
            {error ? <p className="text-[13px] text-sc-danger">{error}</p> : null}
          </form>
        </div>
      </section>
      {backendError ? <BackendUnavailableModal message={backendError} /> : null}
    </main>
  );
}
