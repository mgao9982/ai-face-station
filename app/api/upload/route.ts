import { put, list, del } from '@vercel/blob';
import { NextResponse } from 'next/server';

// 设定最大保留文件数 (250MB / 4MB每张 ≈ 60张，我们设保守点 50张)
const MAX_FILES_COUNT = 50;

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename') || 'file';

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Token missing' }, { status: 500 });
  }

  try {
    // 1. 接收文件并上传
    const blob = await put(filename, request.body!, {
      access: 'public',
      addRandomSuffix: true,
    });

    // 2. 【新增】触发“滚动清理”逻辑 (不等待它完成，让它在后台跑，加快响应速度)
    // 注意：Vercel Serverless 可能会在响应后冻结进程，但在简单场景下这招通常有效
    // 更严谨的做法是单独开个 Cron，但这里我们直接写在上传里最方便
    cleanupOldFiles().catch(err => console.error("Cleanup failed:", err));

    // 3. 立即返回结果给前端
    return NextResponse.json(blob);

  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// 🧹 辅助函数：清理旧文件
async function cleanupOldFiles() {
  // 列出所有文件
  const { blobs } = await list();

  // 如果文件数量没超标，直接返回
  if (blobs.length <= MAX_FILES_COUNT) return;

  // 按上传时间排序：最旧的在前面
  const sortedBlobs = blobs.sort((a, b) => 
    new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime()
  );

  // 计算需要删除多少个 (比如总共 55 个，限制 50 个，就删前 5 个)
  const deleteCount = blobs.length - MAX_FILES_COUNT;
  const blobsToDelete = sortedBlobs.slice(0, deleteCount);
  const urlsToDelete = blobsToDelete.map(b => b.url);

  if (urlsToDelete.length > 0) {
    console.log(`[Cleanup] 存储快满了，正在删除 ${urlsToDelete.length} 个旧文件...`);
    await del(urlsToDelete);
  }
}