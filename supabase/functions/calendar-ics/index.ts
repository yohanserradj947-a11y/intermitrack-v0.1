import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");

  if (!userId) {
    return new Response("Missing user_id", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: missions, error } = await supabase
    .from("missions")
    .select("*")
    .eq("user_id", userId)
    .order("mission_date", { ascending: false });

  if (error) return new Response("Error fetching missions", { status: 500 });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Intermitrack//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Intermitrack — Mes missions",
    "X-WR-TIMEZONE:Europe/Paris",
  ];

  for (const m of missions || []) {
    const start = (m.mission_date || "").replace(/-/g, "");
    const endRaw = m.end_date || m.mission_date;
    // iCal DTEND pour all-day = jour suivant
    const endDate = new Date(endRaw + "T00:00:00");
    endDate.setDate(endDate.getDate() + 1);
    const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");

    const uid = `${m.id}@intermitrack.fr`;
    const summary = `${m.production} — ${m.mission_type}`;
    const description = `${m.hours}h · ${m.gross_amount}€`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="intermitrack.ics"',
      "Access-Control-Allow-Origin": "*",
    },
  });
});