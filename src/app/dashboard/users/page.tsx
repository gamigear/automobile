// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Nhân viên',
};

export default function UsersPage() {
  return <SocialAdminView module="users" />;
}
