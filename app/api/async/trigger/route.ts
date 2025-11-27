import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // 1. 获取前端传来的文件 (前端循环发，每次只发一张)
    // 为了统一，前端发过来 key 我们约定叫 'file' 或者 'body_image'
    // 这里我们兼容一下：
    const bodyFile = formData.get('body_image') as File; 
    const faceFile = formData.get('face_image') as File;

    if (!bodyFile || !faceFile) {
      return NextResponse.json({ error: '后端未接收到完整图片' }, { status: 400 });
    }

    // 2. 重新封装发给 n8n 的数据 (关键：确保 Key 名字正确！)
    const n8nFormData = new FormData();
    n8nFormData.append('body_image', bodyFile); // 👈 必须叫 body_image，对应 n8n 里的配置
    n8nFormData.append('face_image', faceFile); // 👈 必须叫 face_image

    const n8nUrl = process.env.N8N_ASYNC_WEBHOOK_URL;
    if (!n8nUrl) throw new Error("未配置 N8N_ASYNC_WEBHOOK_URL");

    // 3. 发送
    const n8nRes = await fetch(n8nUrl, {
      method: 'POST',
      body: n8nFormData,
    });

    if (!n8nRes.ok) {
        const err = await n8nRes.text();
        throw new Error(`n8n 报错: ${err}`);
    }

    const n8nData = await n8nRes.json();
    console.log("[Async] 任务已发起，ID:", n8nData.taskId);

    return NextResponse.json({ taskId: n8nData.taskId });

  } catch (error: any) {
    console.error("Trigger Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}