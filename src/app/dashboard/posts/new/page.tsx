// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Tạo bài đăng',
};

export default function PostCreatePage() {
  return <SocialAdminView module="post-new" />;
}
