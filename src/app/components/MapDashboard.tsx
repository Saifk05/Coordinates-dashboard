"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Tooltip,
  Popup,
  Marker,
  useMapEvents,
} from "react-leaflet";
import axios from "axios";
import { Icon, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

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
  const [data, setData] = useState<GroupedItem[]>([]);
  const [zoomLevel, setZoomLevel] = useState(11);
  const [filterPin, setFilterPin] = useState("");
  const [allPins, setAllPins] = useState<string[]>([]);
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);

  const API_URL = "/api/data";

  // Parse "(12.97,77.59)" → [12.97, 77.59]
  const cleanCoords = (gps: string | null): [number, number] | null => {
    if (!gps) return null;
    const cleaned = gps.replace(/[()]/g, "").trim();
    const parts = cleaned.split(",").map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    return [parts[0], parts[1]];
  };

  // Fetch + group coordinates
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
          if (!grouped[key]) grouped[key] = { pincode: pin, coords, count: 0, samples: [] };
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

  // Color logic
  const getColor = (c: number) =>
    c > 1000
      ? "#006400"
      : c > 500
      ? "#32CD32"
      : c > 100
      ? "#FFD700"
      : c > 20
      ? "#FFA500"
      : "#FF0000";

  const getRadius = (count: number, zoom: number) =>
    Math.max(50, Math.min(Math.log(count + 1) * 120 * (12 / zoom), 1500));

  // Marker icon
  const markerIcon = new Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });

  // Track zoom and bounds
  const ZoomTracker = () => {
    useMapEvents({
      zoomend: (e) => setZoomLevel(e.target.getZoom()),
      moveend: (e) => setBounds(e.target.getBounds()),
    });
    return null;
  };

  const filteredData = data.filter((d) =>
    !filterPin ? true : d.pincode.toString() === filterPin.trim()
  );

  // Show only items inside map bounds (if known)
  const visibleData =
    bounds == null
      ? filteredData.slice(0, 1000)
      : filteredData.filter((d) => bounds.contains(d.coords));

  const mapContainerId = "leaflet-map";

  useEffect(() => {
    const el = document.getElementById(mapContainerId) as HTMLElement | null;
    if (el && (el as any)._leaflet_id) delete (el as any)._leaflet_id;
  }, [filterPin, data.length]);

  return (
    <div>
      <h2 style={{ textAlign: "center", margin: "10px" }}>
        Coordinates by Pincode (Hover for Details)
      </h2>
      <p style={{ textAlign: "center", color: "gray" }}>
        Showing {visibleData.length.toLocaleString()} of{" "}
        {filteredData.length.toLocaleString()} points
      </p>

      {/* Dropdown filter */}
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
          type="button"
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

      {/* Map */}
      <MapContainer
        id={mapContainerId}
        key={`${filterPin}-${data.length}`}
        center={[12.97, 77.59]}
        zoom={11}
        style={{ height: "85vh", width: "100%" }}
        preferCanvas
      >
        <ZoomTracker />
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {visibleData.map((item, i) => (
          <Marker key={i} position={item.coords} icon={markerIcon}>
            <Popup>
              <b>Pincode:</b> {item.pincode}
              <br />
              <b>Count:</b> {item.count}
              <hr />
              {item.samples.slice(0, 3).map((s: any, j: number) => (
                <div key={j} style={{ marginBottom: "6px" }}>
                  <b>Action:</b> {s.action} <br />
                  <b>BAP:</b> {s.bap_id} <br />
                  <b>Txn:</b> {s.transaction_id} <br />
                  <b>Category:</b> {s.category}
                  <hr />
                </div>
              ))}
              {item.samples.length > 3 && (
                <small style={{ color: "gray" }}>
                  +{item.samples.length - 3} more records...
                </small>
              )}
            </Popup>
          </Marker>
        ))}

        {visibleData.map((item, i) => (
          <Circle
            key={`circle-${i}`}
            center={item.coords}
            radius={getRadius(item.count, zoomLevel)}
            color={getColor(item.count)}
            fillColor={getColor(item.count)}
            fillOpacity={0.4}
            weight={1.5}
          >
            <Tooltip direction="top" offset={[0, -15]}>
              <b>Pincode:</b> {item.pincode}
              <br />
              <b>Count:</b> {item.count}
            </Tooltip>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapDashboard;
