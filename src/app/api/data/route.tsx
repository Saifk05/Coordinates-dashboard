// src/app/api/data/route.ts
import { NextResponse } from "next/server";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbxeXr6RmkZ0c6u_1JuVj2l5YNEgkCTQb7e5em-d4tsb1KCUvbMdbEIqWDDD9OcdEXvh/exec";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryParams = searchParams.toString();
    const url = `${GAS_URL}?${queryParams}`;

    console.log(" Fetching data from GAS URL:", url);

    const response = await fetch(url);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error(" JSON parsing failed. Possibly HTML instead of JSON.");
      return NextResponse.json(
        {
          error: "Response from GAS is not valid JSON",
          hint: "Ensure the Apps Script deployment allows public access and returns JSON",
        },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : data.data || [];
    console.log("✅ Successfully parsed JSON data. Sample:", rows.slice(0, 3));

    return NextResponse.json(data);
  } catch (error) {
    console.error("🚨 Error fetching from GAS:", error);
    return NextResponse.json(
      { error: "Failed to fetch data from Google Apps Script" },
      { status: 500 }
    );
  }
}
