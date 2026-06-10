import FloatingWidgetV3 from "@/components/FloatingWidgetV3";

export default function V3Page() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Message / Notes
          </label>
          <textarea
            id="main-textarea"
            rows={8}
            placeholder="Tap Nova to get started"
            className="w-full resize-none text-sm text-gray-700 placeholder-gray-300 focus:outline-none leading-relaxed"
          />
        </div>
      </div>
      <FloatingWidgetV3 />
    </main>
  );
}
