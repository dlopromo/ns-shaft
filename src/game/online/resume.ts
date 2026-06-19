export const ONLINE_RESUME_KEY = "ns-shaft-online-resume-v1";

export interface OnlineResumeTicket {
  roomCode: string;
  playerId: 0 | 1;
  playerName: string;
}

export function parseResumeTicket(value: string | null): OnlineResumeTicket | null {
  if (!value) return null;
  try {
    const ticket = JSON.parse(value) as Partial<OnlineResumeTicket>;
    if (!/^\d{4}$/.test(ticket.roomCode ?? "")) return null;
    if (ticket.playerId !== 0 && ticket.playerId !== 1) return null;
    if (typeof ticket.playerName !== "string" || !ticket.playerName) return null;
    return ticket as OnlineResumeTicket;
  } catch {
    return null;
  }
}
