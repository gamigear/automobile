// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Chi tiết bài đăng',
};

export default function PostDetailsPage() {
  return <SocialAdminView module="post-detail" />;
}
