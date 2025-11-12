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
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// @ts-ignore
import MarkerClusterGroup from "react-leaflet-cluster";

// ✅ Define types
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

// ✅ Fix TypeScript "no _leaflet_id" issue
interface LeafletElement extends HTMLElement {
  _leaflet_id?: string | null;
}

const MapDashboard: React.FC = () => {
  const [data, setData] = useState<GroupedItem[]>([]);
  const [zoomLevel, setZoomLevel] = useState(11);
  const [filterPin, setFilterPin] = useState("");
  const [allPins, setAllPins] = useState<string[]>([]);

  const API_URL = "/api/data";

  // 🧹 Clean GPS "(12.97,77.59)" → [12.97, 77.59]
  const cleanCoords = (gps: string | null): [number, number] | null => {
    if (!gps) return null;
    const cleaned = gps.replace(/[()]/g, "").trim();
    const parts = cleaned.split(",").map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    return [parts[0], parts[1]];
  };

  // 📡 Fetch + group duplicate coordinates per PINCODE + store full record
  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get(API_URL, {
        headers: { "ngrok-skip-browser-warning": "69420" },
      });

      const rows = res.data.data || [];
      const seen = new Set<string>();

      const uniqueRows = rows.filter((r: any) => {
        const isInvalid = (val: any) => {
          if (val === null || val === undefined) return true;
          if (typeof val === "string") {
            const v = val.trim().toLowerCase();
            return v === "" || v === "null" || v === "undefined";
          }
          return false;
        };

        if (
          isInvalid(r.start_gps) ||
          isInvalid(r.end_gps) ||
          isInvalid(r.start_area_code) ||
          isInvalid(r.end_area_code)
        ) {
          return false;
        }

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

        if (!startGPS || !endGPS) return false;

        const forwardKey = [startGPS, endGPS, startPin, endPin].join("|");
        const reverseKey = [endGPS, startGPS, endPin, startPin].join("|");

        if (seen.has(forwardKey) || seen.has(reverseKey)) return false;
        seen.add(forwardKey);
        return true;
      });

      const grouped: Record<string, GroupedItem> = {};
      const pinSet = new Set<string>();

      uniqueRows.forEach((r: any) => {
        const gpsList = [
          { gps: r.start_gps, type: "start" },
          { gps: r.end_gps, type: "end" },
        ].filter((x) => x.gps);

        const pin = r.start_area_code || r.end_area_code || "Unknown";
        if (pin) pinSet.add(pin);

        gpsList.forEach(({ gps, type }) => {
          const coords = cleanCoords(gps);
          if (!coords) return;

          const key = `${pin}_${coords.join(",")}_${type}`;
          if (!grouped[key]) {
            grouped[key] = {
              pincode: pin,
              coords,
              count: 0,
              samples: [],
            };
          }

          grouped[key].count += 1;
          grouped[key].samples.push({
            action: r.action,
            created_time: r.created_time,
            bap_id: r.bap_id,
            transaction_id: r.transaction_id,
            message_id: r.message_id,
            category: r.category,
            category_id: r.category_id,
            start_gps: r.start_gps,
            end_gps: r.end_gps,
          });
        });
      });

      setData(Object.values(grouped));
      setAllPins([...pinSet].sort());
    } catch (err) {
      console.error("❌ Error fetching data:", err);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 🎨 Color logic
  const getColor = (count: number) => {
    if (count > 1000) return "#006400";
    if (count > 500) return "#32CD32";
    if (count > 100) return "#FFD700";
    if (count > 20) return "#FFA500";
    return "#FF0000";
  };

  // 🔁 Zoom-adaptive radius
  const getRadius = (count: number, zoom: number) => {
    const base = Math.log(count + 1) * 120;
    const zoomScale = 12 / zoom;
    const radius = base * zoomScale;
    return Math.max(50, Math.min(radius, 1500));
  };

  // 📍 Marker icon
  const markerIcon = new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });

  // 👁️ Track zoom
  const ZoomTracker = () => {
    useMapEvents({
      zoomend: (e) => setZoomLevel(e.target.getZoom()),
    });
    return null;
  };

  const filteredData = data.filter((item) => {
    if (!filterPin.trim()) return true;
    return item.pincode.toString() === filterPin.trim();
  });

  // 🧹 Prevent "Map container already initialized" in StrictMode
  const mapContainerId = "leaflet-map";
  useEffect(() => {
    const container = L.DomUtil.get(mapContainerId) as LeafletElement | null;
    if (container) container._leaflet_id = null;
  }, [filterPin, data.length]);

  return (
    <div>
      <h2 style={{ textAlign: "center", margin: "10px" }}>
        Coordinates by Pincode (Full Details on Hover)
      </h2>

      {/* 🔽 Dropdown Filter */}
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

      {/* 🗺️ Map */}
      <MapContainer
        id={mapContainerId}
        key={`${filterPin}-${data.length}`}
        center={[12.97, 77.59]}
        zoom={11}
        style={{ height: "85vh", width: "100%" }}
        preferCanvas={true}
      >
        <ZoomTracker />

        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MarkerClusterGroup>
          {filteredData.map((item, i) => (
            <Marker key={i} position={item.coords} icon={markerIcon}>
              <Popup>
                <b>Pincode:</b> {item.pincode} <br />
                <b>Lat:</b> {item.coords[0]} <br />
                <b>Lng:</b> {item.coords[1]} <br />
                <b>Count:</b> {item.count}
                <hr />
                {item.samples.slice(0, 3).map((s, j) => (
                  <div key={j} style={{ marginBottom: "6px" }}>
                    <b>Action:</b> {s.action} <br />
                    <b>BAP:</b> {s.bap_id} <br />
                    <b>Txn:</b> {s.transaction_id} <br />
                    <b>Msg:</b> {s.message_id} <br />
                    <b>Category:</b> {s.category} ({s.category_id}) <br />
                    <small>
                      <b>Created:</b>{" "}
                      {new Date(s.created_time).toLocaleString()}
                    </small>
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
        </MarkerClusterGroup>

        {filteredData.map((item, i) => (
          <Circle
            key={`circle-${i}`}
            center={item.coords}
            radius={getRadius(item.count, zoomLevel)}
            color={getColor(item.count)}
            fillColor={getColor(item.count)}
            fillOpacity={0.4}
            weight={1.5}
          >
            <Tooltip direction="top" offset={[0, -15]} permanent={false}>
              <b>Pincode:</b> {item.pincode} <br />
              <b>Lat:</b> {item.coords[0].toFixed(4)} <br />
              <b>Lng:</b> {item.coords[1].toFixed(4)} <br />
              <b>Count:</b> {item.count} <br />
              <b>Action:</b> {item.samples[0]?.action || "-"} <br />
              <b>BAP:</b> {item.samples[0]?.bap_id || "-"} <br />
              <b>Txn:</b> {item.samples[0]?.transaction_id || "-"} <br />
              <b>Category:</b> {item.samples[0]?.category || "-"}
            </Tooltip>
          </Circle>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapDashboard;
