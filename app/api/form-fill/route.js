import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasPaidForDocument } from "@/lib/db";
import { getDocumentById, getServiceFeePaise } from "@/data/documents";
import { getJobById } from "@/lib/db";
import { prepareFormData } from "@/lib/gemini";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request) {
  try {
    const sessionUser = await getSessionUser();
    // Login abhi band hai — free forms bina login ke chalte hain (IP par
    // rate limit ke saath, taaki Gemini credits kharab na hon). Paid
    // (multi-page) forms ke liye login/payment abhi bhi zaroori hai.
    if (!sessionUser) {
      const rl = await checkRateLimit(`form-fill-ip:${getClientIp(request)}`, 30, 3600);
      if (!rl.allowed) {
        return NextResponse.json({ error: "Bahut zyada requests, thodi der baad try karo." }, { status: 429 });
      }
    }

    const { jobId, profile } = await request.json();
    if (!jobId || !profile) {
      return NextResponse.json({ error: "jobId aur profile required hain." }, { status: 400 });
    }

    // Document services (Aadhaar, PAN, etc.) are a static list; sarkari
    // jobs come from the DB. Try the static list first (fast, sync).
    let job = getDocumentById(jobId);
    if (!job) {
      job = await getJobById(jobId);
    }
    if (!job) {
      return NextResponse.json({ error: "Job/document nahi mila." }, { status: 404 });
    }

    // Same fee gate as /api/payments/document-status — multi-page document
    // forms need the ₹49 charge paid before AI will fill them.
    const feePaise = getServiceFeePaise(job);
    if (feePaise > 0) {
      if (!sessionUser) {
        return NextResponse.json({ error: "Login zaroori hai." }, { status: 401 });
      }
      const paid = await hasPaidForDocument(sessionUser.mobile, jobId);
      if (!paid) {
        return NextResponse.json({ error: "Pehle service charge pay karo." }, { status: 402 });
      }
    }

    const requiredFields = job.fields || Object.keys(profile);
    const filled = await prepareFormData(profile, requiredFields);

    return NextResponse.json({ filled });
  } catch (err) {
    return NextResponse.json({ error: err.message || "AI fill fail ho gaya." }, { status: 500 });
  }
}
