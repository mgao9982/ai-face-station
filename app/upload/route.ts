import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename') || 'file';

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not defined' },
      { status: 500 }
    );
  }

  try {
    // 🛑 之前的写法: request.body (直接传流，容易锁死)
    // ✅ 现在的写法: await request.arrayBuffer()
    // 先把文件完全读进内存，再传给 Vercel。虽然稍微多占点内存，但绝对稳定！
    const fileContent = await request.arrayBuffer();

    const blob = await put(filename, fileContent, {
      access: 'public',
      addRandomSuffix: true, // 防止文件名冲突
    });

    return NextResponse.json(blob);
  } catch (error) {
    console.error("Blob upload error:", error);
    return NextResponse.json(
      { error: 'File upload failed' },
      { status: 500 }
    );
  }
}