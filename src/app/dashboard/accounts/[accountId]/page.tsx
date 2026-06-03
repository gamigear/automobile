import type { Metadata } from 'next';
// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Dashboard: Account Workspace',
};

export default function AccountWorkspacePage() {
  return <SocialAdminView module="account-workspace" />;
}
