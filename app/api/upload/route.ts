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
    const blob = await put(filename, request.body!, {
      access: 'public',
      addRandomSuffix: true, // ✨ 加上这行，自动给文件名加随机后缀，永不冲突！
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