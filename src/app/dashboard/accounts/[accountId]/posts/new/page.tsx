import type { Metadata } from 'next';
// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Dashboard: New Account Post',
};

export default function NewAccountPostPage() {
  return <SocialAdminView module="post-new" />;
}
