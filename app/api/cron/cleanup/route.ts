import { list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

// Vercel Cron 需要验证安全性，防止被恶意调用
// 这里简单演示逻辑
export async function GET(request: Request) {
  // 1. 列出 Blob 里所有的文件
  const { blobs } = await list();
  
  // 2. 筛选出 24 小时前的文件
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const oldBlobs = blobs.filter(blob => new Date(blob.uploadedAt).getTime() < oneDayAgo);

  if (oldBlobs.length === 0) {
    return NextResponse.json({ msg: '没有过期的文件需要删除' });
  }

  // 3. 批量删除
  const urlsToDelete = oldBlobs.map(blob => blob.url);
  await del(urlsToDelete);

  return NextResponse.json({ 
    msg: `成功删除了 ${urlsToDelete.length} 个过期文件`, 
    deleted: urlsToDelete 
  });
}