// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Tài khoản mạng xã hội',
};

export default function AccountsPage() {
  return <SocialAdminView module="accounts" />;
}
