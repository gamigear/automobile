// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Tổng quan',
};

export default function OverviewAppPage() {
  return <SocialAdminView module="overview" />;
}
