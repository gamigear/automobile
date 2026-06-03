import { useMemo } from 'react';
// routes
import { paths } from 'src/routes/paths';
// components
import Iconify from 'src/components/iconify';
import SvgColor from 'src/components/svg-color';

// ----------------------------------------------------------------------

const navbarIcon = (name: string) => (
  <SvgColor src={`/assets/icons/navbar/${name}.svg`} sx={{ width: 1, height: 1 }} />
);

const iconify = (name: string) => <Iconify icon={name} width={24} />;

const ICONS = {
  dashboard: navbarIcon('ic_dashboard'),
  post: navbarIcon('ic_blog'),
  calendar: navbarIcon('ic_calendar'),
  approvals: navbarIcon('ic_kanban'),
  media: navbarIcon('ic_folder'),
  sources: navbarIcon('ic_file'),
  accounts: navbarIcon('ic_user'),
  devices: iconify('solar:monitor-smartphone-bold-duotone'),
  jobs: navbarIcon('ic_job'),
  users: navbarIcon('ic_user'),
  settings: iconify('solar:settings-bold-duotone'),
};

// ----------------------------------------------------------------------

export function useNavData() {
  const data = useMemo(
    () => [
      {
        subheader: 'Vận hành',
        items: [
          { title: 'Tổng quan', path: paths.dashboard.root, icon: ICONS.dashboard },
          { title: 'Devices', path: paths.dashboard.devices, icon: ICONS.devices },
          { title: 'Tài khoản', path: paths.dashboard.accounts, icon: ICONS.accounts },
          { title: 'Jobs / Đồng bộ', path: paths.dashboard.jobs, icon: ICONS.jobs },
        ],
      },
      {
        subheader: 'Quản trị hệ thống',
        items: [
          { title: 'Cài đặt', path: paths.dashboard.settings, icon: ICONS.settings },
        ],
      },
    ],
    []
  );

  return data;
}
