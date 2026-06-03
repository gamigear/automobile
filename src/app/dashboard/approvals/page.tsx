// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Phê duyệt',
};

export default function ApprovalsPage() {
  return <SocialAdminView module="approvals" />;
}
