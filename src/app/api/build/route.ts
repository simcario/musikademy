import { BUILD_INFO } from "@/lib/build-info";

export const dynamic = "force-dynamic";

/** Build pubblicata sul server: la pagina "Info app" la confronta con quella in esecuzione sul dispositivo. */
export function GET() {
  return Response.json(BUILD_INFO, { headers: { "Cache-Control": "no-store" } });
}
