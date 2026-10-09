import {
  LayoutDashboard, GraduationCap, UsersRound, ClipboardCheck, FileCheck2, BookOpen, CalendarDays, IndianRupee, ReceiptText, Bus, CarFront,
  Library, Package, BedDouble, DoorOpen, PhoneIncoming, MessageSquareWarning, Award, Layers, Megaphone, MessageCircle, Target, Globe, BarChart3,
  Settings, ShieldCheck, CreditCard, KeyRound, type LucideIcon,
} from 'lucide-react';
import type { NavIcon } from '@/lib/navigation';

/** Explicit map (tree-shakeable) instead of importing every Lucide icon. */
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, students: GraduationCap, staff: UsersRound, attendance: ClipboardCheck, exams: FileCheck2, subjects: BookOpen,
  calendar: CalendarDays, fees: IndianRupee, feeHeads: ReceiptText, transport: Bus, vehicles: CarFront, library: Library, inventory: Package,
  hostel: BedDouble, frontOffice: DoorOpen, enquiries: PhoneIncoming, complaints: MessageSquareWarning, alumni: Award, batches: Layers,
  notices: Megaphone, messenger: MessageCircle, crm: Target, website: Globe, reports: BarChart3, settings: Settings, roles: ShieldCheck,
  billing: CreditCard, access: KeyRound,
};
