// 한글(HWP)·MS Word에서 열 수 있는 .doc(Word HTML) 문서를 생성해 다운로드합니다.
// 한글 오피스는 Word HTML(.doc) 형식을 그대로 열 수 있어, 별도 라이브러리 없이
// 서식이 유지된 편집 가능한 문서를 내려받을 수 있습니다.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

export function downloadAsDoc(filename: string, bodyHtml: string, title = '') {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: '맑은 고딕', 'Malgun Gothic', sans-serif; font-size: 11pt; color: #000; line-height: 1.6; }
  h1 { font-size: 20pt; text-align: center; }
  h2 { font-size: 14pt; border-bottom: 1px solid #000; padding-bottom: 4px; margin-top: 24px; }
  h3 { font-size: 12pt; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #444; padding: 5px 7px; font-size: 10pt; vertical-align: top; }
  th { background: #eee; }
  .center { text-align: center; }
  .muted { color: #666; font-size: 9pt; }
  p { margin: 6px 0; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  const blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filename}_${stamp}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
