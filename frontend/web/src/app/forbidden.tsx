import { AccessDenied } from '@/components/ui';

/** API 403 outside the console (e.g. control plane). */
export default function Forbidden() {
  return <AccessDenied />;
}
