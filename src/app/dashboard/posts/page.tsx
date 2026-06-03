// sections
import SocialAdminView from 'src/sections/social-admin/view';

// ----------------------------------------------------------------------

export const metadata = {
  title: 'Dashboard: Bài đăng',
};

export default function PostsPage() {
  return <SocialAdminView module="posts" />;
}
