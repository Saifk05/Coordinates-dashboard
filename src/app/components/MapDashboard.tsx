"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";

interface Sample {
  action: string;
  created_time: string;
  bap_id: string;
  transaction_id: string;
  message_id: string;
  category: string;
  category_id: string;
  start_gps: string;
  end_gps: string;
}

interface GroupedItem {
  pincode: string;
  coords: [number, number];
  count: number;
  samples: Sample[];
}

const MapDashboard: React.FC = () => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GroupedItem[]>([]);
  const [filterPin, setFilterPin] = useState("");
  const [allPins, setAllPins] = useState<string[]>([]);

  const API_URL = "/api/data";

  const cleanCoords = (gps: string | null): [number, number] | null => {
    if (!gps) return null;
    const cleaned = gps.replace(/[()]/g, "").trim();
    const parts = cleaned.split(",").map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    return [parts[0], parts[1]];
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(API_URL, {
        headers: { "ngrok-skip-browser-warning": "69420" },
      });
      const rows = res.data.data || [];

      const seen = new Set<string>();
      const grouped: Record<string, GroupedItem> = {};
      const pins = new Set<string>();

      for (const r of rows) {
        const invalid = (v: any) =>
          v == null || v === "" || v === "null" || v === "undefined";
        if (
          invalid(r.start_gps) ||
          invalid(r.end_gps) ||
          invalid(r.start_area_code) ||
          invalid(r.end_area_code)
        )
          continue;

        const clean = (gps: string) => {
          const cleaned = gps.replace(/[()]/g, "").trim();
          const parts = cleaned.split(",").map((n) => parseFloat(n.trim()));
          if (parts.length !== 2 || parts.some(isNaN)) return "";
          return parts.map((x) => x.toFixed(5)).join(",");
        };

        const startGPS = clean(r.start_gps);
        const endGPS = clean(r.end_gps);
        const startPin = r.start_area_code.toString().trim();
        const endPin = r.end_area_code.toString().trim();

        if (!startGPS || !endGPS) continue;

        const forward = [startGPS, endGPS, startPin, endPin].join("|");
        const reverse = [endGPS, startGPS, endPin, startPin].join("|");
        if (seen.has(forward) || seen.has(reverse)) continue;
        seen.add(forward);

        const gpsList = [
          { gps: r.start_gps },
          { gps: r.end_gps },
        ].filter((x) => x.gps);

        const pin = r.start_area_code || r.end_area_code || "Unknown";
        pins.add(pin);

        for (const { gps } of gpsList) {
          const coords = cleanCoords(gps);
          if (!coords) continue;
          const key = `${pin}_${coords.join(",")}`;
          if (!grouped[key])
            grouped[key] = { pincode: pin, coords, count: 0, samples: [] };
          grouped[key].count += 1;
          grouped[key].samples.push(r);
        }
      }

      setData(Object.values(grouped));
      setAllPins([...pins].sort());
    } catch (err) {
      console.error("❌ Error fetching data:", err);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // ✅ Initialize the map only once
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current).setView([12.97, 77.59], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    map.eachLayer((layer) => {
      if (!(layer as any).getAttribution) map.removeLayer(layer);
    });

    // ✅ Add circles and markers
    const filtered = data.filter((d) =>
      !filterPin ? true : d.pincode.toString() === filterPin.trim()
    );

    filtered.forEach((item) => {
      const [lat, lng] = item.coords;
      const color =
        item.count > 1000
          ? "#006400"
          : item.count > 500
          ? "#32CD32"
          : item.count > 100
          ? "#FFD700"
          : item.count > 20
          ? "#FFA500"
          : "#FF0000";

      const radius = Math.max(
        50,
        Math.min(Math.log(item.count + 1) * 120, 1500)
      );

      const circle = L.circle([lat, lng], {
        radius,
        color,
        fillColor: color,
        fillOpacity: 0.4,
      }).addTo(map);

      circle.bindPopup(`<b>Pincode:</b> ${item.pincode}<br/><b>Count:</b> ${item.count}`);

      const marker = L.marker([lat, lng], {
        icon: L.icon({
          iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        }),
      }).addTo(map);

      marker.bindPopup(`<b>Pincode:</b> ${item.pincode}<br/><b>Count:</b> ${item.count}`);
    });

    return () => {
      // Cleanup all markers/circles, but keep map instance alive
      map.eachLayer((layer) => {
        if (!(layer as any).getAttribution) map.removeLayer(layer);
      });
    };
  }, [data, filterPin]);

  return (
    <div>
      <h2 style={{ textAlign: "center", margin: "10px" }}>
        Coordinates by Pincode
      </h2>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
        <select
          value={filterPin}
          onChange={(e) => setFilterPin(e.target.value)}
          style={{
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            width: "220px",
          }}
        >
          <option value="">All Pincodes</option>
          {allPins.map((pin) => (
            <option key={pin} value={pin}>
              {pin}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFilterPin("")}
          style={{
            padding: "6px 12px",
            backgroundColor: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      <div
        ref={mapContainerRef}
        id="map"
        style={{ height: "85vh", width: "100%", borderRadius: "8px" }}
      />
    </div>
  );
};

export default MapDashboard;
