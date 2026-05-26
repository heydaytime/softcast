"use client";

export function BackendUnavailableModal({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-md">
      <section className="w-full max-w-[390px] rounded-[26px] border border-red-300/15 bg-[#100708]/95 p-5 text-center text-white shadow-2xl">
        <div className="mx-auto h-3 w-3 rounded-full bg-red-300" />
        <h2 className="mt-4 text-[23px] font-semibold tracking-[-0.04em]">Backend unavailable</h2>
        <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-5 text-white/52">{message}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 h-10 w-full rounded-full bg-white text-[13px] font-semibold text-black transition hover:bg-white/85">Try again</button>
      </section>
    </div>
  );
}
