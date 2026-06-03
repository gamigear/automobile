type TranslateInput = {
  title?: string;
  caption?: string;
  platform?: string;
};

type TranslateOutput = {
  title: string;
  caption: string;
  translated: boolean;
  provider: string;
  error?: string;
};

function isTranslationEnabled() {
  return process.env.SOURCE_TITLE_TRANSLATE_ENABLED === 'true' || process.env.SOURCE_CONTENT_TRANSLATE_ENABLED === 'true';
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1) throw new Error('Không đọc được JSON từ kết quả dịch');

  return JSON.parse(candidate.slice(start, end + 1));
}

export async function translateSourceContent(input: TranslateInput): Promise<TranslateOutput> {
  const title = input.title || '';
  const caption = input.caption || '';

  if (!caption && !title) return { title, caption, translated: false, provider: 'none' };
  if (!isTranslationEnabled()) return { title, caption, translated: false, provider: 'disabled' };

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) return { title, caption, translated: false, provider: 'openai', error: 'OPENAI_API_KEY chưa cấu hình' };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.SOURCE_CONTENT_TRANSLATE_MODEL || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Bạn là biên tập viên social media tiếng Việt. Việt hóa tiêu đề và caption nguồn Trung/Anh sang tiếng Việt tự nhiên, giữ hashtag quan trọng nếu phù hợp, không thêm thông tin không có trong nguồn. Trả về JSON hợp lệ với key title và caption.',
          },
          {
            role: 'user',
            content: JSON.stringify({ platform: input.platform || '', title, caption }),
          },
        ],
      }),
    });

    const body = await response.json();

    if (!response.ok) throw new Error(body.error?.message || 'Dịch nội dung thất bại');

    const parsed = extractJson(body.choices?.[0]?.message?.content || '');

    return {
      title: String(parsed.title || title).trim(),
      caption: String(parsed.caption || caption).trim(),
      translated: true,
      provider: 'openai',
    };
  } catch (error) {
    return {
      title,
      caption,
      translated: false,
      provider: 'openai',
      error: error instanceof Error ? error.message : 'Dịch nội dung thất bại',
    };
  }
}
