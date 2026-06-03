// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Add Device',
};

export default function AddDevicePage() {
  return <SocialAdminView module="device-add" />;
}
