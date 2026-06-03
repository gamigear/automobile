// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Cài đặt',
};

export default function SettingsPage() {
  return <SocialAdminView module="settings" />;
}
