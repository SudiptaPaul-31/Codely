import { NextResponse } from "next/server";
import { generateJWT } from "@/lib/auth";

export async function GET() {
  // Only allow this endpoint in development mode
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const token = await generateJWT("GDDEMOADDRESS");
    return NextResponse.json({ token });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
