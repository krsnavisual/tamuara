export type ThemeId = "classic" | "floral" | "minimal";
export type PlanId = "mandiri" | "assisted";
export interface User {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin";
}
export interface Person {
  name: string;
  fullName: string;
  parents: string;
}
export interface WeddingEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  timezone: "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";
  location: string;
  address: string;
  mapUrl: string;
}
export interface Gift {
  id: string;
  bank: string;
  name: string;
  number: string;
}
export interface Story {
  id: string;
  title: string;
  date: string;
  body: string;
}
export interface InvitationContent {
  bride: Person;
  groom: Person;
  opening: string;
  closing: string;
  coverUrl: string;
  gallery: string[];
  events: WeddingEvent[];
  stories: Story[];
  gifts: Gift[];
  showGifts: boolean;
  musicUrl: string;
  rsvpDeadline: string;
}
export interface Guest {
  id: string;
  name: string;
  group: string;
  quota: number;
  eventIds: string[];
  token: string;
  sent: boolean;
}
export interface RSVP {
  guestId: string;
  eventId: string;
  status: "attending" | "declined";
  count: number;
  updatedAt: string;
}
export interface Wish {
  id: string;
  guestId: string;
  name: string;
  message: string;
  status: "pending" | "approved" | "hidden";
  createdAt: string;
}
export interface Order {
  id: string;
  plan: PlanId;
  amount: number;
  status: "pending" | "paid" | "failed" | "expired";
  createdAt: string;
  paidAt?: string;
  paymentUrl?: string;
}
export type ServiceStatus =
  | "none"
  | "submitted"
  | "in_progress"
  | "awaiting_review"
  | "revision_requested"
  | "approved"
  | "completed";
export interface ServiceMessage {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}
export interface Assistance {
  status: ServiceStatus;
  brief: string;
  revisions: number;
  messages: ServiceMessage[];
}
export interface Publication {
  content: InvitationContent;
  theme: ThemeId;
  revision: number;
  publishedAt: string;
}
export interface Invitation {
  id: string;
  ownerId: string;
  assignedAdminId?: string;
  slug: string;
  status: "draft" | "published" | "archived";
  theme: ThemeId;
  content: InvitationContent;
  published?: Publication;
  version: number;
  guests: Guest[];
  rsvps: RSVP[];
  wishes: Wish[];
  orders: Order[];
  service: Assistance;
  previewToken: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
export interface Workspace {
  user: User;
  invitations: Invitation[];
  mode: "demo" | "supabase";
}
export interface PublicInvitation {
  slug: string;
  theme: ThemeId;
  content: InvitationContent;
  guest?: Pick<Guest, "id" | "name" | "quota" | "eventIds">;
  rsvps: RSVP[];
  wishes: Wish[];
  preview: boolean;
  mode: "demo" | "supabase";
}
export interface Mutation {
  action: string;
  invitationId?: string;
  version?: number;
  payload?: Record<string, unknown>;
}
