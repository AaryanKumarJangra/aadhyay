import { AccessDenied } from '@/components/ui';

/** An API call on this page was refused for the signed-in user's role; rendered inside the console shell. */
export default function Forbidden() {
  return <AccessDenied reason="Part of this page needs a permission your role doesn’t include, or the record is outside the classes or students you’re assigned to." />;
}
