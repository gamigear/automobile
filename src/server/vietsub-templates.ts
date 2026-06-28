import { randomUUID } from 'node:crypto';
// db
import { prisma } from 'src/lib/prisma';

// ----------------------------------------------------------------------
// Template bối cảnh/nhân vật cho vietsub. builtin = dựng sẵn (không xoá được);
// custom = người dùng tự lưu, persist trong AppSetting key 'vietsubContextTemplates'.

export type VietsubTemplate = {
  id: string;
  name: string;
  hint: string;
  builtin?: boolean;
};

const APP_SETTING_KEY = 'vietsubContextTemplates';

// Các kịch bản phổ biến cho video Trung (XHS/Douyin) -> dịch xưng hô đúng ngay.
export const BUILTIN_TEMPLATES: VietsubTemplate[] = [
  {
    id: 'builtin-romance',
    name: 'Ngôn tình (nam nữ yêu nhau)',
    hint: 'Phim ngôn tình. Cặp nam–nữ chính đang yêu/thân mật, xưng hô "anh – em". Người ngoài xưng hô lịch sự theo tuổi.',
    builtin: true,
  },
  {
    id: 'builtin-family',
    name: 'Gia đình (bố mẹ – con cái)',
    hint: 'Bối cảnh gia đình. Phân biệt bố/mẹ xưng "bố/mẹ – con", ông bà xưng "ông/bà – cháu", anh chị em ruột xưng "anh/chị/em".',
    builtin: true,
  },
  {
    id: 'builtin-boss',
    name: 'Công sở (sếp – nhân viên)',
    hint: 'Bối cảnh công sở. Sếp và nhân viên xưng hô lịch sự, trang trọng ("anh/chị – tôi/em", "giám đốc", "sếp").',
    builtin: true,
  },
  {
    id: 'builtin-argue',
    name: 'Cãi nhau / căng thẳng (suồng sã)',
    hint: 'Hội thoại căng thẳng, cãi vã, giọng suồng sã/giận dữ. Có thể dùng "mày – tao", "ông – tôi" tuỳ quan hệ.',
    builtin: true,
  },
  {
    id: 'builtin-historical',
    name: 'Cổ trang / kiếm hiệp',
    hint: 'Phim cổ trang/kiếm hiệp. Xưng hô cổ phong: "ta – ngươi", "tại hạ", "ngài", "tiểu thư", "công tử", "bệ hạ", "thần".',
    builtin: true,
  },
  {
    id: 'builtin-friends',
    name: 'Bạn bè đồng trang lứa',
    hint: 'Nhóm bạn bè trẻ đồng trang lứa, thân thiết, xưng hô "tớ – cậu" hoặc "mày – tao" thoải mái.',
    builtin: true,
  },
  {
    id: 'builtin-vlog',
    name: 'Vlog / một người nói (review)',
    hint: 'Một người nói trực tiếp với khán giả (vlog/review/hướng dẫn). Xưng "mình – các bạn", giọng thân thiện, tự nhiên.',
    builtin: true,
  },
];

async function loadCustom(): Promise<VietsubTemplate[]> {
  if (!process.env.DATABASE_URL) return [];

  const row = await prisma.appSetting.findUnique({ where: { key: APP_SETTING_KEY } });
  if (!row || !Array.isArray(row.value)) return [];

  return (row.value as any[])
    .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.hint === 'string')
    .map((t) => ({ id: t.id, name: t.name, hint: t.hint }));
}

async function saveCustom(list: VietsubTemplate[]): Promise<void> {
  const value = list.map((t) => ({ id: t.id, name: t.name, hint: t.hint }));
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEY },
    update: { value: value as any },
    create: { key: APP_SETTING_KEY, value: value as any },
  });
}

// Danh sách hiển thị: builtin trước, rồi custom.
export async function listVietsubTemplates(): Promise<VietsubTemplate[]> {
  const custom = await loadCustom();

  return [...BUILTIN_TEMPLATES, ...custom];
}

export async function addVietsubTemplate(name: string, hint: string): Promise<VietsubTemplate> {
  const custom = await loadCustom();
  const template: VietsubTemplate = { id: randomUUID(), name: name.trim().slice(0, 120), hint: hint.trim().slice(0, 2000) };
  await saveCustom([...custom, template]);

  return template;
}

// Chỉ xoá được custom; builtin bỏ qua.
export async function deleteVietsubTemplate(id: string): Promise<boolean> {
  if (id.startsWith('builtin-')) return false;

  const custom = await loadCustom();
  const next = custom.filter((t) => t.id !== id);
  if (next.length === custom.length) return false;

  await saveCustom(next);

  return true;
}
