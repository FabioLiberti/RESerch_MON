"use client";

export default function CompendiumPage() {
  return (
    <div className="space-y-4 -m-8">
      {/* Full-bleed iframe embedding FedCompendium XL */}
      <iframe
        src="/compendium/index.html"
        className="w-full border-0"
        style={{
          height: "calc(100vh)",
          minHeight: "600px",
        }}
        title="FedCompendium XL"
        allow="fullscreen"
      />
    </div>
  );
}
