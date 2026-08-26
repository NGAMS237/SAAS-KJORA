import { requireUser } from "@/core/auth/require-user";
import { PinLockScreen } from "@/core/security/pin-lock-screen";
import { sanitizeInternalAppPath } from "@/core/security/pin-lock";

type LockPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LockPage({ searchParams }: LockPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const nextPath = sanitizeInternalAppPath(requested);
  return <PinLockScreen nextPath={nextPath} userId={user.id} />;
}
