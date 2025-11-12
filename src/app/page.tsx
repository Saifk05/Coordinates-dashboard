"use client";

import dynamic from "next/dynamic";

// Dynamically import MapDashboard so it only loads in the browser
const MapDashboard = dynamic(() => import("./components/MapDashboard"), {
  ssr: false, // 👈 disables server-side rendering for this component
});

export default function Page() {
  return <MapDashboard />;
}
